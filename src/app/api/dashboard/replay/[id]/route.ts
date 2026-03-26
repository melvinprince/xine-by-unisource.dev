import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { replayEvents, sites } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: any
) {
  try {

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const sessionId = params.id;

    if (!siteId || !sessionId) {
      return NextResponse.json({ error: "Missing siteId or sessionId" }, { status: 400 });
    }

    // Verify site ownership
    if (siteId !== "all") {
      const site = await db.query.sites.findFirst({
        where: eq(sites.id, siteId),
      });
      if (!site) { return NextResponse.json({ error: "Site not found" }, { status: 404 }); }
    }

    // Fetch all replay events for the session
    const eventsQuery = siteId === "all"
      ? db.select().from(replayEvents).where(eq(replayEvents.session_id, sessionId))
      : db.select().from(replayEvents).where(and(eq(replayEvents.site_id, siteId), eq(replayEvents.session_id, sessionId)));

    const events = await eventsQuery.orderBy(asc(replayEvents.timestamp));

    return NextResponse.json({ events });
  } catch (error) {
    console.error("[dashboard/replay/[id]] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
