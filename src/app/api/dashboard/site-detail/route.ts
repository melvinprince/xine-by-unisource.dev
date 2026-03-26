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

/**
 * GET /api/dashboard/site-detail
 *
 * Returns full site detail data: overview + custom events + site info.
 * Query params: ?siteId=xxx&from=2026-01-01&to=2026-03-09
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");

  if (!siteId) {
    return NextResponse.json(
      { error: "siteId is required" },
      { status: 400 }
    );
  }

  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  const to = toStr ? new Date(toStr) : new Date();
  const from = fromStr
    ? new Date(fromStr)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  if (toStr && !toStr.includes('T')) {
    to.setHours(23, 59, 59, 999);
  }

  const dateRange = { from, to };

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
      getSiteById(siteId),
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
      return NextResponse.json(
        { error: "Site not found" },
        { status: 404 }
      );
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
