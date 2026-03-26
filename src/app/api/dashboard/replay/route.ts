import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { replayEvents, sites } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");

    if (!siteId) {
      return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
    }

    if (siteId !== "all") {
      const site = await db.query.sites.findFirst({
        where: eq(sites.id, siteId),
      });
      if (!site) { return NextResponse.json({ error: "Site not found" }, { status: 404 }); }
    }

    let replaysQuery = db
      .select({
        sessionId: replayEvents.session_id,
        url: sql<string>`MAX(${replayEvents.url})`,
        startTime: sql<Date>`MIN(${replayEvents.timestamp})`,
        eventsCount: sql<number>`COUNT(*)`,
      })
      .from(replayEvents);
      
    if (siteId !== "all") {
      replaysQuery = replaysQuery.where(eq(replayEvents.site_id, siteId)) as any;
    }

    const replays = await replaysQuery
      .groupBy(replayEvents.session_id)
      .orderBy(sql`MIN(${replayEvents.timestamp}) DESC`)
      .limit(50);

    return NextResponse.json({ replays });
  } catch (error) {
    console.error("[dashboard/replay] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
