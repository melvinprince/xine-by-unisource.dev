'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ActiveFilters } from '@/components/DashboardContext';
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

function buildParams(siteId: string, dateRange: { from: string; to: string }, filters?: ActiveFilters) {
  const params = new URLSearchParams({ siteId, from: dateRange.from, to: dateRange.to });
  if (filters) {
    Object.entries(filters).forEach(([key, values]) => {
      if (values && values.length > 0) {
        params.set(key, values.join(','));
      }
    });
  }
  return params.toString();
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

export function useAnalyticsData(siteId: string, dateRange: { from: string; to: string }, filters?: ActiveFilters) {
  const url = `/api/dashboard/analytics?${buildParams(siteId, dateRange, filters)}`;
  const filterStr = filters ? JSON.stringify(filters) : '';
  return useFetchData<AnalyticsData>(url, [siteId, dateRange.from, dateRange.to, filterStr]);
}

// ---- Performance Page ----

interface PerformanceData {
  webVitals: WebVitalTrend[];
  vitalsByPage: PageWebVital[];
  errorTrend: ErrorTrendPoint[];
  topErrors: ErrorEntry[];
  connectionTypes: ConnectionTypeEntry[];
}

export function usePerformanceData(siteId: string, dateRange: { from: string; to: string }, filters?: ActiveFilters) {
  const url = `/api/dashboard/performance?${buildParams(siteId, dateRange, filters)}`;
  const filterStr = filters ? JSON.stringify(filters) : '';
  return useFetchData<PerformanceData>(url, [siteId, dateRange.from, dateRange.to, filterStr]);
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

export function useBehaviorData(siteId: string, dateRange: { from: string; to: string }, filters?: ActiveFilters) {
  const url = `/api/dashboard/behavior?${buildParams(siteId, dateRange, filters)}`;
  const filterStr = filters ? JSON.stringify(filters) : '';
  return useFetchData<BehaviorData>(url, [siteId, dateRange.from, dateRange.to, filterStr]);
}

// ---- Acquisition Page ----

interface AcquisitionData {
  campaigns: CampaignPerformance[];
  sourceQuality: SourceQuality[];
}

export function useAcquisitionData(siteId: string, dateRange: { from: string; to: string }, filters?: ActiveFilters) {
  const url = `/api/dashboard/acquisition?${buildParams(siteId, dateRange, filters)}`;
  const filterStr = filters ? JSON.stringify(filters) : '';
  return useFetchData<AcquisitionData>(url, [siteId, dateRange.from, dateRange.to, filterStr]);
}

// ---- Realtime Page ----

export function useRealtimeData(siteId: string, filters?: ActiveFilters) {
  const [data, setData] = useState<RealtimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterStr = filters ? JSON.stringify(filters) : '';

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams({ siteId });
      if (filters) {
        Object.entries(filters).forEach(([key, values]) => {
          if (values && values.length > 0) {
            params.set(key, values.join(','));
          }
        });
      }
      const res = await fetch(`/api/dashboard/realtime?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }, [siteId, filterStr]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
