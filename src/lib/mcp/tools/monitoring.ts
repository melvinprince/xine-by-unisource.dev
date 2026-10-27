// ============================================================
// Xine MCP — Monitoring Tools
// Uptime checks, alert rules, and scheduled email reports.
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { alerts, emailReports, uptimeChecks } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
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

export function registerMonitoringTools(server: McpServer) {
  server.registerTool(
    "xine_get_uptime",
    {
      title: "Get uptime status",
      description:
        "Uptime monitoring for a site over the period: uptime %, average response time (ms), total checks, and the most recent check results.",
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
      if (siteIds.length === 0) return ok({ summary: null, recentChecks: [] });

      const rangeFilter = and(
        inArray(uptimeChecks.site_id, siteIds),
        gte(uptimeChecks.checked_at, dateRange.from),
        lte(uptimeChecks.checked_at, dateRange.to)
      );

      const [summaryRows, recentChecks] = await Promise.all([
        db
          .select({
            totalChecks: sql<number>`COUNT(*)::int`,
            upChecks: sql<number>`COUNT(*) FILTER (WHERE ${uptimeChecks.status} = 'up')::int`,
            avgResponseTime: sql<number>`COALESCE(ROUND(AVG(${uptimeChecks.response_time})), 0)::int`,
          })
          .from(uptimeChecks)
          .where(rangeFilter),
        db.select().from(uptimeChecks).where(rangeFilter).orderBy(desc(uptimeChecks.checked_at)).limit(20),
      ]);

      const summary = summaryRows[0];
      const uptimePercent =
        summary.totalChecks > 0 ? Number(((summary.upChecks / summary.totalChecks) * 100).toFixed(2)) : null;

      return ok({
        summary: { ...summary, uptimePercent },
        recentChecks,
      });
    })
  );

  server.registerTool(
    "xine_list_alerts",
    {
      title: "List alert rules",
      description: "List configured alert rules (traffic spikes/drops, error increases) and where they notify.",
      inputSchema: { site_id: siteIdParam },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      if (siteIds.length === 0) return ok([]);
      const rows = await db.select().from(alerts).where(inArray(alerts.site_id, siteIds));
      return ok(rows);
    })
  );

  server.registerTool(
    "xine_create_alert",
    {
      title: "Create alert rule",
      description:
        'Create an alert rule that notifies by email or webhook. Types: "traffic_spike", "traffic_drop", "error_increase". The threshold is a value plus a timeframe like "1h" or "24h". Requires the editor or owner role.',
      inputSchema: {
        site_id: singleSiteIdParam,
        type: z.enum(["traffic_spike", "traffic_drop", "error_increase"]),
        threshold_value: z.number().positive().describe("Trigger value, e.g. 1000 (visitors) or 50 (errors)."),
        threshold_timeframe: z
          .string()
          .regex(/^\d+[hmd]$/)
          .describe('Evaluation window, e.g. "1h", "30m", "1d".'),
        channel: z.enum(["email", "webhook"]),
        channel_target: z.string().min(1).max(512).describe("Email address or webhook URL to notify."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");
      const result = await db
        .insert(alerts)
        .values({
          site_id: args.site_id,
          type: args.type,
          threshold: { value: args.threshold_value, timeframe: args.threshold_timeframe },
          channel: args.channel,
          channel_target: args.channel_target,
        })
        .returning();
      return ok(result[0]);
    })
  );

  server.registerTool(
    "xine_delete_alert",
    {
      title: "Delete alert rule",
      description: "Delete an alert rule. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        alert_id: z.string().uuid().describe("Alert UUID from xine_list_alerts."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");
      const deleted = await db
        .delete(alerts)
        .where(and(eq(alerts.id, args.alert_id), eq(alerts.site_id, args.site_id)))
        .returning({ id: alerts.id, type: alerts.type });
      if (deleted.length === 0) {
        toolError("Alert not found on this site. Call xine_list_alerts to see existing alerts.");
      }
      return ok({ deleted: deleted[0] });
    })
  );

  server.registerTool(
    "xine_list_email_reports",
    {
      title: "List email reports",
      description: "List scheduled email report configurations (daily/weekly/monthly summaries).",
      inputSchema: { site_id: siteIdParam },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      if (siteIds.length === 0) return ok([]);
      const rows = await db.select().from(emailReports).where(inArray(emailReports.site_id, siteIds));
      return ok(rows);
    })
  );

  server.registerTool(
    "xine_create_email_report",
    {
      title: "Create email report",
      description:
        "Schedule a recurring analytics summary email for a site. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        schedule: z.enum(["daily", "weekly", "monthly"]),
        recipients: z.array(z.string().email()).min(1).max(20).describe("Email addresses to send the report to."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");
      const result = await db
        .insert(emailReports)
        .values({
          site_id: args.site_id,
          schedule: args.schedule,
          recipients: args.recipients,
        })
        .returning();
      return ok(result[0]);
    })
  );

  server.registerTool(
    "xine_delete_email_report",
    {
      title: "Delete email report",
      description: "Delete a scheduled email report. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        report_id: z.string().uuid().describe("Report UUID from xine_list_email_reports."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");
      const deleted = await db
        .delete(emailReports)
        .where(and(eq(emailReports.id, args.report_id), eq(emailReports.site_id, args.site_id)))
        .returning({ id: emailReports.id, schedule: emailReports.schedule });
      if (deleted.length === 0) {
        toolError("Email report not found on this site. Call xine_list_email_reports to see existing reports.");
      }
      return ok({ deleted: deleted[0] });
    })
  );

  server.registerTool(
    "xine_update_alert",
    {
      title: "Update alert rule",
      description:
        "Change an existing alert rule's type, threshold, notification channel or target. Only the fields you pass are changed; passing either threshold field rewrites the whole threshold, so send both. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        alert_id: z.string().uuid().describe("Alert UUID from xine_list_alerts."),
        type: z.enum(["traffic_spike", "traffic_drop", "error_increase"]).optional(),
        threshold_value: z.number().positive().optional().describe("New trigger value. Send with threshold_timeframe."),
        threshold_timeframe: z
          .string()
          .regex(/^\d+[hmd]$/)
          .optional()
          .describe('New evaluation window, e.g. "1h". Send with threshold_value.'),
        channel: z.enum(["email", "webhook"]).optional(),
        channel_target: z.string().min(1).max(512).optional().describe("New email address or webhook URL."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");

      const updates: Partial<typeof alerts.$inferInsert> = {};
      if (args.type !== undefined) updates.type = args.type;
      if (args.channel !== undefined) updates.channel = args.channel;
      if (args.channel_target !== undefined) updates.channel_target = args.channel_target;
      if (args.threshold_value !== undefined || args.threshold_timeframe !== undefined) {
        if (args.threshold_value === undefined || args.threshold_timeframe === undefined) {
          toolError("Send threshold_value and threshold_timeframe together — the threshold is replaced as a whole.");
        }
        updates.threshold = { value: args.threshold_value, timeframe: args.threshold_timeframe };
      }
      if (Object.keys(updates).length === 0) {
        toolError(
          "Nothing to update — pass at least one of: type, threshold_value + threshold_timeframe, channel, channel_target."
        );
      }

      const updated = await db
        .update(alerts)
        .set(updates)
        .where(and(eq(alerts.id, args.alert_id), eq(alerts.site_id, args.site_id)))
        .returning();
      if (updated.length === 0) {
        toolError("Alert not found on this site. Call xine_list_alerts to see existing alerts.");
      }
      return ok(updated[0]);
    })
  );

  server.registerTool(
    "xine_update_email_report",
    {
      title: "Update email report",
      description:
        "Change a scheduled email report's cadence or recipient list. Passing recipients replaces the whole list. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        report_id: z.string().uuid().describe("Report UUID from xine_list_email_reports."),
        schedule: z.enum(["daily", "weekly", "monthly"]).optional(),
        recipients: z
          .array(z.string().email())
          .min(1)
          .max(20)
          .optional()
          .describe("Complete replacement list of recipient addresses."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");

      const updates: Partial<typeof emailReports.$inferInsert> = {};
      if (args.schedule !== undefined) updates.schedule = args.schedule;
      if (args.recipients !== undefined) updates.recipients = args.recipients;
      if (Object.keys(updates).length === 0) {
        toolError("Nothing to update — pass schedule and/or recipients.");
      }

      const updated = await db
        .update(emailReports)
        .set(updates)
        .where(and(eq(emailReports.id, args.report_id), eq(emailReports.site_id, args.site_id)))
        .returning();
      if (updated.length === 0) {
        toolError("Email report not found on this site. Call xine_list_email_reports to see existing reports.");
      }
      return ok(updated[0]);
    })
  );

  server.registerTool(
    "xine_get_uptime_history",
    {
      title: "Get uptime history and outages",
      description:
        "Uptime history beyond the latest snapshot: a per-day roll-up of checks, uptime % and average/worst response time, plus the individual failed checks in the period so you can see exactly when a site was down. Complements xine_get_uptime, which reports the current status.",
      inputSchema: {
        site_id: siteIdParam,
        ...dateRangeParams,
        max_failures: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("How many failed checks to list (default 50)."),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const maxFailures = args.max_failures ?? 50;
      if (siteIds.length === 0) return ok({ dailyHistory: [], failures: [] });

      const rangeFilter = and(
        inArray(uptimeChecks.site_id, siteIds),
        gte(uptimeChecks.checked_at, dateRange.from),
        lte(uptimeChecks.checked_at, dateRange.to)
      );

      const [dailyHistory, failures] = await Promise.all([
        db
          .select({
            day: sql<string>`DATE_TRUNC('day', ${uptimeChecks.checked_at})`,
            site_id: uptimeChecks.site_id,
            checks: sql<number>`COUNT(*)::int`,
            upChecks: sql<number>`COUNT(*) FILTER (WHERE ${uptimeChecks.status} = 'up')::int`,
            uptimePercent: sql<number>`ROUND(100.0 * COUNT(*) FILTER (WHERE ${uptimeChecks.status} = 'up') / NULLIF(COUNT(*), 0), 2)::float`,
            avgResponseTime: sql<number>`COALESCE(ROUND(AVG(${uptimeChecks.response_time})), 0)::int`,
            maxResponseTime: sql<number>`COALESCE(MAX(${uptimeChecks.response_time}), 0)::int`,
          })
          .from(uptimeChecks)
          .where(rangeFilter)
          .groupBy(sql`DATE_TRUNC('day', ${uptimeChecks.checked_at})`, uptimeChecks.site_id)
          .orderBy(sql`DATE_TRUNC('day', ${uptimeChecks.checked_at})`),
        db
          .select()
          .from(uptimeChecks)
          .where(and(rangeFilter, sql`${uptimeChecks.status} <> 'up'`))
          .orderBy(desc(uptimeChecks.checked_at))
          .limit(maxFailures),
      ]);

      return ok({
        period: { from: dateRange.from, to: dateRange.to },
        dailyHistory,
        failureCount: failures.length,
        failures,
      });
    })
  );
}
