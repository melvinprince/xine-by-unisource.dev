import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { annotations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { validateOrThrow, createAnnotationSchema, uuidSchema, ValidationError } from "@/lib/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const rawParams = await params;
    const siteId = validateOrThrow(uuidSchema, rawParams.siteId);
    const data = await db
      .select()
      .from(annotations)
      .where(eq(annotations.site_id, siteId))
      .orderBy(desc(annotations.date));

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("GET annotations error:", error);
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
    const validated = validateOrThrow(createAnnotationSchema, body);

    const result = await db
      .insert(annotations)
      .values({
        site_id: siteId,
        text: validated.text,
        date: new Date(validated.date),
        category: validated.category || "note",
      })
      .returning();

    return NextResponse.json(result[0]);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("POST annotations error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
