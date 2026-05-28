import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { clearGoalsCache } from "@/lib/goals-cache";
import { validateOrThrow, createGoalSchema, uuidSchema, ValidationError } from "@/lib/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const rawParams = await params;
    const siteId = validateOrThrow(uuidSchema, rawParams.siteId);
    const data = await db
      .select()
      .from(goals)
      .where(eq(goals.site_id, siteId));

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("GET goals error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const rawParams = await params;
    const siteId = validateOrThrow(uuidSchema, rawParams.siteId);
    const body = await request.json();
    const validated = validateOrThrow(createGoalSchema, body);

    const result = await db
      .insert(goals)
      .values({
        site_id: siteId,
        name: validated.name,
        type: validated.type,       // 'pageview', 'event', 'duration'
        condition: validated.condition, // 'equals', 'contains', 'starts_with', 'greater_than'
        target: validated.target,
      })
      .returning();

    clearGoalsCache(siteId);

    return NextResponse.json(result[0]);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("POST goals error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
