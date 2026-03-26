import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const to = toStr ? new Date(toStr) : new Date();
  const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (toStr && !toStr.includes('T')) {
    to.setHours(23, 59, 59, 999);
  }

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
          eq(events.site_id, siteId),
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
          eq(events.site_id, siteId),
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
