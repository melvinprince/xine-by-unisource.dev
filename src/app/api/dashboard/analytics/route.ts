import { NextRequest, NextResponse } from "next/server";
import {
  getSessionAnalytics,
  getNewVsReturning,
  getSessionTimeseries,
  getEngagementMetrics,
  getHourlyHeatmap,
  getPeakHours,
} from "@/lib/queries-advanced";
import { verifySiteExists, parseDateRange, siteNotFoundResponse, invalidDateResponse, parseFilters } from "@/lib/api-helpers";
import { filterStore } from "@/lib/filter-store";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") || "all";
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // 1. Verify Site UUID exists in database (or is "all")
    const exists = await verifySiteExists(siteId);
    if (!exists) return siteNotFoundResponse();

    // 2. Safely parse and validate date range
    const dateRange = parseDateRange(from, to);
    if (!dateRange) return invalidDateResponse();

    const filters = parseFilters(searchParams);

    const data = await filterStore.run(filters, async () => {
      const [sessionStats, newVsReturning, sessionTimeseries, engagement, heatmap, peakHours] =
        await Promise.all([
          getSessionAnalytics(siteId, dateRange),
          getNewVsReturning(siteId, dateRange),
          getSessionTimeseries(siteId, dateRange),
          getEngagementMetrics(siteId, dateRange),
          getHourlyHeatmap(siteId, dateRange),
          getPeakHours(siteId, dateRange),
        ]);

      return {
        sessionStats,
        newVsReturning,
        sessionTimeseries,
        engagement,
        heatmap,
        peakHours,
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[analytics] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
