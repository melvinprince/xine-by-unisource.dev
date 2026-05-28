import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { alerts, sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateOrThrow, createAlertSchema, uuidSchema, siteIdSchema, ValidationError } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSiteId = searchParams.get("siteId");
    if (!rawSiteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

    const siteId = validateOrThrow(siteIdSchema, rawSiteId);

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
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[alerts] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = validateOrThrow(createAlertSchema, body);

    const site = await db.query.sites.findFirst({ where: eq(sites.id, validated.siteId) });
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

    const newAlert = await db.insert(alerts).values({
      site_id: validated.siteId,
      type: validated.type,
      threshold: validated.threshold,
      channel: validated.channel,
      channel_target: validated.channelTarget,
    }).returning();

    return NextResponse.json(newAlert[0], { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[alerts] POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
