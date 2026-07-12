// ============================================================
// Xine MCP — Site Management Tools
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { sites, siteSettings, userSites } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireSiteAccess, toolError } from "../auth";
import { getUserId, guard, ok, singleSiteIdParam } from "../helpers";

const DEFAULT_FEATURES = {
  web_vitals: true,
  scroll_depth: true,
  outbound_clicks: true,
  js_errors: true,
  custom_events: true,
  click_tracking: false,
  rage_clicks: false,
  file_downloads: false,
  form_abandonment: false,
};

const domainParam = z
  .string()
  .min(1)
  .max(512)
  .describe('Website domain, e.g. "example.com" (protocol is stripped automatically).');

const featureFlagsShape = {
  web_vitals: z.boolean().optional(),
  scroll_depth: z.boolean().optional(),
  outbound_clicks: z.boolean().optional(),
  js_errors: z.boolean().optional(),
  custom_events: z.boolean().optional(),
  click_tracking: z.boolean().optional(),
  rage_clicks: z.boolean().optional(),
  file_downloads: z.boolean().optional(),
  form_abandonment: z.boolean().optional(),
};

function cleanDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function registerSiteTools(server: McpServer) {
  server.registerTool(
    "xine_list_sites",
    {
      title: "List sites",
      description:
        "List every analytics site the authenticated user can access, including their role (viewer/editor/owner), the tracking api_key, and creation date. Use the returned site ids in all other tools.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guard(async (_args, extra) => {
      const userId = getUserId(extra);
      const rows = await db
        .select({
          id: sites.id,
          name: sites.name,
          domain: sites.domain,
          role: userSites.role,
          api_key: sites.api_key,
          is_public: sites.is_public,
          api_access_enabled: sites.api_access_enabled,
          created_at: sites.created_at,
        })
        .from(userSites)
        .innerJoin(sites, eq(userSites.site_id, sites.id))
        .where(eq(userSites.user_id, userId))
        .orderBy(desc(sites.created_at));
      return ok(rows);
    })
  );

  server.registerTool(
    "xine_create_site",
    {
      title: "Create site",
      description:
        "Create a new site to track. Returns the new site including its tracking api_key — embed it on the website as: <script defer src=\"https://YOUR_XINE_DOMAIN/t.js\" data-api-key=\"API_KEY\"></script>",
      inputSchema: {
        name: z.string().min(1).max(256).describe("Display name for the site."),
        domain: domainParam,
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      try {
        const result = await db.transaction(async (tx) => {
          const siteRes = await tx
            .insert(sites)
            .values({
              name: args.name,
              domain: cleanDomain(args.domain),
              api_key: randomUUID(),
              server_api_key: randomUUID(),
              owner_id: userId,
              user_id: userId,
            })
            .returning();

          await tx.insert(userSites).values({
            user_id: userId,
            site_id: siteRes[0].id,
            role: "owner",
          });

          return siteRes[0];
        });
        return ok(result);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          toolError("A site with this domain already exists.");
        }
        throw error;
      }
    })
  );

  server.registerTool(
    "xine_update_site",
    {
      title: "Update site",
      description:
        "Update a site's name, domain, public-dashboard flag, or external API access flag. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        name: z.string().min(1).max(256).optional(),
        domain: domainParam.optional(),
        is_public: z.boolean().optional().describe("Whether the shareable public dashboard is enabled."),
        api_access_enabled: z.boolean().optional().describe("Whether the external /api/v1 stats API is enabled."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");

      const updates: Partial<typeof sites.$inferInsert> = {};
      if (args.name !== undefined) updates.name = args.name;
      if (args.domain !== undefined) updates.domain = cleanDomain(args.domain);
      if (args.is_public !== undefined) updates.is_public = args.is_public;
      if (args.api_access_enabled !== undefined) updates.api_access_enabled = args.api_access_enabled;

      if (Object.keys(updates).length === 0) {
        toolError("Nothing to update — pass at least one of: name, domain, is_public, api_access_enabled.");
      }

      try {
        const result = await db.update(sites).set(updates).where(eq(sites.id, args.site_id)).returning();
        return ok(result[0]);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          toolError("A site with this domain already exists.");
        }
        throw error;
      }
    })
  );

  server.registerTool(
    "xine_delete_site",
    {
      title: "Delete site",
      description:
        "Permanently delete a site and ALL of its analytics data (pageviews, sessions, events, goals, funnels…). Irreversible. Requires the owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        confirm: z
          .literal(true)
          .describe("Must be true — acknowledges that all analytics data for the site will be permanently deleted."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "owner");
      const deleted = await db.delete(sites).where(eq(sites.id, args.site_id)).returning({
        id: sites.id,
        name: sites.name,
        domain: sites.domain,
      });
      return ok({ deleted: deleted[0], message: "Site and all associated data deleted." });
    })
  );

  server.registerTool(
    "xine_get_site_settings",
    {
      title: "Get site feature settings",
      description:
        "Get the per-site tracking feature flags (web vitals, scroll depth, JS errors, click tracking, session features…).",
      inputSchema: { site_id: singleSiteIdParam },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "viewer");
      const row = await db.query.siteSettings.findFirst({
        where: eq(siteSettings.site_id, args.site_id),
      });
      return ok({ site_id: args.site_id, features: row?.features ?? DEFAULT_FEATURES });
    })
  );

  server.registerTool(
    "xine_update_site_settings",
    {
      title: "Update site feature settings",
      description:
        "Toggle per-site tracking features. Only the flags you pass are changed; the rest keep their current value. Requires the editor or owner role.",
      inputSchema: {
        site_id: singleSiteIdParam,
        features: z.object(featureFlagsShape).strict().describe("Feature flags to change."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "editor");

      const existing = await db.query.siteSettings.findFirst({
        where: eq(siteSettings.site_id, args.site_id),
      });
      const merged = {
        ...DEFAULT_FEATURES,
        ...((existing?.features as Record<string, boolean>) ?? {}),
        ...args.features,
      };

      await db
        .insert(siteSettings)
        .values({ site_id: args.site_id, features: merged, updated_at: new Date() })
        .onConflictDoUpdate({
          target: siteSettings.site_id,
          set: { features: merged, updated_at: new Date() },
        });

      return ok({ site_id: args.site_id, features: merged });
    })
  );
}
