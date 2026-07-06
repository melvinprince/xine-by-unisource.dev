import { NextRequest, NextResponse } from "next/server";
import { getRealtimeStats } from "@/lib/queries-advanced";
import { verifySiteExists, siteNotFoundResponse, parseFilters, getUserFromRequest, getUserAccessibleSiteIds } from "@/lib/api-helpers";
import { filterStore } from "@/lib/filter-store";

export async function GET(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") || "all";

    // Verify Site UUID exists in database (or is "all")
    const exists = await verifySiteExists(siteId, request);
  if (!exists) return siteNotFoundResponse();

  const targetSiteId = siteId === "all" ? await getUserAccessibleSiteIds(userId) : siteId;

    const filters = parseFilters(searchParams);
    const stats = await filterStore.run(filters, () => getRealtimeStats(targetSiteId));

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
