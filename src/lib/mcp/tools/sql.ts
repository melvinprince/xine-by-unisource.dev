// ============================================================
// Xine MCP — Schema Introspection & Read-only SQL
// The catch-all for questions no purpose-built tool answers.
// Queries run inside a READ ONLY transaction with a statement
// timeout, so the database itself enforces that nothing is
// written, whatever the query text says.
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { requireFullDataAccess, toolError } from "../auth";
import { getUserId, guard, ok } from "../helpers";

/** Tables the MCP will describe. Everything else is internal plumbing. */
const KNOWN_TABLES = [
  "sites",
  "pageviews",
  "events",
  "sessions",
  "site_settings",
  "goals",
  "goal_conversions",
  "funnels",
  "annotations",
  "email_reports",
  "uptime_checks",
  "alerts",
  "users",
  "user_sites",
  "site_invites",
  "api_tokens",
  "login_attempts",
  "banned_logins",
  "password_reset_otps",
] as const;

const TABLE_NOTES: Record<string, string> = {
  sites: "One row per tracked website. api_key is the public tracking key; server_api_key is for the /api/v1 API.",
  pageviews:
    "One row per page view. Bot traffic is flagged, not deleted — add is_bot = false to match the dashboard. duration and ttfb are in seconds and milliseconds respectively.",
  events:
    "One row per custom/auto event (web vitals, scroll depth, clicks, JS errors...). The payload lives in the jsonb properties column; filter it with properties->>'key'.",
  sessions:
    "Pre-aggregated visit summaries keyed by the tracker's session id. is_bounce marks single-page visits; total_duration is in seconds.",
  site_settings: "Per-site tracking feature flags, stored as a jsonb features object.",
  goals: "Goal definitions. type is pageview | event | duration; condition is equals | contains | starts_with | greater_than.",
  goal_conversions: "One row per goal conversion, deduplicated per session.",
  funnels: "Funnel definitions; steps is a jsonb array of { goalId, name } in order.",
  annotations: "Dated notes overlaid on charts (deployments, campaigns, incidents).",
  email_reports: "Scheduled summary emails; recipients is a jsonb array of addresses.",
  uptime_checks: "Results of the uptime cron: status up/down and response_time in ms.",
  alerts: "Alert rules; threshold is a jsonb { value, timeframe }.",
  users: "Dashboard accounts. password_hash is redacted by this tool and must never be selected for display.",
  user_sites: "Join table granting a user a role (owner/editor/viewer) on a site.",
  site_invites: "Outstanding invitations to collaborate on a site.",
  api_tokens: "Personal access tokens for this MCP endpoint. Only sha256 hashes are stored.",
  login_attempts: "Failed dashboard login tracking, used for rate limiting.",
  banned_logins: "Clients blocked after repeated failed logins.",
  password_reset_otps: "One-time password-reset codes; hashes only.",
};

/** Result keys whose values are credentials and are never returned. */
const REDACT_KEY = /(password|token_hash|otp_hash|secret|^token$)/i;

const FORBIDDEN_KEYWORD =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|analyze|reindex|cluster|comment|refresh|lock|listen|notify|unlisten|prepare|execute|deallocate|begin|start|commit|rollback|savepoint|release|set|reset|do|call|discard|checkpoint|import|security)\b/i;

const FORBIDDEN_FUNCTION =
  /\b(pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|lo_get|dblink|pg_sleep|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|set_config|current_setting|pg_logical_emit_message)\s*\(/i;

const MAX_SQL_ROWS = 1000;

function redact(rows: unknown[]): { rows: unknown[]; redactedColumns: string[] } {
  const redacted = new Set<string>();
  const cleaned = rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
      if (REDACT_KEY.test(key)) {
        out[key] = "[redacted]";
        redacted.add(key);
      } else {
        out[key] = value;
      }
    }
    return out;
  });
  return { rows: cleaned, redactedColumns: Array.from(redacted) };
}

/**
 * Reduce a query to just its SQL skeleton for the safety checks: comments
 * dropped (so a keyword cannot hide behind one) and string literals emptied
 * (so a URL filter like '%/create%' is not mistaken for a CREATE statement).
 */
function normalizeForChecks(query: string): string {
  return query
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, "''")
    .replace(/'(?:[^']|'')*'/g, "''");
}

function validateQuery(raw: string): string {
  let query = raw.trim();
  if (!query) toolError("Empty query.");

  // A single trailing semicolon is fine; anything else means multiple statements.
  query = query.replace(/;\s*$/, "");
  const bare = normalizeForChecks(query);

  if (bare.includes(";")) {
    toolError("Only a single statement is allowed — remove the extra semicolons.");
  }
  if (!/^\s*(select|with)\b/i.test(bare)) {
    toolError("Only SELECT (or WITH ... SELECT) queries are allowed.");
  }
  if (FORBIDDEN_KEYWORD.test(bare)) {
    toolError(
      "That query contains a write or session-control keyword. This tool is read-only — use the purpose-built write tools (xine_create_goal, xine_update_site, ...) instead."
    );
  }
  if (FORBIDDEN_FUNCTION.test(bare)) {
    toolError("That query calls a filesystem, network or session function that is not permitted here.");
  }
  return query;
}

export function registerSqlTools(server: McpServer) {
  // ----------------------------------------------------------
  // Schema introspection
  // ----------------------------------------------------------
  server.registerTool(
    "xine_describe_schema",
    {
      title: "Describe the analytics database schema",
      description:
        "The full shape of the Xine database: every table, its columns with Postgres types, nullability and defaults, its indexes, and a note on what the table is for and how to query it correctly. Read this before writing anything for xine_run_sql — it tells you the exact column names, which tables carry the is_bot flag, and where the jsonb payloads live.",
      inputSchema: {
        table: z
          .string()
          .optional()
          .describe("Describe just this one table. Omit to describe them all."),
        include_indexes: z
          .boolean()
          .optional()
          .describe("Include index definitions, which show what is efficient to filter on (default true)."),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args) => {
      const tables = args.table ? [args.table] : [...KNOWN_TABLES];
      if (args.table && !KNOWN_TABLES.includes(args.table as (typeof KNOWN_TABLES)[number])) {
        toolError(`Unknown table "${args.table}". Known tables: ${KNOWN_TABLES.join(", ")}`);
      }

      const columnsRes = await db.execute(sql`
        SELECT table_name, column_name, data_type, is_nullable, column_default,
               character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN (${sql.join(
            tables.map((t) => sql`${t}`),
            sql`, `
          )})
        ORDER BY table_name, ordinal_position
      `);

      type ColRow = {
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
        character_maximum_length: number | null;
      };

      const byTable = new Map<string, { name: string; note: string; columns: unknown[]; indexes?: unknown[] }>();
      for (const row of columnsRes.rows as unknown as ColRow[]) {
        let entry = byTable.get(row.table_name);
        if (!entry) {
          entry = { name: row.table_name, note: TABLE_NOTES[row.table_name] ?? "", columns: [] };
          byTable.set(row.table_name, entry);
        }
        entry.columns.push({
          name: row.column_name,
          type: row.character_maximum_length
            ? `${row.data_type}(${row.character_maximum_length})`
            : row.data_type,
          nullable: row.is_nullable === "YES",
          default: row.column_default,
        });
      }

      if (args.include_indexes !== false) {
        const indexRes = await db.execute(sql`
          SELECT tablename, indexname, indexdef
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename IN (${sql.join(
              tables.map((t) => sql`${t}`),
              sql`, `
            )})
          ORDER BY tablename, indexname
        `);
        for (const row of indexRes.rows as unknown as {
          tablename: string;
          indexname: string;
          indexdef: string;
        }[]) {
          const entry = byTable.get(row.tablename);
          if (!entry) continue;
          entry.indexes = entry.indexes ?? [];
          entry.indexes.push({ name: row.indexname, definition: row.indexdef });
        }
      }

      return ok({
        tableCount: byTable.size,
        queryingTips: [
          "Add is_bot = false on pageviews, events and sessions to match what the dashboard shows.",
          "pageviews/events are timestamped by created_at; sessions by started_at/ended_at.",
          "Join analytics rows to a site with site_id, and restrict to your own sites.",
          "events.properties and funnels.steps are jsonb — use ->> for text access and jsonb_each_text to enumerate.",
          "Credential columns such as password_hash and token_hash are redacted in xine_run_sql results.",
        ],
        tables: Array.from(byTable.values()),
      });
    })
  );

  // ----------------------------------------------------------
  // Read-only SQL
  // ----------------------------------------------------------
  server.registerTool(
    "xine_run_sql",
    {
      title: "Run a read-only SQL query",
      description:
        "Run an arbitrary read-only SELECT against the analytics database when no purpose-built tool fits — unusual joins, custom cohorts, multi-table aggregations, ad-hoc investigation. Call xine_describe_schema first for exact column names. Enforced limits: SELECT/WITH only, one statement, executed inside a READ ONLY transaction with a statement timeout, results capped (default 200 rows, max 1000), and credential columns redacted. Needs full-account access (platform admin, or ownership of every site on the account). This can read data for any site in the database, so scope your query with site_id yourself when you only want one.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(20000)
          .describe("A single SELECT or WITH ... SELECT statement. No semicolon-separated statements."),
        max_rows: z
          .number()
          .int()
          .min(1)
          .max(MAX_SQL_ROWS)
          .optional()
          .describe(`Row cap applied around your query (default 200, max ${MAX_SQL_ROWS}).`),
        timeout_ms: z
          .number()
          .int()
          .min(1000)
          .max(55000)
          .optional()
          .describe("Statement timeout in milliseconds (default 15000)."),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireFullDataAccess(userId);

      const query = validateQuery(args.query);
      const maxRows = args.max_rows ?? 200;
      const timeoutMs = args.timeout_ms ?? 15000;

      let result: { rows: unknown[] };
      try {
        result = await db.transaction(async (tx) => {
          await tx.execute(sql`SET TRANSACTION READ ONLY`);
          await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${timeoutMs}`));
          return tx.execute(
            sql.raw(`SELECT * FROM (${query}) AS xine_mcp_query LIMIT ${maxRows + 1}`)
          );
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/statement timeout/i.test(message)) {
          toolError(
            `Query exceeded the ${timeoutMs}ms timeout. Narrow the date range, add a site_id filter, or raise timeout_ms.`
          );
        }
        if (/read-only transaction/i.test(message)) {
          toolError("That query tried to write. This tool is read-only.");
        }
        toolError(`SQL error: ${message}`);
      }

      const allRows = result.rows ?? [];
      const truncated = allRows.length > maxRows;
      const { rows, redactedColumns } = redact(truncated ? allRows.slice(0, maxRows) : allRows);

      return ok({
        rowCount: rows.length,
        truncated,
        ...(truncated ? { note: `More rows matched; only the first ${maxRows} are shown. Raise max_rows or add LIMIT/filters.` } : {}),
        ...(redactedColumns.length > 0 ? { redactedColumns } : {}),
        rows,
      });
    })
  );
}
