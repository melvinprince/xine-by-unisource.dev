// ============================================================
// Xine MCP — Analytics Read Tools
// Thin, consolidated wrappers over lib/queries + lib/queries-advanced.
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getOverviewStats,
  getVisitorTimeseries,
  getTopPages,
  getTopSources,
  getDeviceBreakdown,
  getBrowserBreakdown,
  getCountryBreakdown,
  getTopEvents,
} from "@/lib/queries";
import {
  getSessionAnalytics,
  getNewVsReturning,
  getSessionTimeseries,
  getEngagementMetrics,
  getScrollDepthAnalysis,
  getHourlyHeatmap,
  getPeakHours,
  getEntryPages,
  getExitPages,
  getPageExitRates,
  getUserFlows,
  getPagesPerSessionDistribution,
  getWebVitalsTrends,
  getWebVitalsByPage,
  getErrorTrend,
  getTopErrors,
  getCampaignPerformance,
  getSourceQuality,
  getConnectionTypes,
  getRealtimeStats,
  getSeoOverview,
} from "@/lib/queries-advanced";
import { resolveSiteScope, toolError } from "../auth";
import {
  dateRangeParams,
  filtersParam,
  getUserId,
  guard,
  limitParam,
  ok,
  resolveDateRange,
  siteIdParam,
} from "../helpers";

const DIMENSIONS = [
  "pages",
  "entry_pages",
  "exit_pages",
  "exit_rates",
  "sources",
  "source_quality",
  "campaigns",
  "devices",
  "browsers",
  "countries",
  "events",
  "connection_types",
] as const;

const BEHAVIOR_REPORTS = ["scroll_depth", "user_flows", "hourly_heatmap", "peak_hours"] as const;

export function registerAnalyticsTools(server: McpServer) {
  server.registerTool(
    "xine_get_overview",
    {
      title: "Get traffic overview",
      description:
        "Headline stats for a site and period: unique visitors, pageviews, average visit duration (seconds), bounce rate (%), each with the %-change vs the previous period of the same length.",
      inputSchema: {
        site_id: siteIdParam,
        ...dateRangeParams,
        filters: filtersParam,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const scope = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      return ok(await getOverviewStats(scope, dateRange, args.filters));
    })
  );

  server.registerTool(
    "xine_get_timeseries",
    {
      title: "Get timeseries",
      description:
        'Time-bucketed chart data. metric "traffic" returns visitors + pageviews per bucket; "sessions" returns sessions, bounce rate, and avg duration per bucket. Bucket size adapts to the range (hourly for short ranges, daily for long).',
      inputSchema: {
        site_id: siteIdParam,
        metric: z.enum(["traffic", "sessions"]).describe('"traffic" = visitors/pageviews, "sessions" = session stats.'),
        ...dateRangeParams,
        filters: filtersParam,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const scope = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const data =
        args.metric === "sessions"
          ? await getSessionTimeseries(scope, dateRange)
          : await getVisitorTimeseries(scope, dateRange, args.filters);
      return ok(data);
    })
  );

  server.registerTool(
    "xine_get_breakdown",
    {
      title: "Get breakdown by dimension",
      description:
        "Top-N breakdown of traffic by one dimension: pages, entry_pages, exit_pages, exit_rates, sources (referrers), source_quality (bounce/duration per source), campaigns (UTM), devices, browsers, countries, events (custom events), or connection_types.",
      inputSchema: {
        site_id: siteIdParam,
        dimension: z.enum(DIMENSIONS).describe("Which dimension to break traffic down by."),
        limit: limitParam,
        ...dateRangeParams,
        filters: filtersParam,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const scope = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const limit = args.limit ?? 10;
      const filters = args.filters;

      switch (args.dimension) {
        case "pages":
          return ok(await getTopPages(scope, dateRange, limit, filters));
        case "entry_pages":
          return ok(await getEntryPages(scope, dateRange, limit));
        case "exit_pages":
          return ok(await getExitPages(scope, dateRange, limit));
        case "exit_rates":
          return ok(await getPageExitRates(scope, dateRange, limit));
        case "sources":
          return ok(await getTopSources(scope, dateRange, limit, filters));
        case "source_quality":
          return ok(await getSourceQuality(scope, dateRange, limit));
        case "campaigns":
          return ok(await getCampaignPerformance(scope, dateRange, limit));
        case "devices":
          return ok(await getDeviceBreakdown(scope, dateRange, filters));
        case "browsers":
          return ok(await getBrowserBreakdown(scope, dateRange, limit, filters));
        case "countries":
          return ok(await getCountryBreakdown(scope, dateRange, limit, filters));
        case "events":
          return ok(await getTopEvents(scope, dateRange, limit, filters));
        case "connection_types":
          return ok(await getConnectionTypes(scope, dateRange));
        default:
          toolError(`Unknown dimension. Valid values: ${DIMENSIONS.join(", ")}`);
      }
    })
  );

  server.registerTool(
    "xine_get_realtime",
    {
      title: "Get realtime stats",
      description:
        "Live snapshot of the last 30 minutes: active visitors, pageviews, top active pages, and recent countries.",
      inputSchema: { site_id: siteIdParam },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const scope = await resolveSiteScope(userId, args.site_id);
      return ok(await getRealtimeStats(scope));
    })
  );

  server.registerTool(
    "xine_get_engagement",
    {
      title: "Get engagement report",
      description:
        "Session quality report: session analytics (count, avg duration, bounce rate, pages/session), engagement metrics, new vs returning visitors, and the pages-per-session distribution.",
      inputSchema: {
        site_id: siteIdParam,
        ...dateRangeParams,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const scope = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const [sessionAnalytics, engagement, newVsReturning, pagesPerSession] = await Promise.all([
        getSessionAnalytics(scope, dateRange),
        getEngagementMetrics(scope, dateRange),
        getNewVsReturning(scope, dateRange),
        getPagesPerSessionDistribution(scope, dateRange),
      ]);
      return ok({ sessionAnalytics, engagement, newVsReturning, pagesPerSession });
    })
  );

  server.registerTool(
    "xine_get_behavior",
    {
      title: "Get behavior report",
      description:
        'Visitor behavior reports: "scroll_depth" (how far visitors scroll), "user_flows" (page-to-page navigation paths), "hourly_heatmap" (traffic by day-of-week × hour), or "peak_hours" (busiest hours).',
      inputSchema: {
        site_id: siteIdParam,
        report: z.enum(BEHAVIOR_REPORTS).describe("Which behavior report to fetch."),
        limit: limitParam,
        ...dateRangeParams,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const scope = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      switch (args.report) {
        case "scroll_depth":
          return ok(await getScrollDepthAnalysis(scope, dateRange));
        case "user_flows":
          return ok(await getUserFlows(scope, dateRange, args.limit ?? 15));
        case "hourly_heatmap":
          return ok(await getHourlyHeatmap(scope, dateRange));
        case "peak_hours":
          return ok(await getPeakHours(scope, dateRange));
        default:
          toolError(`Unknown report. Valid values: ${BEHAVIOR_REPORTS.join(", ")}`);
      }
    })
  );

  server.registerTool(
    "xine_get_web_vitals",
    {
      title: "Get Web Vitals",
      description:
        "Core Web Vitals performance data (LCP, FCP, CLS, INP): trends over time plus a per-page breakdown of the slowest pages.",
      inputSchema: {
        site_id: siteIdParam,
        limit: limitParam,
        ...dateRangeParams,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const scope = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const [trends, byPage] = await Promise.all([
        getWebVitalsTrends(scope, dateRange),
        getWebVitalsByPage(scope, dateRange, args.limit ?? 10),
      ]);
      return ok({ trends, byPage });
    })
  );

  server.registerTool(
    "xine_get_js_errors",
    {
      title: "Get JavaScript errors",
      description:
        "JavaScript errors captured on the tracked site: error-count trend over time plus the most frequent error messages.",
      inputSchema: {
        site_id: siteIdParam,
        limit: limitParam,
        ...dateRangeParams,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const scope = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      const [trend, topErrors] = await Promise.all([
        getErrorTrend(scope, dateRange),
        getTopErrors(scope, dateRange, args.limit ?? 10),
      ]);
      return ok({ trend, topErrors });
    })
  );

  server.registerTool(
    "xine_get_seo",
    {
      title: "Get SEO overview",
      description:
        "Organic search traffic report: organic visitors/pageviews, top search engines, top landing pages from search, and the organic-traffic timeseries.",
      inputSchema: {
        site_id: siteIdParam,
        ...dateRangeParams,
      },
      annotations: { readOnlyHint: true },
    },
    guard(async (args, extra) => {
      const userId = getUserId(extra);
      const scope = await resolveSiteScope(userId, args.site_id);
      const dateRange = resolveDateRange(args);
      return ok(await getSeoOverview(scope, dateRange));
    })
  );
}
