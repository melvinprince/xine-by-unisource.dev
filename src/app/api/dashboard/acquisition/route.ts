import { NextRequest, NextResponse } from "next/server";
import {
  getCampaignPerformance,
  getSourceQuality,
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

    const [campaigns, sourceQuality] = await Promise.all([
      getCampaignPerformance(siteId, dateRange),
      getSourceQuality(siteId, dateRange),
    ]);

    return NextResponse.json({
      campaigns,
      sourceQuality,
    });
  } catch (error) {
    console.error("[acquisition] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
