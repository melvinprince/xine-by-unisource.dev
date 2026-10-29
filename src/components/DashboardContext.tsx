'use client';

import { createContext, useContext } from 'react';
import type { Site, User } from '@/lib/types';

export interface ActiveFilters {
  countries: string[];
  browsers: string[];
  devices: string[];
  sources: string[];
  pages: string[];
}

export interface DateRangeState {
  from: string;
  to: string;
  label: string;
}

interface DashboardContextValue {
  selectedSite: string;
  setSelectedSite: (siteId: string) => void;
  dateRange: DateRangeState;
  setDateRange: (range: DateRangeState) => void;
  sites: Site[];
  sitesLoading: boolean;
  refetchSites: () => void;
  user: User | null;
  userLoading: boolean;
  activeFilters: ActiveFilters;
  setActiveFilters: (filters: ActiveFilters) => void;
  toggleFilter: (dimension: keyof ActiveFilters, value: string) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
}

/**
 * The viewer's IANA timezone (e.g. "Europe/Berlin"), sent to the API as
 * `tz` so day buckets and date-only bounds are the viewer's calendar days
 * rather than UTC days. The server validates it and falls back to UTC.
 */
export function getViewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * "Last N days" = N calendar days in the viewer's timezone, ending with
 * today: from local midnight N−1 days ago to the end of today, sent as full
 * ISO instants. (It used to send UTC date strings with `to` = tomorrow, so
 * "Last 30 days" covered 31–32 days and the window edges were UTC
 * midnights.) N = 1 is "Today". The previous-period comparison clamps the
 * not-yet-elapsed part of today on the server.
 */
export function getLastNDaysRange(days: number): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (Math.max(days, 1) - 1));
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  endOfToday.setMilliseconds(-1);
  return { from: from.toISOString(), to: endOfToday.toISOString() };
}

// Compute default date range lazily (avoid SSR/client mismatch)
export function getDefaultDateRange(): DateRangeState {
  return {
    ...getLastNDaysRange(30),
    label: 'Last 30 days',
  };
}

export const initialFilters: ActiveFilters = {
  countries: [],
  browsers: [],
  devices: [],
  sources: [],
  pages: [],
};

export const DashboardContext = createContext<DashboardContextValue>({
  selectedSite: 'all',
  setSelectedSite: () => {},
  dateRange: { from: '', to: '', label: 'Last 30 days' },
  setDateRange: () => {},
  sites: [],
  sitesLoading: true,
  refetchSites: () => {},
  user: null,
  userLoading: true,
  activeFilters: initialFilters,
  setActiveFilters: () => {},
  toggleFilter: () => {},
  clearFilters: () => {},
  hasActiveFilters: false,
});

export function useDashboardContext() {
  return useContext(DashboardContext);
}

