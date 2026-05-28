import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { funnels } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateOrThrow, createFunnelSchema, uuidSchema, ValidationError } from "@/lib/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const rawParams = await params;
    const siteId = validateOrThrow(uuidSchema, rawParams.siteId);
    const data = await db
      .select()
      .from(funnels)
      .where(eq(funnels.site_id, siteId));

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("GET funnels error:", error);
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
    const validated = validateOrThrow(createFunnelSchema, body);

    const result = await db
      .insert(funnels)
      .values({
        site_id: siteId,
        name: validated.name,
        steps: validated.steps, // JSON array
      })
      .returning();

    return NextResponse.json(result[0]);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("POST funnels error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
