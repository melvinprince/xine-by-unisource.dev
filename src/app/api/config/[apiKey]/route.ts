import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites, siteSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ apiKey: string }> }
) {
  try {
    const { apiKey } = await params;
    
    // Allow CORS for the tracking script
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    };

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 400, headers });
    }

    // Get site by API key
    const siteRows = await db
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.api_key, apiKey))
      .limit(1);

    if (siteRows.length === 0) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401, headers });
    }

    const siteId = siteRows[0].id;

    // Get site settings
    const settingsRows = await db
      .select({ features: siteSettings.features })
      .from(siteSettings)
      .where(eq(siteSettings.site_id, siteId))
      .limit(1);

    // If no settings exist yet, return empty object (t.js will default to core only)
    const features = settingsRows.length > 0 ? settingsRows[0].features : {};

    return NextResponse.json({ features }, { status: 200, headers });
  } catch (error) {
    console.error("Config fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
