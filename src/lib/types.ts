// ============================================================
// Xine — TypeScript Types
// Shared types used across the data layer, API routes, and UI.
// ============================================================

/** A tracked website */
export interface Site {
  id: string;
  name: string;
  domain: string;
  api_key: string;
  user_id: string;
  is_public: boolean | null;
  api_access_enabled: boolean | null;
  server_api_key: string;
  created_at: string;
}

/** A single pageview record */
export interface Pageview {
  id: number;
  site_id: string;
  url: string;
  referrer: string;
  title: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  visitor_id: string;
  session_id: string;
  country: string;
  city: string;
  browser: string;
  os: string;
  device: string;
  duration: number;
  connection_type: string | null;
  ttfb: number | null;
  created_at: string;
}

/** A custom event record */
export interface AnalyticsEvent {
  id: number;
  site_id: string;
  name: string;
  properties: Record<string, unknown>;
  visitor_id: string;
  session_id: string;
  url: string;
  created_at: string;
}

/** Date range filter */
export interface DateRange {
  from: Date;
  to: Date;
}

/** Overview stat card data */
export interface OverviewStats {
  visitors: number;
  pageviews: number;
  avgDuration: number;
  bounceRate: number;
  visitorsChange: number;
  pageviewsChange: number;
  durationChange: number;
  bounceRateChange: number;
}

/** A single point on the visitor timeseries chart */
export interface TimeseriesPoint {
  date: string;
  visitors: number;
  pageviews: number;
}

/** Top page entry */
export interface TopPage {
  url: string;
  views: number;
  uniqueVisitors: number;
  avgDuration: number;
}

/** Top referrer/source entry */
export interface TopSource {
  referrer: string;
  visitors: number;
  percentage: number;
}

/** Device type breakdown */
export interface DeviceBreakdown {
  desktop: number;
  mobile: number;
  tablet: number;
}

/** Browser usage entry */
export interface BrowserStat {
  browser: string;
  count: number;
}

/** Country visitor entry */
export interface CountryStat {
  country: string;
  visitors: number;
  flag: string;
}

/** Custom event summary entry */
export interface CustomEvent {
  name: string;
  count: number;
  lastTriggered: string;
}

/** Common query parameters */
export interface QueryParams {
  siteId: string | "all";
  dateRange: DateRange;
}

// ============================================================
// ADVANCED ANALYTICS TYPES
// ============================================================

/** Session analytics overview */
export interface SessionAnalytics {
  totalSessions: number;
  avgPagesPerSession: number;
  avgSessionDuration: number;
  newVisitorPercent: number;
  returningVisitorPercent: number;
  sessionsChange: number;
  pagesPerSessionChange: number;
  sessionDurationChange: number;
}

/** New vs Returning breakdown */
export interface NewVsReturning {
  newVisitors: number;
  returningVisitors: number;
  newPercent: number;
  returningPercent: number;
}

/** Engagement metrics */
export interface EngagementMetrics {
  avgEngagementScore: number;
  highlyEngaged: number;
  moderatelyEngaged: number;
  lowEngagement: number;
  avgScrollDepth: number;
  avgTimeOnPage: number;
}

/** Scroll depth distribution */
export interface ScrollDepthEntry {
  depth: number;
  count: number;
  percentage: number;
}

/** Heatmap cell for hour×day grid */
export interface HeatmapCell {
  hour: number;
  day: number;
  dayLabel: string;
  value: number;
}

/** Peak hour entry */
export interface PeakHour {
  hour: number;
  visitors: number;
  label: string;
}

/** Entry/Exit page entry */
export interface EntryExitPage {
  url: string;
  count: number;
  percentage: number;
}

/** Exit rate per page */
export interface PageExitRate {
  url: string;
  views: number;
  exits: number;
  exitRate: number;
}

/** Web Vital data point */
export interface WebVitalPoint {
  date: string;
  value: number;
}

/** Web Vital trend */
export interface WebVitalTrend {
  metric: string;
  data: WebVitalPoint[];
  current: number;
  rating: "good" | "needs-improvement" | "poor";
}

/** Per-page Web Vital */
export interface PageWebVital {
  url: string;
  lcp: number | null;
  fcp: number | null;
  cls: number | null;
  inp: number | null;
  ttfb: number | null;
}

/** Error entry */
export interface ErrorEntry {
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  source?: string;
}

/** Error trend point */
export interface ErrorTrendPoint {
  date: string;
  count: number;
}

/** Campaign performance */
export interface CampaignPerformance {
  campaign: string;
  source: string;
  medium: string;
  sessions: number;
  bounceRate: number;
  avgDuration: number;
  pagesPerSession: number;
}

/** Source quality entry */
export interface SourceQuality {
  source: string;
  visitors: number;
  sessions: number;
  bounceRate: number;
  avgDuration: number;
  avgPages: number;
  qualityScore: number;
}

/** Realtime stats */
export interface RealtimeStats {
  activeVisitors: number;
  pageviewsLast30Min: number;
  activeBots: number;
  botPageviewsLast30Min: number;
  activePages: { url: string; viewers: number }[];
  topCountries: { country: string; flag: string; count: number }[];
}

/** Connection type distribution */
export interface ConnectionTypeEntry {
  type: string;
  count: number;
  percentage: number;
}

/** Session timeseries point */
export interface SessionTimeseriesPoint {
  date: string;
  sessions: number;
}

/** User flow step */
export interface UserFlowStep {
  from: string;
  to: string;
  count: number;
}

/** Pages per session distribution */
export interface PagesPerSessionBucket {
  pages: string;
  count: number;
  percentage: number;
}

