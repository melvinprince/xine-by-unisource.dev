import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { verifySiteExists, parseDateRange, siteNotFoundResponse, invalidDateResponse } from "@/lib/api-helpers";

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

  const { from, to } = dateRange;

  try {
    const topEvents = await db
      .select({
        name: events.name,
        count: sql<number>`count(*)::int`,
        uniqueUsers: sql<number>`count(distinct ${events.visitor_id})::int`
      })
      .from(events)
      .where(
        and(
          siteId === "all" ? sql`1=1` : eq(events.site_id, siteId),
          gte(events.created_at, from),
          lte(events.created_at, to)
        )
      )
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
      .where(
        and(
          siteId === "all" ? sql`1=1` : eq(events.site_id, siteId),
          gte(events.created_at, from),
          lte(events.created_at, to)
        )
      )
      .groupBy(sql`to_char(${events.created_at}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${events.created_at}, 'YYYY-MM-DD')`);

    return NextResponse.json({
      topEvents,
      timeseries,
    });
  } catch(error) {
    console.error("Dashboard events error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
