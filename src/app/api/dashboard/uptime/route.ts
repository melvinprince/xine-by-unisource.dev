import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { uptimeChecks, sites } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { isPrivateUrl } from "@/lib/ssrf";
import { validateOrThrow, siteIdSchema, uuidSchema, ValidationError } from "@/lib/validation";

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

    const checksQuery = siteId === "all" 
      ? db.select().from(uptimeChecks).orderBy(desc(uptimeChecks.checked_at)).limit(100)
      : db.select().from(uptimeChecks).where(eq(uptimeChecks.site_id, siteId)).orderBy(desc(uptimeChecks.checked_at)).limit(100);
      
    const checks = await checksQuery;
    
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
  try {
    const body = await request.json();
    const { siteId: rawSiteId, url } = body;

    if (!rawSiteId || !url) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const siteId = validateOrThrow(uuidSchema, rawSiteId);

    const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

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
