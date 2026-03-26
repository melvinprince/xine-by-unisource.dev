import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { funnels } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const data = await db
      .select()
      .from(funnels)
      .where(eq(funnels.site_id, siteId));

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET funnels error:", error);
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
      .insert(funnels)
      .values({
        site_id: siteId,
        name: body.name,
        steps: body.steps, // JSON array
      })
      .returning();

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("POST funnels error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
