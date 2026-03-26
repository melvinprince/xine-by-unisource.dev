import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events, pageviews, sessions } from "@/lib/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "events";
  const format = searchParams.get("format") || "csv";
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  const to = toStr ? new Date(toStr) : new Date();
  const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  to.setHours(23, 59, 59, 999);

  try {
    let rawData: any[] = [];

    if (type === "events") {
      rawData = await db.select().from(events)
        .where(and(eq(events.site_id, siteId), gte(events.created_at, from), lte(events.created_at, to)))
        .orderBy(desc(events.created_at))
        .limit(10000); // hard limit to prevent OOM
    } else if (type === "pageviews") {
      rawData = await db.select().from(pageviews)
        .where(and(eq(pageviews.site_id, siteId), gte(pageviews.created_at, from), lte(pageviews.created_at, to)))
        .orderBy(desc(pageviews.created_at))
        .limit(10000);
    } else if (type === "sessions") {
      rawData = await db.select().from(sessions)
        .where(and(eq(sessions.site_id, siteId), gte(sessions.started_at, from), lte(sessions.started_at, to)))
        .orderBy(desc(sessions.started_at))
        .limit(10000);
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    if (format === "json") {
      return NextResponse.json(rawData);
    }

    // CSV format
    if (rawData.length === 0) {
      return new NextResponse("No data found\n", { headers: { "Content-Type": "text/csv" } });
    }

    const headers = Object.keys(rawData[0]).join(",");
    const rows = rawData.map(row => 
      Object.values(row).map(val => {
        if (val === null || val === undefined) return '""';
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(",")
    ).join("\n");

    const csvContent = headers + "\n" + rows;

    const response = new NextResponse(csvContent);
    response.headers.set("Content-Type", "text/csv");
    response.headers.set("Content-Disposition", `attachment; filename="${type}_export_${siteId}.csv"`);
    return response;

  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
