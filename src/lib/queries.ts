// ============================================================
// Xine — Dashboard Data Layer
// Server-side query functions for all dashboard views.
// Uses Drizzle ORM with PostgreSQL.
// ============================================================

import { db } from "./db";
import { pageviews, events, sites, sessions } from "./db/schema";
import { eq, gte, lte, ne, desc, sql, and } from "drizzle-orm";
import { format, subDays, differenceInDays } from "date-fns";
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

// Country code → flag emoji
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌍";
  const codePoints = code
    .toUpperCase()
    .split("")
    .map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function buildFilters(siteId: string | "all", dateRange: DateRange, table: typeof pageviews | typeof events) {
  const conditions = [
    gte(table.created_at, dateRange.from),
    lte(table.created_at, dateRange.to),
  ];
  if (siteId !== "all") {
    conditions.push(eq(table.site_id, siteId));
  }
  // Exclude bot traffic from all dashboard metrics
  if ("is_bot" in table) {
    conditions.push(eq((table as typeof pageviews).is_bot, false));
  }
  return and(...conditions);
}

// ---- Query Functions ----

/**
 * Get overview stats: total visitors, pageviews, avg duration, bounce rate
 * with comparison to the previous period of the same length.
 */
export async function getOverviewStats(
  siteId: string | "all",
  dateRange: DateRange
): Promise<OverviewStats> {
  const prevRange = getPreviousDateRange(dateRange);

  const statsQuery = (range: DateRange) => db
    .select({
      visitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
      pageviewCount: sql<number>`COUNT(*)::int`,
      avgDuration: sql<number>`COALESCE(AVG(${pageviews.duration}), 0)::float`,
    })
    .from(pageviews)
    .where(buildFilters(siteId, range, pageviews));

  const bounceQuery = (range: DateRange) => {
    const sub = db.select({
      cnt: sql<number>`COUNT(*)::int`.as('cnt'),
    })
    .from(pageviews)
    .where(buildFilters(siteId, range, pageviews))
    .groupBy(pageviews.session_id)
    .as('sub');

    return db
      .select({
        bounceRate: sql<number>`COALESCE(
          COUNT(*) FILTER (WHERE ${sub.cnt} = 1)::float / NULLIF(COUNT(*), 0) * 100,
          0
        )::float`,
      })
      .from(sub);
  };

  const [[current], [prev], [currentBounce], [prevBounce]] = await Promise.all([
    statsQuery(dateRange),
    statsQuery(prevRange),
    bounceQuery(dateRange),
    bounceQuery(prevRange),
  ]);

  const visitors = current.visitors || 0;
  const prevVisitors = prev.visitors || 0;
  const pageviewCount = current.pageviewCount || 0;
  const prevPageviewCount = prev.pageviewCount || 0;
  const avgDuration = Math.round(current.avgDuration || 0);
  const prevAvgDuration = Math.round(prev.avgDuration || 0);
  const bounceRate = Math.round(currentBounce.bounceRate || 0);
  const prevBounceRate = Math.round(prevBounce.bounceRate || 0);

  return {
    visitors,
    pageviews: pageviewCount,
    avgDuration,
    bounceRate,
    visitorsChange: calcChange(visitors, prevVisitors),
    pageviewsChange: calcChange(pageviewCount, prevPageviewCount),
    durationChange: calcChange(avgDuration, prevAvgDuration),
    bounceRateChange: calcChange(bounceRate, prevBounceRate),
  };
}

/**
 * Get visitor + pageview timeseries for charting.
 */
export async function getVisitorTimeseries(
  siteId: string | "all",
  dateRange: DateRange
): Promise<TimeseriesPoint[]> {
  const daysDiff = differenceInDays(dateRange.to, dateRange.from);
  const bucket = daysDiff <= 2 ? 'hour' : 'day';
  const dateFormat = bucket === 'hour' ? 'YYYY-MM-DD HH24:00' : 'YYYY-MM-DD';
  const dateExpr = sql<string>`to_char(DATE_TRUNC(${bucket}, ${pageviews.created_at}), ${dateFormat})`;

  const rows = await db
    .select({
      date: dateExpr,
      visitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
      pageviews: sql<number>`COUNT(*)::int`,
    })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews))
    .groupBy(dateExpr)
    .orderBy(dateExpr);

  return rows;
}

/**
 * Get top pages by view count.
 */
export async function getTopPages(
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<TopPage[]> {
  const rows = await db
    .select({
      url: pageviews.url,
      views: sql<number>`COUNT(*)::int`,
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
      avgDuration: sql<number>`COALESCE(ROUND(AVG(${pageviews.duration})), 0)::int`,
    })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews))
    .groupBy(pageviews.url)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return rows;
}

/**
 * Get top referrer sources.
 */
export async function getTopSources(
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<TopSource[]> {
  const filters = buildFilters(siteId, dateRange, pageviews);

  const extractedHost = sql<string>`
    CASE 
      WHEN ${pageviews.referrer} ~ '^https?://' 
      THEN regexp_replace(${pageviews.referrer}, '^https?://([^/]+).*$', '\\1')
      ELSE ${pageviews.referrer}
    END
  `;

  const rows = await db
    .select({
      source: extractedHost,
      visitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
    })
    .from(pageviews)
    .where(and(filters, ne(pageviews.referrer, "")))
    .groupBy(extractedHost)
    .orderBy(sql`COUNT(DISTINCT ${pageviews.visitor_id}) DESC`)
    .limit(limit);

  const totalVisitorsRow = await db
    .select({
      total: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
    })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews));

  const total = totalVisitorsRow[0]?.total || 0;

  return rows.map((r) => ({
    referrer: r.source,
    visitors: r.visitors,
    percentage: total > 0 ? Math.round((r.visitors / total) * 100) : 0,
  }));
}

/**
 * Get device type breakdown (desktop/mobile/tablet).
 */
export async function getDeviceBreakdown(
  siteId: string | "all",
  dateRange: DateRange
): Promise<DeviceBreakdown> {
  const rows = await db
    .select({
      device: sql<string>`LOWER(COALESCE(${pageviews.device}, 'desktop'))`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews))
    .groupBy(sql`LOWER(COALESCE(${pageviews.device}, 'desktop'))`);

  const breakdown: DeviceBreakdown = { desktop: 0, mobile: 0, tablet: 0 };
  rows.forEach((row) => {
    const dev = row.device as keyof DeviceBreakdown;
    if (dev === "mobile" || dev === "tablet" || dev === "desktop") {
      breakdown[dev] = row.count;
    } else {
      breakdown.desktop += row.count;
    }
  });

  return breakdown;
}

/**
 * Get browser usage breakdown.
 */
export async function getBrowserBreakdown(
  siteId: string | "all",
  dateRange: DateRange,
  limit = 8
): Promise<BrowserStat[]> {
  const rows = await db
    .select({
      browser: sql<string>`COALESCE(${pageviews.browser}, 'Unknown')`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews))
    .groupBy(sql`COALESCE(${pageviews.browser}, 'Unknown')`)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(limit);

  return rows;
}

/**
 * Get country visitor breakdown.
 */
export async function getCountryBreakdown(
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<CountryStat[]> {
  const filters = buildFilters(siteId, dateRange, pageviews);
  const rows = await db
    .select({
      country: pageviews.country,
      visitors: sql<number>`COUNT(DISTINCT ${pageviews.visitor_id})::int`,
    })
    .from(pageviews)
    .where(and(filters, ne(pageviews.country, "")))
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
  siteId: string | "all",
  dateRange: DateRange,
  limit = 10
): Promise<CustomEvent[]> {
  const rows = await db
    .select({
      name: events.name,
      count: sql<number>`COUNT(*)::int`,
      lastTriggered: sql<string>`to_char(MAX(${events.created_at}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    })
    .from(events)
    .where(buildFilters(siteId, dateRange, events))
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
