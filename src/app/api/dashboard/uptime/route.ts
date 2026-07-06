import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { uptimeChecks, sites } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { isPrivateUrl } from "@/lib/ssrf";
import { validateOrThrow, siteIdSchema, uuidSchema, ValidationError } from "@/lib/validation";
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

    const checks = accessibleSites.length > 0 
      ? await db.select().from(uptimeChecks).where(inArray(uptimeChecks.site_id, accessibleSites)).orderBy(desc(uptimeChecks.checked_at)).limit(100)
      : [];
      
    return NextResponse.json({ checks });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[uptime] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const { siteId: rawSiteId, url } = body;

    if (!rawSiteId || !url) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const siteId = validateOrThrow(uuidSchema, rawSiteId);

    const hasAccess = await verifyUserSiteAccess(userId, siteId);
    if (!hasAccess) return NextResponse.json({ error: "Site not found" }, { status: 404 });

    if (isPrivateUrl(url)) {
      return NextResponse.json({ error: "URL blocked: private/internal addresses are not allowed" }, { status: 400 });
    }

    // Run an immediate check
    const start = Date.now();
    let status = 'down';
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      status = res.ok ? 'up' : 'degraded';
    } catch {
      // Site unreachable — status stays 'down'
    }
    const responseTime = Date.now() - start;

    const newCheck = await db.insert(uptimeChecks).values({
      site_id: siteId,
      url,
      status,
      response_time: responseTime,
    }).returning();

    return NextResponse.json(newCheck[0], { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[uptime] POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
