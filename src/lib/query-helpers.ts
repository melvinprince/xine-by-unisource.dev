// ============================================================
// Xine — Shared Query Helpers
// Centralized, validated helpers used by both queries.ts and
// queries-advanced.ts. Keeps raw SQL patterns in a single
// auditable location.
// ============================================================

import { sql, type SQL } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import { differenceInDays } from "date-fns";
import type { DateRange } from "./types";

/**
 * Supported time-bucket intervals for timeseries queries.
 * This is a closed set — only these values are ever inlined
 * into SQL via sql.raw(), guaranteeing injection safety.
 */
type TimeBucket = "hour" | "day";

/** PostgreSQL to_char format strings mapped to each bucket. */
const BUCKET_FORMATS: Record<TimeBucket, string> = {
  hour: "YYYY-MM-DD HH24:00",
  day: "YYYY-MM-DD",
};

/**
 * Determines the appropriate time bucket for a date range.
 *  - Ranges ≤ 2 days  → hourly buckets
 *  - Ranges > 2 days  → daily  buckets
 */
export function getTimeBucket(dateRange: DateRange): TimeBucket {
  const daysDiff = differenceInDays(dateRange.to, dateRange.from);
  return daysDiff <= 2 ? "hour" : "day";
}

/**
 * Builds a deterministic SQL date expression for timeseries grouping.
 *
 * Uses `sql.raw()` to inline the bucket interval and format string
 * as SQL literals (not parameterized values). This is critical because
 * PostgreSQL requires the exact same expression text in SELECT,
 * GROUP BY, and ORDER BY clauses — parameterized values get different
 * slot numbers ($1 vs $6) on each reference, causing GROUP BY mismatches.
 *
 * Safety: `bucket` is derived from `getTimeBucket()` which returns
 * only `"hour"` or `"day"`. `format` is looked up from the frozen
 * `BUCKET_FORMATS` map. Neither value ever originates from user input.
 *
 * @param dateRange - The selected date range (determines bucket size)
 * @param column    - The timestamp column to bucket (e.g. pageviews.created_at)
 * @returns A reusable SQL<string> expression safe for select/groupBy/orderBy
 *
 * @example
 * ```ts
 * const dateExpr = buildDateExpr(dateRange, pageviews.created_at);
 * const rows = await db
 *   .select({ date: dateExpr, count: sql<number>`COUNT(*)::int` })
 *   .from(pageviews)
 *   .where(...)
 *   .groupBy(dateExpr)
 *   .orderBy(dateExpr);
 * ```
 */
export function buildDateExpr(
  dateRange: DateRange,
  column: Column
): SQL<string> {
  const bucket = getTimeBucket(dateRange);
  const format = BUCKET_FORMATS[bucket];

  return sql<string>`to_char(DATE_TRUNC(${sql.raw(`'${bucket}'`)}, ${column}), ${sql.raw(`'${format}'`)})`;
}
