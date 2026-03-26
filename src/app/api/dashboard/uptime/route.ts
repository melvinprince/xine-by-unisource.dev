import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { uptimeChecks, sites } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

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
    console.error("[uptime] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, url } = body;

    if (!siteId || !url) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

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
    console.error("[uptime] POST Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
