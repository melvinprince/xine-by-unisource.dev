import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { annotations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const data = await db
      .select()
      .from(annotations)
      .where(eq(annotations.site_id, siteId))
      .orderBy(desc(annotations.date));

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET annotations error:", error);
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
      .insert(annotations)
      .values({
        site_id: siteId,
        text: body.text,
        date: new Date(body.date),
        category: body.category || "note",
      })
      .returning();

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("POST annotations error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
