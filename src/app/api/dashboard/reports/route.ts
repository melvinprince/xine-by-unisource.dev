import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailReports, sites } from "@/lib/db/schema";
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

    const reportsQuery = siteId === "all"
      ? db.select().from(emailReports)
      : db.select().from(emailReports).where(eq(emailReports.site_id, siteId));
      
    const reports = await reportsQuery;
    
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("[reports] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, schedule, recipients } = body;

    if (!siteId || !schedule || !recipients || !Array.isArray(recipients)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

    const newReport = await db.insert(emailReports).values({
      site_id: siteId,
      schedule,
      recipients,
    }).returning();

    return NextResponse.json(newReport[0], { status: 201 });
  } catch (error) {
    console.error("[reports] POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
