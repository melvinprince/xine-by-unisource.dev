// ============================================================
// Xine MCP — Cross-cutting Insight Tools
// Cohort retention, bot auditing, period comparison, and
// generic breakdown/timeseries over any stored dimension.
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { events, pageviews, sessions } from "@/lib/db/schema";
import { sql, type SQL } from "drizzle-orm";
import { getOverviewStats } from "@/lib/queries";
import { getBotBreakdown } from "@/lib/queries-advanced";
import type { DateRange } from "@/lib/types";
import { resolveSiteScope, toolError } from "../auth";
import {
  dateRangeParams,
  getUserId,
  guard,
  limitParam,
  ok,
  resolveDateRange,
  siteIdParam,
} from "../helpers";

/** Dimensions available on the pageviews table for generic breakdowns. */
const PAGEVIEW_DIMENSIONS = {
  url: pageviews.url,
  title: pageviews.title,
  referrer: pageviews.referrer,
  utm_source: pageviews.utm_source,
  utm_medium: pageviews.utm_medium,
  utm_campaign: pageviews.utm_campaign,
  country: pageviews.country,
  city: pageviews.city,
  continent: pageviews.continent,
  browser: pageviews.browser,
  os: pageviews.os,
  device: pageviews.device,
  screen: pageviews.screen,
  language: pageviews.language,
  timezone: pageviews.timezone,
  connection_type: pageviews.connection_type,
} as const;

type PageviewDimension = keyof typeof PAGEVIEW_DIMENSIONS;

const INTERVALS = { hour: "hour", day: "day", week: "week", month: "month" } as const;

function siteIdList(siteIds: string[]): SQL {
  return sql.join(
    siteIds.map((id) => sql`${id}::uuid`),
    sql`, `
  );
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function registerInsightTools(server: McpServer) {
  // ----------------------------------------------------------
  // Generic dimension breakdown
  // ----------------------------------------------------------
  server.registerTool(
    "xine_get_dimension_breakdown",
    {
      title: "Break traffic down by any dimension",
      description:
        "Group traffic by any single stored pageview dimension and get pageviews, unique visitors and sessions for each value. Dimensions: url, title, referrer, utm_source, utm_medium, utm_campaign, country, city, continent, browser, os, device, screen, language, timezone, connection_type. This complements xine_get_breakdown (which has the curated reports like exit rates and source quality) by covering the dimensions those reports omit — operating systems, languages, timezones and screen sizes. Note: city and continent are only populated when the hosting layer sends visitor-location headers (x-vercel-ip-city / cf-ipcity); on installs without them these two come back empty, which is a collection gap and not a missing row.",
      inputSchema: {
        site_id: siteIdParam,
        dimension: z
          .enum(Object.keys(PAGEVIEW_DIMENSIONS) as [PageviewDimension, ...PageviewDimension[]])
          .describe("Which stored column to group by."),
        ...dateRangeParams,
        limit: limitParam,
        include_bots: z
          .boolean()
          .optional()
          .describe("Include bot-flagged traffic (default false)."),
        include_nulls: z
          .boolean()
          .optional()
          .describe('Include rows where the dimension is NULL/empty, grouped as "(not set)" (default false).'),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const limit = args.limit ?? 10;
      if (siteIds.length === 0) return ok({ dimension: args.dimension, total: 0, rows: [] });

      const col = PAGEVIEW_DIMENSIONS[args.dimension];
      const botFilter = args.include_bots ? sql`` : sql`AND is_bot = false`;
      const nullFilter = args.include_nulls ? sql`` : sql`AND ${col} IS NOT NULL AND ${col} <> ''`;

      const result = await db.execute(sql`
        SELECT
          COALESCE(NULLIF(${col}, ''), '(not set)') AS value,
          COUNT(*)::int AS pageviews,
          COUNT(DISTINCT visitor_id)::int AS visitors,
          COUNT(DISTINCT session_id)::int AS sessions
        FROM ${pageviews}
        WHERE site_id IN (${siteIdList(siteIds)})
          AND created_at >= ${dateRange.from}
          AND created_at <= ${dateRange.to}
          ${botFilter}
          ${nullFilter}
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT ${limit}
      `);

      const rows = result.rows as unknown as {
        value: string;
        pageviews: number;
        visitors: number;
        sessions: number;
      }[];
      const grandTotal = rows.reduce((sum, r) => sum + r.pageviews, 0);

      return ok({
        dimension: args.dimension,
        period: { from: dateRange.from, to: dateRange.to },
        rowsReturned: rows.length,
        rows: rows.map((r) => ({
          ...r,
          shareOfReturnedPageviews: grandTotal > 0 ? Number(((r.pageviews / grandTotal) * 100).toFixed(1)) : 0,
        })),
      });
    })
  );

  // ----------------------------------------------------------
  // Generic metric timeseries
  // ----------------------------------------------------------
  server.registerTool(
    "xine_get_metric_timeseries",
    {
      title: "Get a timeseries for one metric at a chosen interval",
      description:
        "Bucket a single metric over time at an interval you choose: hour, day, week or month. Metrics: pageviews, visitors (unique), sessions, events, bounce_rate (%), avg_session_duration (seconds). Unlike xine_get_timeseries, which picks the bucket size for you, this lets you control the grain — e.g. monthly pageviews across a year, or hourly visitors for one day.",
      inputSchema: {
        site_id: siteIdParam,
        metric: z
          .enum(["pageviews", "visitors", "sessions", "events", "bounce_rate", "avg_session_duration"])
          .describe("Which metric to chart."),
        interval: z.enum(["hour", "day", "week", "month"]).describe("Bucket size."),
        ...dateRangeParams,
        include_bots: z.boolean().optional().describe("Include bot-flagged traffic (default false)."),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      if (siteIds.length === 0) return ok({ metric: args.metric, points: [] });

      const bucket = sql.raw(`'${INTERVALS[args.interval]}'`);
      const botFilter = args.include_bots ? sql`` : sql`AND is_bot = false`;
      const scope = sql`site_id IN (${siteIdList(siteIds)})`;

      let query: SQL;
      if (args.metric === "pageviews" || args.metric === "visitors") {
        const agg =
          args.metric === "pageviews" ? sql`COUNT(*)::int` : sql`COUNT(DISTINCT visitor_id)::int`;
        query = sql`
          SELECT DATE_TRUNC(${bucket}, created_at) AS bucket, ${agg} AS value
          FROM ${pageviews}
          WHERE ${scope} AND created_at >= ${dateRange.from} AND created_at <= ${dateRange.to} ${botFilter}
          GROUP BY 1 ORDER BY 1
        `;
      } else if (args.metric === "events") {
        query = sql`
          SELECT DATE_TRUNC(${bucket}, created_at) AS bucket, COUNT(*)::int AS value
          FROM ${events}
          WHERE ${scope} AND created_at >= ${dateRange.from} AND created_at <= ${dateRange.to} ${botFilter}
          GROUP BY 1 ORDER BY 1
        `;
      } else {
        const agg =
          args.metric === "sessions"
            ? sql`COUNT(*)::int`
            : args.metric === "bounce_rate"
              ? sql`ROUND(100.0 * COUNT(*) FILTER (WHERE is_bounce = true) / NULLIF(COUNT(*), 0), 1)::float`
              : sql`ROUND(COALESCE(AVG(total_duration), 0))::int`;
        query = sql`
          SELECT DATE_TRUNC(${bucket}, started_at) AS bucket, ${agg} AS value
          FROM ${sessions}
          WHERE ${scope} AND started_at >= ${dateRange.from} AND started_at <= ${dateRange.to} ${botFilter}
          GROUP BY 1 ORDER BY 1
        `;
      }

      const result = await db.execute(query);
      const points = (result.rows as unknown as { bucket: string; value: number }[]).map((r) => ({
        bucket: r.bucket,
        value: r.value ?? 0,
      }));

      return ok({
        metric: args.metric,
        interval: args.interval,
        period: { from: dateRange.from, to: dateRange.to },
        points,
      });
    })
  );

  // ----------------------------------------------------------
  // Period comparison
  // ----------------------------------------------------------
  server.registerTool(
    "xine_compare_periods",
    {
      title: "Compare two periods side by side",
      description:
        "Compare headline metrics (visitors, pageviews, avg duration, bounce rate) between two arbitrary periods, with absolute and percentage deltas. Period A is the normal range/from/to. Period B defaults to the immediately preceding period of the same length; set compare to \"previous_year\" to shift back a year, or \"custom\" and pass compare_from/compare_to. Optionally also compares one dimension breakdown so you can see which pages or sources moved.",
      inputSchema: {
        site_id: siteIdParam,
        ...dateRangeParams,
        compare: z
          .enum(["previous_period", "previous_year", "custom"])
          .optional()
          .describe('Which baseline to compare against. Default "previous_period".'),
        compare_from: z.string().optional().describe('Baseline start (ISO 8601). Required when compare is "custom".'),
        compare_to: z.string().optional().describe('Baseline end (ISO 8601). Required when compare is "custom".'),
        dimension: z
          .enum(Object.keys(PAGEVIEW_DIMENSIONS) as [PageviewDimension, ...PageviewDimension[]])
          .optional()
          .describe("Also compare the top values of this dimension between the two periods."),
        limit: limitParam,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const periodA = resolveDateRange(args);
      const mode = args.compare ?? "previous_period";
      const spanMs = periodA.to.getTime() - periodA.from.getTime();

      let periodB: DateRange;
      if (mode === "custom") {
        if (!args.compare_from || !args.compare_to) {
          toolError('compare "custom" needs both compare_from and compare_to.');
        }
        const from = new Date(args.compare_from as string);
        const to = new Date(args.compare_to as string);
        if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
          toolError("Invalid compare_from/compare_to — both must be valid dates with compare_from before compare_to.");
        }
        periodB = { from, to };
      } else if (mode === "previous_year") {
        const from = new Date(periodA.from);
        const to = new Date(periodA.to);
        from.setFullYear(from.getFullYear() - 1);
        to.setFullYear(to.getFullYear() - 1);
        periodB = { from, to };
      } else {
        periodB = { from: new Date(periodA.from.getTime() - spanMs), to: new Date(periodA.from) };
      }

      const [statsA, statsB] = await Promise.all([
        getOverviewStats(siteIds, periodA),
        getOverviewStats(siteIds, periodB),
      ]);

      const metrics = ["visitors", "pageviews", "avgDuration", "bounceRate"] as const;
      const comparison: Record<string, { periodA: number; periodB: number; delta: number; percentChange: number }> = {};
      for (const key of metrics) {
        const a = Number((statsA as unknown as Record<string, number>)[key] ?? 0);
        const b = Number((statsB as unknown as Record<string, number>)[key] ?? 0);
        comparison[key] = {
          periodA: a,
          periodB: b,
          delta: Number((a - b).toFixed(2)),
          percentChange: pctChange(a, b),
        };
      }

      let dimensionComparison: unknown = null;
      if (args.dimension) {
        const col = PAGEVIEW_DIMENSIONS[args.dimension];
        const limit = args.limit ?? 10;
        const breakdown = async (range: DateRange) => {
          if (siteIds.length === 0) return [] as { value: string; pageviews: number; visitors: number }[];
          const res = await db.execute(sql`
            SELECT COALESCE(NULLIF(${col}, ''), '(not set)') AS value,
                   COUNT(*)::int AS pageviews,
                   COUNT(DISTINCT visitor_id)::int AS visitors
            FROM ${pageviews}
            WHERE site_id IN (${siteIdList(siteIds)})
              AND created_at >= ${range.from} AND created_at <= ${range.to}
              AND is_bot = false
            GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}
          `);
          return res.rows as unknown as { value: string; pageviews: number; visitors: number }[];
        };

        const [rowsA, rowsB] = await Promise.all([breakdown(periodA), breakdown(periodB)]);
        const mapB = new Map(rowsB.map((r) => [r.value, r]));
        const mapA = new Map(rowsA.map((r) => [r.value, r]));
        const allValues = new Set([...mapA.keys(), ...mapB.keys()]);

        dimensionComparison = {
          dimension: args.dimension,
          rows: Array.from(allValues)
            .map((value) => {
              const a = mapA.get(value)?.pageviews ?? 0;
              const b = mapB.get(value)?.pageviews ?? 0;
              return { value, periodA: a, periodB: b, delta: a - b, percentChange: pctChange(a, b) };
            })
            .sort((x, y) => y.periodA - x.periodA),
        };
      }

      return ok({
        periodA: { from: periodA.from, to: periodA.to, stats: statsA },
        periodB: { from: periodB.from, to: periodB.to, stats: statsB, basis: mode },
        comparison,
        dimensionComparison,
      });
    })
  );

  // ----------------------------------------------------------
  // Cohort retention
  // ----------------------------------------------------------
  server.registerTool(
    "xine_get_retention",
    {
      title: "Get weekly cohort retention",
      description:
        "Weekly cohort retention: visitors are grouped into cohorts by the week of their first session, then counted again in each later week they came back. Returns one row per (cohort week, week number) with the cohort size, how many returned, and the retention percentage — plus a pivoted grid that is easier to read.",
      inputSchema: {
        site_id: siteIdParam,
        ...dateRangeParams,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      if (siteIds.length === 0) return ok({ cohorts: [], grid: [] });

      const result = await db.execute(sql`
        WITH scoped AS (
          SELECT visitor_id, started_at
          FROM ${sessions}
          WHERE site_id IN (${siteIdList(siteIds)})
            AND started_at >= ${dateRange.from}
            AND started_at <= ${dateRange.to}
            AND is_bot = false
        ),
        cohorts AS (
          SELECT visitor_id, DATE_TRUNC('week', MIN(started_at)) AS cohort_week
          FROM scoped GROUP BY visitor_id
        ),
        activity AS (
          SELECT DISTINCT visitor_id, DATE_TRUNC('week', started_at) AS activity_week
          FROM scoped
        ),
        cohort_size AS (
          SELECT cohort_week, COUNT(DISTINCT visitor_id)::int AS total_users
          FROM cohorts GROUP BY cohort_week
        )
        SELECT
          c.cohort_week AS "cohortWeek",
          s.total_users AS "cohortSize",
          (EXTRACT(EPOCH FROM (a.activity_week - c.cohort_week)) / 604800)::int AS "weekNumber",
          COUNT(DISTINCT a.visitor_id)::int AS "returnedUsers"
        FROM cohorts c
        JOIN activity a ON a.visitor_id = c.visitor_id
        JOIN cohort_size s ON s.cohort_week = c.cohort_week
        GROUP BY c.cohort_week, s.total_users, a.activity_week
        ORDER BY c.cohort_week DESC, "weekNumber" ASC
      `);

      const rows = (
        result.rows as unknown as {
          cohortWeek: string;
          cohortSize: number;
          weekNumber: number;
          returnedUsers: number;
        }[]
      ).map((r) => ({
        ...r,
        retentionPercent: r.cohortSize > 0 ? Number(((r.returnedUsers / r.cohortSize) * 100).toFixed(1)) : 0,
      }));

      const gridMap = new Map<string, { cohortWeek: string; cohortSize: number; weeks: Record<number, number> }>();
      for (const row of rows) {
        const key = String(row.cohortWeek);
        let entry = gridMap.get(key);
        if (!entry) {
          entry = { cohortWeek: key, cohortSize: row.cohortSize, weeks: {} };
          gridMap.set(key, entry);
        }
        entry.weeks[row.weekNumber] = row.retentionPercent;
      }

      return ok({
        period: { from: dateRange.from, to: dateRange.to },
        note: 'weekNumber 0 is the cohort’s own week, so its retention is always 100%. Cohorts are bounded by the requested period, so visitors first seen before "from" are counted as new here.',
        cohorts: rows,
        grid: Array.from(gridMap.values()),
      });
    })
  );

  // ----------------------------------------------------------
  // Bot audit
  // ----------------------------------------------------------
  server.registerTool(
    "xine_get_bot_audit",
    {
      title: "Audit bot-filtered traffic",
      description:
        "What the bot filter flagged and why. Returns human vs bot pageview counts, the share that was bots, and a breakdown by bot_reason with average bot_score per reason, plus a daily trend. Bot traffic is flagged rather than discarded, so use xine_query_pageviews with include_bots=true to inspect the underlying rows when a reason bucket looks wrong.",
      inputSchema: {
        site_id: siteIdParam,
        ...dateRangeParams,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      if (siteIds.length === 0) return ok({ humanPageviews: 0, botPageviews: 0, reasons: [], dailyTrend: [] });

      const [breakdown, trendRes] = await Promise.all([
        getBotBreakdown(siteIds, dateRange),
        db.execute(sql`
          SELECT DATE_TRUNC('day', created_at) AS bucket,
                 COUNT(*) FILTER (WHERE is_bot = true)::int AS bots,
                 COUNT(*) FILTER (WHERE is_bot = false)::int AS humans
          FROM ${pageviews}
          WHERE site_id IN (${siteIdList(siteIds)})
            AND created_at >= ${dateRange.from} AND created_at <= ${dateRange.to}
          GROUP BY 1 ORDER BY 1
        `),
      ]);

      return ok({
        period: { from: dateRange.from, to: dateRange.to },
        ...breakdown,
        dailyTrend: trendRes.rows,
      });
    })
  );
}
