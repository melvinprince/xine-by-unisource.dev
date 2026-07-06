import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailReports, sites } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { validateOrThrow, createReportSchema, siteIdSchema, ValidationError } from "@/lib/validation";
import { getUserFromRequest, getUserAccessibleSiteIds, verifyUserSiteAccess } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const rawSiteId = searchParams.get("siteId");
    
    if (!rawSiteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

    const siteId = validateOrThrow(siteIdSchema, rawSiteId);

    if (siteId !== "all") {
      const hasAccess = await verifyUserSiteAccess(userId, siteId);
      if (!hasAccess) return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const accessibleSites = siteId === "all" ? await getUserAccessibleSiteIds(userId) : [siteId];

    const reports = accessibleSites.length > 0 
      ? await db.select().from(emailReports).where(inArray(emailReports.site_id, accessibleSites))
      : [];

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
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const validated = validateOrThrow(createReportSchema, body);

    const hasAccess = await verifyUserSiteAccess(userId, validated.siteId);
    if (!hasAccess) return NextResponse.json({ error: "Site not found" }, { status: 404 });

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
