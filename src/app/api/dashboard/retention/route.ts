import { NextRequest, NextResponse } from "next/server";
import { getRetentionCohorts } from "@/lib/queries-advanced";
import { verifySiteExists, parseDateRange, siteNotFoundResponse, invalidDateResponse, parseFilters, getUserFromRequest, getUserAccessibleSiteIds } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") || "all";
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");

    // 1. Verify Site UUID exists in database (or is "all")
    const exists = await verifySiteExists(siteId, request);
  if (!exists) return siteNotFoundResponse();

  const targetSiteId = siteId === "all" ? await getUserAccessibleSiteIds(userId) : siteId;

    // 2. Safely parse and validate date range
    const dateRange = parseDateRange(fromStr, toStr, null, searchParams.get("tz"));
    if (!dateRange) return invalidDateResponse();

    const filters = parseFilters(searchParams);

    // Shared with the MCP xine_get_retention tool. Bots are excluded, "all"
    // is scoped to the caller's own sites (it used to read every site in the
    // database), filters are parameterised (they used to be concatenated
    // into sql.raw), and weeks are computed in the viewer's timezone.
    const rows = await getRetentionCohorts(targetSiteId, dateRange, filters);
    const cohorts = rows.map((r) => ({
      cohortWeek: r.cohortWeek,
      totalUsers: r.cohortSize,
      weekNumber: r.weekNumber,
      returnedUsers: r.returnedUsers,
    }));

    return NextResponse.json({ cohorts });
  } catch (error) {
    console.error("[dashboard/retention] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
