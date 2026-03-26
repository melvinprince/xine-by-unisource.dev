import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { alerts, sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

    if (siteId !== "all") {
      const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
      if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const alertsQuery = siteId === "all"
      ? db.select().from(alerts)
      : db.select().from(alerts).where(eq(alerts.site_id, siteId));
      
    const siteAlerts = await alertsQuery;
    
    return NextResponse.json({ alerts: siteAlerts });
  } catch (error) {
    console.error("[alerts] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, type, threshold, channel, channelTarget } = body;

    if (!siteId || !type || !threshold || !channel || !channelTarget) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

    // threshold should be a JSON object like { value: 1000, timeframe: '1h' }
    const thresholdObj = typeof threshold === 'object' ? threshold : { value: Number(threshold), timeframe: '1h' };

    const newAlert = await db.insert(alerts).values({
      site_id: siteId,
      type,
      threshold: thresholdObj,
      channel,
      channel_target: channelTarget,
    }).returning();

    return NextResponse.json(newAlert[0], { status: 201 });
  } catch (error) {
    console.error("[alerts] POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
