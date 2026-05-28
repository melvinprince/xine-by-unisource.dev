import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateOrThrow, siteFeaturesSchema, uuidSchema, ValidationError } from "@/lib/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const rawParams = await params;
    const siteId = validateOrThrow(uuidSchema, rawParams.siteId);

    const rows = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.site_id, siteId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({
        web_vitals: true,
        scroll_depth: true,
        outbound_clicks: true,
        js_errors: true,
        custom_events: true,
        click_tracking: false,
        rage_clicks: false,
        file_downloads: false,
        form_abandonment: false,
      });
    }

    return NextResponse.json(rows[0].features || {});
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("GET site settings error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const rawParams = await params;
    const siteId = validateOrThrow(uuidSchema, rawParams.siteId);
    const body = await request.json();
    const validatedFeatures = validateOrThrow(siteFeaturesSchema, body);

    // Upsert the settings
    await db
      .insert(siteSettings)
      .values({
        site_id: siteId,
        features: validatedFeatures,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: siteSettings.site_id,
        set: {
          features: validatedFeatures,
          updated_at: new Date(),
        },
      });

    return NextResponse.json({ success: true, features: validatedFeatures });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("PUT site settings error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
