'use client';
import { useState, useEffect } from 'react';

import { Users, Eye, Clock, ArrowDownUp, BarChart3, Settings } from 'lucide-react';
import StatCard from '@/components/StatCard';
import VisitorChart from '@/components/charts/VisitorChart';
import DonutChart from '@/components/charts/DonutChart';
import BarChart from '@/components/charts/BarChart';
import DataTable from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import SectionHeader from '@/components/SectionHeader';
import HelpTooltip from '@/components/HelpTooltip';
import SiteFavicons from '@/components/SiteFavicons';
import { LoadingState, EmptyState, ErrorState } from '@/components/DataStates';
import { useDashboardContext } from '@/components/DashboardContext';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { formatDuration } from '@/lib/utils';

export default function DashboardPage() {
  const { selectedSite, dateRange, activeFilters, toggleFilter, sites } = useDashboardContext();
  const { data, loading, error, refetch } = useDashboardData(selectedSite, dateRange, activeFilters);

  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([]);
  const [showCustomize, setShowCustomize] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('dashboard_hidden_widgets');
    if (saved) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHiddenWidgets(JSON.parse(saved));
      } catch {
        // Ignore error
      }
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
        icon={<BarChart3 size={28} />}
        title="No analytics data yet"
        description="Once your tracking script sends pageviews, your dashboard will populate here."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* ── Page Header ────────────────────────────────────── */}
      <PageHeader
        title="Overview"
        description="Your site performance at a glance"
        icon={<BarChart3 size={20} />}
        actions={
          <button 
            onClick={() => setShowCustomize(!showCustomize)}
            className="btn-ghost"
            style={{ gap: '0.375rem', fontSize: '0.75rem' }}
          >
            <Settings size={14} />
            Customize
          </button>
        }
      />
      
      {/* ── Customize Panel ────────────────────────────────── */}
      {showCustomize && (
        <div 
          className="glass-card"
          style={{ 
            display: 'flex', 
            gap: '1rem', 
            flexWrap: 'wrap', 
            padding: '1rem 1.25rem',
            animation: 'slide-down 0.2s ease-out',
          }}
        >
          <span style={{ 
            width: '100%', 
            fontSize: '0.75rem', 
            fontWeight: 600, 
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            Toggle Sections
          </span>
          {['stats', 'trend', 'pages', 'sources', 'devices', 'browsers', 'countries'].map(id => (
            <label 
              key={id} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                fontSize: '0.8125rem', 
                color: hiddenWidgets.includes(id) ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                cursor: 'pointer',
                transition: 'color 0.15s ease',
              }}
            >
              <input 
                type="checkbox" 
                checked={!hiddenWidgets.includes(id)} 
                onChange={() => toggleWidget(id)}
                style={{ accentColor: 'var(--color-accent)' }}
              />
              {id.charAt(0).toUpperCase() + id.slice(1)}
            </label>
          ))}
        </div>
      )}

      {/* ── KPI Stat Cards ─────────────────────────────────── */}
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
            invertTrend={true}
          />
        </div>
      )}

      {/* ── Visitor Trend Chart ─────────────────────────────── */}
      {!hiddenWidgets.includes('trend') && (
        <VisitorChart data={data.timeseries} annotations={data.annotations} />
      )}

      {/* ── Two-Column: Top Pages + Top Sources ───────────── */}
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
                render: (v, row) => (
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span
                      style={{
                        color: 'var(--color-accent)',
                        fontWeight: 500,
                      }}
                    >
                      {String(v)}
                    </span>
                    {selectedSite === 'all' && row.siteIds && (
                      <SiteFavicons siteIds={row.siteIds} sites={sites} />
                    )}
                  </div>
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
            onRowClick={(row) => toggleFilter('pages', row.url)}
            selectedValues={activeFilters.pages}
            selectableKey="url"
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
                render: (v, row) => (
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500 }}>{String(v)}</span>
                    {selectedSite === 'all' && row.siteIds && (
                      <SiteFavicons siteIds={row.siteIds} sites={sites} />
                    )}
                  </div>
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
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {Number(v).toFixed(1)}%
                    </span>
                  </div>
                ),
              },
            ]}
            data={data.topSources}
            onRowClick={(row) => toggleFilter('sources', row.referrer)}
            selectedValues={activeFilters.sources}
            selectableKey="referrer"
          />
        )}
      </div>

      {/* ── Three-Column: Devices, Browsers, Countries ───── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
          gap: '1rem',
        }}
      >
        {!hiddenWidgets.includes('devices') && (
          <DonutChart
            data={data.deviceBreakdown}
            onSegmentClick={(device) => toggleFilter('devices', device)}
            selectedDevices={activeFilters.devices}
          />
        )}
        {!hiddenWidgets.includes('browsers') && (
          <BarChart
            data={data.browserStats}
            onBarClick={(browser) => toggleFilter('browsers', browser)}
            selectedBrowsers={activeFilters.browsers}
          />
        )}

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
                render: (v) => (
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {Number(v).toLocaleString()}
                  </span>
                ),
              },
            ]}
            data={data.countryStats}
            onRowClick={(row) => toggleFilter('countries', row.country)}
            selectedValues={activeFilters.countries}
            selectableKey="country"
          />
        )}
      </div>
    </div>
  );
}
