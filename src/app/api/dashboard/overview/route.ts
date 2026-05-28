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
import { verifySiteExists, parseDateRange, siteNotFoundResponse, invalidDateResponse } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") || "all";
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  // 1. Verify Site UUID exists in database (or is "all")
  const exists = await verifySiteExists(siteId);
  if (!exists) return siteNotFoundResponse();

  // 2. Safely parse and validate date range
  const dateRange = parseDateRange(fromStr, toStr);
  if (!dateRange) return invalidDateResponse();

  const { from, to } = dateRange;

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
