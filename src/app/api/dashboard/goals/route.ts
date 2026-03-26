import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { goals, goalConversions, sessions } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  if (!siteId) return NextResponse.json({ error: "Missing siteId" }, { status: 400 });

  const to = toStr ? new Date(toStr) : new Date();
  const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (toStr && !toStr.includes('T')) {
    to.setHours(23, 59, 59, 999);
  }

  try {
    // 1. Get total sessions in range for the site (for conversion rate)
    const sessionRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessions)
      .where(
        and(
          eq(sessions.site_id, siteId),
          gte(sessions.started_at, from),
          lte(sessions.started_at, to)
        )
      );
    const totalSessions = sessionRes[0].count || 1; // avoid div/0

    // 2. Get all goals for the site
    const siteGoals = await db.select().from(goals).where(eq(goals.site_id, siteId));

    // 3. Get conversions grouped by goal in range
    const conversionsRes = await db
      .select({
        goal_id: goalConversions.goal_id,
        count: sql<number>`count(*)::int`,
      })
      .from(goalConversions)
      .where(
        and(
          eq(goalConversions.site_id, siteId),
          gte(goalConversions.created_at, from),
          lte(goalConversions.created_at, to)
        )
      )
      .groupBy(goalConversions.goal_id);

    // Map counts to goals
    const conversionsMap = Object.fromEntries(
      conversionsRes.map((c) => [c.goal_id, c.count])
    );

    const enrichGoals = siteGoals.map(g => {
      const convCount = conversionsMap[g.id] || 0;
      return {
        ...g,
        conversions: convCount,
        rate: ((convCount / totalSessions) * 100).toFixed(1)
      };
    });

    return NextResponse.json(enrichGoals);
  } catch (error) {
    console.error("Dashboard goals error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
