'use client';

import { useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ActiveFilterBar from '@/components/ActiveFilterBar';
import {
  DashboardContext,
  getDefaultDateRange,
  type DateRangeState,
  type ActiveFilters,
  initialFilters,
} from '@/components/DashboardContext';
import { useSites } from '@/hooks/use-sites';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedSite, setSelectedSite] = useState('all');
  const [dateRange, setDateRange] = useState<DateRangeState>(getDefaultDateRange);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(initialFilters);
  const { sites, loading: sitesLoading, refetch: refetchSites } = useSites();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleSiteChange = useCallback((siteId: string) => {
    setSelectedSite(siteId);
    setActiveFilters(initialFilters);
  }, []);

  const toggleFilter = useCallback((dimension: keyof ActiveFilters, value: string) => {
    setActiveFilters((prev) => {
      const currentValues = prev[dimension];
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];
      return {
        ...prev,
        [dimension]: newValues,
      };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilters(initialFilters);
  }, []);

  const hasActiveFilters = Object.values(activeFilters).some((arr) => arr.length > 0);

  return (
    <DashboardContext.Provider
      value={{
        selectedSite,
        setSelectedSite: handleSiteChange,
        dateRange,
        setDateRange,
        sites,
        sitesLoading,
        refetchSites,
        activeFilters,
        setActiveFilters,
        toggleFilter,
        clearFilters,
        hasActiveFilters,
      }}
    >
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar 
          sites={sites.map((s) => ({ id: s.id, name: s.name }))} 
          onCollapse={setSidebarCollapsed}
        />

        {/* Main Content Area */}
        <div
          className="dashboard-main"
          style={{
            flex: 1,
            marginLeft: sidebarCollapsed ? '72px' : '260px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            transition: 'margin-left 0.35s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          {/* Sticky Header */}
          <Header
            title="Dashboard"
            sites={sites}
            selectedSite={selectedSite}
            onSiteChange={handleSiteChange}
            onDateRangeChange={setDateRange}
          />

          {/* Active Filter Bar — only visible when filters are applied */}
          <ActiveFilterBar />

          {/* Page Content */}
          <main
            style={{
              flex: 1,
              padding: '1.5rem 2rem',
              overflowY: 'auto',
              maxWidth: '1400px',
              width: '100%',
              margin: '0 auto',
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </DashboardContext.Provider>
  );
}
