import { NextRequest, NextResponse } from "next/server";
import {
  getCampaignPerformance,
  getSourceQuality,
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
