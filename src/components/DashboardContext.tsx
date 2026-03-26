'use client';

import { createContext, useContext } from 'react';
import type { Site } from '@/lib/types';

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
}

// Compute default date range lazily (avoid SSR/client mismatch)
export function getDefaultDateRange(): DateRangeState {
  const to = new Date();
  // Add 1 day to 'to' so today's data is always included regardless of timezone
  to.setDate(to.getDate() + 1);
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
    label: 'Last 30 days',
  };
}

export const DashboardContext = createContext<DashboardContextValue>({
  selectedSite: 'all',
  setSelectedSite: () => {},
  dateRange: { from: '', to: '', label: 'Last 30 days' },
  setDateRange: () => {},
  sites: [],
  sitesLoading: true,
  refetchSites: () => {},
});

export function useDashboardContext() {
  return useContext(DashboardContext);
}
