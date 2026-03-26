import { NextRequest, NextResponse } from "next/server";
import {
  getWebVitalsTrends,
  getWebVitalsByPage,
  getErrorTrend,
  getTopErrors,
  getConnectionTypes,
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
