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
import { verifySiteExists, parseDateRange, siteNotFoundResponse, invalidDateResponse, getUserFromRequest, getUserAccessibleSiteIds } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") || "all";
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  // 1. Verify Site UUID exists in database (or is "all")
  const exists = await verifySiteExists(siteId, request);
  if (!exists) return siteNotFoundResponse();

  const targetSiteId = siteId === "all" ? await getUserAccessibleSiteIds(userId) : siteId;

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
      getOverviewStats(targetSiteId, dateRange),
      getVisitorTimeseries(targetSiteId, dateRange),
      getTopPages(targetSiteId, dateRange),
      getTopSources(targetSiteId, dateRange),
      getDeviceBreakdown(targetSiteId, dateRange),
      getBrowserBreakdown(targetSiteId, dateRange),
      getCountryBreakdown(targetSiteId, dateRange),
      getTopEvents(targetSiteId, dateRange),
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
