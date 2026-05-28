import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailReports, sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateOrThrow, createReportSchema, siteIdSchema, ValidationError } from "@/lib/validation";

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

    const reportsQuery = siteId === "all"
      ? db.select().from(emailReports)
      : db.select().from(emailReports).where(eq(emailReports.site_id, siteId));
      
    const reports = await reportsQuery;
    
    return NextResponse.json({ reports });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[reports] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = validateOrThrow(createReportSchema, body);

    const site = await db.query.sites.findFirst({ where: eq(sites.id, validated.siteId) });
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

    const newReport = await db.insert(emailReports).values({
      site_id: validated.siteId,
      schedule: validated.schedule,
      recipients: validated.recipients,
    }).returning();

    return NextResponse.json(newReport[0], { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[reports] POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
