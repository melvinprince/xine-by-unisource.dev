import { NextRequest, NextResponse } from "next/server";
import {
  getEntryPages,
  getExitPages,
  getPageExitRates,
  getScrollDepthAnalysis,
  getUserFlows,
  getPagesPerSessionDistribution,
} from "@/lib/queries-advanced";
import { verifySiteExists, parseDateRange, siteNotFoundResponse, invalidDateResponse } from "@/lib/api-helpers";

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
