'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  SessionAnalytics,
  NewVsReturning,
  EngagementMetrics,
  HeatmapCell,
  PeakHour,
  SessionTimeseriesPoint,
  WebVitalTrend,
  PageWebVital,
  ErrorEntry,
  ErrorTrendPoint,
  ConnectionTypeEntry,
  EntryExitPage,
  PageExitRate,
  ScrollDepthEntry,
  UserFlowStep,
  PagesPerSessionBucket,
  CampaignPerformance,
  SourceQuality,
  RealtimeStats,
} from '@/lib/types';

// ---- Generic fetcher ----

function useFetchData<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!url) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

function buildParams(siteId: string, dateRange: { from: string; to: string }) {
  return new URLSearchParams({ siteId, from: dateRange.from, to: dateRange.to }).toString();
}

// ---- Analytics Page ----

interface AnalyticsData {
  sessionStats: SessionAnalytics;
  newVsReturning: NewVsReturning;
  sessionTimeseries: SessionTimeseriesPoint[];
  engagement: EngagementMetrics;
  heatmap: HeatmapCell[];
  peakHours: PeakHour[];
}

export function useAnalyticsData(siteId: string, dateRange: { from: string; to: string }) {
  const url = `/api/dashboard/analytics?${buildParams(siteId, dateRange)}`;
  return useFetchData<AnalyticsData>(url, [siteId, dateRange.from, dateRange.to]);
}

// ---- Performance Page ----

interface PerformanceData {
  webVitals: WebVitalTrend[];
  vitalsByPage: PageWebVital[];
  errorTrend: ErrorTrendPoint[];
  topErrors: ErrorEntry[];
  connectionTypes: ConnectionTypeEntry[];
}

export function usePerformanceData(siteId: string, dateRange: { from: string; to: string }) {
  const url = `/api/dashboard/performance?${buildParams(siteId, dateRange)}`;
  return useFetchData<PerformanceData>(url, [siteId, dateRange.from, dateRange.to]);
}

// ---- Behavior Page ----

interface BehaviorData {
  entryPages: EntryExitPage[];
  exitPages: EntryExitPage[];
  exitRates: PageExitRate[];
  scrollDepth: ScrollDepthEntry[];
  userFlows: UserFlowStep[];
  pagesPerSession: PagesPerSessionBucket[];
}

export function useBehaviorData(siteId: string, dateRange: { from: string; to: string }) {
  const url = `/api/dashboard/behavior?${buildParams(siteId, dateRange)}`;
  return useFetchData<BehaviorData>(url, [siteId, dateRange.from, dateRange.to]);
}

// ---- Acquisition Page ----

interface AcquisitionData {
  campaigns: CampaignPerformance[];
  sourceQuality: SourceQuality[];
}

export function useAcquisitionData(siteId: string, dateRange: { from: string; to: string }) {
  const url = `/api/dashboard/acquisition?${buildParams(siteId, dateRange)}`;
  return useFetchData<AcquisitionData>(url, [siteId, dateRange.from, dateRange.to]);
}

// ---- Realtime Page ----

export function useRealtimeData(siteId: string) {
  const [data, setData] = useState<RealtimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/dashboard/realtime?siteId=${siteId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
