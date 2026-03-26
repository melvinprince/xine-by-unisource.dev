// ============================================================
// Xine — Advanced Analytics Data Layer
// Server-side query functions for deep analytics, performance,
// behavior, acquisition, and realtime dashboards.
// Uses Drizzle ORM with PostgreSQL + sessions table.
// ============================================================

import { db } from "./db";
import { pageviews, events, sessions } from "./db/schema";
import { eq, gte, lte, ne, and, sql, desc, count } from "drizzle-orm";
import { format, subDays, subMinutes, differenceInDays } from "date-fns";
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

// ============================================================
// SESSION ANALYTICS
// ============================================================

export async function getSessionAnalytics(
  siteId: string | "all",
  dateRange: DateRange
): Promise<SessionAnalytics> {
  const prevRange = getPreviousDateRange(dateRange);

  const currentRows = await db
    .select({
      page_count: sessions.page_count,
      total_duration: sessions.total_duration,
      visitor_id: sessions.visitor_id,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange));

  const prevRows = await db
    .select({
      page_count: sessions.page_count,
      total_duration: sessions.total_duration,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, prevRange));

  const totalSessions = currentRows.length;
  const prevTotalSessions = prevRows.length;

  const avgPagesPerSession =
    totalSessions > 0
      ? Math.round(
          (currentRows.reduce((sum, r) => sum + r.page_count, 0) /
            totalSessions) *
            10
        ) / 10
      : 0;
  const prevAvgPages =
    prevTotalSessions > 0
      ? Math.round(
          (prevRows.reduce((sum, r) => sum + r.page_count, 0) /
            prevTotalSessions) *
            10
        ) / 10
      : 0;

  const avgSessionDuration =
    totalSessions > 0
      ? Math.round(
          currentRows.reduce((sum, r) => sum + r.total_duration, 0) /
            totalSessions
        )
      : 0;
  const prevAvgDuration =
    prevTotalSessions > 0
      ? Math.round(
          prevRows.reduce((sum, r) => sum + r.total_duration, 0) /
            prevTotalSessions
        )
      : 0;

  // New vs Returning: check if visitor_id existed before the date range
  const visitorIds = [...new Set(currentRows.map((r) => r.visitor_id))];
  let newVisitorCount = 0;
  if (visitorIds.length > 0) {
    // Check which visitors had sessions before this date range
    const existingVisitors = await db
      .select({ visitor_id: sessions.visitor_id })
      .from(sessions)
      .where(
        and(
          ...(siteId !== "all" ? [eq(sessions.site_id, siteId)] : []),
          lte(sessions.started_at, dateRange.from)
        )
      )
      .groupBy(sessions.visitor_id);

    const existingSet = new Set(existingVisitors.map((r) => r.visitor_id));
    newVisitorCount = visitorIds.filter((v) => !existingSet.has(v)).length;
  }

  const totalVisitors = visitorIds.length;
  const newPct = totalVisitors > 0 ? Math.round((newVisitorCount / totalVisitors) * 100) : 0;

  return {
    totalSessions,
    avgPagesPerSession,
    avgSessionDuration,
    newVisitorPercent: newPct,
    returningVisitorPercent: 100 - newPct,
    sessionsChange: calcChange(totalSessions, prevTotalSessions),
    pagesPerSessionChange: calcChange(avgPagesPerSession * 10, prevAvgPages * 10),
    sessionDurationChange: calcChange(avgSessionDuration, prevAvgDuration),
  };
}

export async function getNewVsReturning(
  siteId: string | "all",
  dateRange: DateRange
): Promise<NewVsReturning> {
  const currentVisitors = await db
    .select({ visitor_id: sessions.visitor_id })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .groupBy(sessions.visitor_id);

  const visitorIds = currentVisitors.map((r) => r.visitor_id);
  if (visitorIds.length === 0) {
    return { newVisitors: 0, returningVisitors: 0, newPercent: 0, returningPercent: 0 };
  }

  const existingVisitors = await db
    .select({ visitor_id: sessions.visitor_id })
    .from(sessions)
    .where(
      and(
        ...(siteId !== "all" ? [eq(sessions.site_id, siteId)] : []),
        lte(sessions.started_at, dateRange.from)
      )
    )
    .groupBy(sessions.visitor_id);

  const existingSet = new Set(existingVisitors.map((r) => r.visitor_id));
  const newV = visitorIds.filter((v) => !existingSet.has(v)).length;
  const retV = visitorIds.length - newV;
  const total = visitorIds.length;

  return {
    newVisitors: newV,
    returningVisitors: retV,
    newPercent: Math.round((newV / total) * 100),
    returningPercent: Math.round((retV / total) * 100),
  };
}

export async function getSessionTimeseries(
  siteId: string | "all",
  dateRange: DateRange
): Promise<SessionTimeseriesPoint[]> {
  const rows = await db
    .select({ started_at: sessions.started_at })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange))
    .orderBy(sessions.started_at);

  const isHourly = differenceInDays(dateRange.to, dateRange.from) <= 2;
  const dateFormatStr = isHourly ? "yyyy-MM-dd HH:00" : "yyyy-MM-dd";

  const dateMap = new Map<string, number>();
  rows.forEach((row) => {
    const date = format(new Date(row.started_at), dateFormatStr);
    dateMap.set(date, (dateMap.get(date) || 0) + 1);
  });

  return Array.from(dateMap.entries()).map(([date, sessions]) => ({
    date,
    sessions,
  }));
}

// ============================================================
// ENGAGEMENT
// ============================================================

export async function getEngagementMetrics(
  siteId: string | "all",
  dateRange: DateRange
): Promise<EngagementMetrics> {
  // Get sessions with engagement data
  const sessionRows = await db
    .select({
      total_duration: sessions.total_duration,
      page_count: sessions.page_count,
      session_id: sessions.id,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange));

  // Get scroll depth events for the period
  const scrollEvents = await db
    .select({
      session_id: events.session_id,
      properties: events.properties,
    })
    .from(events)
    .where(
      and(
        buildEventFilters(siteId, dateRange),
        eq(events.name, "scroll_depth")
      )
    );

  // Max scroll depth per session
  const sessionScrollMap = new Map<string, number>();
  scrollEvents.forEach((e) => {
    const props = e.properties as Record<string, unknown>;
    const depth = (props.depth as number) || 0;
    const current = sessionScrollMap.get(e.session_id) || 0;
    if (depth > current) sessionScrollMap.set(e.session_id, depth);
  });

  // Compute engagement scores
  let totalScore = 0;
  let highCount = 0;
  let midCount = 0;
  let lowCount = 0;
  let totalScrollDepth = 0;
  let scrollCount = 0;

  sessionRows.forEach((s) => {
    const durationScore = Math.min(s.total_duration / 300, 1) * 40; // max 40 pts
    const pageScore = Math.min(s.page_count / 5, 1) * 30; // max 30 pts
    const scrollDepth = sessionScrollMap.get(s.session_id) || 0;
    const scrollScore = (scrollDepth / 100) * 30; // max 30 pts
    const score = Math.round(durationScore + pageScore + scrollScore);

    totalScore += score;
    if (score >= 70) highCount++;
    else if (score >= 40) midCount++;
    else lowCount++;

    if (scrollDepth > 0) {
      totalScrollDepth += scrollDepth;
      scrollCount++;
    }
  });

  const totalDuration = sessionRows.reduce((sum, r) => sum + r.total_duration, 0);
  const totalPageviews = sessionRows.reduce((sum, r) => sum + r.page_count, 0);

  return {
    avgEngagementScore:
      sessionRows.length > 0 ? Math.round(totalScore / sessionRows.length) : 0,
    highlyEngaged: highCount,
    moderatelyEngaged: midCount,
    lowEngagement: lowCount,
    avgScrollDepth: scrollCount > 0 ? Math.round(totalScrollDepth / scrollCount) : 0,
    avgTimeOnPage:
      totalPageviews > 0 ? Math.round(totalDuration / totalPageviews) : 0,
  };
}

export async function getScrollDepthAnalysis(
  siteId: string | "all",
  dateRange: DateRange
): Promise<ScrollDepthEntry[]> {
  const scrollEvents = await db
    .select({
      properties: events.properties,
    })
    .from(events)
    .where(
      and(
        buildEventFilters(siteId, dateRange),
        eq(events.name, "scroll_depth")
      )
    );

  const depthCounts = new Map<number, number>();
  scrollEvents.forEach((e) => {
    const props = e.properties as Record<string, unknown>;
    const depth = (props.depth as number) || 0;
    depthCounts.set(depth, (depthCounts.get(depth) || 0) + 1);
  });

  const total = scrollEvents.length || 1;
  return [25, 50, 75, 100].map((depth) => ({
    depth,
    count: depthCounts.get(depth) || 0,
    percentage: Math.round(((depthCounts.get(depth) || 0) / total) * 100),
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
    .select({ started_at: sessions.started_at })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange));

  // Initialize 7×24 grid
  const grid = new Map<string, number>();
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      grid.set(`${d}-${h}`, 0);
    }
  }

  rows.forEach((row) => {
    const date = new Date(row.started_at);
    const day = date.getDay(); // 0=Sun
    const hour = date.getHours();
    const key = `${day}-${hour}`;
    grid.set(key, (grid.get(key) || 0) + 1);
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
    .select({ started_at: sessions.started_at })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange));

  const hourCounts = new Map<number, number>();
  rows.forEach((row) => {
    const hour = new Date(row.started_at).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  });

  return Array.from(hourCounts.entries())
    .map(([hour, visitors]) => ({
      hour,
      visitors,
      label: `${hour.toString().padStart(2, "0")}:00`,
    }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 5);
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
    .select({ entry_page: sessions.entry_page })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange));

  if (rows.length === 0) return [];

  const pageMap = new Map<string, number>();
  rows.forEach((r) => {
    pageMap.set(r.entry_page, (pageMap.get(r.entry_page) || 0) + 1);
  });

  const total = rows.length;
  return Array.from(pageMap.entries())
    .map(([url, count]) => ({
      url,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function getExitPages(
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<EntryExitPage[]> {
  const rows = await db
    .select({ exit_page: sessions.exit_page })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange));

  if (rows.length === 0) return [];

  const pageMap = new Map<string, number>();
  rows.forEach((r) => {
    pageMap.set(r.exit_page, (pageMap.get(r.exit_page) || 0) + 1);
  });

  const total = rows.length;
  return Array.from(pageMap.entries())
    .map(([url, count]) => ({
      url,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function getPageExitRates(
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<PageExitRate[]> {
  // Get exit counts from sessions
  const exitRows = await db
    .select({ exit_page: sessions.exit_page })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange));

  // Get total view counts from pageviews
  const viewRows = await db
    .select({ url: pageviews.url })
    .from(pageviews)
    .where(buildPageviewFilters(siteId, dateRange));

  const exitMap = new Map<string, number>();
  exitRows.forEach((r) => {
    exitMap.set(r.exit_page, (exitMap.get(r.exit_page) || 0) + 1);
  });

  const viewMap = new Map<string, number>();
  viewRows.forEach((r) => {
    viewMap.set(r.url, (viewMap.get(r.url) || 0) + 1);
  });

  const results: PageExitRate[] = [];
  viewMap.forEach((views, url) => {
    const exits = exitMap.get(url) || 0;
    results.push({
      url,
      views,
      exits,
      exitRate: views > 0 ? Math.round((exits / views) * 100) : 0,
    });
  });

  return results.sort((a, b) => b.exitRate - a.exitRate).slice(0, limit);
}

// ============================================================
// USER FLOW & PAGES PER SESSION
// ============================================================

export async function getUserFlows(
  siteId: string | "all",
  dateRange: DateRange,
  limit = 15
): Promise<UserFlowStep[]> {
  // Get pageviews grouped by session, ordered by time
  const rows = await db
    .select({
      session_id: pageviews.session_id,
      url: pageviews.url,
      created_at: pageviews.created_at,
    })
    .from(pageviews)
    .where(buildPageviewFilters(siteId, dateRange))
    .orderBy(pageviews.session_id, pageviews.created_at);

  // Build session page sequences
  const sessionPages = new Map<string, string[]>();
  rows.forEach((r) => {
    if (!sessionPages.has(r.session_id)) {
      sessionPages.set(r.session_id, []);
    }
    const pages = sessionPages.get(r.session_id)!;
    // Only add if different from the last page (avoid duplicate SPA navigations)
    if (pages.length === 0 || pages[pages.length - 1] !== r.url) {
      pages.push(r.url);
    }
  });

  // Count transitions
  const flowMap = new Map<string, number>();
  sessionPages.forEach((pages) => {
    for (let i = 0; i < pages.length - 1; i++) {
      const key = `${pages[i]}→${pages[i + 1]}`;
      flowMap.set(key, (flowMap.get(key) || 0) + 1);
    }
  });

  return Array.from(flowMap.entries())
    .map(([key, count]) => {
      const [from, to] = key.split("→");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function getPagesPerSessionDistribution(
  siteId: string | "all",
  dateRange: DateRange
): Promise<PagesPerSessionBucket[]> {
  const rows = await db
    .select({ page_count: sessions.page_count })
    .from(sessions)
    .where(buildSessionFilters(siteId, dateRange));

  if (rows.length === 0) return [];

  const bucketMap = new Map<string, number>();
  rows.forEach((r) => {
    let bucket: string;
    if (r.page_count === 1) bucket = "1";
    else if (r.page_count === 2) bucket = "2";
    else if (r.page_count === 3) bucket = "3";
    else if (r.page_count <= 5) bucket = "4-5";
    else if (r.page_count <= 10) bucket = "6-10";
    else bucket = "11+";
    bucketMap.set(bucket, (bucketMap.get(bucket) || 0) + 1);
  });

  const total = rows.length;
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

export async function getWebVitalsTrends(
  siteId: string | "all",
  dateRange: DateRange
): Promise<WebVitalTrend[]> {
  const isHourly = differenceInDays(dateRange.to, dateRange.from) <= 2;
  const dateFormatStr = isHourly ? "yyyy-MM-dd HH:00" : "yyyy-MM-dd";

  const vitalEvents = await db
    .select({
      properties: events.properties,
      created_at: events.created_at,
    })
    .from(events)
    .where(
      and(
        buildEventFilters(siteId, dateRange),
        eq(events.name, "web_vital")
      )
    )
    .orderBy(events.created_at);

  // Group by metric then by date/hour
  const metricData = new Map<
    string,
    Map<string, { total: number; count: number }>
  >();

  vitalEvents.forEach((e) => {
    const props = e.properties as Record<string, unknown>;
    const metric = (props.metric as string) || "";
    const value = (props.value as number) || 0;
    const date = format(new Date(e.created_at), dateFormatStr);

    if (!metric) return;
    if (!metricData.has(metric)) metricData.set(metric, new Map());
    const dateMap = metricData.get(metric)!;
    if (!dateMap.has(date)) dateMap.set(date, { total: 0, count: 0 });
    const entry = dateMap.get(date)!;
    entry.total += value;
    entry.count += 1;
  });

  // Also add TTFB from pageviews
  const ttfbRows = await db
    .select({
      ttfb: pageviews.ttfb,
      created_at: pageviews.created_at,
    })
    .from(pageviews)
    .where(buildPageviewFilters(siteId, dateRange));

  const ttfbDateMap = new Map<string, { total: number; count: number }>();
  ttfbRows.forEach((r) => {
    if (r.ttfb == null || r.ttfb <= 0) return;
    const date = format(new Date(r.created_at), dateFormatStr);
    if (!ttfbDateMap.has(date)) ttfbDateMap.set(date, { total: 0, count: 0 });
    const entry = ttfbDateMap.get(date)!;
    entry.total += r.ttfb;
    entry.count += 1;
  });
  if (ttfbDateMap.size > 0) {
    metricData.set("TTFB", ttfbDateMap);
  }

  const results: WebVitalTrend[] = [];
  const desiredMetrics = ["LCP", "FCP", "CLS", "INP", "TTFB"];

  desiredMetrics.forEach((metric) => {
    const dateMap = metricData.get(metric);
    if (!dateMap) {
      results.push({
        metric,
        data: [],
        current: 0,
        rating: "good",
      });
      return;
    }

    const data = Array.from(dateMap.entries())
      .map(([date, { total, count }]) => ({
        date,
        value: Math.round(total / count),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const current = data.length > 0 ? data[data.length - 1].value : 0;

    results.push({
      metric,
      data,
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
  // Get web vital events with their URLs
  const vitalEvents = await db
    .select({
      url: events.url,
      properties: events.properties,
    })
    .from(events)
    .where(
      and(
        buildEventFilters(siteId, dateRange),
        eq(events.name, "web_vital")
      )
    );

  // Get TTFB from pageviews
  const ttfbRows = await db
    .select({
      url: pageviews.url,
      ttfb: pageviews.ttfb,
    })
    .from(pageviews)
    .where(buildPageviewFilters(siteId, dateRange));

  const pageMetrics = new Map<
    string,
    {
      lcp: { total: number; count: number };
      fcp: { total: number; count: number };
      cls: { total: number; count: number };
      inp: { total: number; count: number };
      ttfb: { total: number; count: number };
    }
  >();

  const getOrCreate = (url: string) => {
    if (!pageMetrics.has(url)) {
      pageMetrics.set(url, {
        lcp: { total: 0, count: 0 },
        fcp: { total: 0, count: 0 },
        cls: { total: 0, count: 0 },
        inp: { total: 0, count: 0 },
        ttfb: { total: 0, count: 0 },
      });
    }
    return pageMetrics.get(url)!;
  };

  vitalEvents.forEach((e) => {
    const url = e.url || "";
    if (!url) return;
    const props = e.properties as Record<string, unknown>;
    const metric = ((props.metric as string) || "").toLowerCase();
    const value = (props.value as number) || 0;
    const entry = getOrCreate(url);
    if (metric in entry) {
      const m = entry[metric as keyof typeof entry];
      m.total += value;
      m.count += 1;
    }
  });

  ttfbRows.forEach((r) => {
    if (r.ttfb == null || r.ttfb <= 0) return;
    const entry = getOrCreate(r.url);
    entry.ttfb.total += r.ttfb;
    entry.ttfb.count += 1;
  });

  return Array.from(pageMetrics.entries())
    .map(([url, m]) => ({
      url,
      lcp: m.lcp.count > 0 ? Math.round(m.lcp.total / m.lcp.count) : null,
      fcp: m.fcp.count > 0 ? Math.round(m.fcp.total / m.fcp.count) : null,
      cls: m.cls.count > 0 ? Math.round(m.cls.total / m.cls.count) : null,
      inp: m.inp.count > 0 ? Math.round(m.inp.total / m.inp.count) : null,
      ttfb: m.ttfb.count > 0 ? Math.round(m.ttfb.total / m.ttfb.count) : null,
    }))
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
  const isHourly = differenceInDays(dateRange.to, dateRange.from) <= 2;
  const dateFormatStr = isHourly ? "yyyy-MM-dd HH:00" : "yyyy-MM-dd";

  const errorEvents = await db
    .select({ created_at: events.created_at })
    .from(events)
    .where(
      and(
        buildEventFilters(siteId, dateRange),
        eq(events.name, "js_error")
      )
    )
    .orderBy(events.created_at);

  const dateMap = new Map<string, number>();
  errorEvents.forEach((e) => {
    const date = format(new Date(e.created_at), dateFormatStr);
    dateMap.set(date, (dateMap.get(date) || 0) + 1);
  });

  return Array.from(dateMap.entries()).map(([date, count]) => ({
    date,
    count,
  }));
}

export async function getTopErrors(
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<ErrorEntry[]> {
  const errorEvents = await db
    .select({
      properties: events.properties,
      created_at: events.created_at,
    })
    .from(events)
    .where(
      and(
        buildEventFilters(siteId, dateRange),
        eq(events.name, "js_error")
      )
    );

  const errorMap = new Map<
    string,
    { count: number; firstSeen: string; lastSeen: string; source?: string }
  >();

  errorEvents.forEach((e) => {
    const props = e.properties as Record<string, unknown>;
    const message = (props.message as string) || "Unknown error";
    const ts = new Date(e.created_at).toISOString();
    const source = (props.source as string) || undefined;

    const existing = errorMap.get(message);
    if (!existing) {
      errorMap.set(message, { count: 1, firstSeen: ts, lastSeen: ts, source });
    } else {
      existing.count += 1;
      if (ts < existing.firstSeen) existing.firstSeen = ts;
      if (ts > existing.lastSeen) existing.lastSeen = ts;
    }
  });

  return Array.from(errorMap.entries())
    .map(([message, data]) => ({ message, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
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
      utm_source: sessions.utm_source,
      utm_medium: sessions.utm_medium,
      utm_campaign: sessions.utm_campaign,
      page_count: sessions.page_count,
      total_duration: sessions.total_duration,
      is_bounce: sessions.is_bounce,
    })
    .from(sessions)
    .where(
      and(
        buildSessionFilters(siteId, dateRange),
        ne(sessions.utm_campaign, "")
      )
    );

  if (rows.length === 0) return [];

  const campaignMap = new Map<
    string,
    {
      source: string;
      medium: string;
      sessions: number;
      bounces: number;
      totalDuration: number;
      totalPages: number;
    }
  >();

  rows.forEach((r) => {
    const key = r.utm_campaign || "direct";
    if (!campaignMap.has(key)) {
      campaignMap.set(key, {
        source: r.utm_source || "",
        medium: r.utm_medium || "",
        sessions: 0,
        bounces: 0,
        totalDuration: 0,
        totalPages: 0,
      });
    }
    const entry = campaignMap.get(key)!;
    entry.sessions += 1;
    if (r.is_bounce) entry.bounces += 1;
    entry.totalDuration += r.total_duration;
    entry.totalPages += r.page_count;
  });

  return Array.from(campaignMap.entries())
    .map(([campaign, d]) => ({
      campaign,
      source: d.source,
      medium: d.medium,
      sessions: d.sessions,
      bounceRate:
        d.sessions > 0 ? Math.round((d.bounces / d.sessions) * 100) : 0,
      avgDuration:
        d.sessions > 0 ? Math.round(d.totalDuration / d.sessions) : 0,
      pagesPerSession:
        d.sessions > 0 ? Math.round((d.totalPages / d.sessions) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

export async function getSourceQuality(
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<SourceQuality[]> {
  const rows = await db
    .select({
      referrer: sessions.referrer,
      visitor_id: sessions.visitor_id,
      page_count: sessions.page_count,
      total_duration: sessions.total_duration,
      is_bounce: sessions.is_bounce,
    })
    .from(sessions)
    .where(
      and(
        buildSessionFilters(siteId, dateRange),
        ne(sessions.referrer, "")
      )
    );

  if (rows.length === 0) return [];

  const sourceMap = new Map<
    string,
    {
      visitors: Set<string>;
      sessions: number;
      bounces: number;
      totalDuration: number;
      totalPages: number;
    }
  >();

  rows.forEach((r) => {
    let domain = r.referrer || "";
    try {
      domain = new URL(domain).hostname;
    } catch {
      // use as-is
    }
    if (!sourceMap.has(domain)) {
      sourceMap.set(domain, {
        visitors: new Set(),
        sessions: 0,
        bounces: 0,
        totalDuration: 0,
        totalPages: 0,
      });
    }
    const entry = sourceMap.get(domain)!;
    entry.visitors.add(r.visitor_id);
    entry.sessions += 1;
    if (r.is_bounce) entry.bounces += 1;
    entry.totalDuration += r.total_duration;
    entry.totalPages += r.page_count;
  });

  return Array.from(sourceMap.entries())
    .map(([source, d]) => {
      const bounceRate =
        d.sessions > 0 ? Math.round((d.bounces / d.sessions) * 100) : 0;
      const avgDuration =
        d.sessions > 0 ? Math.round(d.totalDuration / d.sessions) : 0;
      const avgPages =
        d.sessions > 0
          ? Math.round((d.totalPages / d.sessions) * 10) / 10
          : 0;

      // Quality score: lower bounce + higher duration + more pages = better
      const bounceScore = Math.max(0, 100 - bounceRate);
      const durationScore = Math.min(avgDuration / 3, 100);
      const pageScore = Math.min(avgPages * 20, 100);
      const qualityScore = Math.round(
        bounceScore * 0.4 + durationScore * 0.3 + pageScore * 0.3
      );

      return {
        source,
        visitors: d.visitors.size,
        sessions: d.sessions,
        bounceRate,
        avgDuration,
        avgPages,
        qualityScore,
      };
    })
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, limit);
}

// ============================================================
// CONNECTION TYPE
// ============================================================

export async function getConnectionTypes(
  siteId: string | "all",
  dateRange: DateRange
): Promise<ConnectionTypeEntry[]> {
  const rows = await db
    .select({ connection_type: pageviews.connection_type })
    .from(pageviews)
    .where(buildPageviewFilters(siteId, dateRange));

  const typeMap = new Map<string, number>();
  rows.forEach((r) => {
    const type = r.connection_type || "unknown";
    typeMap.set(type, (typeMap.get(type) || 0) + 1);
  });

  const total = rows.length || 1;
  return Array.from(typeMap.entries())
    .filter(([type]) => type !== "unknown" && type !== "")
    .map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

// ============================================================
// REALTIME
// ============================================================

export async function getRealtimeStats(
  siteId: string | "all"
): Promise<RealtimeStats> {
  const thirtyMinAgo = subMinutes(new Date(), 30);

  const conditions = [
    gte(pageviews.created_at, thirtyMinAgo),
  ];
  if (siteId !== "all") {
    conditions.push(eq(pageviews.site_id, siteId));
  }

  const rows = await db
    .select({
      visitor_id: pageviews.visitor_id,
      url: pageviews.url,
      country: pageviews.country,
      is_bot: pageviews.is_bot,
    })
    .from(pageviews)
    .where(and(...conditions));

  const realRows = rows.filter((r) => !r.is_bot);
  const botRows = rows.filter((r) => r.is_bot);

  const activeVisitors = new Set(realRows.map((r) => r.visitor_id)).size;
  const activeBots = new Set(botRows.map((r) => r.visitor_id)).size;

  // Active pages (only for real users to keep it clean)
  const pageMap = new Map<string, Set<string>>();
  realRows.forEach((r) => {
    if (!pageMap.has(r.url)) pageMap.set(r.url, new Set());
    pageMap.get(r.url)!.add(r.visitor_id);
  });

  const activePages = Array.from(pageMap.entries())
    .map(([url, visitors]) => ({ url, viewers: visitors.size }))
    .sort((a, b) => b.viewers - a.viewers)
    .slice(0, 10);

  // Top countries (only real users)
  const countryMap = new Map<string, number>();
  realRows.forEach((r) => {
    const country = r.country || "";
    if (country) {
      countryMap.set(country, (countryMap.get(country) || 0) + 1);
    }
  });

  const topCountries = Array.from(countryMap.entries())
    .map(([country, count]) => ({
      country,
      flag: countryFlag(country),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    activeVisitors,
    pageviewsLast30Min: realRows.length,
    activeBots,
    botPageviewsLast30Min: botRows.length,
    activePages,
    topCountries,
  };
}

// ============================================================
// SEO OVERVIEW
// ============================================================

export async function getSeoOverview(
  siteId: string | "all",
  dateRange: DateRange
) {
  const isHourly = differenceInDays(dateRange.to, dateRange.from) <= 2;
  const dateFormatStr = isHourly ? "yyyy-MM-dd HH:00" : "yyyy-MM-dd";
  // Define known search engine domains
  const searchEngines = [
    "google.com", "google.co", "bing.com", "yahoo.com", "duckduckgo.com", "yandex.ru", "yandex.com", "ecosia.org"
  ];

  const pFilters = buildPageviewFilters(siteId, dateRange);

  // Get all pageviews with referrers for the period
  const pvRows = await db
    .select({
      url: pageviews.url,
      referrer: pageviews.referrer,
      visitor_id: pageviews.visitor_id,
      created_at: pageviews.created_at,
    })
    .from(pageviews)
    .where(pFilters);

  let organicVisitors = new Set<string>();
  let organicPageviews = 0;
  
  const landingPagesMap = new Map<string, { views: number; visitors: Set<string> }>();
  const enginesMap = new Map<string, { views: number; visitors: Set<string> }>();
  const trendMap = new Map<string, Set<string>>();

  pvRows.forEach((row) => {
    if (!row.referrer) return;
    
    // Check if referrer matches a search engine
    let isOrganic = false;
    let engineFound = "Other";
    const refLower = row.referrer.toLowerCase();
    
    for (const engine of searchEngines) {
      if (refLower.includes(engine)) {
        isOrganic = true;
        engineFound = engine.split('.')[0];
        engineFound = engineFound.charAt(0).toUpperCase() + engineFound.slice(1);
        break;
      }
    }

    if (isOrganic) {
      organicVisitors.add(row.visitor_id);
      organicPageviews++;

      // Engines
      if (!enginesMap.has(engineFound)) {
        enginesMap.set(engineFound, { views: 0, visitors: new Set() });
      }
      const eStats = enginesMap.get(engineFound)!;
      eStats.views++;
      eStats.visitors.add(row.visitor_id);

      // Landing Pages
      const path = new URL(row.url, "http://dummy").pathname;
      if (!landingPagesMap.has(path)) {
        landingPagesMap.set(path, { views: 0, visitors: new Set() });
      }
      const pStats = landingPagesMap.get(path)!;
      pStats.views++;
      pStats.visitors.add(row.visitor_id);

      // Trend
      const dateStr = format(new Date(row.created_at), dateFormatStr);
      if (!trendMap.has(dateStr)) trendMap.set(dateStr, new Set());
      trendMap.get(dateStr)!.add(row.visitor_id);
    }
  });

  const topEngines = Array.from(enginesMap.entries())
    .map(([engine, stats]) => ({
      engine,
      views: stats.views,
      visitors: stats.visitors.size,
    }))
    .sort((a, b) => b.visitors - a.visitors);

  const topLandingPages = Array.from(landingPagesMap.entries())
    .map(([url, stats]) => ({
      url,
      views: stats.views,
      visitors: stats.visitors.size,
    }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 50);

  const timeseries = Array.from(trendMap.entries())
    .map(([date, vSet]) => ({
      date,
      visitors: vSet.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    organicVisitors: organicVisitors.size,
    organicPageviews,
    topEngines,
    topLandingPages,
    timeseries,
  };
}
