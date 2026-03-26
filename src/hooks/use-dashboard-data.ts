'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  OverviewStats,
  TimeseriesPoint,
  TopPage,
  TopSource,
  DeviceBreakdown,
  BrowserStat,
  CountryStat,
  CustomEvent,
  Site,
} from '@/lib/types';

interface DashboardData {
  stats: OverviewStats;
  timeseries: TimeseriesPoint[];
  topPages: TopPage[];
  topSources: TopSource[];
  deviceBreakdown: DeviceBreakdown;
  browserStats: BrowserStat[];
  countryStats: CountryStat[];
  annotations: any[];
}

interface SiteDetailData extends DashboardData {
  site: Site;
  customEvents: CustomEvent[];
}

interface UseDashboardDataReturn {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseSiteDetailReturn {
  data: SiteDetailData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDashboardData(
  siteId: string,
  dateRange: { from: string; to: string }
): UseDashboardDataReturn {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        siteId,
        from: dateRange.from,
        to: dateRange.to,
      });
      const res = await fetch(`/api/dashboard/overview?${params}`);
      if (!res.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [siteId, dateRange.from, dateRange.to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useSiteDetail(
  siteId: string,
  dateRange: { from: string; to: string }
): UseSiteDetailReturn {
  const [data, setData] = useState<SiteDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        siteId,
        from: dateRange.from,
        to: dateRange.to,
      });
      const res = await fetch(`/api/dashboard/site-detail?${params}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Site not found');
          return;
        }
        throw new Error('Failed to fetch site data');
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [siteId, dateRange.from, dateRange.to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
