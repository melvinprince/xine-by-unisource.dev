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
    let from = new Date();
    
    switch (rangeStr) {
      case "24h": from.setHours(from.getHours() - 24); break;
      case "7d": from.setDate(from.getDate() - 7); break;
      case "30d": from.setDate(from.getDate() - 30); break;
      default: from.setHours(from.getHours() - 24);
    }

    const dateRange = { from, to: new Date() };

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
