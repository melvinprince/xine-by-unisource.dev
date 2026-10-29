"use client";

import { Search, BarChart3, Users, MousePointerClick } from "lucide-react";
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
  /** Sessions whose entry source is organic search — the GSC/BWT "clicks" analogue. */
  organicSessions: number;
  organicVisitors: number;
  organicPageviews: number;
  organicBounceRate: number;
  paidSearchSessions: number;
  timeseries: (import('@/lib/types').TimeseriesPoint & { sessions: number })[];
  topEngines: { engine: string; sessions: number; visitors: number; views: number }[];
  engineHosts: { engine: string; host: string; sessions: number }[];
  topLandingPages: { url: string; entrances: number; visitors: number }[];
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
  
  const hasData = data && (data.organicSessions > 0 || data.organicPageviews > 0);
  
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
        description="Organic search visits by engine and landing page (paid search excluded)"
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
        <StatCard
          label={<>Organic Visits <HelpTooltip title="Organic Visits" content="Visits (sessions) that started from a search engine results page — the closest equivalent to Clicks in Google Search Console and Bing Webmaster Tools. Paid clicks (gclid/msclkid, utm_medium=cpc), AI assistants and webmail are excluded. To compare with GSC, choose complete days; GSC reports days in Pacific Time." /></>}
          value={data.organicSessions}
          icon={<MousePointerClick size={20} />}
          delay={0.1}
        />
        <StatCard
          label={<>Unique Visitors (daily) <HelpTooltip title="Unique Visitors" content="Distinct visitor IDs among organic visits. IDs are a privacy-preserving daily hash, so the same person on two days counts twice and two searches on one day count once." /></>}
          value={data.organicVisitors}
          icon={<Users size={20} />}
          delay={0.15}
        />
        <StatCard label="Pageviews in Organic Visits" value={data.organicPageviews} icon={<BarChart3 size={20} />} delay={0.2} />
        <StatCard
          label={<>Paid Search Visits <HelpTooltip title="Paid Search Visits" content="Visits from search ads (gclid/gbraid/wbraid/msclkid or utm_medium=cpc/ppc/paid). Shown for reference; not counted as organic." /></>}
          value={data.paidSearchSessions}
          icon={<Search size={20} />}
          delay={0.25}
        />
      </div>

      {/* Visitor Trend Chart */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <SectionHeader title="Organic Traffic Trend" />
        <VisitorChart data={data.timeseries} annotations={[]} primaryDataKey="sessions" primaryLabel="Organic visits" />
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
                key: 'sessions',
                label: 'Organic Visits',
                align: 'right',
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toLocaleString()}</span>,
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
                key: 'entrances',
                label: 'Entrances (visits)',
                align: 'right',
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toLocaleString()}</span>,
              },
              {
                key: 'visitors',
                label: 'Visitors',
                align: 'right',
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toLocaleString()}</span>,
              },
            ]}
            data={data.topLandingPages}
          />
          <DataTable
            title="Search Referrer Hosts"
            delay={0.6}
            columns={[
              {
                key: 'host',
                label: 'Referrer Host',
                render: (v) => (
                  <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{String(v)}</span>
                ),
              },
              {
                key: 'engine',
                label: 'Engine',
                render: (v) => <span style={{ color: 'var(--color-text-secondary)' }}>{String(v)}</span>,
              },
              {
                key: 'sessions',
                label: 'Organic Visits',
                align: 'right',
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toLocaleString()}</span>,
              },
            ]}
            data={data.engineHosts}
          />
        </div>
      </div>
    </div>
  );
}
