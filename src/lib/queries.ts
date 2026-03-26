// ============================================================
// Xine — Dashboard Data Layer
// Server-side query functions for all dashboard views.
// Uses Drizzle ORM with PostgreSQL.
// ============================================================

import { db } from "./db";
import { pageviews, events, sites } from "./db/schema";
import { eq, gte, lte, ne, desc, sql, and, count } from "drizzle-orm";
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

  // Current period
  const currentRows = await db
    .select({
      visitor_id: pageviews.visitor_id,
      session_id: pageviews.session_id,
      duration: pageviews.duration,
    })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews));

  // Previous period
  const prevRows = await db
    .select({
      visitor_id: pageviews.visitor_id,
      session_id: pageviews.session_id,
      duration: pageviews.duration,
    })
    .from(pageviews)
    .where(buildFilters(siteId, prevRange, pageviews));

  // Unique visitors
  const visitors = new Set(currentRows.map((r) => r.visitor_id)).size;
  const prevVisitors = new Set(prevRows.map((r) => r.visitor_id)).size;

  // Total pageviews
  const pageviewCount = currentRows.length;
  const prevPageviewCount = prevRows.length;

  // Avg duration
  const totalDuration = currentRows.reduce((sum, r) => sum + (r.duration || 0), 0);
  const avgDuration = currentRows.length > 0 ? Math.round(totalDuration / currentRows.length) : 0;
  const prevTotalDuration = prevRows.reduce((sum, r) => sum + (r.duration || 0), 0);
  const prevAvgDuration = prevRows.length > 0 ? Math.round(prevTotalDuration / prevRows.length) : 0;

  // Bounce rate: sessions with only 1 pageview / total sessions
  const sessionCounts = new Map<string, number>();
  currentRows.forEach((r) => {
    sessionCounts.set(r.session_id, (sessionCounts.get(r.session_id) || 0) + 1);
  });
  const totalSessions = sessionCounts.size;
  const bouncedSessions = Array.from(sessionCounts.values()).filter((c) => c === 1).length;
  const bounceRate = totalSessions > 0 ? Math.round((bouncedSessions / totalSessions) * 100) : 0;

  const prevSessionCounts = new Map<string, number>();
  prevRows.forEach((r) => {
    prevSessionCounts.set(r.session_id, (prevSessionCounts.get(r.session_id) || 0) + 1);
  });
  const prevTotalSessions = prevSessionCounts.size;
  const prevBouncedSessions = Array.from(prevSessionCounts.values()).filter((c) => c === 1).length;
  const prevBounceRate = prevTotalSessions > 0 ? Math.round((prevBouncedSessions / prevTotalSessions) * 100) : 0;

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
  const rows = await db
    .select({
      visitor_id: pageviews.visitor_id,
      created_at: pageviews.created_at,
    })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews))
    .orderBy(pageviews.created_at);

  if (rows.length === 0) return [];

  // Dynamic bucketing: hourly for short ranges, daily otherwise
  const isHourly = differenceInDays(dateRange.to, dateRange.from) <= 2;
  const dateFormatStr = isHourly ? "yyyy-MM-dd HH:00" : "yyyy-MM-dd";

  // Group by date/hour
  const dateMap = new Map<string, { visitors: Set<string>; pageviews: number }>();

  rows.forEach((row) => {
    const date = format(new Date(row.created_at), dateFormatStr);
    if (!dateMap.has(date)) {
      dateMap.set(date, { visitors: new Set(), pageviews: 0 });
    }
    const entry = dateMap.get(date)!;
    entry.visitors.add(row.visitor_id);
    entry.pageviews += 1;
  });

  return Array.from(dateMap.entries()).map(([date, entry]) => ({
    date,
    visitors: entry.visitors.size,
    pageviews: entry.pageviews,
  }));
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
      visitor_id: pageviews.visitor_id,
      duration: pageviews.duration,
    })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews));

  if (rows.length === 0) return [];

  // Aggregate by URL
  const urlMap = new Map<
    string,
    { views: number; visitors: Set<string>; totalDuration: number }
  >();

  rows.forEach((row) => {
    if (!urlMap.has(row.url)) {
      urlMap.set(row.url, { views: 0, visitors: new Set(), totalDuration: 0 });
    }
    const entry = urlMap.get(row.url)!;
    entry.views += 1;
    entry.visitors.add(row.visitor_id);
    entry.totalDuration += row.duration || 0;
  });

  return Array.from(urlMap.entries())
    .map(([url, entry]) => ({
      url,
      views: entry.views,
      uniqueVisitors: entry.visitors.size,
      avgDuration: entry.views > 0 ? Math.round(entry.totalDuration / entry.views) : 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
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
  const rows = await db
    .select({
      referrer: pageviews.referrer,
      visitor_id: pageviews.visitor_id,
    })
    .from(pageviews)
    .where(and(filters, ne(pageviews.referrer, "")));

  if (rows.length === 0) return [];

  const refMap = new Map<string, Set<string>>();
  rows.forEach((row) => {
    // Normalize referrer to domain only
    let domain = row.referrer || "";
    try {
      domain = new URL(domain).hostname;
    } catch {
      // Use as-is if not a valid URL
    }
    if (!refMap.has(domain)) refMap.set(domain, new Set());
    refMap.get(domain)!.add(row.visitor_id);
  });

  const totalVisitors = new Set(rows.map((r) => r.visitor_id)).size;

  return Array.from(refMap.entries())
    .map(([referrer, visitors]) => ({
      referrer,
      visitors: visitors.size,
      percentage: totalVisitors > 0 ? Math.round((visitors.size / totalVisitors) * 100) : 0,
    }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, limit);
}

/**
 * Get device type breakdown (desktop/mobile/tablet).
 */
export async function getDeviceBreakdown(
  siteId: string | "all",
  dateRange: DateRange
): Promise<DeviceBreakdown> {
  const rows = await db
    .select({ device: pageviews.device })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews));

  if (!rows) return { desktop: 0, mobile: 0, tablet: 0 };

  const breakdown: DeviceBreakdown = { desktop: 0, mobile: 0, tablet: 0 };
  rows.forEach((row) => {
    const device = (row.device || "desktop").toLowerCase();
    if (device === "mobile") breakdown.mobile += 1;
    else if (device === "tablet") breakdown.tablet += 1;
    else breakdown.desktop += 1;
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
    .select({ browser: pageviews.browser })
    .from(pageviews)
    .where(buildFilters(siteId, dateRange, pageviews));

  if (!rows) return [];

  const browserMap = new Map<string, number>();
  rows.forEach((row) => {
    const browser = row.browser || "Unknown";
    browserMap.set(browser, (browserMap.get(browser) || 0) + 1);
  });

  return Array.from(browserMap.entries())
    .map(([browser, count]) => ({ browser, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
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
      visitor_id: pageviews.visitor_id,
    })
    .from(pageviews)
    .where(and(filters, ne(pageviews.country, "")));

  if (!rows) return [];

  const countryMap = new Map<string, Set<string>>();
  rows.forEach((row) => {
    const country = row.country || "Unknown";
    if (!countryMap.has(country)) countryMap.set(country, new Set());
    countryMap.get(country)!.add(row.visitor_id);
  });

  return Array.from(countryMap.entries())
    .map(([country, visitors]) => ({
      country,
      visitors: visitors.size,
      flag: countryFlag(country),
    }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, limit);
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
      created_at: events.created_at,
    })
    .from(events)
    .where(buildFilters(siteId, dateRange, events));

  if (!rows) return [];

  const eventMap = new Map<string, { count: number; lastTriggered: string }>();
  rows.forEach((row) => {
    const ts = new Date(row.created_at).toISOString();
    const existing = eventMap.get(row.name);
    if (!existing) {
      eventMap.set(row.name, { count: 1, lastTriggered: ts });
    } else {
      existing.count += 1;
      if (ts > existing.lastTriggered) {
        existing.lastTriggered = ts;
      }
    }
  });

  return Array.from(eventMap.entries())
    .map(([name, entry]) => ({
      name,
      count: entry.count,
      lastTriggered: entry.lastTriggered,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
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
