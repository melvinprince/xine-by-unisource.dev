"use client";

import { Search, BarChart3 } from "lucide-react";
import StatCard from "@/components/StatCard";
import VisitorChart from "@/components/charts/VisitorChart";
import DataTable from "@/components/DataTable";
import HelpTooltip from "@/components/HelpTooltip";
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
  const { selectedSite, dateRange } = useDashboardContext();
  const { data, loading, error, refetch } = useDashboardFetch<SEOData>(
    "/api/dashboard/seo",
    selectedSite,
    dateRange
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SEO Overview <HelpTooltip title="SEO Overview" content="Analyze organic traffic from search engines. Tracks visitors arriving from Google, Bing, Yahoo, DuckDuckGo and other search engines." /></h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>Analyze organic traffic performance and discoverability.</p>
        </div>
      </div>

      {/* Stat Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Organic Visitors" value={data.organicVisitors} icon={<Search size={20} />} delay={0.1} />
        <StatCard label="Organic Pageviews" value={data.organicPageviews} icon={<BarChart3 size={20} />} delay={0.2} />
      </div>

      {/* Visitor Trend Chart */}
      <VisitorChart data={data.timeseries} annotations={[]} />

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DataTable
          title="Top Search Engines" delay={0.4}
          columns={[
            { key: 'engine', label: 'Search Engine', render: (v) => <span className="font-medium">{String(v)}</span> },
            { key: 'visitors', label: 'Visitors', align: 'right' },
            { key: 'views', label: 'Pageviews', align: 'right' },
          ]}
          data={data.topEngines}
        />
        <DataTable
          title="Organic Landing Pages" delay={0.5}
          columns={[
            { key: 'url', label: 'Landing Page', render: (v) => <span className="text-emerald-400 font-medium">{String(v)}</span> },
            { key: 'visitors', label: 'Organic Entrances', align: 'right' },
          ]}
          data={data.topLandingPages}
        />
      </div>
    </div>
  );
}
