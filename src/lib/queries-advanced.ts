// ============================================================
// Xine — Advanced Analytics Data Layer
// Server-side query functions for deep analytics, performance,
// behavior, acquisition, and realtime dashboards.
// Uses Drizzle ORM with PostgreSQL + sessions table.
// ============================================================

import { db } from "./db";
import { pageviews, events, sessions } from "./db/schema";
import { eq, gte, lte, ne, and, sql, desc } from "drizzle-orm";
import { subDays, subMinutes, differenceInDays } from "date-fns";
import { buildDateExpr } from "./query-helpers";
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
} from "./types";

// ---- Helpers ----

function getPreviousDateRange(dateRange: DateRange): DateRange {
  const days = differenceInDays(dateRange.to, dateRange.from);
  return {
    from: subDays(dateRange.from, days),
    to: dateRange.from,
  };
}

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

function buildSessionFilters(siteId: string | "all", dateRange: DateRange) {
  const conditions = [
    gte(sessions.started_at, dateRange.from),
    lte(sessions.started_at, dateRange.to),
    eq(sessions.is_bot, false),
  ];
  if (siteId !== "all") {
    conditions.push(eq(sessions.site_id, siteId));
  }
  return and(...conditions);
}

function buildEventFilters(siteId: string | "all", dateRange: DateRange) {
  const conditions = [
    gte(events.created_at, dateRange.from),
    lte(events.created_at, dateRange.to),
    eq(events.is_bot, false),
  ];
  if (siteId !== "all") {
    conditions.push(eq(events.site_id, siteId));
  }
  return and(...conditions);
}

function buildPageviewFilters(siteId: string | "all", dateRange: DateRange) {
  const conditions = [
    gte(pageviews.created_at, dateRange.from),
    lte(pageviews.created_at, dateRange.to),
    eq(pageviews.is_bot, false),
  ];
  if (siteId !== "all") {
    conditions.push(eq(pageviews.site_id, siteId));
  }
  return and(...conditions);
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
  siteId: string | "all",
  dateRange: DateRange
): Promise<SessionAnalytics> {
  const prevRange = getPreviousDateRange(dateRange);

  const statsQuery = (range: DateRange) => db
    .select({
      totalSessions: sql<number>`COUNT(*)::int`,
      avgPages: sql<number>`COALESCE(ROUND(AVG(${sessions.page_count})::numeric, 1), 0)::float`,
      avgDuration: sql<number>`COALESCE(ROUND(AVG(${sessions.total_duration})), 0)::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, range));

  const visitorsQuery = (range: DateRange) => db
    .select({
      total: sql<number>`COUNT(DISTINCT ${sessions.visitor_id})::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, range));

  const newVisitorsQuery = (range: DateRange) => db
    .select({
      newCount: sql<number>`COUNT(DISTINCT ${sessions.visitor_id})::int`,
    })
    .from(sessions)
    .where(
      and(
        buildSessionFilters(siteId, range),
        sql`NOT EXISTS (
          SELECT 1 FROM ${sessions} s2 
          WHERE s2.visitor_id = ${sessions.visitor_id} 
            AND s2.started_at < ${range.from}
            ${siteId !== 'all' ? sql`AND s2.site_id = ${siteId}` : sql``}
        )`
      )
    );

  const [
    [current],
    [prev],
    [currentVisitors],
    [currentNew]
  ] = await Promise.all([
    statsQuery(dateRange),
    statsQuery(prevRange),
    visitorsQuery(dateRange),
    newVisitorsQuery(dateRange)
  ]);

  const totalSessions = current.totalSessions || 0;
  const prevTotalSessions = prev.totalSessions || 0;
  const avgPagesPerSession = current.avgPages || 0;
  const prevAvgPages = prev.avgPages || 0;
  const avgSessionDuration = current.avgDuration || 0;
  const prevAvgDuration = prev.avgDuration || 0;

  const totalVisitors = currentVisitors.total || 0;
  const newVisitors = currentNew.newCount || 0;
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
  siteId: string | "all",
  dateRange: DateRange
): Promise<NewVsReturning> {
  const totalQuery = await db
    .select({
      total: sql<number>`COUNT(DISTINCT ${sessions.visitor_id})::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange));

  const newQuery = await db
    .select({
      newCount: sql<number>`COUNT(DISTINCT ${sessions.visitor_id})::int`,
    })
    .from(sessions)
    .where(
      and(
        buildSessionFilters(siteId, dateRange),
        sql`NOT EXISTS (
          SELECT 1 FROM ${sessions} s2 
          WHERE s2.visitor_id = ${sessions.visitor_id} 
            AND s2.started_at < ${dateRange.from}
            ${siteId !== 'all' ? sql`AND s2.site_id = ${siteId}` : sql``}
        )`
      )
    );

  const total = totalQuery[0]?.total || 0;
  const newV = newQuery[0]?.newCount || 0;
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
  siteId: string | "all",
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
  siteId: string | "all",
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
  let totalDuration = 0;
  let totalPageviews = 0;

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
    totalDuration += r.total_duration;
    totalPageviews += r.page_count;
  });

  return {
    avgEngagementScore: Math.round(totalScore / rows.length),
    highlyEngaged: highCount,
    moderatelyEngaged: midCount,
    lowEngagement: lowCount,
    avgScrollDepth: scrollCount > 0 ? Math.round(totalScrollDepth / scrollCount) : 0,
    avgTimeOnPage: totalPageviews > 0 ? Math.round(totalDuration / totalPageviews) : 0,
  };
}

export async function getScrollDepthAnalysis(
  siteId: string | "all",
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
  siteId: string | "all",
  dateRange: DateRange
): Promise<HeatmapCell[]> {
  const rows = await db
    .select({
      day: sql<number>`EXTRACT(DOW FROM ${sessions.started_at})::int`,
      hour: sql<number>`EXTRACT(HOUR FROM ${sessions.started_at})::int`,
      value: sql<number>`COUNT(*)::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .groupBy(
      sql`EXTRACT(DOW FROM ${sessions.started_at})`,
      sql`EXTRACT(HOUR FROM ${sessions.started_at})`
    );

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
  siteId: string | "all",
  dateRange: DateRange
): Promise<PeakHour[]> {
  const rows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${sessions.started_at})::int`,
      visitors: sql<number>`COUNT(*)::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .groupBy(sql`EXTRACT(HOUR FROM ${sessions.started_at})`)
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
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<EntryExitPage[]> {
  const rows = await db
    .select({
      url: sessions.entry_page,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .groupBy(sessions.entry_page)
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
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<EntryExitPage[]> {
  const rows = await db
    .select({
      url: sessions.exit_page,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .groupBy(sessions.exit_page)
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
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<PageExitRate[]> {
  const subExits = db
    .select({
      exit_page: sessions.exit_page,
      exits: sql<number>`COUNT(*)::int`.as('exits'),
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .groupBy(sessions.exit_page)
    .as('sub_exits');

  const rows = await db
    .select({
      url: pageviews.url,
      views: sql<number>`COUNT(*)::int`,
      exits: sql<number>`COALESCE(${subExits.exits}, 0)::int`,
    })
    .from(pageviews)
    .leftJoin(subExits, eq(pageviews.url, subExits.exit_page))
    .where(buildPageviewFilters(siteId, dateRange))
    .groupBy(pageviews.url, subExits.exits)
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
  siteId: string | "all",
  dateRange: DateRange,
  limit = 15
): Promise<UserFlowStep[]> {
  const sub = db
    .select({
      session_id: pageviews.session_id,
      url: pageviews.url,
      prev_url: sql<string>`LAG(${pageviews.url}) OVER (PARTITION BY ${pageviews.session_id} ORDER BY ${pageviews.created_at})`.as('prev_url'),
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
  siteId: string | "all",
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
  siteId: string | "all",
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
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<PageWebVital[]> {
  const rows = await db
    .select({
      url: events.url,
      lcp: sql<number>`ROUND(AVG((properties->>'value')::numeric) FILTER (WHERE LOWER(properties->>'metric') = 'lcp'))::int`,
      fcp: sql<number>`ROUND(AVG((properties->>'value')::numeric) FILTER (WHERE LOWER(properties->>'metric') = 'fcp'))::int`,
      cls: sql<number>`ROUND(AVG((properties->>'value')::numeric) FILTER (WHERE LOWER(properties->>'metric') = 'cls'))::int`,
      inp: sql<number>`ROUND(AVG((properties->>'value')::numeric) FILTER (WHERE LOWER(properties->>'metric') = 'inp'))::int`,
    })
    .from(events)
    .where(and(buildEventFilters(siteId, dateRange), eq(events.name, 'web_vital'), sql`${events.url} IS NOT NULL`))
    .groupBy(events.url);

  const ttfbRows = await db
    .select({
      url: pageviews.url,
      ttfb: sql<number>`ROUND(AVG(${pageviews.ttfb}))::int`,
    })
    .from(pageviews)
    .where(and(buildPageviewFilters(siteId, dateRange), sql`${pageviews.ttfb} IS NOT NULL AND ${pageviews.ttfb} > 0`))
    .groupBy(pageviews.url);

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
  siteId: string | "all",
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
  siteId: string | "all",
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
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<CampaignPerformance[]> {
  const rows = await db
    .select({
      campaign: sessions.utm_campaign,
      source: sessions.utm_source,
      medium: sessions.utm_medium,
      sessions: sql<number>`COUNT(*)::int`,
      bounces: sql<number>`COUNT(*) FILTER (WHERE ${sessions.is_bounce} = true)::int`,
      totalDuration: sql<number>`SUM(${sessions.total_duration})::int`,
      totalPages: sql<number>`SUM(${sessions.page_count})::int`,
    })
    .from(sessions)
    .where(and(buildSessionFilters(siteId, dateRange), ne(sessions.utm_campaign, "")))
    .groupBy(sessions.utm_campaign, sessions.utm_source, sessions.utm_medium)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return rows.map((r) => ({
    campaign: r.campaign || "direct",
    source: r.source || "",
    medium: r.medium || "",
    sessions: r.sessions,
    bounceRate: r.sessions > 0 ? Math.round((r.bounces / r.sessions) * 100) : 0,
    avgDuration: r.sessions > 0 ? Math.round(r.totalDuration / r.sessions) : 0,
    pagesPerSession: r.sessions > 0 ? Math.round((r.totalPages / r.sessions) * 10) / 10 : 0,
  }));
}

export async function getSourceQuality(
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<SourceQuality[]> {
  const extractedHost = sql<string>`
    CASE 
      WHEN ${sessions.referrer} ~ '^https?://' 
      THEN regexp_replace(${sessions.referrer}, '^https?://([^/]+).*$', '\\1')
      ELSE ${sessions.referrer}
    END
  `;

  const rows = await db
    .select({
      source: extractedHost,
      visitors: sql<number>`COUNT(DISTINCT ${sessions.visitor_id})::int`,
      sessions: sql<number>`COUNT(*)::int`,
      bounces: sql<number>`COUNT(*) FILTER (WHERE ${sessions.is_bounce} = true)::int`,
      totalDuration: sql<number>`SUM(${sessions.total_duration})::int`,
      totalPages: sql<number>`SUM(${sessions.page_count})::int`,
    })
    .from(sessions)
    .where(and(buildSessionFilters(siteId, dateRange), ne(sessions.referrer, "")))
    .groupBy(extractedHost)
    .orderBy(sql`COUNT(DISTINCT ${sessions.visitor_id}) DESC`)
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
  }).sort((a, b) => b.qualityScore - a.qualityScore);
}

// ============================================================
// CONNECTION TYPE
// ============================================================

export async function getConnectionTypes(
  siteId: string | "all",
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
  siteId: string | "all"
): Promise<RealtimeStats> {
  const thirtyMinAgo = subMinutes(new Date(), 30);
  const conditions = [gte(pageviews.created_at, thirtyMinAgo)];
  if (siteId !== "all") conditions.push(eq(pageviews.site_id, siteId));

  const stats = await db
    .select({
      activeVisitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id}) FILTER (WHERE ${pageviews.is_bot} = false)::int`,
      pageviews30Min: sql<number>`COUNT(*) FILTER (WHERE ${pageviews.is_bot} = false)::int`,
      activeBots: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id}) FILTER (WHERE ${pageviews.is_bot} = true)::int`,
      botPageviews30Min: sql<number>`COUNT(*) FILTER (WHERE ${pageviews.is_bot} = true)::int`,
    })
    .from(pageviews)
    .where(and(...conditions));

  const activePages = await db
    .select({
      url: pageviews.url,
      viewers: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
    })
    .from(pageviews)
    .where(and(...conditions, eq(pageviews.is_bot, false)))
    .groupBy(pageviews.url)
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
// SEO OVERVIEW
// ============================================================

export async function getSeoOverview(
  siteId: string | "all",
  dateRange: DateRange
) {
  const dateExpr = buildDateExpr(dateRange, pageviews.created_at);

  const isOrganicSql = sql<boolean>`(
    ${pageviews.referrer} ILIKE '%google.com%' OR
    ${pageviews.referrer} ILIKE '%google.co%' OR
    ${pageviews.referrer} ILIKE '%bing.com%' OR
    ${pageviews.referrer} ILIKE '%yahoo.com%' OR
    ${pageviews.referrer} ILIKE '%duckduckgo.com%' OR
    ${pageviews.referrer} ILIKE '%yandex.ru%' OR
    ${pageviews.referrer} ILIKE '%yandex.com%' OR
    ${pageviews.referrer} ILIKE '%ecosia.org%'
  )`;

  const engineNameSql = sql<string>`
    CASE
      WHEN ${pageviews.referrer} ILIKE '%google.%' THEN 'Google'
      WHEN ${pageviews.referrer} ILIKE '%bing.%' THEN 'Bing'
      WHEN ${pageviews.referrer} ILIKE '%yahoo.%' THEN 'Yahoo'
      WHEN ${pageviews.referrer} ILIKE '%duckduckgo.%' THEN 'Duckduckgo'
      WHEN ${pageviews.referrer} ILIKE '%yandex.%' THEN 'Yandex'
      WHEN ${pageviews.referrer} ILIKE '%ecosia.%' THEN 'Ecosia'
      ELSE 'Other'
    END
  `;

  // Main overview stats
  const stats = await db
    .select({
      visitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
      pageviews: sql<number>`COUNT(*)::int`,
    })
    .from(pageviews)
    .where(and(buildPageviewFilters(siteId, dateRange), isOrganicSql));

  // Top search engines
  const topEngines = await db
    .select({
      engine: engineNameSql,
      views: sql<number>`COUNT(*)::int`,
      visitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
    })
    .from(pageviews)
    .where(and(buildPageviewFilters(siteId, dateRange), isOrganicSql))
    .groupBy(engineNameSql)
    .orderBy(sql`COUNT(DISTINCT ${pageviews.visitor_id}) DESC`);

  // Top landing pages
  const topLandingPages = await db
    .select({
      url: pageviews.url,
      views: sql<number>`COUNT(*)::int`,
      visitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
    })
    .from(pageviews)
    .where(and(buildPageviewFilters(siteId, dateRange), isOrganicSql))
    .groupBy(pageviews.url)
    .orderBy(sql`COUNT(DISTINCT ${pageviews.visitor_id}) DESC`)
    .limit(50);

  // Timeseries
  const timeseries = await db
    .select({
      date: dateExpr,
      visitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
    })
    .from(pageviews)
    .where(and(buildPageviewFilters(siteId, dateRange), isOrganicSql))
    .groupBy(dateExpr)
    .orderBy(dateExpr);

  return {
    organicVisitors: stats[0]?.visitors || 0,
    organicPageviews: stats[0]?.pageviews || 0,
    topEngines,
    topLandingPages,
    timeseries,
  };
}
