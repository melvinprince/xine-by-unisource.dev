import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { sql, desc } from "drizzle-orm";
import { verifySiteExists, parseDateRange, siteNotFoundResponse, invalidDateResponse, parseFilters, getUserFromRequest, getUserAccessibleSiteIds } from "@/lib/api-helpers";
import { buildFilters } from "@/lib/queries";
import { buildDateExpr } from "@/lib/query-helpers";
import { filterStore } from "@/lib/filter-store";

export async function GET(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  try {
    const data = await filterStore.run(filters, async () => {
      const topEvents = await db
        .select({
          name: events.name,
          count: sql<number>`count(*)::int`,
          uniqueUsers: sql<number>`count(distinct ${events.visitor_id})::int`
        })
        .from(events)
        .where(buildFilters(targetSiteId, dateRange, events))
        .groupBy(events.name)
        .orderBy(desc(sql`count(*)`))
        .limit(50);
        
      // Additionally, get a daily timeseries of events. Days are the
      // viewer's calendar days (tz param), not the database's UTC days.
      const dayExpr = buildDateExpr(dateRange, events.created_at, "day");
      const timeseries = await db
        .select({
          date: dayExpr,
          count: sql<number>`count(*)::int`
        })
        .from(events)
        .where(buildFilters(targetSiteId, dateRange, events))
        .groupBy(dayExpr)
        .orderBy(dayExpr);

      return {
        topEvents,
        timeseries,
      };
    });

    return NextResponse.json(data);
  } catch(error) {
    console.error("Dashboard events error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
