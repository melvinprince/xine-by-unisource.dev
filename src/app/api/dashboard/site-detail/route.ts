import { NextRequest, NextResponse } from "next/server";
import {
  getOverviewStats,
  getVisitorTimeseries,
  getTopPages,
  getTopSources,
  getDeviceBreakdown,
  getBrowserBreakdown,
  getCountryBreakdown,
  getTopEvents,
  getSiteById,
} from "@/lib/queries";
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

  try {
    const [
      site,
      stats,
      timeseries,
      topPages,
      topSources,
      deviceBreakdown,
      browserStats,
      countryStats,
      customEvents,
    ] = await Promise.all([
      siteId === "all" ? Promise.resolve({ id: "all", name: "All Sites", domain: "*" }) : getSiteById(siteId),
      getOverviewStats(siteId, dateRange),
      getVisitorTimeseries(siteId, dateRange),
      getTopPages(siteId, dateRange),
      getTopSources(siteId, dateRange),
      getDeviceBreakdown(siteId, dateRange),
      getBrowserBreakdown(siteId, dateRange),
      getCountryBreakdown(siteId, dateRange),
      getTopEvents(siteId, dateRange),
    ]);

    if (!site) {
      return siteNotFoundResponse();
    }

    return NextResponse.json({
      site,
      stats,
      timeseries,
      topPages,
      topSources,
      deviceBreakdown,
      browserStats,
      countryStats,
      customEvents,
    });
  } catch (error) {
    console.error("Site detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch site data" },
      { status: 500 }
    );
  }
}
