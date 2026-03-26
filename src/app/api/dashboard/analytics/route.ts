import { NextRequest, NextResponse } from "next/server";
import {
  getSessionAnalytics,
  getNewVsReturning,
  getSessionTimeseries,
  getEngagementMetrics,
  getHourlyHeatmap,
  getPeakHours,
} from "@/lib/queries-advanced";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") || "all";
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "Missing date range" },
        { status: 400 }
      );
    }

    const dateRange = { from: new Date(from), to: new Date(to) };

    const [sessionStats, newVsReturning, sessionTimeseries, engagement, heatmap, peakHours] =
      await Promise.all([
        getSessionAnalytics(siteId, dateRange),
        getNewVsReturning(siteId, dateRange),
        getSessionTimeseries(siteId, dateRange),
        getEngagementMetrics(siteId, dateRange),
        getHourlyHeatmap(siteId, dateRange),
        getPeakHours(siteId, dateRange),
      ]);

    return NextResponse.json({
      sessionStats,
      newVsReturning,
      sessionTimeseries,
      engagement,
      heatmap,
      peakHours,
    });
  } catch (error) {
    console.error("[analytics] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
