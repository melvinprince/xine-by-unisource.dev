import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { funnels } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ siteId: string; funnelId: string }> }
) {
  try {
    const { siteId, funnelId } = await params;

    await db
      .delete(funnels)
      .where(
        and(eq(funnels.id, funnelId), eq(funnels.site_id, siteId))
      );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE funnel error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
