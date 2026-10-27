// ============================================================
// Xine MCP — Raw Data Access Tools
// Row-level access to pageviews, events and sessions, plus
// per-visitor journey reconstruction. These are the escape
// hatch for questions the aggregate reports don't answer.
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { events, goalConversions, goals, pageviews, sessions } from "@/lib/db/schema";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { resolveSiteScope, toolError } from "../auth";
import { dateRangeParams, getUserId, guard, ok, resolveDateRange, siteIdParam } from "../helpers";

const MAX_ROWS = 500;

const rowLimitParam = z
  .number()
  .int()
  .min(1)
  .max(MAX_ROWS)
  .optional()
  .describe(`Rows to return (default 50, max ${MAX_ROWS}).`);

const offsetParam = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe("Rows to skip — page through large result sets by increasing this (default 0).");

const includeBotsParam = z
  .boolean()
  .optional()
  .describe(
    "Include traffic flagged as bot. Default false, which matches the dashboard. Set true to audit the bot filter for false positives."
  );

const orderParam = z
  .enum(["newest", "oldest"])
  .optional()
  .describe('Sort direction by timestamp. Default "newest".');

/** IN (...) list of site uuids for hand-written SQL. */
function siteIdList(siteIds: string[]): SQL {
  return sql.join(
    siteIds.map((id) => sql`${id}::uuid`),
    sql`, `
  );
}

export function registerRawDataTools(server: McpServer) {
  // ----------------------------------------------------------
  // Raw pageviews
  // ----------------------------------------------------------
  server.registerTool(
    "xine_query_pageviews",
    {
      title: "Query raw pageviews",
      description:
        "Row-level pageview records with every stored column: url, title, referrer, UTM tags, visitor_id, session_id, country, city, continent, browser, os, device, screen, language, timezone, connection_type, duration, ttfb, and the bot verdict (is_bot, bot_reason, bot_score). All filters are optional and combined with AND. Use this when an aggregate report cannot answer the question — e.g. the actual hits from Germany on /pricing yesterday. Returns a total count alongside the page of rows, so you can tell how much matched.",
      inputSchema: {
        site_id: siteIdParam,
        ...dateRangeParams,
        url: z.string().optional().describe('Exact URL path match, e.g. "/pricing".'),
        url_contains: z.string().optional().describe('Substring match on the URL, e.g. "/blog/".'),
        referrer_contains: z.string().optional().describe('Substring match on the referrer, e.g. "google".'),
        country: z.string().optional().describe('Two-letter country code, e.g. "DE".'),
        city: z.string().optional(),
        continent: z.string().optional(),
        browser: z.string().optional().describe('e.g. "Chrome".'),
        os: z.string().optional().describe('e.g. "Windows".'),
        device: z.string().optional().describe('"desktop", "mobile" or "tablet".'),
        language: z.string().optional().describe('e.g. "en-US".'),
        timezone: z.string().optional().describe('e.g. "Europe/Berlin".'),
        connection_type: z.string().optional().describe('e.g. "4g".'),
        utm_source: z.string().optional(),
        utm_medium: z.string().optional(),
        utm_campaign: z.string().optional(),
        visitor_id: z.string().optional().describe("Restrict to one visitor."),
        session_id: z.string().optional().describe("Restrict to one session."),
        include_bots: includeBotsParam,
        order: orderParam,
        limit: rowLimitParam,
        offset: offsetParam,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;

      const conds: SQL[] = [
        gte(pageviews.created_at, dateRange.from),
        lte(pageviews.created_at, dateRange.to),
      ];
      conds.push(siteIds.length > 0 ? inArray(pageviews.site_id, siteIds) : sql`1 = 0`);
      if (!args.include_bots) conds.push(eq(pageviews.is_bot, false));

      if (args.url) conds.push(eq(pageviews.url, args.url));
      if (args.url_contains) conds.push(sql`${pageviews.url} ILIKE ${"%" + args.url_contains + "%"}`);
      if (args.referrer_contains)
        conds.push(sql`${pageviews.referrer} ILIKE ${"%" + args.referrer_contains + "%"}`);
      if (args.country) conds.push(eq(pageviews.country, args.country));
      if (args.city) conds.push(eq(pageviews.city, args.city));
      if (args.continent) conds.push(eq(pageviews.continent, args.continent));
      if (args.browser) conds.push(eq(pageviews.browser, args.browser));
      if (args.os) conds.push(eq(pageviews.os, args.os));
      if (args.device) conds.push(sql`LOWER(${pageviews.device}) = ${args.device.toLowerCase()}`);
      if (args.language) conds.push(eq(pageviews.language, args.language));
      if (args.timezone) conds.push(eq(pageviews.timezone, args.timezone));
      if (args.connection_type) conds.push(eq(pageviews.connection_type, args.connection_type));
      if (args.utm_source) conds.push(eq(pageviews.utm_source, args.utm_source));
      if (args.utm_medium) conds.push(eq(pageviews.utm_medium, args.utm_medium));
      if (args.utm_campaign) conds.push(eq(pageviews.utm_campaign, args.utm_campaign));
      if (args.visitor_id) conds.push(eq(pageviews.visitor_id, args.visitor_id));
      if (args.session_id) conds.push(eq(pageviews.session_id, args.session_id));

      const where = and(...conds);
      const [rows, totalRes] = await Promise.all([
        db
          .select()
          .from(pageviews)
          .where(where)
          .orderBy(args.order === "oldest" ? asc(pageviews.created_at) : desc(pageviews.created_at))
          .limit(limit)
          .offset(offset),
        db.select({ total: sql<number>`COUNT(*)::int` }).from(pageviews).where(where),
      ]);

      const total = totalRes[0]?.total ?? 0;
      return ok({
        total,
        returned: rows.length,
        limit,
        offset,
        nextOffset: offset + rows.length < total ? offset + rows.length : null,
        rows,
      });
    })
  );

  // ----------------------------------------------------------
  // Raw events
  // ----------------------------------------------------------
  server.registerTool(
    "xine_query_events",
    {
      title: "Query raw custom events",
      description:
        "Row-level custom event records including the full JSON properties payload. Covers everything the tracker emits: custom events, web vitals (LCP/FCP/CLS/INP/TTFB), scroll depth, outbound clicks, JS errors, click tracking, rage clicks, file downloads and form abandonment. You can filter on a key inside the properties JSON — e.g. name \"web_vital\" with property_key \"metric\" and property_value \"LCP\". Call xine_get_event_properties first to learn which keys exist.",
      inputSchema: {
        site_id: siteIdParam,
        ...dateRangeParams,
        name: z.string().optional().describe('Exact event name, e.g. "web_vital", "js_error", "scroll_depth".'),
        name_contains: z.string().optional().describe("Substring match on the event name."),
        url_contains: z.string().optional().describe("Substring match on the page URL the event fired on."),
        property_key: z
          .string()
          .optional()
          .describe('Only events whose properties JSON contains this key, e.g. "metric" or "message".'),
        property_value: z
          .string()
          .optional()
          .describe("Require property_key to equal this value (compared as text). Requires property_key."),
        property_contains: z
          .string()
          .optional()
          .describe("Require property_key's value to contain this substring. Requires property_key."),
        visitor_id: z.string().optional(),
        session_id: z.string().optional(),
        include_bots: includeBotsParam,
        order: orderParam,
        limit: rowLimitParam,
        offset: offsetParam,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;

      if ((args.property_value !== undefined || args.property_contains !== undefined) && !args.property_key) {
        toolError("property_value / property_contains need property_key as well.");
      }

      const conds: SQL[] = [gte(events.created_at, dateRange.from), lte(events.created_at, dateRange.to)];
      conds.push(siteIds.length > 0 ? inArray(events.site_id, siteIds) : sql`1 = 0`);
      if (!args.include_bots) conds.push(eq(events.is_bot, false));

      if (args.name) conds.push(eq(events.name, args.name));
      if (args.name_contains) conds.push(sql`${events.name} ILIKE ${"%" + args.name_contains + "%"}`);
      if (args.url_contains) conds.push(sql`${events.url} ILIKE ${"%" + args.url_contains + "%"}`);
      if (args.visitor_id) conds.push(eq(events.visitor_id, args.visitor_id));
      if (args.session_id) conds.push(eq(events.session_id, args.session_id));

      if (args.property_key) {
        conds.push(sql`jsonb_exists(${events.properties}, ${args.property_key})`);
        if (args.property_value !== undefined) {
          conds.push(sql`(${events.properties} ->> ${args.property_key}) = ${args.property_value}`);
        }
        if (args.property_contains !== undefined) {
          conds.push(
            sql`(${events.properties} ->> ${args.property_key}) ILIKE ${"%" + args.property_contains + "%"}`
          );
        }
      }

      const where = and(...conds);
      const [rows, totalRes] = await Promise.all([
        db
          .select()
          .from(events)
          .where(where)
          .orderBy(args.order === "oldest" ? asc(events.created_at) : desc(events.created_at))
          .limit(limit)
          .offset(offset),
        db.select({ total: sql<number>`COUNT(*)::int` }).from(events).where(where),
      ]);

      const total = totalRes[0]?.total ?? 0;
      return ok({
        total,
        returned: rows.length,
        limit,
        offset,
        nextOffset: offset + rows.length < total ? offset + rows.length : null,
        rows,
      });
    })
  );

  // ----------------------------------------------------------
  // Raw sessions
  // ----------------------------------------------------------
  server.registerTool(
    "xine_query_sessions",
    {
      title: "Query raw sessions",
      description:
        "Row-level session records: entry_page, exit_page, page_count, total_duration (seconds), bounce flag, referrer, UTM tags, geo, browser/os/device, screen, language, timezone and start/end timestamps. Use it to isolate specific kinds of visit — long sessions, deep sessions, bounced sessions from one campaign.",
      inputSchema: {
        site_id: siteIdParam,
        ...dateRangeParams,
        entry_page: z.string().optional().describe("Exact entry page path."),
        exit_page: z.string().optional().describe("Exact exit page path."),
        is_bounce: z
          .boolean()
          .optional()
          .describe("true = single-page visits only, false = engaged (multi-page) visits only."),
        country: z.string().optional(),
        browser: z.string().optional(),
        device: z.string().optional(),
        utm_campaign: z.string().optional(),
        visitor_id: z.string().optional(),
        min_pages: z.number().int().min(1).optional().describe("Only sessions with at least this many pageviews."),
        min_duration: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Only sessions lasting at least this many seconds."),
        include_bots: includeBotsParam,
        order: orderParam,
        limit: rowLimitParam,
        offset: offsetParam,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;

      const conds: SQL[] = [
        gte(sessions.started_at, dateRange.from),
        lte(sessions.started_at, dateRange.to),
      ];
      conds.push(siteIds.length > 0 ? inArray(sessions.site_id, siteIds) : sql`1 = 0`);
      if (!args.include_bots) conds.push(eq(sessions.is_bot, false));

      if (args.entry_page) conds.push(eq(sessions.entry_page, args.entry_page));
      if (args.exit_page) conds.push(eq(sessions.exit_page, args.exit_page));
      if (args.is_bounce !== undefined) conds.push(eq(sessions.is_bounce, args.is_bounce));
      if (args.country) conds.push(eq(sessions.country, args.country));
      if (args.browser) conds.push(eq(sessions.browser, args.browser));
      if (args.device) conds.push(sql`LOWER(${sessions.device}) = ${args.device.toLowerCase()}`);
      if (args.utm_campaign) conds.push(eq(sessions.utm_campaign, args.utm_campaign));
      if (args.visitor_id) conds.push(eq(sessions.visitor_id, args.visitor_id));
      if (args.min_pages !== undefined) conds.push(gte(sessions.page_count, args.min_pages));
      if (args.min_duration !== undefined) conds.push(gte(sessions.total_duration, args.min_duration));

      const where = and(...conds);
      const [rows, totalRes] = await Promise.all([
        db
          .select()
          .from(sessions)
          .where(where)
          .orderBy(args.order === "oldest" ? asc(sessions.started_at) : desc(sessions.started_at))
          .limit(limit)
          .offset(offset),
        db.select({ total: sql<number>`COUNT(*)::int` }).from(sessions).where(where),
      ]);

      const total = totalRes[0]?.total ?? 0;
      return ok({
        total,
        returned: rows.length,
        limit,
        offset,
        nextOffset: offset + rows.length < total ? offset + rows.length : null,
        rows,
      });
    })
  );

  // ----------------------------------------------------------
  // Visitor / session journey
  // ----------------------------------------------------------
  server.registerTool(
    "xine_get_visitor_journey",
    {
      title: "Get visitor or session journey",
      description:
        "Reconstruct everything one visitor or one session did, as a single chronological timeline merging pageviews, custom events and goal conversions, plus their session summaries. Pass either visitor_id (every visit by that visitor) or session_id (one visit). Get ids from xine_query_pageviews, xine_query_sessions or xine_get_realtime.",
      inputSchema: {
        site_id: siteIdParam,
        visitor_id: z.string().optional().describe("Visitor id — returns every visit by this visitor in the range."),
        session_id: z.string().optional().describe("Session id — returns just that one visit."),
        ...dateRangeParams,
        limit: rowLimitParam,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const limit = args.limit ?? 200;

      if (!args.visitor_id && !args.session_id) {
        toolError("Pass either visitor_id or session_id.");
      }
      if (siteIds.length === 0) return ok({ sessions: [], timeline: [] });

      const pvWhere = and(
        inArray(pageviews.site_id, siteIds),
        gte(pageviews.created_at, dateRange.from),
        lte(pageviews.created_at, dateRange.to),
        args.session_id
          ? eq(pageviews.session_id, args.session_id)
          : eq(pageviews.visitor_id, args.visitor_id as string)
      );
      const evWhere = and(
        inArray(events.site_id, siteIds),
        gte(events.created_at, dateRange.from),
        lte(events.created_at, dateRange.to),
        args.session_id ? eq(events.session_id, args.session_id) : eq(events.visitor_id, args.visitor_id as string)
      );
      const sessWhere = and(
        inArray(sessions.site_id, siteIds),
        gte(sessions.started_at, dateRange.from),
        lte(sessions.started_at, dateRange.to),
        args.session_id ? eq(sessions.id, args.session_id) : eq(sessions.visitor_id, args.visitor_id as string)
      );
      const convWhere = and(
        inArray(goalConversions.site_id, siteIds),
        gte(goalConversions.created_at, dateRange.from),
        lte(goalConversions.created_at, dateRange.to),
        args.session_id
          ? eq(goalConversions.session_id, args.session_id)
          : eq(goalConversions.visitor_id, args.visitor_id as string)
      );

      const [pvRows, evRows, sessRows, convRows] = await Promise.all([
        db.select().from(pageviews).where(pvWhere).orderBy(asc(pageviews.created_at)).limit(limit),
        db.select().from(events).where(evWhere).orderBy(asc(events.created_at)).limit(limit),
        db.select().from(sessions).where(sessWhere).orderBy(asc(sessions.started_at)).limit(limit),
        db
          .select({
            created_at: goalConversions.created_at,
            session_id: goalConversions.session_id,
            goal_id: goalConversions.goal_id,
            goal_name: goals.name,
          })
          .from(goalConversions)
          .leftJoin(goals, eq(goalConversions.goal_id, goals.id))
          .where(convWhere)
          .orderBy(asc(goalConversions.created_at))
          .limit(limit),
      ]);

      type TimelineItem = {
        at: Date | null;
        kind: "pageview" | "event" | "conversion";
        session_id: string | null;
        label: string | null;
        detail: Record<string, unknown>;
      };

      const timeline: TimelineItem[] = [
        ...pvRows.map((r) => ({
          at: r.created_at,
          kind: "pageview" as const,
          session_id: r.session_id,
          label: r.url,
          detail: {
            title: r.title,
            referrer: r.referrer,
            duration: r.duration,
            ttfb: r.ttfb,
            country: r.country,
            city: r.city,
            browser: r.browser,
            os: r.os,
            device: r.device,
            is_bot: r.is_bot,
          },
        })),
        ...evRows.map((r) => ({
          at: r.created_at,
          kind: "event" as const,
          session_id: r.session_id,
          label: r.name,
          detail: { url: r.url, properties: r.properties, is_bot: r.is_bot },
        })),
        ...convRows.map((r) => ({
          at: r.created_at,
          kind: "conversion" as const,
          session_id: r.session_id,
          label: r.goal_name,
          detail: { goal_id: r.goal_id },
        })),
      ].sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));

      return ok({
        query: { visitor_id: args.visitor_id ?? null, session_id: args.session_id ?? null },
        sessionCount: sessRows.length,
        sessions: sessRows,
        counts: { pageviews: pvRows.length, events: evRows.length, conversions: convRows.length },
        timeline,
      });
    })
  );

  // ----------------------------------------------------------
  // Event property discovery
  // ----------------------------------------------------------
  server.registerTool(
    "xine_get_event_properties",
    {
      title: "Discover event property keys and values",
      description:
        "Profile the JSON properties payload of custom events: which keys exist, how often they appear, and the most common values for each. Call this before filtering xine_query_events by property_key/property_value so you know what is actually stored.",
      inputSchema: {
        site_id: siteIdParam,
        event_name: z.string().optional().describe("Limit to one event name. Omit to profile every event."),
        ...dateRangeParams,
        max_values_per_key: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("How many top values to list per key (default 10)."),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const maxValues = args.max_values_per_key ?? 10;
      if (siteIds.length === 0) return ok({ keys: [] });

      const nameFilter = args.event_name ? sql`AND e.name = ${args.event_name}` : sql``;
      const result = await db.execute(sql`
        SELECT kv.key AS key, kv.value AS value, COUNT(*)::int AS count
        FROM events e, LATERAL jsonb_each_text(e.properties) AS kv
        WHERE e.site_id IN (${siteIdList(siteIds)})
          AND e.created_at >= ${dateRange.from}
          AND e.created_at <= ${dateRange.to}
          AND e.is_bot = false
          ${nameFilter}
        GROUP BY kv.key, kv.value
        ORDER BY COUNT(*) DESC
        LIMIT 2000
      `);

      const rows = result.rows as unknown as { key: string; value: string; count: number }[];
      const byKey = new Map<
        string,
        { key: string; totalOccurrences: number; distinctValues: number; topValues: { value: string; count: number }[] }
      >();
      for (const row of rows) {
        let entry = byKey.get(row.key);
        if (!entry) {
          entry = { key: row.key, totalOccurrences: 0, distinctValues: 0, topValues: [] };
          byKey.set(row.key, entry);
        }
        entry.totalOccurrences += row.count;
        entry.distinctValues += 1;
        if (entry.topValues.length < maxValues) entry.topValues.push({ value: row.value, count: row.count });
      }

      return ok({
        event_name: args.event_name ?? "(all events)",
        note: "Values are sampled from the 2000 most common key/value pairs in the period.",
        keys: Array.from(byKey.values()).sort((a, b) => b.totalOccurrences - a.totalOccurrences),
      });
    })
  );
}
