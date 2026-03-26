import { NextRequest, NextResponse } from "next/server";
import {
  getEntryPages,
  getExitPages,
  getPageExitRates,
  getScrollDepthAnalysis,
  getUserFlows,
  getPagesPerSessionDistribution,
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

    const [entryPages, exitPages, exitRates, scrollDepth, userFlows, pagesPerSession] =
      await Promise.all([
        getEntryPages(siteId, dateRange),
        getExitPages(siteId, dateRange),
        getPageExitRates(siteId, dateRange),
        getScrollDepthAnalysis(siteId, dateRange),
        getUserFlows(siteId, dateRange),
        getPagesPerSessionDistribution(siteId, dateRange),
      ]);

    return NextResponse.json({
      entryPages,
      exitPages,
      exitRates,
      scrollDepth,
      userFlows,
      pagesPerSession,
    });
  } catch (error) {
    console.error("[behavior] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
