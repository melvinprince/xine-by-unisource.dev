import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getOverviewStats } from "@/lib/queries";
import { parseDateRange } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    
    // Default to last 24h if no range provided
    const rangeStr = searchParams.get("range") || "24h";
    // Rolling window ending now ("7d" = 7 × 24 h). An optional `tz`
    // (IANA name) sets the timezone for day buckets; default UTC.
    const preset = ["24h", "7d", "30d"].includes(rangeStr) ? rangeStr : "24h";
    const dateRange = parseDateRange(null, null, preset, searchParams.get("tz"))!;

    if (!siteId) {
      return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
    }

    // Auth check: Instead of user session, check if the site is public
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, siteId),
    });

    if (!site || site.is_public !== true) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Reuse the exact same dashboard query lib functions
    const stats = await getOverviewStats(siteId, dateRange);
    
    // Additionally, fetch the site name so the public page knows it
    return NextResponse.json({ 
      site: { id: site.id, name: site.name, domain: site.domain },
      ...stats 
    });
  } catch (error) {
    console.error("[public/overview] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
