import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;

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
        session_replay: false,
      });
    }

    return NextResponse.json(rows[0].features || {});
  } catch (error) {
    console.error("GET site settings error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const body = await request.json();

    // Upsert the settings
    await db
      .insert(siteSettings)
      .values({
        site_id: siteId,
        features: body,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: siteSettings.site_id,
        set: {
          features: body,
          updated_at: new Date(),
        },
      });

    return NextResponse.json({ success: true, features: body });
  } catch (error) {
    console.error("PUT site settings error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
