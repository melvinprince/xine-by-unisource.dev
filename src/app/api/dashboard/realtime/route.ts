import { NextRequest, NextResponse } from "next/server";
import { getRealtimeStats } from "@/lib/queries-advanced";
import { verifySiteExists, siteNotFoundResponse, parseFilters } from "@/lib/api-helpers";
import { filterStore } from "@/lib/filter-store";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") || "all";

    // Verify Site UUID exists in database (or is "all")
    const exists = await verifySiteExists(siteId);
    if (!exists) return siteNotFoundResponse();

    const filters = parseFilters(searchParams);
    const stats = await filterStore.run(filters, () => getRealtimeStats(siteId));

    return NextResponse.json(stats, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[realtime] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
