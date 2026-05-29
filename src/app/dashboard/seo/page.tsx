"use client";

import { Search, BarChart3 } from "lucide-react";
import StatCard from "@/components/StatCard";
import VisitorChart from "@/components/charts/VisitorChart";
import DataTable from "@/components/DataTable";
import HelpTooltip from "@/components/HelpTooltip";
import PageHeader from "@/components/PageHeader";
import SectionHeader from "@/components/SectionHeader";
import { LoadingState, EmptyState, ErrorState } from "@/components/DataStates";
import { useDashboardContext } from "@/components/DashboardContext";
import { useDashboardFetch } from "@/hooks/use-dashboard-data";

interface SEOData {
  organicVisitors: number;
  organicPageviews: number;
  timeseries: import('@/lib/types').TimeseriesPoint[];
  topEngines: { engine: string; visitors: number; views: number }[];
  topLandingPages: { url: string; visitors: number }[];
}

export default function SEOOverviewPage() {
  const { selectedSite, dateRange, activeFilters } = useDashboardContext();
  const { data, loading, error, refetch } = useDashboardFetch<SEOData>(
    "/api/dashboard/seo",
    selectedSite,
    dateRange,
    activeFilters
  );

  if (loading) return <LoadingState message="Analyzing search traffic..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  
  const hasData = data && (data.organicPageviews > 0 || data.organicVisitors > 0);
  
  if (!hasData) return (
    <EmptyState
      icon={<Search size={48} />}
      title="No Organic Traffic Detected"
      description="It looks like you haven't received traffic from known search engines in this date range. Try expanding the date filter."
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="SEO"
        description="Organic search traffic and landing page performance"
        icon={<Search size={20} />}
      />

      {/* Stat Cards Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          gap: '1rem',
        }}
      >
        <StatCard label="Organic Visitors" value={data.organicVisitors} icon={<Search size={20} />} delay={0.1} />
        <StatCard label="Organic Pageviews" value={data.organicPageviews} icon={<BarChart3 size={20} />} delay={0.2} />
      </div>

      {/* Visitor Trend Chart */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <SectionHeader title="Organic Traffic Trend" />
        <VisitorChart data={data.timeseries} annotations={[]} />
      </div>

      {/* Tables */}
      <div>
        <SectionHeader title="Search Engines & Landing Pages" />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
            gap: '1rem',
          }}
        >
          <DataTable
            title="Top Search Engines"
            delay={0.4}
            columns={[
              {
                key: 'engine',
                label: 'Search Engine',
                render: (v) => (
                  <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{String(v)}</span>
                ),
              },
              {
                key: 'visitors',
                label: 'Visitors',
                align: 'right',
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toLocaleString()}</span>,
              },
              {
                key: 'views',
                label: 'Pageviews',
                align: 'right',
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toLocaleString()}</span>,
              },
            ]}
            data={data.topEngines}
          />
          <DataTable
            title="Organic Landing Pages"
            delay={0.5}
            columns={[
              {
                key: 'url',
                label: 'Landing Page',
                render: (v) => (
                  <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>{String(v)}</span>
                ),
              },
              {
                key: 'visitors',
                label: 'Organic Entrances',
                align: 'right',
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toLocaleString()}</span>,
              },
            ]}
            data={data.topLandingPages}
          />
        </div>
      </div>
    </div>
  );
}
