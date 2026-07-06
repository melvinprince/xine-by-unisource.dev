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
import { verifySiteExists, parseDateRange, siteNotFoundResponse, invalidDateResponse, parseFilters, getUserFromRequest, getUserAccessibleSiteIds } from "@/lib/api-helpers";
import { filterStore } from "@/lib/filter-store";

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

  const { from, to } = dateRange;
  const filters = parseFilters(searchParams);

  try {
    const data = await filterStore.run(filters, async () => {
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
        getOverviewStats(targetSiteId, dateRange, filters),
        getVisitorTimeseries(targetSiteId, dateRange, filters),
        getTopPages(targetSiteId, dateRange, 10, filters),
        getTopSources(targetSiteId, dateRange, 10, filters),
        getDeviceBreakdown(targetSiteId, dateRange, filters),
        getBrowserBreakdown(targetSiteId, dateRange, 8, filters),
        getCountryBreakdown(targetSiteId, dateRange, 10, filters),
        siteId === "all" ? Promise.resolve([]) : db.select().from(annotations).where(
          and(
            eq(annotations.site_id, siteId),
            gte(annotations.date, from),
            lte(annotations.date, to)
          )
        )
      ]);

      return {
        stats,
        timeseries,
        topPages,
        topSources,
        deviceBreakdown,
        browserStats,
        countryStats,
        annotations: siteAnnotations,
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Dashboard overview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
