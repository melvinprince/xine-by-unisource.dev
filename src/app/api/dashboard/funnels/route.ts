import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { funnels, goalConversions, sessions } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

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
    // 1. Fetch site funnels
    const siteFunnels = await db.select().from(funnels).where(eq(funnels.site_id, siteId));
    if (siteFunnels.length === 0) {
      return NextResponse.json([]);
    }

    // Extract all unique goalIds used in all funnels
    const neededGoalIds = new Set<string>();
    siteFunnels.forEach(f => {
      const steps = f.steps as { goalId: string; name: string }[];
      if (Array.isArray(steps)) {
        steps.forEach(s => neededGoalIds.add(s.goalId));
      }
    });

    if (neededGoalIds.size === 0) {
      // Funnels exist but have no goal steps
      return NextResponse.json(siteFunnels.map(f => ({ ...f, analytics: [] })));
    }

    // 2. Fetch goal conversions for the date range
    const rows = await db
      .select({
        sessionId: goalConversions.session_id,
        goalId: goalConversions.goal_id,
      })
      .from(goalConversions)
      .where(
        and(
          eq(goalConversions.site_id, siteId),
          gte(goalConversions.created_at, from),
          lte(goalConversions.created_at, to)
        )
      );

    // Group by sessionId
    const sessionGoals = new Map<string, Set<string>>();
    for (const row of rows) {
      let set = sessionGoals.get(row.sessionId);
      if (!set) {
        set = new Set();
        sessionGoals.set(row.sessionId, set);
      }
      set.add(row.goalId);
    }

    const allSessions = Array.from(sessionGoals.values());

    // 3. Evaluate each funnel
    const enrichedFunnels = siteFunnels.map(funnel => {
      const steps = (funnel.steps as { goalId: string; name: string }[]) || [];
      const stats: { stepIndex: number; name: string; count: number; dropoffFromPrevious: number }[] = [];

      let previousCount = 0;

      steps.forEach((step, index) => {
        let count = 0;
        // Count how many sessions hit ALL goals up to this step
        for (const sessionSet of allSessions) {
          let hasSequence = true;
          for (let i = 0; i <= index; i++) {
            if (!sessionSet.has(steps[i].goalId)) {
              hasSequence = false;
              break;
            }
          }
          if (hasSequence) count++;
        }

        const dropoff = index === 0 ? 0 : previousCount > 0 ? ((previousCount - count) / previousCount) * 100 : 0;
        
        stats.push({
          stepIndex: index,
          name: step.name,
          count,
          dropoffFromPrevious: parseFloat(dropoff.toFixed(1)),
        });

        previousCount = count;
      });

      return {
        ...funnel,
        analytics: stats,
      };
    });

    return NextResponse.json(enrichedFunnels);

  } catch (error) {
    console.error("Funnels dashboard error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
