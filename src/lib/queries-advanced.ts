// ============================================================
// Xine — Advanced Analytics Data Layer
// Server-side query functions for deep analytics, performance,
// behavior, acquisition, and realtime dashboards.
// Uses Drizzle ORM with PostgreSQL + sessions table.
// ============================================================

import { db } from "./db";
import { pageviews, events, sessions } from "./db/schema";
import { eq, gte, lte, ne, and, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { subMinutes } from "date-fns";
import {
  buildDateExpr,
  buildDimensionConditions,
  cappedPageDuration,
  cappedSessionDuration,
  getPreviousDateRange,
  localTimestamp,
  pagePathSql,
  sessionSourceClassifier,
  siteScopeSql,
  tzLiteral,
} from "./query-helpers";
import { filterStore } from "./filter-store";
import type { DimensionFilters } from "./api-helpers";
import type {
  DateRange,
  SessionAnalytics,
  NewVsReturning,
  EngagementMetrics,
  ScrollDepthEntry,
  HeatmapCell,
  PeakHour,
  EntryExitPage,
  PageExitRate,
  WebVitalTrend,
  PageWebVital,
  ErrorEntry,
  ErrorTrendPoint,
  CampaignPerformance,
  SourceQuality,
  RealtimeStats,
  ConnectionTypeEntry,
  SessionTimeseriesPoint,
  UserFlowStep,
  PagesPerSessionBucket,
  BotBreakdown,
} from "./types";

// ---- Helpers ----

function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌍";
  const codePoints = code
    .toUpperCase()
    .split("")
    .map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/**
 * Row conditions for the sessions table: start time in range, site scope,
 * bots excluded, plus the shared dimension filters (see
 * buildDimensionConditions for what each filter means). Exported so the
 * overview, sources and retention queries use exactly the same scoping.
 */
export function buildSessionFilters(siteId: string | string[], dateRange: DateRange, filters?: DimensionFilters) {
  const conditions: SQL[] = [
    gte(sessions.started_at, dateRange.from),
    lte(sessions.started_at, dateRange.to),
    eq(sessions.is_bot, false),
    siteScopeSql(sessions.site_id, siteId),
    ...buildDimensionConditions(sessions, siteId, dateRange, filters || filterStore.getStore()),
  ];
  return and(...conditions);
}

function buildEventFilters(siteId: string | string[], dateRange: DateRange, filters?: DimensionFilters) {
  const conditions: SQL[] = [
    gte(events.created_at, dateRange.from),
    lte(events.created_at, dateRange.to),
    eq(events.is_bot, false),
    siteScopeSql(events.site_id, siteId),
    ...buildDimensionConditions(events, siteId, dateRange, filters || filterStore.getStore()),
  ];
  return and(...conditions);
}

function buildPageviewFilters(siteId: string | string[], dateRange: DateRange, filters?: DimensionFilters) {
  const conditions: SQL[] = [
    gte(pageviews.created_at, dateRange.from),
    lte(pageviews.created_at, dateRange.to),
    eq(pageviews.is_bot, false),
    siteScopeSql(pageviews.site_id, siteId),
    ...buildDimensionConditions(pageviews, siteId, dateRange, filters || filterStore.getStore()),
  ];
  return and(...conditions);
}

/**
 * Distinct visitors in range who had no (human) session on the same site
 * scope before the range started.
 *
 * The lookback subquery used to interpolate siteId as a scalar
 * (`s2.site_id = ${siteId}`); the dashboard passes an array for "All
 * sites", which rendered `uuid = ($1, $2)` and failed the whole Analytics
 * page with a 500. It also counted bot sessions as prior visits.
 */
async function countNewVisitors(siteId: string | string[], range: DateRange): Promise<number> {
  const s2 = alias(sessions, "s2");
  const [row] = await db
    .select({
      newCount: sql<number>`COUNT(DISTINCT ${sessions.visitor_id})::int`,
    })
    .from(sessions)
    .where(
      and(
        buildSessionFilters(siteId, range),
        sql`NOT EXISTS (
          SELECT 1 FROM ${sessions} AS ${s2}
          WHERE ${s2.visitor_id} = ${sessions.visitor_id}
            AND ${s2.started_at} < ${range.from}
            AND ${s2.is_bot} = false
            AND ${siteScopeSql(s2.site_id, siteId)}
        )`
      )
    );
  return row?.newCount || 0;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const VITAL_THRESHOLDS: Record<string, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  FCP: { good: 1800, poor: 3000 },
  CLS: { good: 100, poor: 250 }, // CLS × 1000
  INP: { good: 200, poor: 500 },
  TTFB: { good: 800, poor: 1800 },
};

function rateVital(
  metric: string,
  value: number
): "good" | "needs-improvement" | "poor" {
  const t = VITAL_THRESHOLDS[metric];
  if (!t) return "good";
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-improvement";
  return "poor";
}

// ============================================================
// SESSION ANALYTICS
// ============================================================

export async function getSessionAnalytics(
  siteId: string | string[],
  dateRange: DateRange
): Promise<SessionAnalytics> {
  const prevRange = getPreviousDateRange(dateRange);

  const statsQuery = (range: DateRange) => db
    .select({
      totalSessions: sql<number>`COUNT(*)::int`,
      avgPages: sql<number>`COALESCE(ROUND(AVG(${sessions.page_count})::numeric, 1), 0)::float`,
      // Visit duration, capped per session at 4 h (see cappedSessionDuration).
      avgDuration: sql<number>`COALESCE(ROUND(AVG(${cappedSessionDuration(sessions.total_duration)})), 0)::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, range));

  const visitorsQuery = (range: DateRange) => db
    .select({
      total: sql<number>`COUNT(DISTINCT ${sessions.visitor_id})::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, range));

  const [
    [current],
    [prev],
    [currentVisitors],
    newVisitors
  ] = await Promise.all([
    statsQuery(dateRange),
    statsQuery(prevRange),
    visitorsQuery(dateRange),
    countNewVisitors(siteId, dateRange)
  ]);

  const totalSessions = current.totalSessions || 0;
  const prevTotalSessions = prev.totalSessions || 0;
  const avgPagesPerSession = current.avgPages || 0;
  const prevAvgPages = prev.avgPages || 0;
  const avgSessionDuration = current.avgDuration || 0;
  const prevAvgDuration = prev.avgDuration || 0;

  const totalVisitors = currentVisitors.total || 0;
  const newPct = totalVisitors > 0 ? Math.round((newVisitors / totalVisitors) * 100) : 0;

  return {
    totalSessions,
    avgPagesPerSession,
    avgSessionDuration,
    newVisitorPercent: newPct,
    returningVisitorPercent: totalVisitors > 0 ? 100 - newPct : 0,
    sessionsChange: calcChange(totalSessions, prevTotalSessions),
    pagesPerSessionChange: calcChange(avgPagesPerSession * 10, prevAvgPages * 10),
    sessionDurationChange: calcChange(avgSessionDuration, prevAvgDuration),
  };
}

export async function getNewVsReturning(
  siteId: string | string[],
  dateRange: DateRange
): Promise<NewVsReturning> {
  const totalQuery = await db
    .select({
      total: sql<number>`COUNT(DISTINCT ${sessions.visitor_id})::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange));

  const total = totalQuery[0]?.total || 0;
  const newV = Math.min(await countNewVisitors(siteId, dateRange), total);
  const retV = total - newV;
  const newPercent = total > 0 ? Math.round((newV / total) * 100) : 0;

  return {
    newVisitors: newV,
    returningVisitors: retV,
    newPercent,
    returningPercent: total > 0 ? 100 - newPercent : 0,
  };
}

export async function getSessionTimeseries(
  siteId: string | string[],
  dateRange: DateRange
): Promise<SessionTimeseriesPoint[]> {
  const dateExpr = buildDateExpr(dateRange, sessions.started_at);

  const rows = await db
    .select({
      date: dateExpr,
      sessions: sql<number>`COUNT(*)::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .groupBy(dateExpr)
    .orderBy(dateExpr);

  return rows;
}

// ============================================================
// ENGAGEMENT
// ============================================================

export async function getEngagementMetrics(
  siteId: string | string[],
  dateRange: DateRange
): Promise<EngagementMetrics> {
  const scrollSub = db
    .select({
      session_id: events.session_id,
      max_depth: sql<number>`MAX((properties->>'depth')::int)::int`.as('max_depth'),
    })
    .from(events)
    .where(and(buildEventFilters(siteId, dateRange), eq(events.name, 'scroll_depth')))
    .groupBy(events.session_id)
    .as('scroll_sub');

  const rows = await db
    .select({
      score: sql<number>`ROUND(
        LEAST(${sessions.total_duration}::float / 300, 1) * 40 +
        LEAST(${sessions.page_count}::float / 5, 1) * 30 +
        COALESCE(${scrollSub.max_depth}::float / 100, 0) * 30
      )::int`,
      scrollDepth: sql<number>`COALESCE(${scrollSub.max_depth}, 0)::int`,
      total_duration: sessions.total_duration,
      page_count: sessions.page_count,
    })
    .from(sessions)
    .leftJoin(scrollSub, eq(sessions.id, scrollSub.session_id))
    .where(buildSessionFilters(siteId, dateRange));

  // Time on page: AVG(LEAST(pageviews.duration, 30 min)) — the same
  // definition as the overview. It used to be SUM(total_duration) /
  // SUM(page_count), which mixed the longest page per session with a
  // per-page denominator.
  const [timeOnPage] = await db
    .select({
      avg: sql<number>`COALESCE(ROUND(AVG(${cappedPageDuration(pageviews.duration)})), 0)::int`,
    })
    .from(pageviews)
    .where(buildPageviewFilters(siteId, dateRange));

  if (rows.length === 0) {
    return {
      avgEngagementScore: 0,
      highlyEngaged: 0,
      moderatelyEngaged: 0,
      lowEngagement: 0,
      avgScrollDepth: 0,
      avgTimeOnPage: 0,
    };
  }

  let totalScore = 0;
  let highCount = 0;
  let midCount = 0;
  let lowCount = 0;
  let totalScrollDepth = 0;
  let scrollCount = 0;

  rows.forEach((r) => {
    const score = r.score || 0;
    totalScore += score;
    if (score >= 70) highCount++;
    else if (score >= 40) midCount++;
    else lowCount++;

    if (r.scrollDepth > 0) {
      totalScrollDepth += r.scrollDepth;
      scrollCount++;
    }
  });

  return {
    avgEngagementScore: Math.round(totalScore / rows.length),
    highlyEngaged: highCount,
    moderatelyEngaged: midCount,
    lowEngagement: lowCount,
    avgScrollDepth: scrollCount > 0 ? Math.round(totalScrollDepth / scrollCount) : 0,
    avgTimeOnPage: timeOnPage?.avg || 0,
  };
}

export async function getScrollDepthAnalysis(
  siteId: string | string[],
  dateRange: DateRange
): Promise<ScrollDepthEntry[]> {
  const rows = await db
    .select({
      depth: sql<number>`(properties->>'depth')::int`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(events)
    .where(and(buildEventFilters(siteId, dateRange), eq(events.name, 'scroll_depth')))
    .groupBy(sql`(properties->>'depth')::int`);

  const counts = new Map<number, number>();
  rows.forEach((r) => {
    if (r.depth != null) counts.set(r.depth, r.count);
  });

  const total = rows.reduce((sum, r) => sum + r.count, 0) || 1;
  return [25, 50, 75, 100].map((depth) => ({
    depth,
    count: counts.get(depth) || 0,
    percentage: Math.round(((counts.get(depth) || 0) / total) * 100),
  }));
}

// ============================================================
// TEMPORAL ANALYSIS
// ============================================================

export async function getHourlyHeatmap(
  siteId: string | string[],
  dateRange: DateRange
): Promise<HeatmapCell[]> {
  // Day-of-week / hour in the viewer's timezone, not the DB's UTC.
  const local = localTimestamp(sessions.started_at, dateRange);
  const dowExpr = sql<number>`EXTRACT(DOW FROM ${local})::int`;
  const hourExpr = sql<number>`EXTRACT(HOUR FROM ${local})::int`;
  const rows = await db
    .select({
      day: dowExpr,
      hour: hourExpr,
      value: sql<number>`COUNT(*)::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .groupBy(dowExpr, hourExpr);

  const grid = new Map<string, number>();
  rows.forEach((r) => {
    grid.set(`${r.day}-${r.hour}`, r.value);
  });

  const result: HeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      result.push({
        hour: h,
        day: d,
        dayLabel: DAY_LABELS[d],
        value: grid.get(`${d}-${h}`) || 0,
      });
    }
  }
  return result;
}

export async function getPeakHours(
  siteId: string | string[],
  dateRange: DateRange
): Promise<PeakHour[]> {
  const hourExpr = sql<number>`EXTRACT(HOUR FROM ${localTimestamp(sessions.started_at, dateRange)})::int`;
  const rows = await db
    .select({
      hour: hourExpr,
      visitors: sql<number>`COUNT(*)::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .groupBy(hourExpr)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(5);

  return rows.map((r) => ({
    hour: r.hour,
    visitors: r.visitors,
    label: `${r.hour.toString().padStart(2, "0")}:00`,
  }));
}

// ============================================================
// ENTRY / EXIT PAGE ANALYSIS
// ============================================================

export async function getEntryPages(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 10
): Promise<EntryExitPage[]> {
  const entryPath = pagePathSql(sessions.entry_page);
  const rows = await db
    .select({
      url: entryPath,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .groupBy(entryPath)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  const totalRow = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange));

  const total = totalRow[0]?.total || 1;

  return rows.map((r) => ({
    url: r.url,
    count: r.count,
    percentage: Math.round((r.count / total) * 100),
  }));
}

export async function getExitPages(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 10
): Promise<EntryExitPage[]> {
  const exitPath = pagePathSql(sessions.exit_page);
  const rows = await db
    .select({
      url: exitPath,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .groupBy(exitPath)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  const totalRow = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange));

  const total = totalRow[0]?.total || 1;

  return rows.map((r) => ({
    url: r.url,
    count: r.count,
    percentage: Math.round((r.count / total) * 100),
  }));
}

export async function getPageExitRates(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 10
): Promise<PageExitRate[]> {
  // Both sides keyed by path so ?query variants of a page share one row.
  const exitPath = pagePathSql(sessions.exit_page);
  const subExits = db
    .select({
      exit_page: sql<string>`${exitPath}`.as('exit_path'),
      exits: sql<number>`COUNT(*)::int`.as('exits'),
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .groupBy(exitPath)
    .as('sub_exits');

  const viewPath = pagePathSql(pageviews.url);
  const rows = await db
    .select({
      url: viewPath,
      views: sql<number>`COUNT(*)::int`,
      exits: sql<number>`COALESCE(${subExits.exits}, 0)::int`,
    })
    .from(pageviews)
    .leftJoin(subExits, sql`${viewPath} = ${subExits.exit_page}`)
    .where(buildPageviewFilters(siteId, dateRange))
    .groupBy(viewPath, subExits.exits)
    .orderBy(sql`COALESCE(${subExits.exits}, 0)::float / NULLIF(COUNT(*), 0) * 100 DESC`)
    .limit(limit);

  return rows.map((r) => ({
    url: r.url,
    views: r.views,
    exits: r.exits,
    exitRate: r.views > 0 ? Math.round((r.exits / r.views) * 100) : 0,
  }));
}

// ============================================================
// USER FLOW & PAGES PER SESSION
// ============================================================

export async function getUserFlows(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 15
): Promise<UserFlowStep[]> {
  const sub = db
    .select({
      session_id: pageviews.session_id,
      url: sql<string>`${pagePathSql(pageviews.url)}`.as('url'),
      prev_url: sql<string>`LAG(${pagePathSql(pageviews.url)}) OVER (PARTITION BY ${pageviews.session_id} ORDER BY ${pageviews.created_at})`.as('prev_url'),
    })
    .from(pageviews)
    .where(buildPageviewFilters(siteId, dateRange))
    .as('sub');

  const rows = await db
    .select({
      from: sub.prev_url,
      to: sub.url,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(sub)
    .where(and(sql`${sub.prev_url} IS NOT NULL`, ne(sub.prev_url, sub.url)))
    .groupBy(sub.prev_url, sub.url)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return rows;
}

export async function getPagesPerSessionDistribution(
  siteId: string | string[],
  dateRange: DateRange
): Promise<PagesPerSessionBucket[]> {
  const bucketQuery = db
    .select({
      bucket: sql<string>`
        CASE 
          WHEN ${sessions.page_count} = 1 THEN '1'
          WHEN ${sessions.page_count} = 2 THEN '2'
          WHEN ${sessions.page_count} = 3 THEN '3'
          WHEN ${sessions.page_count} <= 5 THEN '4-5'
          WHEN ${sessions.page_count} <= 10 THEN '6-10'
          ELSE '11+'
        END
      `.as('bucket'),
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .as('bq');

  const rows = await db
    .select({
      pages: bucketQuery.bucket,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(bucketQuery)
    .groupBy(bucketQuery.bucket);

  const bucketMap = new Map<string, number>();
  rows.forEach((r) => {
    if (r.pages) bucketMap.set(r.pages, r.count);
  });

  const total = rows.reduce((sum, r) => sum + r.count, 0) || 1;
  const order = ["1", "2", "3", "4-5", "6-10", "11+"];
  return order
    .filter((b) => bucketMap.has(b))
    .map((pages) => ({
      pages,
      count: bucketMap.get(pages) || 0,
      percentage: Math.round(((bucketMap.get(pages) || 0) / total) * 100),
    }));
}

// ============================================================
// WEB VITALS
// ============================================================

export async function getWebVitalsTrends(
  siteId: string | string[],
  dateRange: DateRange
): Promise<WebVitalTrend[]> {
  const dateExpr = buildDateExpr(dateRange, events.created_at);

  const rows = await db
    .select({
      metric: sql<string>`(properties->>'metric')`,
      date: dateExpr,
      avgValue: sql<number>`ROUND(AVG((properties->>'value')::numeric))::int`,
    })
    .from(events)
    .where(and(buildEventFilters(siteId, dateRange), eq(events.name, 'web_vital')))
    .groupBy(sql`(properties->>'metric')`, dateExpr);

  const metricData = new Map<string, { date: string; value: number }[]>();
  rows.forEach((r) => {
    const m = r.metric;
    if (!m) return;
    if (!metricData.has(m)) metricData.set(m, []);
    metricData.get(m)!.push({ date: r.date, value: r.avgValue });
  });

  const ttfbDateExpr = buildDateExpr(dateRange, pageviews.created_at);
  const ttfbRows = await db
    .select({
      date: ttfbDateExpr,
      avgValue: sql<number>`ROUND(AVG(${pageviews.ttfb}))::int`,
    })
    .from(pageviews)
    .where(and(buildPageviewFilters(siteId, dateRange), sql`${pageviews.ttfb} IS NOT NULL AND ${pageviews.ttfb} > 0`))
    .groupBy(ttfbDateExpr);

  if (ttfbRows.length > 0) {
    metricData.set("TTFB", ttfbRows.map((r) => ({ date: r.date, value: r.avgValue })));
  }

  const results: WebVitalTrend[] = [];
  const desiredMetrics = ["LCP", "FCP", "CLS", "INP", "TTFB"];

  desiredMetrics.forEach((metric) => {
    const trendData = metricData.get(metric) || [];
    trendData.sort((a, b) => a.date.localeCompare(b.date));
    const current = trendData.length > 0 ? trendData[trendData.length - 1].value : 0;
    results.push({
      metric,
      data: trendData,
      current,
      rating: rateVital(metric, current),
    });
  });

  return results;
}

export async function getWebVitalsByPage(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 10
): Promise<PageWebVital[]> {
  const eventPath = pagePathSql(events.url);
  const rows = await db
    .select({
      url: eventPath,
      lcp: sql<number>`ROUND(AVG((properties->>'value')::numeric) FILTER (WHERE LOWER(properties->>'metric') = 'lcp'))::int`,
      fcp: sql<number>`ROUND(AVG((properties->>'value')::numeric) FILTER (WHERE LOWER(properties->>'metric') = 'fcp'))::int`,
      cls: sql<number>`ROUND(AVG((properties->>'value')::numeric) FILTER (WHERE LOWER(properties->>'metric') = 'cls'))::int`,
      inp: sql<number>`ROUND(AVG((properties->>'value')::numeric) FILTER (WHERE LOWER(properties->>'metric') = 'inp'))::int`,
    })
    .from(events)
    .where(and(buildEventFilters(siteId, dateRange), eq(events.name, 'web_vital'), sql`${events.url} IS NOT NULL`))
    .groupBy(eventPath);

  const ttfbPath = pagePathSql(pageviews.url);
  const ttfbRows = await db
    .select({
      url: ttfbPath,
      ttfb: sql<number>`ROUND(AVG(${pageviews.ttfb}))::int`,
    })
    .from(pageviews)
    .where(and(buildPageviewFilters(siteId, dateRange), sql`${pageviews.ttfb} IS NOT NULL AND ${pageviews.ttfb} > 0`))
    .groupBy(ttfbPath);

  const ttfbMap = new Map<string, number>();
  ttfbRows.forEach((r) => ttfbMap.set(r.url, r.ttfb));

  const merged = rows.map((r) => ({
    url: r.url || "",
    lcp: r.lcp,
    fcp: r.fcp,
    cls: r.cls,
    inp: r.inp,
    ttfb: ttfbMap.get(r.url || "") || null,
  }));

  return merged
    .sort((a, b) => (b.lcp || 0) - (a.lcp || 0))
    .slice(0, limit);
}

// ============================================================
// ERROR TRACKING
// ============================================================

export async function getErrorTrend(
  siteId: string | string[],
  dateRange: DateRange
): Promise<ErrorTrendPoint[]> {
  const dateExpr = buildDateExpr(dateRange, events.created_at);

  const rows = await db
    .select({
      date: dateExpr,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(events)
    .where(and(buildEventFilters(siteId, dateRange), eq(events.name, 'js_error')))
    .groupBy(dateExpr)
    .orderBy(dateExpr);

  return rows;
}

export async function getTopErrors(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 10
): Promise<ErrorEntry[]> {
  const rows = await db
    .select({
      message: sql<string>`COALESCE(properties->>'message', 'Unknown error')`,
      count: sql<number>`COUNT(*)::int`,
      firstSeen: sql<string>`to_char(MIN(${events.created_at}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      lastSeen: sql<string>`to_char(MAX(${events.created_at}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      source: sql<string>`properties->>'source'`,
    })
    .from(events)
    .where(and(buildEventFilters(siteId, dateRange), eq(events.name, 'js_error')))
    .groupBy(sql`properties->>'message'`, sql`properties->>'source'`)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return rows.map((r) => ({
    message: r.message,
    count: r.count,
    firstSeen: r.firstSeen,
    lastSeen: r.lastSeen,
    source: r.source || undefined,
  }));
}

// ============================================================
// CAMPAIGNS / ACQUISITION
// ============================================================

export async function getCampaignPerformance(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 10
): Promise<CampaignPerformance[]> {
  // NULL and '' both mean "not set"; group them together so a source/medium
  // pair does not show up as two identical "(not set)" rows.
  const campaignExpr = sql<string>`COALESCE(NULLIF(${sessions.utm_campaign}, ''), '(not set)')`;
  const sourceExpr = sql<string>`COALESCE(NULLIF(${sessions.utm_source}, ''), '(not set)')`;
  const mediumExpr = sql<string>`COALESCE(NULLIF(${sessions.utm_medium}, ''), '(not set)')`;
  const rows = await db
    .select({
      campaign: campaignExpr,
      source: sourceExpr,
      medium: mediumExpr,
      sessions: sql<number>`COUNT(*)::int`,
      bounces: sql<number>`COUNT(*) FILTER (WHERE ${sessions.is_bounce} = true)::int`,
      totalDuration: sql<number>`SUM(${cappedSessionDuration(sessions.total_duration)})::int`,
      totalPages: sql<number>`SUM(${sessions.page_count})::int`,
    })
    .from(sessions)
    // Any UTM-tagged session, not just ones with a campaign: ChatGPT and
    // Copilot append ?utm_source=chatgpt.com with no campaign, and
    // `utm_campaign <> ''` dropped 113 of 115 tagged sessions (and every
    // NULL, since NULL <> '' is not true).
    .where(and(
      buildSessionFilters(siteId, dateRange),
      sql`(COALESCE(${sessions.utm_source}, '') <> '' OR COALESCE(${sessions.utm_medium}, '') <> '' OR COALESCE(${sessions.utm_campaign}, '') <> '')`
    ))
    .groupBy(campaignExpr, sourceExpr, mediumExpr)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return rows.map((r) => ({
    campaign: r.campaign || "(not set)",
    source: r.source || "(not set)",
    medium: r.medium || "(not set)",
    sessions: r.sessions,
    bounceRate: r.sessions > 0 ? Math.round((r.bounces / r.sessions) * 100) : 0,
    avgDuration: r.sessions > 0 ? Math.round(r.totalDuration / r.sessions) : 0,
    pagesPerSession: r.sessions > 0 ? Math.round((r.totalPages / r.sessions) * 10) / 10 : 0,
  }));
}

export async function getSourceQuality(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 10
): Promise<SourceQuality[]> {
  // Same normalised source as the overview's Top Sources (classifySource):
  // engines are grouped across hosts/ccTLDs, UTM tags take precedence,
  // self-referrals fold into Direct, and Direct is listed as a row.
  // Classified once per session in a derived table, grouped on the column.
  const src = db
    .select({
      source: sql<string>`${sessionSourceClassifier().name}`.as("source"),
      visitor_id: sessions.visitor_id,
      is_bounce: sessions.is_bounce,
      duration: sql<number>`${cappedSessionDuration(sessions.total_duration)}`.as("duration"),
      page_count: sessions.page_count,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .as("src");

  // Rows stay in volume (sessions) order: re-sorting the top-N by quality
  // made the table look like a volume ranking that it wasn't.
  const rows = await db
    .select({
      source: src.source,
      visitors: sql<number>`COUNT(DISTINCT ${src.visitor_id})::int`,
      sessions: sql<number>`COUNT(*)::int`,
      bounces: sql<number>`COUNT(*) FILTER (WHERE ${src.is_bounce} = true)::int`,
      totalDuration: sql<number>`COALESCE(SUM(${src.duration}), 0)::int`,
      totalPages: sql<number>`COALESCE(SUM(${src.page_count}), 0)::int`,
    })
    .from(src)
    .groupBy(src.source)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return rows.map((r) => {
    const bounceRate = r.sessions > 0 ? Math.round((r.bounces / r.sessions) * 100) : 0;
    const avgDuration = r.sessions > 0 ? Math.round(r.totalDuration / r.sessions) : 0;
    const avgPages = r.sessions > 0 ? Math.round((r.totalPages / r.sessions) * 10) / 10 : 0;

    const bounceScore = Math.max(0, 100 - bounceRate);
    const durationScore = Math.min(avgDuration / 3, 100);
    const pageScore = Math.min(avgPages * 20, 100);
    const qualityScore = Math.round(
      bounceScore * 0.4 + durationScore * 0.3 + pageScore * 0.3
    );

    return {
      source: r.source,
      visitors: r.visitors,
      sessions: r.sessions,
      bounceRate,
      avgDuration,
      avgPages,
      qualityScore,
    };
  });
}

// ============================================================
// CONNECTION TYPE
// ============================================================

export async function getConnectionTypes(
  siteId: string | string[],
  dateRange: DateRange
): Promise<ConnectionTypeEntry[]> {
  const rows = await db
    .select({
      type: pageviews.connection_type,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(pageviews)
    .where(and(buildPageviewFilters(siteId, dateRange), ne(pageviews.connection_type, ""), sql`${pageviews.connection_type} IS NOT NULL`))
    .groupBy(pageviews.connection_type)
    .orderBy(sql`COUNT(*) DESC`);

  const total = rows.reduce((sum, r) => sum + r.count, 0) || 1;
  return rows.map((r) => ({
    type: r.type || "unknown",
    count: r.count,
    percentage: Math.round((r.count / total) * 100),
  }));
}

// ============================================================
// REALTIME
// ============================================================

export async function getRealtimeStats(
  siteId: string | string[]
): Promise<RealtimeStats> {
  const now = new Date();
  const thirtyMinAgo = subMinutes(now, 30);
  const conditions: SQL[] = [
    gte(pageviews.created_at, thirtyMinAgo),
    siteScopeSql(pageviews.site_id, siteId),
    ...buildDimensionConditions(pageviews, siteId, { from: thirtyMinAgo, to: now }, filterStore.getStore()),
  ];

  const stats = await db
    .select({
      activeVisitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id}) FILTER (WHERE ${pageviews.is_bot} = false)::int`,
      pageviews30Min: sql<number>`COUNT(*) FILTER (WHERE ${pageviews.is_bot} = false)::int`,
      activeBots: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id}) FILTER (WHERE ${pageviews.is_bot} = true)::int`,
      botPageviews30Min: sql<number>`COUNT(*) FILTER (WHERE ${pageviews.is_bot} = true)::int`,
    })
    .from(pageviews)
    .where(and(...conditions));

  const activePath = pagePathSql(pageviews.url);
  const activePages = await db
    .select({
      url: activePath,
      viewers: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
    })
    .from(pageviews)
    .where(and(...conditions, eq(pageviews.is_bot, false)))
    .groupBy(activePath)
    .orderBy(sql`COUNT(DISTINCT ${pageviews.visitor_id}) DESC`)
    .limit(10);

  const topCountriesRows = await db
    .select({
      country: pageviews.country,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(pageviews)
    .where(and(...conditions, eq(pageviews.is_bot, false), ne(pageviews.country, ""), sql`${pageviews.country} IS NOT NULL`))
    .groupBy(pageviews.country)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(5);

  return {
    activeVisitors: stats[0]?.activeVisitors || 0,
    pageviewsLast30Min: stats[0]?.pageviews30Min || 0,
    activeBots: stats[0]?.activeBots || 0,
    botPageviewsLast30Min: stats[0]?.botPageviews30Min || 0,
    activePages: activePages.map((p) => ({ url: p.url, viewers: p.viewers })),
    topCountries: topCountriesRows.map((c) => ({
      country: c.country || "",
      flag: countryFlag(c.country || ""),
      count: c.count,
    })),
  };
}

// ============================================================
// BOT FILTER AUDIT
// ============================================================

/**
 * Break down flagged traffic by the reason it was flagged.
 *
 * This is the feedback loop for src/lib/bot-detection.ts: the filter is only
 * as good as your ability to see what it caught. A reason bucket that grows
 * unexpectedly is the signal to re-check its weight — inspect the underlying
 * rows via /api/sites/{id}/export?include_bots=1.
 */
export async function getBotBreakdown(
  siteId: string | string[],
  dateRange: DateRange
): Promise<BotBreakdown> {
  const scopeConditions: SQL[] = [
    gte(pageviews.created_at, dateRange.from),
    lte(pageviews.created_at, dateRange.to),
    siteScopeSql(pageviews.site_id, siteId),
  ];

  const [totals] = await db
    .select({
      human: sql<number>`COUNT(*) FILTER (WHERE ${pageviews.is_bot} = false)::int`,
      bot: sql<number>`COUNT(*) FILTER (WHERE ${pageviews.is_bot} = true)::int`,
    })
    .from(pageviews)
    .where(and(...scopeConditions));

  // bot_reason is stored as "reason:signal1,signal2"; group on the reason.
  const reasonExpr = sql<string>`COALESCE(split_part(${pageviews.bot_reason}, ':', 1), 'unknown')`;

  const rows = await db
    .select({
      reason: reasonExpr,
      count: sql<number>`COUNT(*)::int`,
      avgScore: sql<number>`COALESCE(ROUND(AVG(${pageviews.bot_score})), 0)::int`,
    })
    .from(pageviews)
    .where(and(...scopeConditions, eq(pageviews.is_bot, true)))
    .groupBy(reasonExpr)
    .orderBy(sql`COUNT(*) DESC`);

  const botTotal = totals?.bot || 0;
  const humanTotal = totals?.human || 0;
  const grandTotal = botTotal + humanTotal;

  return {
    humanPageviews: humanTotal,
    botPageviews: botTotal,
    botPercentage: grandTotal > 0 ? Math.round((botTotal / grandTotal) * 100) : 0,
    reasons: rows.map((r) => ({
      reason: r.reason || "unknown",
      count: r.count,
      avgScore: r.avgScore,
      percentage: botTotal > 0 ? Math.round((r.count / botTotal) * 100) : 0,
    })),
  };
}

// ============================================================
// SEO OVERVIEW
// ============================================================

/**
 * Organic search report.
 *
 * Built on sessions (entry referrer + first-touch UTMs), not pageviews:
 *  - document.referrer persists across SPA navigations, so pageview-level
 *    classification credited every page a searcher browsed to afterwards as
 *    an "organic landing page" (32.5k of 101.8k "organic" pageviews on one
 *    site were not the session's entry page).
 *  - GSC / Bing Webmaster "clicks" are one per SERP click. The closest Xine
 *    analogue is an organic session (organicSessions), not distinct
 *    visitor ids — those rotate daily and merge repeat clicks by the same
 *    IP+UA on one day.
 *
 * "Organic" is classifySource's `search` channel: host-anchored engine
 * rules (every Google ccTLD and the Google app; Bing incl. cn.bing.com;
 * Yahoo/DuckDuckGo/Ecosia/Baidu/Yandex/…), excluding Gemini/Copilot/
 * ChatGPT (AI), Gmail/Outlook (email) and anything paid (utm_medium
 * cpc/ppc/paid* or a gclid/gbraid/wbraid/msclkid click id).
 */
export async function getSeoOverview(
  siteId: string | string[],
  dateRange: DateRange
) {
  const cls = sessionSourceClassifier();
  const scope = buildSessionFilters(siteId, dateRange);
  const organic = and(scope, cls.isOrganicSearch);
  const dateExpr = buildDateExpr(dateRange, sessions.started_at);
  const landingPath = pagePathSql(sessions.entry_page);
  const engineSub = db
    .select({
      engine: sql<string>`${cls.name}`.as("engine"),
      host: sql<string>`COALESCE(${cls.host}, '(no referrer, UTM-tagged)')`.as("host"),
      visitor_id: sessions.visitor_id,
      page_count: sessions.page_count,
    })
    .from(sessions)
    .where(organic)
    .as("organic_sessions");

  const [stats, paid, topEngines, engineHosts, topLandingPages, timeseries] = await Promise.all([
    // Headline numbers
    db
      .select({
        sessions: sql<number>`COUNT(*)::int`,
        visitors: sql<number>`COUNT(DISTINCT ${sessions.visitor_id})::int`,
        pageviews: sql<number>`COALESCE(SUM(${sessions.page_count}), 0)::int`,
        bounces: sql<number>`COUNT(*) FILTER (WHERE ${sessions.is_bounce} = true)::int`,
      })
      .from(sessions)
      .where(organic),

    // Paid search, reported separately so it is visible but never counted as
    // SEO. Search only: paid social/display (utm_medium=cpc on facebook…)
    // shares the "paid" channel but is not a search ad click.
    db
      .select({ sessions: sql<number>`COUNT(*)::int` })
      .from(sessions)
      .where(and(scope, cls.isPaidSearch)),

    // Top search engines (classified once per session in a derived table)
    db
      .select({
        engine: engineSub.engine,
        sessions: sql<number>`COUNT(*)::int`,
        visitors: sql<number>`COUNT(DISTINCT ${engineSub.visitor_id})::int`,
        views: sql<number>`COALESCE(SUM(${engineSub.page_count}), 0)::int`,
      })
      .from(engineSub)
      .groupBy(engineSub.engine)
      .orderBy(sql`COUNT(*) DESC`),

    // Raw referrer hosts behind each engine row (e.g. www.bing.com vs
    // cn.bing.com), so the engine total can be reconciled host by host.
    db
      .select({
        engine: engineSub.engine,
        host: engineSub.host,
        sessions: sql<number>`COUNT(*)::int`,
      })
      .from(engineSub)
      .groupBy(engineSub.engine, engineSub.host)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(50),

    // Landing pages = the session's entry page (path only)
    db
      .select({
        url: landingPath,
        entrances: sql<number>`COUNT(*)::int`,
        visitors: sql<number>`COUNT(DISTINCT ${sessions.visitor_id})::int`,
      })
      .from(sessions)
      .where(organic)
      .groupBy(landingPath)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(50),

    // Timeseries (days/hours in the viewer's timezone)
    db
      .select({
        date: dateExpr,
        sessions: sql<number>`COUNT(*)::int`,
        visitors: sql<number>`COUNT(DISTINCT ${sessions.visitor_id})::int`,
        pageviews: sql<number>`COALESCE(SUM(${sessions.page_count}), 0)::int`,
      })
      .from(sessions)
      .where(organic)
      .groupBy(dateExpr)
      .orderBy(dateExpr),
  ]);

  const organicSessions = stats[0]?.sessions || 0;

  return {
    /** Organic search sessions — the GSC/BWT "clicks" analogue. */
    organicSessions,
    /** Distinct daily visitor ids (IP+UA hash, rotates daily). */
    organicVisitors: stats[0]?.visitors || 0,
    /** Pageviews within organic sessions. */
    organicPageviews: stats[0]?.pageviews || 0,
    organicBounceRate: organicSessions > 0 ? Math.round(((stats[0]?.bounces || 0) / organicSessions) * 100) : 0,
    paidSearchSessions: paid[0]?.sessions || 0,
    topEngines,
    engineHosts,
    topLandingPages,
    timeseries,
  };
}

// ============================================================
// RETENTION
// ============================================================

export interface RetentionCohortRow {
  cohortWeek: string;
  cohortSize: number;
  weekNumber: number;
  returnedUsers: number;
}

/**
 * Weekly cohort retention, shared by the dashboard route and the MCP
 * xine_get_retention tool so the two cannot drift apart.
 *
 * Scoped by buildSessionFilters: bots excluded, "all" restricted to the
 * caller's own sites, parameterised dimension filters. Weeks are ISO weeks
 * of the wall-clock time in the range's timezone.
 *
 * Caveat: visitor_id is hash(IP + UA + daily salt) by design (no cookies),
 * so the same person gets a new id every day and weeks ≥ 1 stay near 0.
 * This report measures same-day-id returns only.
 */
export async function getRetentionCohorts(
  siteId: string | string[],
  dateRange: DateRange,
  filters?: DimensionFilters
): Promise<RetentionCohortRow[]> {
  if (Array.isArray(siteId) && siteId.length === 0) return [];
  const tz = tzLiteral(dateRange);

  const result = await db.execute(sql`
    WITH scoped AS (
      SELECT ${sessions.visitor_id} AS visitor_id, (${sessions.started_at} AT TIME ZONE ${tz}) AS local_start
      FROM ${sessions}
      WHERE ${buildSessionFilters(siteId, dateRange, filters)}
    ),
    cohorts AS (
      SELECT visitor_id, DATE_TRUNC('week', MIN(local_start)) AS cohort_week
      FROM scoped GROUP BY visitor_id
    ),
    activity AS (
      SELECT DISTINCT visitor_id, DATE_TRUNC('week', local_start) AS activity_week
      FROM scoped
    ),
    cohort_size AS (
      SELECT cohort_week, COUNT(*)::int AS total_users
      FROM cohorts GROUP BY cohort_week
    )
    SELECT
      to_char(c.cohort_week, 'YYYY-MM-DD') AS "cohortWeek",
      s.total_users AS "cohortSize",
      ROUND(EXTRACT(EPOCH FROM (a.activity_week - c.cohort_week)) / 604800)::int AS "weekNumber",
      COUNT(DISTINCT a.visitor_id)::int AS "returnedUsers"
    FROM cohorts c
    JOIN activity a ON a.visitor_id = c.visitor_id
    JOIN cohort_size s ON s.cohort_week = c.cohort_week
    GROUP BY c.cohort_week, s.total_users, a.activity_week
    ORDER BY c.cohort_week DESC, "weekNumber" ASC
  `);

  return result.rows as unknown as RetentionCohortRow[];
}
