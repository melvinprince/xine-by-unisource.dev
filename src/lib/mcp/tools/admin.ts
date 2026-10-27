// ============================================================
// Xine MCP — Account, Platform & Security Tools
// Who am I, what is on this install, who can see it, and
// what the auth layer has been rejecting.
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  alerts,
  annotations,
  apiTokens,
  bannedLogins,
  emailReports,
  events,
  funnels,
  goals,
  loginAttempts,
  pageviews,
  sessions,
  siteInvites,
  siteSettings,
  sites,
  userSites,
  users,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getUserAccessibleSiteIds } from "@/lib/api-helpers";
import { getAccount, requireFullDataAccess, requireSiteAccess } from "../auth";
import { getUserId, guard, limitParam, ok, singleSiteIdParam } from "../helpers";

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

/** Base URL of this Xine install, for building install snippets. */
function xineBaseUrl(override?: string): { url: string; source: string } {
  if (override) return { url: override.replace(/\/$/, ""), source: "provided by the caller" };
  const fromEnv =
    process.env.XINE_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_XINE_URL;
  if (fromEnv) return { url: fromEnv.replace(/\/$/, ""), source: "server environment" };
  return {
    url: "https://YOUR_XINE_DOMAIN",
    source: "placeholder — pass xine_base_url or set XINE_PUBLIC_URL on the server",
  };
}

export function registerAdminTools(server: McpServer) {
  // ----------------------------------------------------------
  // Who am I
  // ----------------------------------------------------------
  server.registerTool(
    "xine_whoami",
    {
      title: "Describe the authenticated account",
      description:
        "Identify the account behind the API token: user id, email, name, platform role (admin or user), and the role held on each accessible site. Also reports whether full-account tools (xine_run_sql, xine_get_security_audit) are available to this token and why. Useful as a first call to establish what is reachable.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guard(async (_args, extra) => {
      const userId = getUserId(extra);
      const account = await getAccount(userId);

      const siteRoles = await db
        .select({
          site_id: userSites.site_id,
          role: userSites.role,
          name: sites.name,
          domain: sites.domain,
        })
        .from(userSites)
        .innerJoin(sites, eq(userSites.site_id, sites.id))
        .where(eq(userSites.user_id, userId));

      const ownsEverything = siteRoles.length > 0 && siteRoles.every((s) => s.role === "owner");
      const fullAccess = account.role === "admin" || ownsEverything;

      return ok({
        account,
        siteCount: siteRoles.length,
        sites: siteRoles,
        fullAccountAccess: {
          granted: fullAccess,
          reason: fullAccess
            ? account.role === "admin"
              ? 'platform role is "admin"'
              : "owner of every site on this account"
            : "needs the admin platform role, or ownership of every accessible site",
          unlocks: ["xine_run_sql", "xine_get_security_audit"],
        },
      });
    })
  );

  // ----------------------------------------------------------
  // Platform summary
  // ----------------------------------------------------------
  server.registerTool(
    "xine_get_platform_summary",
    {
      title: "Summarise every site on the account",
      description:
        "One call for the whole picture: for every accessible site, the all-time pageview/session/event totals, the first and most recent data point (data freshness), activity in the last 24 hours / 7 days / 30 days, the enabled tracking features, and how many goals, funnels, annotations, alerts and email reports are configured. Start here when you need orientation before drilling into a specific site.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guard(async (_args, extra) => {
      const userId = getUserId(extra);
      const siteIds = await getUserAccessibleSiteIds(userId);
      if (siteIds.length === 0) return ok({ siteCount: 0, sites: [] });

      const scope = inArray(sites.id, siteIds);

      const [siteRows, pvStats, sessStats, evStats, settingsRows, counts] = await Promise.all([
        db
          .select({
            id: sites.id,
            name: sites.name,
            domain: sites.domain,
            role: userSites.role,
            is_public: sites.is_public,
            api_access_enabled: sites.api_access_enabled,
            created_at: sites.created_at,
          })
          .from(sites)
          .innerJoin(userSites, and(eq(userSites.site_id, sites.id), eq(userSites.user_id, userId)))
          .where(scope),
        db
          .select({
            site_id: pageviews.site_id,
            total: sql<number>`COUNT(*)::int`,
            humanTotal: sql<number>`COUNT(*) FILTER (WHERE ${pageviews.is_bot} = false)::int`,
            botTotal: sql<number>`COUNT(*) FILTER (WHERE ${pageviews.is_bot} = true)::int`,
            firstSeen: sql<string>`MIN(${pageviews.created_at})`,
            lastSeen: sql<string>`MAX(${pageviews.created_at})`,
            last24h: sql<number>`COUNT(*) FILTER (WHERE ${pageviews.created_at} > NOW() - INTERVAL '24 hours' AND ${pageviews.is_bot} = false)::int`,
            last7d: sql<number>`COUNT(*) FILTER (WHERE ${pageviews.created_at} > NOW() - INTERVAL '7 days' AND ${pageviews.is_bot} = false)::int`,
            last30d: sql<number>`COUNT(*) FILTER (WHERE ${pageviews.created_at} > NOW() - INTERVAL '30 days' AND ${pageviews.is_bot} = false)::int`,
          })
          .from(pageviews)
          .where(inArray(pageviews.site_id, siteIds))
          .groupBy(pageviews.site_id),
        db
          .select({
            site_id: sessions.site_id,
            total: sql<number>`COUNT(*) FILTER (WHERE ${sessions.is_bot} = false)::int`,
            uniqueVisitors: sql<number>`COUNT(DISTINCT ${sessions.visitor_id}) FILTER (WHERE ${sessions.is_bot} = false)::int`,
            lastStarted: sql<string>`MAX(${sessions.started_at})`,
          })
          .from(sessions)
          .where(inArray(sessions.site_id, siteIds))
          .groupBy(sessions.site_id),
        db
          .select({
            site_id: events.site_id,
            total: sql<number>`COUNT(*) FILTER (WHERE ${events.is_bot} = false)::int`,
            distinctNames: sql<number>`COUNT(DISTINCT ${events.name})::int`,
            lastSeen: sql<string>`MAX(${events.created_at})`,
          })
          .from(events)
          .where(inArray(events.site_id, siteIds))
          .groupBy(events.site_id),
        db.select().from(siteSettings).where(inArray(siteSettings.site_id, siteIds)),
        Promise.all([
          db
            .select({ site_id: goals.site_id, n: sql<number>`COUNT(*)::int` })
            .from(goals)
            .where(inArray(goals.site_id, siteIds))
            .groupBy(goals.site_id),
          db
            .select({ site_id: funnels.site_id, n: sql<number>`COUNT(*)::int` })
            .from(funnels)
            .where(inArray(funnels.site_id, siteIds))
            .groupBy(funnels.site_id),
          db
            .select({ site_id: annotations.site_id, n: sql<number>`COUNT(*)::int` })
            .from(annotations)
            .where(inArray(annotations.site_id, siteIds))
            .groupBy(annotations.site_id),
          db
            .select({ site_id: alerts.site_id, n: sql<number>`COUNT(*)::int` })
            .from(alerts)
            .where(inArray(alerts.site_id, siteIds))
            .groupBy(alerts.site_id),
          db
            .select({ site_id: emailReports.site_id, n: sql<number>`COUNT(*)::int` })
            .from(emailReports)
            .where(inArray(emailReports.site_id, siteIds))
            .groupBy(emailReports.site_id),
        ]),
      ]);

      const [goalCounts, funnelCounts, annotationCounts, alertCounts, reportCounts] = counts;
      const index = <T extends { site_id: string }>(rows: T[]) => new Map(rows.map((r) => [r.site_id, r]));
      const pvMap = index(pvStats);
      const sessMap = index(sessStats);
      const evMap = index(evStats);
      const settingsMap = index(settingsRows);
      const countMap = (rows: { site_id: string; n: number }[]) => new Map(rows.map((r) => [r.site_id, r.n]));
      const goalMap = countMap(goalCounts);
      const funnelMap = countMap(funnelCounts);
      const annMap = countMap(annotationCounts);
      const alertMap = countMap(alertCounts);
      const reportMap = countMap(reportCounts);

      const result = siteRows.map((site) => {
        const pv = pvMap.get(site.id);
        const se = sessMap.get(site.id);
        const ev = evMap.get(site.id);
        return {
          ...site,
          traffic: {
            pageviewsAllTime: pv?.humanTotal ?? 0,
            botPageviewsAllTime: pv?.botTotal ?? 0,
            sessionsAllTime: se?.total ?? 0,
            uniqueVisitorsAllTime: se?.uniqueVisitors ?? 0,
            eventsAllTime: ev?.total ?? 0,
            distinctEventNames: ev?.distinctNames ?? 0,
            pageviewsLast24h: pv?.last24h ?? 0,
            pageviewsLast7d: pv?.last7d ?? 0,
            pageviewsLast30d: pv?.last30d ?? 0,
          },
          dataFreshness: {
            firstPageview: pv?.firstSeen ?? null,
            lastPageview: pv?.lastSeen ?? null,
            lastSessionStart: se?.lastStarted ?? null,
            lastEvent: ev?.lastSeen ?? null,
            receivingData: Boolean(pv?.last24h && pv.last24h > 0),
          },
          features: settingsMap.get(site.id)?.features ?? DEFAULT_FEATURES,
          configured: {
            goals: goalMap.get(site.id) ?? 0,
            funnels: funnelMap.get(site.id) ?? 0,
            annotations: annMap.get(site.id) ?? 0,
            alerts: alertMap.get(site.id) ?? 0,
            emailReports: reportMap.get(site.id) ?? 0,
          },
        };
      });

      return ok({ siteCount: result.length, sites: result });
    })
  );

  // ----------------------------------------------------------
  // Tracking snippet
  // ----------------------------------------------------------
  server.registerTool(
    "xine_get_tracking_snippet",
    {
      title: "Get the install snippet for a site",
      description:
        "The exact script tag to embed on a site, its tracking api_key, the runtime config endpoint the tracker reads its feature flags from, and which tracking features are currently enabled. Use this to help install or debug tracking on a site.",
      inputSchema: {
        site_id: singleSiteIdParam,
        xine_base_url: z
          .string()
          .optional()
          .describe('Public base URL of this Xine install, e.g. "https://analytics.example.com". Falls back to the server\'s configured URL.'),
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "viewer");

      const [site] = await db
        .select({ id: sites.id, name: sites.name, domain: sites.domain, api_key: sites.api_key })
        .from(sites)
        .where(eq(sites.id, args.site_id))
        .limit(1);

      const settings = await db.query.siteSettings.findFirst({
        where: eq(siteSettings.site_id, args.site_id),
      });
      const base = xineBaseUrl(args.xine_base_url);

      return ok({
        site,
        baseUrl: base.url,
        baseUrlSource: base.source,
        snippet: `<script defer src="${base.url}/t.js" data-api-key="${site.api_key}"></script>`,
        configEndpoint: `${base.url}/api/config/${site.api_key}`,
        collectEndpoint: `${base.url}/api/collect`,
        features: settings?.features ?? DEFAULT_FEATURES,
        notes: [
          "The tracker is cookie-free: it stores a visitor id in localStorage and a session id in sessionStorage.",
          "Feature flags are fetched from the config endpoint at runtime, so toggling them with xine_update_site_settings takes effect without changing the snippet.",
        ],
      });
    })
  );

  // ----------------------------------------------------------
  // Site members & invites
  // ----------------------------------------------------------
  server.registerTool(
    "xine_list_site_members",
    {
      title: "List who can access a site",
      description:
        "Everyone with access to a site and their role (owner/editor/viewer), plus any pending invitations that have not been accepted yet. Password hashes are never returned.",
      inputSchema: { site_id: singleSiteIdParam },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireSiteAccess(userId, args.site_id, "viewer");

      const [members, invites] = await Promise.all([
        db
          .select({
            user_id: users.id,
            email: users.email,
            name: users.name,
            platform_role: users.role,
            is_active: users.is_active,
            site_role: userSites.role,
            granted_at: userSites.granted_at,
          })
          .from(userSites)
          .innerJoin(users, eq(userSites.user_id, users.id))
          .where(eq(userSites.site_id, args.site_id)),
        db
          .select({
            id: siteInvites.id,
            email: siteInvites.email,
            role: siteInvites.role,
            invited_by: siteInvites.invited_by,
            created_at: siteInvites.created_at,
            expires_at: siteInvites.expires_at,
          })
          .from(siteInvites)
          .where(eq(siteInvites.site_id, args.site_id)),
      ]);

      const now = Date.now();
      return ok({
        site_id: args.site_id,
        memberCount: members.length,
        members,
        pendingInvites: invites.map((i) => ({
          ...i,
          expired: i.expires_at ? i.expires_at.getTime() < now : false,
        })),
      });
    })
  );

  // ----------------------------------------------------------
  // API tokens
  // ----------------------------------------------------------
  server.registerTool(
    "xine_list_api_tokens",
    {
      title: "List your MCP API tokens",
      description:
        "Metadata for the personal access tokens on your account: name, prefix, when each was created, when it was last used, and whether it has expired. Token values themselves are stored only as hashes and can never be read back — create a replacement in Dashboard → Settings → API Tokens if one is lost.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    guard(async (_args, extra) => {
      const userId = getUserId(extra);
      const rows = await db
        .select({
          id: apiTokens.id,
          name: apiTokens.name,
          token_prefix: apiTokens.token_prefix,
          last_used_at: apiTokens.last_used_at,
          expires_at: apiTokens.expires_at,
          created_at: apiTokens.created_at,
        })
        .from(apiTokens)
        .where(eq(apiTokens.user_id, userId))
        .orderBy(desc(apiTokens.created_at));

      const now = Date.now();
      return ok(
        rows.map((r) => ({ ...r, expired: r.expires_at ? r.expires_at.getTime() < now : false }))
      );
    })
  );

  // ----------------------------------------------------------
  // Security audit
  // ----------------------------------------------------------
  server.registerTool(
    "xine_get_security_audit",
    {
      title: "Audit dashboard login security",
      description:
        "Failed dashboard login attempts and banned clients for this Xine install: which emails and IPs are being tried, attempt counts, user agents, and current bans with their reasons. Needs full-account access (platform admin, or ownership of every site on the account).",
      inputSchema: {
        limit: limitParam,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      await requireFullDataAccess(userId);
      const limit = args.limit ?? 25;

      const [attempts, bans, summary] = await Promise.all([
        db
          .select()
          .from(loginAttempts)
          .orderBy(desc(loginAttempts.last_attempt_at))
          .limit(limit),
        db.select().from(bannedLogins).orderBy(desc(bannedLogins.banned_at)).limit(limit),
        db
          .select({
            trackedClients: sql<number>`COUNT(*)::int`,
            totalAttempts: sql<number>`COALESCE(SUM(${loginAttempts.attempts}), 0)::int`,
            attemptsLast24h: sql<number>`COUNT(*) FILTER (WHERE ${loginAttempts.last_attempt_at} > NOW() - INTERVAL '24 hours')::int`,
          })
          .from(loginAttempts),
      ]);

      return ok({
        summary: { ...summary[0], activeBans: bans.length },
        recentAttempts: attempts,
        bannedClients: bans,
      });
    })
  );
}
