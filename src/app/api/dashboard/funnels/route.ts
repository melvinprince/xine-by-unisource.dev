import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { funnels, goalConversions, sessions } from "@/lib/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { verifySiteExists, parseDateRange, siteNotFoundResponse, invalidDateResponse, getUserFromRequest, getUserAccessibleSiteIds } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") || "all";
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");

  // 1. Verify Site UUID exists in database (or is "all")
  const exists = await verifySiteExists(siteId, request);
  if (!exists) return siteNotFoundResponse();

  const accessibleSites = siteId === "all" ? await getUserAccessibleSiteIds(userId) : [siteId];

  // 2. Safely parse and validate date range
  const dateRange = parseDateRange(fromStr, toStr);
  if (!dateRange) return invalidDateResponse();

  const { from, to } = dateRange;

  try {
    // 1. Fetch site funnels
    const siteFunnels = accessibleSites.length > 0
      ? await db.select().from(funnels).where(inArray(funnels.site_id, accessibleSites))
      : [];

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
          inArray(goalConversions.site_id, accessibleSites),
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
