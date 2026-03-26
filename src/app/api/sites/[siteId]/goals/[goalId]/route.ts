import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { clearGoalsCache } from "@/lib/goals-cache";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ siteId: string; goalId: string }> }
) {
  try {
    const { siteId, goalId } = await params;

    await db
      .delete(goals)
      .where(
        and(eq(goals.id, goalId), eq(goals.site_id, siteId))
      );

    clearGoalsCache(siteId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("DELETE goal error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
