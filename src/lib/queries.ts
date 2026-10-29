// ============================================================
// Xine — Dashboard Data Layer
// Server-side query functions for all dashboard views.
// Uses Drizzle ORM with PostgreSQL.
// ============================================================

import { db } from "./db";
import { pageviews, events, sites, sessions } from "./db/schema";
import { eq, gte, lte, ne, desc, sql, and, type SQL } from "drizzle-orm";
import {
  buildDateExpr,
  buildDimensionConditions,
  cappedPageDuration,
  cappedSessionDuration,
  getPreviousDateRange,
  pagePathSql,
  sessionSourceClassifier,
  siteScopeSql,
} from "./query-helpers";
import { buildSessionFilters } from "./queries-advanced";
import { filterStore } from "./filter-store";
import type { DimensionFilters } from "./api-helpers";
import type {
  Site,
  OverviewStats,
  TimeseriesPoint,
  TopPage,
  TopSource,
  DeviceBreakdown,
  BrowserStat,
  CountryStat,
  CustomEvent,
  DateRange,
} from "./types";

// ---- Helpers ----

function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// Country code → flag emoji
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌍";
  const codePoints = code
    .toUpperCase()
    .split("")
    .map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/**
 * Row conditions for a pageviews/events query: date range, site scope,
 * bot exclusion, and the dimension filters. Filter semantics (pages and
 * sources are session-level) live in buildDimensionConditions so every
 * report agrees on what a filter means.
 */
export function buildFilters(
  siteId: string | string[],
  dateRange: DateRange,
  table: typeof pageviews | typeof events,
  filters?: DimensionFilters
) {
  const conditions: SQL[] = [
    gte(table.created_at, dateRange.from),
    lte(table.created_at, dateRange.to),
    siteScopeSql(table.site_id, siteId),
    // Exclude bot traffic from all dashboard metrics
    eq(table.is_bot, false),
  ];

  const activeFilters = filters || filterStore.getStore();
  conditions.push(...buildDimensionConditions(table, siteId, dateRange, activeFilters));

  return and(...conditions);
}

// ---- Query Functions ----

/**
 * Get overview stats with comparison to the previous period of the same
 * length (see getPreviousDateRange).
 *
 *  - visitors / pageviews   — from pageviews (whole matching visits when a
 *    pages/sources filter is active; see buildDimensionConditions).
 *  - avgDuration            — average VISIT duration, from sessions:
 *    AVG(LEAST(total_duration, 4h)). Previously this was the average of
 *    per-pageview durations (time on page), which disagreed with the
 *    Analytics page's session duration for the same period.
 *  - avgTimeOnPage          — AVG(LEAST(pageviews.duration, 30 min)).
 *  - bounceRate             — share of sessions with a single pageview
 *    (sessions.is_bounce), the same definition the Analytics, Behavior and
 *    Acquisition pages use. It used to be derived by grouping the filtered
 *    pageviews by session, so a page filter turned every multi-page visit
 *    that touched the page into a "bounce".
 */
export async function getOverviewStats(
  siteId: string | string[],
  dateRange: DateRange,
  filters?: DimensionFilters
): Promise<OverviewStats> {
  const prevRange = getPreviousDateRange(dateRange);
  const activeFilters = filters || filterStore.getStore();

  const pageviewQuery = (range: DateRange) => db
    .select({
      visitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
      pageviewCount: sql<number>`COUNT(*)::int`,
      avgTimeOnPage: sql<number>`COALESCE(AVG(${cappedPageDuration(pageviews.duration)}), 0)::float`,
    })
    .from(pageviews)
    .where(buildFilters(siteId, range, pageviews, activeFilters));

  const sessionQuery = (range: DateRange) => db
    .select({
      sessions: sql<number>`COUNT(*)::int`,
      avgDuration: sql<number>`COALESCE(AVG(${cappedSessionDuration(sessions.total_duration)}), 0)::float`,
      bounceRate: sql<number>`COALESCE(
        COUNT(*) FILTER (WHERE ${sessions.is_bounce} = true)::float / NULLIF(COUNT(*), 0) * 100,
        0
      )::float`,
    })
    .from(sessions)
    .where(buildSessionFilters(siteId, range, activeFilters));

  const [[current], [prev], [currentSessions], [prevSessions]] = await Promise.all([
    pageviewQuery(dateRange),
    pageviewQuery(prevRange),
    sessionQuery(dateRange),
    sessionQuery(prevRange),
  ]);

  const visitors = current.visitors || 0;
  const prevVisitors = prev.visitors || 0;
  const pageviewCount = current.pageviewCount || 0;
  const prevPageviewCount = prev.pageviewCount || 0;
  const avgDuration = Math.round(currentSessions.avgDuration || 0);
  const prevAvgDuration = Math.round(prevSessions.avgDuration || 0);
  const bounceRate = Math.round(currentSessions.bounceRate || 0);
  const prevBounceRate = Math.round(prevSessions.bounceRate || 0);

  return {
    visitors,
    pageviews: pageviewCount,
    avgDuration,
    avgTimeOnPage: Math.round(current.avgTimeOnPage || 0),
    sessions: currentSessions.sessions || 0,
    bounceRate,
    visitorsChange: calcChange(visitors, prevVisitors),
    pageviewsChange: calcChange(pageviewCount, prevPageviewCount),
    durationChange: calcChange(avgDuration, prevAvgDuration),
    bounceRateChange: calcChange(bounceRate, prevBounceRate),
  };
}

/**
 * Get visitor + pageview timeseries for charting.
 * Buckets are days/hours in the range's timezone (buildDateExpr).
 */
export async function getVisitorTimeseries(
  siteId: string | string[],
  dateRange: DateRange,
  filters?: DimensionFilters
): Promise<TimeseriesPoint[]> {
  const dateExpr = buildDateExpr(dateRange, pageviews.created_at);

  const rows = await db
    .select({
      date: dateExpr,
      visitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
      pageviews: sql<number>`COUNT(*)::int`,
    })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews, filters))
    .groupBy(dateExpr)
    .orderBy(dateExpr);

  return rows;
}

/**
 * Get top pages by view count.
 *
 * Grouped by path (query string and fragment stripped) so one page is not
 * split into a row per ?utm_/fbclid/search-param variant. avgDuration is
 * time on page, capped per row at 30 min.
 */
export async function getTopPages(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 10,
  filters?: DimensionFilters
): Promise<TopPage[]> {
  const pathExpr = pagePathSql(pageviews.url);

  const rows = await db
    .select({
      url: pathExpr,
      views: sql<number>`COUNT(*)::int`,
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
      avgDuration: sql<number>`COALESCE(ROUND(AVG(${cappedPageDuration(pageviews.duration)})), 0)::int`,
      siteIds: sql<string[]>`ARRAY_AGG(DISTINCT ${pageviews.site_id}::text)`,
    })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews, filters))
    .groupBy(pathExpr)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return rows.map((r) => ({
    url: r.url,
    views: r.views,
    uniqueVisitors: r.uniqueVisitors,
    avgDuration: r.avgDuration,
    siteIds: Array.isArray(siteId) || siteId === "all" ? r.siteIds : undefined,
  }));
}

/**
 * Get top traffic sources.
 *
 * Attributed per session from the session's entry referrer and first-touch
 * UTMs (sessions table), not per pageview: on SPAs every soft navigation
 * re-sent the original document.referrer, and on multi-page sites internal
 * navigations sent the site's own URL, so pageview-level counting both
 * inflated search engines and listed the site as its own source.
 *
 * Sources are normalised by classifySource ("Google" covers every Google
 * ccTLD and the Google app, "Bing" every bing.com host), self-referrals fold
 * into Direct, and Direct is a row of its own so percentages — share of all
 * sessions in range — add up to 100.
 */
export async function getTopSources(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 10,
  filters?: DimensionFilters
): Promise<TopSource[]> {
  const activeFilters = filters || filterStore.getStore();
  const where = buildSessionFilters(siteId, dateRange, activeFilters);
  // Classify once per session in a derived table, then group on the
  // resulting column (the classifier is a correlated scalar subquery).
  const src = db
    .select({
      source: sql<string>`${sessionSourceClassifier().name}`.as("source"),
      visitor_id: sessions.visitor_id,
      site_id: sessions.site_id,
    })
    .from(sessions)
    .where(where)
    .as("src");

  const [rows, totals] = await Promise.all([
    db
      .select({
        source: src.source,
        visitors: sql<number>`COUNT(DISTINCT ${src.visitor_id})::int`,
        sessions: sql<number>`COUNT(*)::int`,
        siteIds: sql<string[]>`ARRAY_AGG(DISTINCT ${src.site_id}::text)`,
      })
      .from(src)
      .groupBy(src.source)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(limit),
    db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(sessions)
      .where(where),
  ]);

  const total = totals[0]?.total || 0;

  return rows.map((r) => ({
    referrer: r.source,
    visitors: r.visitors,
    sessions: r.sessions,
    percentage: total > 0 ? Math.round((r.sessions / total) * 100) : 0,
    siteIds: Array.isArray(siteId) || siteId === "all" ? r.siteIds : undefined,
  }));
}

/**
 * Get device type breakdown (desktop/mobile/tablet), in unique visitors —
 * the same unit as the country and source tables (it used to count
 * pageviews, which over-weighted desktop sessions with more pages).
 * Anything that is not mobile/tablet (NULL, '', unrecognised) is desktop,
 * matching the "desktop" filter.
 */
export async function getDeviceBreakdown(
  siteId: string | string[],
  dateRange: DateRange,
  filters?: DimensionFilters
): Promise<DeviceBreakdown> {
  const deviceExpr = sql<string>`CASE WHEN LOWER(COALESCE(${pageviews.device}, '')) IN ('mobile', 'tablet') THEN LOWER(${pageviews.device}) ELSE 'desktop' END`;

  const rows = await db
    .select({
      device: deviceExpr,
      count: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
    })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews, filters))
    .groupBy(deviceExpr);

  const breakdown: DeviceBreakdown = { desktop: 0, mobile: 0, tablet: 0 };
  rows.forEach((row) => {
    const dev = row.device as keyof DeviceBreakdown;
    if (dev === "mobile" || dev === "tablet" || dev === "desktop") {
      breakdown[dev] = row.count;
    }
  });

  return breakdown;
}

/**
 * Get browser usage breakdown, in unique visitors.
 */
export async function getBrowserBreakdown(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 8,
  filters?: DimensionFilters
): Promise<BrowserStat[]> {
  const rows = await db
    .select({
      browser: sql<string>`COALESCE(${pageviews.browser}, 'Unknown')`,
      count: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
    })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews, filters))
    .groupBy(sql`COALESCE(${pageviews.browser}, 'Unknown')`)
    .orderBy(sql`COUNT(DISTINCT ${pageviews.visitor_id}) DESC`)
    .limit(limit);

  return rows;
}

/**
 * Get country visitor breakdown.
 */
export async function getCountryBreakdown(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 10,
  filters?: DimensionFilters
): Promise<CountryStat[]> {
  const combinedFilters = buildFilters(siteId, dateRange, pageviews, filters);
  const rows = await db
    .select({
      country: pageviews.country,
      visitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
    })
    .from(pageviews)
    .where(and(combinedFilters, ne(pageviews.country, "")))
    .groupBy(pageviews.country)
    .orderBy(sql`COUNT(DISTINCT ${pageviews.visitor_id}) DESC`)
    .limit(limit);

  return rows.map((r) => ({
    country: r.country || "Unknown",
    visitors: r.visitors,
    flag: countryFlag(r.country || ""),
  }));
}

/**
 * Get top custom events.
 */
export async function getTopEvents(
  siteId: string | string[],
  dateRange: DateRange,
  limit = 10,
  filters?: DimensionFilters
): Promise<CustomEvent[]> {
  const rows = await db
    .select({
      name: events.name,
      count: sql<number>`COUNT(*)::int`,
      lastTriggered: sql<string>`to_char(MAX(${events.created_at}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    })
    .from(events)
    .where(buildFilters(siteId, dateRange, events, filters))
    .groupBy(events.name)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return rows;
}

/**
 * Get all tracked sites.
 */
export async function getSites(): Promise<Site[]> {
  try {
    const rows = await db
      .select()
      .from(sites)
      .orderBy(desc(sites.created_at));

    return rows.map((row) => ({
      ...row,
      created_at: new Date(row.created_at).toISOString(),
    }));
  } catch (error) {
    console.error("Error fetching sites:", error);
    return [];
  }
}

/**
 * Get a single site by ID.
 */
export async function getSiteById(siteId: string): Promise<Site | null> {
  try {
    const rows = await db
      .select()
      .from(sites)
      .where(eq(sites.id, siteId))
      .limit(1);

    if (rows.length === 0) return null;
    return {
      ...rows[0],
      created_at: new Date(rows[0].created_at).toISOString(),
    };
  } catch {
    return null;
  }
}
