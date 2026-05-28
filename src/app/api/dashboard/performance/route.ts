import { NextRequest, NextResponse } from "next/server";
import {
  getWebVitalsTrends,
  getWebVitalsByPage,
  getErrorTrend,
  getTopErrors,
  getConnectionTypes,
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

    const [webVitals, vitalsByPage, errorTrend, topErrors, connectionTypes] =
      await Promise.all([
        getWebVitalsTrends(siteId, dateRange),
        getWebVitalsByPage(siteId, dateRange),
        getErrorTrend(siteId, dateRange),
        getTopErrors(siteId, dateRange),
        getConnectionTypes(siteId, dateRange),
      ]);

    return NextResponse.json({
      webVitals,
      vitalsByPage,
      errorTrend,
      topErrors,
      connectionTypes,
    });
  } catch (error) {
    console.error("[performance] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
