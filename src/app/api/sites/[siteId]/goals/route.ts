import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { clearGoalsCache } from "@/lib/goals-cache";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const data = await db
      .select()
      .from(goals)
      .where(eq(goals.site_id, siteId));

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET goals error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const body = await request.json();

    const result = await db
      .insert(goals)
      .values({
        site_id: siteId,
        name: body.name,
        type: body.type,       // 'pageview', 'event', 'duration'
        condition: body.condition, // 'equals', 'contains', 'starts_with', 'greater_than'
        target: body.target,
      })
      .returning();

    clearGoalsCache(siteId);

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("POST goals error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
