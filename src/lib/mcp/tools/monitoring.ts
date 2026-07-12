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
}
