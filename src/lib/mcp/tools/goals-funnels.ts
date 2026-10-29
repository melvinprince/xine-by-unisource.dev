// ============================================================
// Xine MCP — Goals & Funnels Tools
// Mirrors the dashboard's goal-conversion and funnel-evaluation
// logic (api/dashboard/goals + api/dashboard/funnels).
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { funnels, goalConversions, goals, sessions } from "@/lib/db/schema";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { clearGoalsCache } from "@/lib/goals-cache";
import { buildDateExpr } from "@/lib/query-helpers";
import type { DateRange } from "@/lib/types";
import { requireSiteAccess, resolveSiteScope, toolError } from "../auth";
import {
  dateRangeParams,
  getUserId,
  guard,
  ok,
  resolveDateRange,
  siteIdParam,
  singleSiteIdParam,
} from "../helpers";

async function getGoalsWithStats(siteIds: string[], dateRange: DateRange) {
  if (siteIds.length === 0) return [];

  const [sessionRes, siteGoals, conversionsRes] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessions)
      .where(
        and(
          inArray(sessions.site_id, siteIds),
          gte(sessions.started_at, dateRange.from),
          lte(sessions.started_at, dateRange.to)
        )
      ),
    db.select().from(goals).where(inArray(goals.site_id, siteIds)),
    db
      .select({ goal_id: goalConversions.goal_id, count: sql<number>`count(*)::int` })
      .from(goalConversions)
      .where(
        and(
          inArray(goalConversions.site_id, siteIds),
          gte(goalConversions.created_at, dateRange.from),
          lte(goalConversions.created_at, dateRange.to)
        )
      )
      .groupBy(goalConversions.goal_id),
  ]);

  const totalSessions = sessionRes[0].count || 1;
  const conversionsMap = Object.fromEntries(conversionsRes.map((c) => [c.goal_id, c.count]));

  return siteGoals.map((g) => {
    const conversions = conversionsMap[g.id] || 0;
    return {
      ...g,
      conversions,
      conversionRate: `${((conversions / totalSessions) * 100).toFixed(1)}%`,
    };
  });
}

type FunnelStep = { goalId: string; name: string };

async function evaluateFunnels(siteIds: string[], dateRange: DateRange) {
  if (siteIds.length === 0) return [];

  const siteFunnels = await db.select().from(funnels).where(inArray(funnels.site_id, siteIds));
  if (siteFunnels.length === 0) return [];

  const rows = await db
    .select({ sessionId: goalConversions.session_id, goalId: goalConversions.goal_id })
    .from(goalConversions)
    .where(
      and(
        inArray(goalConversions.site_id, siteIds),
        gte(goalConversions.created_at, dateRange.from),
        lte(goalConversions.created_at, dateRange.to)
      )
    );

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

  return siteFunnels.map((funnel) => {
    const steps = (funnel.steps as FunnelStep[]) || [];
    const stats: { stepIndex: number; name: string; count: number; dropoffFromPrevious: number }[] = [];
    let previousCount = 0;

    steps.forEach((step, index) => {
      let count = 0;
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

    return { ...funnel, analytics: stats };
  });
}

export function registerGoalFunnelTools(server: McpServer) {
  server.registerTool(
    "xine_list_goals",
    {
      title: "List goals with conversions",
      description:
        "List conversion goals with their conversion count and conversion rate (per session) for the given period.",
      inputSchema: {
        site_id: siteIdParam,
        ...dateRangeParams,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      return ok(await getGoalsWithStats(siteIds, dateRange));
    })
  );

  server.registerTool(
    "xine_create_goal",
    {
      title: "Create goal",
      description:
        'Create a conversion goal. Types: "pageview" (target = URL path), "event" (target = custom event name), "duration" (target = seconds on site, use condition "greater_than"). Requires the editor or owner role.',
      inputSchema: {
        site_id: singleSiteIdParam,
        name: z.string().min(1).max(256).describe("Display name for the goal."),
        type: z.enum(["pageview", "event", "duration"]),
        condition: z.enum(["equals", "contains", "starts_with", "greater_than"]),
        target: z
          .string()
          .min(1)
          .max(2048)
          .describe('Value to match, e.g. "/checkout/success", "signup_click", or "120".'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");
      const result = await db
        .insert(goals)
        .values({
          site_id: args.site_id,
          name: args.name,
          type: args.type,
          condition: args.condition,
          target: args.target,
        })
        .returning();
      clearGoalsCache(args.site_id);
      return ok(result[0]);
    })
  );

  server.registerTool(
    "xine_delete_goal",
    {
      title: "Delete goal",
      description:
        "Delete a conversion goal and its recorded conversions. Funnels referencing this goal keep the step but it will no longer accumulate data. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        goal_id: z.string().uuid().describe("Goal UUID from xine_list_goals."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");
      const deleted = await db
        .delete(goals)
        .where(and(eq(goals.id, args.goal_id), eq(goals.site_id, args.site_id)))
        .returning({ id: goals.id, name: goals.name });
      if (deleted.length === 0) {
        toolError("Goal not found on this site. Call xine_list_goals to see existing goals.");
      }
      clearGoalsCache(args.site_id);
      return ok({ deleted: deleted[0] });
    })
  );

  server.registerTool(
    "xine_list_funnels",
    {
      title: "List funnels with step analytics",
      description:
        "List conversion funnels including per-step analytics for the period: sessions reaching each step and drop-off % from the previous step.",
      inputSchema: {
        site_id: siteIdParam,
        ...dateRangeParams,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      return ok(await evaluateFunnels(siteIds, dateRange));
    })
  );

  server.registerTool(
    "xine_create_funnel",
    {
      title: "Create funnel",
      description:
        "Create a multi-step conversion funnel from existing goals (2–20 steps, in order). Create the goals first with xine_create_goal if needed. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        name: z.string().min(1).max(256).describe("Display name for the funnel."),
        steps: z
          .array(
            z.object({
              goal_id: z.string().uuid().describe("Goal UUID from xine_list_goals."),
              name: z.string().min(1).max(256).describe("Step label shown in the funnel chart."),
            })
          )
          .min(2)
          .max(20)
          .describe("Ordered funnel steps, first to last."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");

      const goalIds = args.steps.map((s) => s.goal_id);
      const found = await db
        .select({ id: goals.id })
        .from(goals)
        .where(and(inArray(goals.id, goalIds), eq(goals.site_id, args.site_id)));
      const foundIds = new Set(found.map((g) => g.id));
      const missing = goalIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        toolError(
          `These goal ids don't exist on this site: ${missing.join(", ")}. Call xine_list_goals to see valid goals.`
        );
      }

      const result = await db
        .insert(funnels)
        .values({
          site_id: args.site_id,
          name: args.name,
          steps: args.steps.map((s) => ({ goalId: s.goal_id, name: s.name })),
        })
        .returning();
      return ok(result[0]);
    })
  );

  server.registerTool(
    "xine_delete_funnel",
    {
      title: "Delete funnel",
      description: "Delete a conversion funnel (its underlying goals are kept). Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        funnel_id: z.string().uuid().describe("Funnel UUID from xine_list_funnels."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");
      const deleted = await db
        .delete(funnels)
        .where(and(eq(funnels.id, args.funnel_id), eq(funnels.site_id, args.site_id)))
        .returning({ id: funnels.id, name: funnels.name });
      if (deleted.length === 0) {
        toolError("Funnel not found on this site. Call xine_list_funnels to see existing funnels.");
      }
      return ok({ deleted: deleted[0] });
    })
  );

  server.registerTool(
    "xine_update_goal",
    {
      title: "Update goal",
      description:
        "Change an existing goal's name, type, condition or target. Only the fields you pass are changed. Past conversions are kept as-is; the new definition applies to traffic from now on. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        goal_id: z.string().uuid().describe("Goal UUID from xine_list_goals."),
        name: z.string().min(1).max(256).optional(),
        type: z.enum(["pageview", "event", "duration"]).optional(),
        condition: z.enum(["equals", "contains", "starts_with", "greater_than"]).optional(),
        target: z.string().min(1).max(2048).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");

      const updates: Partial<typeof goals.$inferInsert> = {};
      if (args.name !== undefined) updates.name = args.name;
      if (args.type !== undefined) updates.type = args.type;
      if (args.condition !== undefined) updates.condition = args.condition;
      if (args.target !== undefined) updates.target = args.target;
      if (Object.keys(updates).length === 0) {
        toolError("Nothing to update — pass at least one of: name, type, condition, target.");
      }

      const updated = await db
        .update(goals)
        .set(updates)
        .where(and(eq(goals.id, args.goal_id), eq(goals.site_id, args.site_id)))
        .returning();
      if (updated.length === 0) {
        toolError("Goal not found on this site. Call xine_list_goals to see existing goals.");
      }
      clearGoalsCache(args.site_id);
      return ok(updated[0]);
    })
  );

  server.registerTool(
    "xine_update_funnel",
    {
      title: "Update funnel",
      description:
        "Rename a funnel or replace its ordered list of steps. Passing steps replaces every step, so send the complete list. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        funnel_id: z.string().uuid().describe("Funnel UUID from xine_list_funnels."),
        name: z.string().min(1).max(256).optional(),
        steps: z
          .array(
            z.object({
              goal_id: z.string().uuid().describe("Goal UUID from xine_list_goals."),
              name: z.string().min(1).max(256).describe("Step label shown in the funnel chart."),
            })
          )
          .min(2)
          .max(20)
          .optional()
          .describe("Complete replacement list of steps, in order (2–20)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");

      const updates: Partial<typeof funnels.$inferInsert> = {};
      if (args.name !== undefined) updates.name = args.name;
      if (args.steps !== undefined) {
        const siteGoals = await db
          .select({ id: goals.id })
          .from(goals)
          .where(eq(goals.site_id, args.site_id));
        const valid = new Set(siteGoals.map((g) => g.id));
        const missing = args.steps.filter((s) => !valid.has(s.goal_id)).map((s) => s.goal_id);
        if (missing.length > 0) {
          toolError(
            `These goal ids don't belong to this site: ${missing.join(", ")}. Call xine_list_goals for valid ids.`
          );
        }
        updates.steps = args.steps.map((s) => ({ goalId: s.goal_id, name: s.name }));
      }
      if (Object.keys(updates).length === 0) {
        toolError("Nothing to update — pass name and/or steps.");
      }

      const updated = await db
        .update(funnels)
        .set(updates)
        .where(and(eq(funnels.id, args.funnel_id), eq(funnels.site_id, args.site_id)))
        .returning();
      if (updated.length === 0) {
        toolError("Funnel not found on this site. Call xine_list_funnels to see existing funnels.");
      }
      return ok(updated[0]);
    })
  );

  server.registerTool(
    "xine_get_goal_conversions",
    {
      title: "Get goal conversion records and trend",
      description:
        "The individual conversion records behind a goal — session id, visitor id and timestamp — plus a daily conversion trend. Use it to see exactly who converted and when, then feed a visitor_id into xine_get_visitor_journey to see the path they took. Omit goal_id to cover every goal on the site.",
      inputSchema: {
        site_id: siteIdParam,
        goal_id: z.string().uuid().optional().describe("Restrict to one goal. Omit for all goals in scope."),
        ...dateRangeParams,
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Conversion records to return (default 100, max 500)."),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const limit = args.limit ?? 100;
      if (siteIds.length === 0) return ok({ total: 0, records: [], dailyTrend: [], byGoal: [] });

      const where = and(
        inArray(goalConversions.site_id, siteIds),
        gte(goalConversions.created_at, dateRange.from),
        lte(goalConversions.created_at, dateRange.to),
        ...(args.goal_id ? [eq(goalConversions.goal_id, args.goal_id)] : [])
      );
      const dayExpr = buildDateExpr(dateRange, goalConversions.created_at, "day");

      const [records, byGoal, dailyTrend, totalRes] = await Promise.all([
        db
          .select({
            id: goalConversions.id,
            goal_id: goalConversions.goal_id,
            goal_name: goals.name,
            site_id: goalConversions.site_id,
            session_id: goalConversions.session_id,
            visitor_id: goalConversions.visitor_id,
            created_at: goalConversions.created_at,
          })
          .from(goalConversions)
          .leftJoin(goals, eq(goalConversions.goal_id, goals.id))
          .where(where)
          .orderBy(sql`${goalConversions.created_at} DESC`)
          .limit(limit),
        db
          .select({
            goal_id: goalConversions.goal_id,
            goal_name: goals.name,
            conversions: sql<number>`COUNT(*)::int`,
            uniqueVisitors: sql<number>`COUNT(DISTINCT ${goalConversions.visitor_id})::int`,
          })
          .from(goalConversions)
          .leftJoin(goals, eq(goalConversions.goal_id, goals.id))
          .where(where)
          .groupBy(goalConversions.goal_id, goals.name)
          .orderBy(sql`COUNT(*) DESC`),
        // Calendar days in the requested timezone (default UTC).
        db
          .select({
            day: dayExpr,
            conversions: sql<number>`COUNT(*)::int`,
          })
          .from(goalConversions)
          .where(where)
          .groupBy(dayExpr)
          .orderBy(dayExpr),
        db.select({ total: sql<number>`COUNT(*)::int` }).from(goalConversions).where(where),
      ]);

      return ok({
        period: { from: dateRange.from, to: dateRange.to, timezone: dateRange.tz ?? "UTC" },
        total: totalRes[0]?.total ?? 0,
        returned: records.length,
        byGoal,
        dailyTrend,
        records,
      });
    })
  );
}
