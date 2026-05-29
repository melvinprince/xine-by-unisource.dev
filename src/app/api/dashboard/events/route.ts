import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { verifySiteExists, parseDateRange, siteNotFoundResponse, invalidDateResponse, parseFilters } from "@/lib/api-helpers";
import { buildFilters } from "@/lib/queries";
import { filterStore } from "@/lib/filter-store";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") || "all";
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  // 1. Verify Site UUID exists in database (or is "all")
  const exists = await verifySiteExists(siteId);
  if (!exists) return siteNotFoundResponse();

  // 2. Safely parse and validate date range
  const dateRange = parseDateRange(fromStr, toStr);
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
        .where(buildFilters(siteId, dateRange, events))
        .groupBy(events.name)
        .orderBy(desc(sql`count(*)`))
        .limit(50);
        
      // Additionally, get a timeseries of events
      const timeseries = await db
        .select({
          date: sql<string>`to_char(${events.created_at}, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`
        })
        .from(events)
        .where(buildFilters(siteId, dateRange, events))
        .groupBy(sql`to_char(${events.created_at}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${events.created_at}, 'YYYY-MM-DD')`);

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
