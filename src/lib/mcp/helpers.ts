// ============================================================
// Xine — MCP Tool Helpers
// Shared param schemas, result formatting, and error handling
// for all MCP tools.
// ============================================================

import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { parseDateRange } from "@/lib/api-helpers";
import { ValidationError } from "@/lib/validation";
import type { DateRange } from "@/lib/types";
import { McpToolError, toolError } from "./auth";

// ---- Common parameter schemas ----

export const siteIdParam = z
  .string()
  .describe('Site UUID from xine_list_sites, or "all" for every site you can access.');

export const singleSiteIdParam = z
  .string()
  .uuid()
  .describe("Site UUID from xine_list_sites.");

export const dateRangeParams = {
  range: z
    .enum(["1h", "3h", "12h", "24h", "7d", "30d", "90d"])
    .optional()
    .describe('Relative time range ending now. Defaults to "30d". Ignored when "from" is provided.'),
  from: z
    .string()
    .optional()
    .describe('Start date/time (ISO 8601, e.g. "2026-06-01"). Overrides "range".'),
  to: z
    .string()
    .optional()
    .describe("End date/time (ISO 8601). Defaults to now."),
};

export const limitParam = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe("Maximum number of rows to return (default 10, max 100).");

export const filtersParam = z
  .object({
    countries: z.array(z.string()).optional().describe('Country codes, e.g. ["US", "DE"].'),
    browsers: z.array(z.string()).optional().describe('Browser names, e.g. ["Chrome", "Safari"].'),
    devices: z.array(z.string()).optional().describe('Device types: "desktop", "mobile", "tablet".'),
    sources: z.array(z.string()).optional().describe('Referrer hosts, e.g. ["google.com"].'),
    pages: z.array(z.string()).optional().describe('URL paths, e.g. ["/pricing"].'),
  })
  .optional()
  .describe("Optional dimension filters to narrow the data.");

// ---- Helpers ----

export function resolveDateRange(args: { range?: string; from?: string; to?: string }): DateRange {
  const parsed = parseDateRange(args.from ?? null, args.to ?? null, args.range ?? null);
  if (!parsed) {
    toolError('Invalid date range: "from" and "to" must be valid dates with "from" before "to".');
  }
  return parsed;
}

/** Format a successful tool result as pretty-printed JSON. */
export function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Wrap a tool callback: expected errors (McpToolError / ValidationError)
 * surface their message to the client; anything else is logged and
 * returned as a generic failure.
 */
export function guard<A extends unknown[]>(
  fn: (...args: A) => Promise<CallToolResult>
): (...args: A) => Promise<CallToolResult> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof McpToolError || error instanceof ValidationError) {
        return errResult(error.message);
      }
      console.error("[mcp] tool error:", error);
      return errResult("Internal error while executing the tool. Check the server logs.");
    }
  };
}

/** Extract the authenticated user id injected by the /api/mcp bearer auth. */
export function getUserId(extra: { authInfo?: AuthInfo }): string {
  const userId = extra.authInfo?.extra?.userId;
  if (typeof userId !== "string" || !userId) {
    toolError("Unauthorized: missing or invalid API token.");
  }
  return userId;
}
