import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { 
  getOverviewStats,
  getVisitorTimeseries,
  getTopPages,
  getTopSources,
  getDeviceBreakdown,
  getBrowserBreakdown,
  getCountryBreakdown,
} from "@/lib/queries";
import { parseDateRange } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    
    // Auth check using the server_api_key
    const site = await db.query.sites.findFirst({
      where: eq(sites.server_api_key, token),
    });

    if (!site) {
      return NextResponse.json({ error: "Unauthorized access token" }, { status: 401 });
    }

    if (!site.api_access_enabled) {
      return NextResponse.json({ error: "API Access is disabled for this site" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const rangeStr = searchParams.get("range") || "24h";
    // Rolling window ending now ("7d" = 7 × 24 h). An optional `tz`
    // (IANA name) sets the timezone for day buckets; default UTC.
    const preset = ["24h", "7d", "30d"].includes(rangeStr) ? rangeStr : "24h";
    const dateRange = parseDateRange(null, null, preset, searchParams.get("tz"))!;


    const [
      stats,
      timeseries,
      topPages,
      topSources,
      deviceBreakdown,
      browserStats,
      locations,
    ] = await Promise.all([
      getOverviewStats(site.id, dateRange),
      getVisitorTimeseries(site.id, dateRange),
      getTopPages(site.id, dateRange),
      getTopSources(site.id, dateRange),
      getDeviceBreakdown(site.id, dateRange),
      getBrowserBreakdown(site.id, dateRange),
      getCountryBreakdown(site.id, dateRange),
    ]);
    
    return NextResponse.json({ 
      site: { id: site.id, name: site.name, domain: site.domain },
      stats,
      timeseries,
      topPages,
      topSources,
      deviceBreakdown,
      browserStats,
      locations
    });
  } catch (error) {
    console.error("[api/v1/stats] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
