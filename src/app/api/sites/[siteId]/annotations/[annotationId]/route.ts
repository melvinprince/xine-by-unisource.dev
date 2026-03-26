import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { annotations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ siteId: string; annotationId: string }> }
) {
  try {
    const { siteId, annotationId } = await params;
    await db.delete(annotations).where(and(eq(annotations.id, annotationId), eq(annotations.site_id, siteId)));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE annotation error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
