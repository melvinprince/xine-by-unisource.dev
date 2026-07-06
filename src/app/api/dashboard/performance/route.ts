import { NextRequest, NextResponse } from "next/server";
import {
  getWebVitalsTrends,
  getWebVitalsByPage,
  getErrorTrend,
  getTopErrors,
  getConnectionTypes,
} from "@/lib/queries-advanced";
import { verifySiteExists, parseDateRange, siteNotFoundResponse, invalidDateResponse, parseFilters, getUserFromRequest, getUserAccessibleSiteIds } from "@/lib/api-helpers";
import { filterStore } from "@/lib/filter-store";

export async function GET(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") || "all";
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // 1. Verify Site UUID exists in database (or is "all")
    const exists = await verifySiteExists(siteId, request);
  if (!exists) return siteNotFoundResponse();

  const targetSiteId = siteId === "all" ? await getUserAccessibleSiteIds(userId) : siteId;

    // 2. Safely parse and validate date range
    const dateRange = parseDateRange(from, to);
    if (!dateRange) return invalidDateResponse();

    const filters = parseFilters(searchParams);

    const data = await filterStore.run(filters, async () => {
      const [webVitals, vitalsByPage, errorTrend, topErrors, connectionTypes] =
        await Promise.all([
          getWebVitalsTrends(targetSiteId, dateRange),
          getWebVitalsByPage(targetSiteId, dateRange),
          getErrorTrend(targetSiteId, dateRange),
          getTopErrors(targetSiteId, dateRange),
          getConnectionTypes(targetSiteId, dateRange),
        ]);

      return {
        webVitals,
        vitalsByPage,
        errorTrend,
        topErrors,
        connectionTypes,
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[performance] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
