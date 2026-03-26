import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { annotations } from "@/lib/db/schema";
import { eq, gte, lte, and } from "drizzle-orm";
import {
  getOverviewStats,
  getVisitorTimeseries,
  getTopPages,
  getTopSources,
  getDeviceBreakdown,
  getBrowserBreakdown,
  getCountryBreakdown,
} from "@/lib/queries";

/**
 * GET /api/dashboard/overview
 *
 * Aggregates all dashboard overview data into a single response.
 * Query params: ?siteId=all&from=2026-01-01&to=2026-03-09
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") || "all";
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  // Default to last 30 days
  const to = toStr ? new Date(toStr) : new Date();
  const from = fromStr
    ? new Date(fromStr)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Set end of day only for date-only strings (not full ISO timestamps)
  if (toStr && !toStr.includes('T')) {
    to.setHours(23, 59, 59, 999);
  }

  const dateRange = { from, to };

  try {
    const [
      stats,
      timeseries,
      topPages,
      topSources,
      deviceBreakdown,
      browserStats,
      countryStats,
      siteAnnotations,
    ] = await Promise.all([
      getOverviewStats(siteId, dateRange),
      getVisitorTimeseries(siteId, dateRange),
      getTopPages(siteId, dateRange),
      getTopSources(siteId, dateRange),
      getDeviceBreakdown(siteId, dateRange),
      getBrowserBreakdown(siteId, dateRange),
      getCountryBreakdown(siteId, dateRange),
      siteId === "all" ? Promise.resolve([]) : db.select().from(annotations).where(
        and(
          eq(annotations.site_id, siteId),
          gte(annotations.date, from),
          lte(annotations.date, to)
        )
      )
    ]);

    return NextResponse.json({
      stats,
      timeseries,
      topPages,
      topSources,
      deviceBreakdown,
      browserStats,
      countryStats,
      annotations: siteAnnotations,
    });
  } catch (error) {
    console.error("Dashboard overview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
