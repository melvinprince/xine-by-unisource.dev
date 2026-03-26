'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import {
  DashboardContext,
  getDefaultDateRange,
  type DateRangeState,
} from '@/components/DashboardContext';
import { useSites } from '@/hooks/use-sites';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedSite, setSelectedSite] = useState('all');
  const [dateRange, setDateRange] = useState<DateRangeState>(getDefaultDateRange);
  const { sites, loading: sitesLoading, refetch: refetchSites } = useSites();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <DashboardContext.Provider
      value={{
        selectedSite,
        setSelectedSite,
        dateRange,
        setDateRange,
        sites,
        sitesLoading,
        refetchSites,
      }}
    >
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar 
          sites={sites.map((s) => ({ id: s.id, name: s.name }))} 
          onCollapse={setSidebarCollapsed}
        />

        {/* Main Content */}
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
          <Header
            title="Dashboard"
            sites={sites}
            selectedSite={selectedSite}
            onSiteChange={setSelectedSite}
            onDateRangeChange={setDateRange}
          />

          <main
            style={{
              flex: 1,
              padding: '1.5rem 2rem',
              overflowY: 'auto',
            }}
          >
            {children}
          </main>
        </div>

        <style jsx global>{`
          @media (max-width: 768px) {
            .dashboard-main {
              margin-left: 0 !important;
            }
            .dashboard-header {
              padding-left: 4rem !important;
              padding-right: 1rem !important;
            }
            .dashboard-main main {
              padding: 1rem !important;
            }
          }
        `}</style>
      </div>
    </DashboardContext.Provider>
  );
}
