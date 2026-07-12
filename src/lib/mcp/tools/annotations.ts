// ============================================================
// Xine MCP — Annotation Tools
// Chart annotations for deployments, campaigns, incidents, notes.
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { annotations } from "@/lib/db/schema";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
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

export function registerAnnotationTools(server: McpServer) {
  server.registerTool(
    "xine_list_annotations",
    {
      title: "List annotations",
      description:
        "List chart annotations (deployments, campaign launches, incidents, notes) within the period, oldest first.",
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
      if (siteIds.length === 0) return ok([]);
      const rows = await db
        .select()
        .from(annotations)
        .where(
          and(
            inArray(annotations.site_id, siteIds),
            gte(annotations.date, dateRange.from),
            lte(annotations.date, dateRange.to)
          )
        )
        .orderBy(asc(annotations.date));
      return ok(rows);
    })
  );

  server.registerTool(
    "xine_create_annotation",
    {
      title: "Create annotation",
      description:
        "Add a chart annotation at a specific date — useful for marking deployments, campaign launches, or incidents so traffic changes have context. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        text: z.string().min(1).max(1024).describe("Annotation text, e.g. \"Deployed v2.3 checkout redesign\"."),
        date: z.string().describe("Date/time the annotation refers to (ISO 8601)."),
        category: z
          .string()
          .max(100)
          .optional()
          .describe('Category label, e.g. "deployment", "campaign", "incident". Defaults to "note".'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");
      const date = new Date(args.date);
      if (isNaN(date.getTime())) {
        toolError(`Invalid date "${args.date}" — pass an ISO 8601 date like "2026-07-01" or "2026-07-01T14:30:00Z".`);
      }
      const result = await db
        .insert(annotations)
        .values({
          site_id: args.site_id,
          text: args.text,
          date,
          category: args.category || "note",
        })
        .returning();
      return ok(result[0]);
    })
  );

  server.registerTool(
    "xine_delete_annotation",
    {
      title: "Delete annotation",
      description: "Delete a chart annotation. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        annotation_id: z.string().uuid().describe("Annotation UUID from xine_list_annotations."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");
      const deleted = await db
        .delete(annotations)
        .where(and(eq(annotations.id, args.annotation_id), eq(annotations.site_id, args.site_id)))
        .returning({ id: annotations.id, text: annotations.text });
      if (deleted.length === 0) {
        toolError("Annotation not found on this site. Call xine_list_annotations to see existing annotations.");
      }
      return ok({ deleted: deleted[0] });
    })
  );
}
