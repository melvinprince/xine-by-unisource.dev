'use client';
import { useState, useEffect } from 'react';

import { Users, Eye, Clock, ArrowDownUp, BarChart3, Settings } from 'lucide-react';
import StatCard from '@/components/StatCard';
import VisitorChart from '@/components/charts/VisitorChart';
import DonutChart from '@/components/charts/DonutChart';
import BarChart from '@/components/charts/BarChart';
import DataTable from '@/components/DataTable';
import HelpTooltip from '@/components/HelpTooltip';
import { LoadingState, EmptyState, ErrorState } from '@/components/DataStates';
import { useDashboardContext } from '@/components/DashboardContext';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { formatDuration } from '@/lib/utils';

export default function DashboardPage() {
  const { selectedSite, dateRange } = useDashboardContext();
  const { data, loading, error, refetch } = useDashboardData(selectedSite, dateRange);

  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([]);
  const [showCustomize, setShowCustomize] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('dashboard_hidden_widgets');
    if (saved) {
      try { setHiddenWidgets(JSON.parse(saved)); } catch(e){}
    }
  }, []);

  const toggleWidget = (id: string) => {
    const newHidden = hiddenWidgets.includes(id) 
      ? hiddenWidgets.filter(w => w !== id)
      : [...hiddenWidgets, id];
    setHiddenWidgets(newHidden);
    localStorage.setItem('dashboard_hidden_widgets', JSON.stringify(newHidden));
  };

  if (loading) return <LoadingState message="Loading analytics..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState icon={<BarChart3 size={48} />} />;

  const stats = data.stats;
  const hasData = stats.pageviews > 0 || stats.visitors > 0;

  if (!hasData) {
    return (
      <EmptyState
        icon={<BarChart3 size={48} />}
        title="No analytics data yet"
        description="Once your tracking script sends pageviews, your dashboard will populate here."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
      
      {/* Customize Toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-0.5rem' }}>
        <button 
          onClick={() => setShowCustomize(!showCustomize)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', transition: 'all 0.2s', cursor: 'pointer' }}
        >
          <Settings size={14} /> Customize
        </button>
      </div>
      
      {showCustomize && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', background: 'var(--color-bg-raised)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', marginBottom: '1rem' }}>
           <div style={{ width: '100%', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Visibility Toggles</div>
           {['stats', 'trend', 'pages', 'sources', 'devices', 'browsers', 'countries'].map(id => (
             <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
               <input type="checkbox" checked={!hiddenWidgets.includes(id)} onChange={() => toggleWidget(id)} />
               {id.charAt(0).toUpperCase() + id.slice(1)}
             </label>
           ))}
        </div>
      )}

      {/* ── Stat Cards Row ──────────────────────────────── */}
      {!hiddenWidgets.includes('stats') && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
            gap: '1rem',
          }}
        >
          <StatCard
            label={<>Visitors <HelpTooltip title="Visitors" content="Unique visitors identified by a browser-level fingerprint. Each device/browser combination counts as one visitor." /></>}
            value={stats.visitors}
            change={stats.visitorsChange}
            icon={<Users size={20} />}
            delay={0.1}
          />
          <StatCard
            label={<>Pageviews <HelpTooltip title="Pageviews" content="Total number of pages loaded. A single visitor can generate multiple pageviews across their session." /></>}
            value={stats.pageviews}
            change={stats.pageviewsChange}
            icon={<Eye size={20} />}
            delay={0.15}
          />
          <StatCard
            label={<>Avg. Duration <HelpTooltip title="Average Duration" content="Average time visitors spend on your site per session. Calculated from page load to the last recorded interaction." /></>}
            value={stats.avgDuration}
            change={stats.durationChange}
            format="duration"
            icon={<Clock size={20} />}
            delay={0.2}
          />
          <StatCard
            label={<>Bounce Rate <HelpTooltip title="Bounce Rate" content="Percentage of visitors who left after viewing only one page. A lower bounce rate indicates better engagement." /></>}
            value={stats.bounceRate}
            change={stats.bounceRateChange}
            format="percent"
            icon={<ArrowDownUp size={20} />}
            delay={0.25}
          />
        </div>
      )}

      {/* ── Visitor Trend Chart ─────────────────────────── */}
      {!hiddenWidgets.includes('trend') && (
        <VisitorChart data={data.timeseries} annotations={data.annotations} />
      )}

      {/* ── Two-Column: Top Pages + Top Sources ─────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
          gap: '1rem',
        }}
      >
        {!hiddenWidgets.includes('pages') && (
          <DataTable
            title="Top Pages"
            delay={0.5}
            columns={[
              {
                key: 'url' as const,
                label: 'Page',
                render: (v) => (
                  <span
                    style={{
                      color: 'var(--color-accent)',
                      fontWeight: 500,
                    }}
                  >
                    {String(v)}
                  </span>
                ),
              },
              { key: 'views' as const, label: 'Views', align: 'right' as const },
              {
                key: 'uniqueVisitors' as const,
                label: 'Unique',
                align: 'right' as const,
              },
              {
                key: 'avgDuration' as const,
                label: 'Duration',
                align: 'right' as const,
                render: (v) => formatDuration(Number(v)),
              },
            ]}
            data={data.topPages}
          />
        )}

        {!hiddenWidgets.includes('sources') && (
          <DataTable
            title="Top Sources"
            delay={0.55}
            columns={[
              {
                key: 'referrer' as const,
                label: 'Source',
                render: (v) => (
                  <span style={{ fontWeight: 500 }}>{String(v)}</span>
                ),
              },
              {
                key: 'visitors' as const,
                label: 'Visitors',
                align: 'right' as const,
              },
              {
                key: 'percentage' as const,
                label: '%',
                align: 'right' as const,
                render: (v) => (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div
                      style={{
                        width: '50px',
                        height: '4px',
                        borderRadius: '4px',
                        background: 'var(--color-border-subtle)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Number(v)}%`,
                          height: '100%',
                          borderRadius: '4px',
                          background: 'var(--color-accent)',
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                    <span>{Number(v).toFixed(1)}%</span>
                  </div>
                ),
              },
            ]}
            data={data.topSources}
          />
        )}
      </div>

      {/* ── Three-Column: Devices, Browsers, Countries ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gap: '1rem',
        }}
      >
        {!hiddenWidgets.includes('devices') && <DonutChart data={data.deviceBreakdown} />}
        {!hiddenWidgets.includes('browsers') && <BarChart data={data.browserStats} />}

        {/* Countries */}
        {!hiddenWidgets.includes('countries') && (
          <DataTable
            title="Top Countries"
            delay={0.75}
            columns={[
              {
                key: 'flag' as const,
                label: '',
                sortable: false,
                width: '30px',
                render: (v) => (
                  <span style={{ fontSize: '1.25rem' }}>{String(v)}</span>
                ),
              },
              { key: 'country' as const, label: 'Country' },
              {
                key: 'visitors' as const,
                label: 'Visitors',
                align: 'right' as const,
                render: (v) => Number(v).toLocaleString(),
              },
            ]}
            data={data.countryStats}
          />
        )}
      </div>
    </div>
  );
}
