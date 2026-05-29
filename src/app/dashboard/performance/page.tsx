'use client';

import {
  Gauge,
  AlertTriangle,
  Wifi,
} from 'lucide-react';
import WebVitalsGauge from '@/components/charts/WebVitalsGauge';
import DataTable from '@/components/DataTable';
import FunnelChart from '@/components/charts/FunnelChart';
import HelpTooltip from '@/components/HelpTooltip';
import PageHeader from '@/components/PageHeader';
import SectionHeader from '@/components/SectionHeader';
import { LoadingState, EmptyState, ErrorState } from '@/components/DataStates';
import { useDashboardContext } from '@/components/DashboardContext';
import { usePerformanceData } from '@/hooks/use-advanced-data';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function PerformancePage() {
  const { selectedSite, dateRange, activeFilters } = useDashboardContext();
  const { data, loading, error, refetch } = usePerformanceData(
    selectedSite,
    dateRange,
    activeFilters
  );

  if (loading) return <LoadingState message="Analyzing site performance..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState icon={<Gauge size={48} />} />;

  const { webVitals, vitalsByPage, errorTrend, topErrors, connectionTypes } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Page Header ─────────────────────────────────── */}
      <PageHeader
        title="Web Vitals"
        description="Core Web Vitals and performance metrics"
        icon={<Gauge size={20} />}
      />

      {/* ── Web Vitals Gauges ──────────────────────────── */}
      <div style={{ animation: 'slide-down 0.2s ease-out' }}>
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <SectionHeader title="Core Web Vitals" description="Real-time performance scores from your visitors" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
              gap: '1rem',
            }}
          >
            {webVitals.map((vital) => (
              <WebVitalsGauge
                key={vital.metric}
                metric={vital.metric}
                value={vital.current}
                rating={vital.rating}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Web Vital Trends ──────────────────────────── */}
      <div className="glass-card" style={{ padding: '1.25rem', animation: 'slide-down 0.2s ease-out' }}>
        <SectionHeader title="Web Vitals Trend" description="Performance metrics over time" />
        {webVitals
          .filter((v) => v.data.length > 0)
          .slice(0, 3)
          .map((vital, idx) => (
            <div key={vital.metric} style={{ marginBottom: idx < 2 ? '1rem' : 0 }}>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  marginBottom: '0.25rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {vital.metric}
              </div>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={vital.data}>
                  <defs>
                    <linearGradient id={`grad-${vital.metric}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={`var(--color-chart-${(idx % 5) + 1})`} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={`var(--color-chart-${(idx % 5) + 1})`} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-bg-raised)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.75rem',
                    }}
                    formatter={(value) => {
                      const v = Number(value);
                      return vital.metric === 'CLS'
                        ? [(v / 1000).toFixed(3)]
                        : [`${v}ms`];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={`var(--color-chart-${(idx % 5) + 1})`}
                    fill={`url(#grad-${vital.metric})`}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ))}
      </div>

      {/* ── Two Column: Errors + Connection Types ─────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
          gap: '1rem',
          animation: 'slide-down 0.2s ease-out',
        }}
      >
        {/* Error Trend */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <SectionHeader title="JS Errors Over Time" />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginTop: '-0.75rem',
              marginBottom: '1rem',
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
            }}
          >
            <AlertTriangle size={14} style={{ color: 'var(--color-danger)' }} />
          </div>
          {errorTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={errorTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                <XAxis
                  dataKey="date"
                  stroke="var(--color-text-muted)"
                  fontSize={10}
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis stroke="var(--color-text-muted)" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-bg-raised)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.75rem',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-danger)"
                  fill="var(--color-danger-subtle)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div
              style={{
                height: '150px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-success)',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              ✓ No JS errors detected
            </div>
          )}
        </div>

        {/* Connection Types */}
        <FunnelChart
          title="Network Connection Types"
          data={connectionTypes.map((c) => ({
            label: c.type,
            value: c.count,
            percentage: c.percentage,
          }))}
        />
      </div>

      {/* ── Top Errors Table ──────────────────────────── */}
      {topErrors.length > 0 && (
        <div style={{ animation: 'slide-down 0.2s ease-out' }}>
          <DataTable
            title="Top JS Errors"
            delay={0.6}
            columns={[
              {
                key: 'message' as const,
                label: 'Error',
                render: (v) => (
                  <code
                    style={{
                      padding: '0.125rem 0.5rem',
                      background: 'var(--color-danger-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      color: 'var(--color-danger)',
                      fontFamily: 'monospace',
                      wordBreak: 'break-word',
                    }}
                  >
                    {String(v)}
                  </code>
                ),
              },
              { key: 'count' as const, label: 'Count', align: 'right' as const, render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toLocaleString()}</span> },
              {
                key: 'lastSeen' as const,
                label: 'Last Seen',
                align: 'right' as const,
                render: (v) => new Date(String(v)).toLocaleDateString(),
              },
            ]}
            data={topErrors}
          />
        </div>
      )}

      {/* ── Per-Page Web Vitals ────────────────────────── */}
      {vitalsByPage.length > 0 && (
        <div style={{ animation: 'slide-down 0.2s ease-out' }}>
          <DataTable
            title="Web Vitals by Page"
            delay={0.7}
            columns={[
              {
                key: 'url' as const,
                label: 'Page',
                render: (v) => (
                  <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>
                    {String(v)}
                  </span>
                ),
              },
              {
                key: 'lcp' as const,
                label: 'LCP',
                align: 'right' as const,
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v != null ? `${v}ms` : '—'}</span>,
              },
              {
                key: 'fcp' as const,
                label: 'FCP',
                align: 'right' as const,
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v != null ? `${v}ms` : '—'}</span>,
              },
              {
                key: 'cls' as const,
                label: 'CLS',
                align: 'right' as const,
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v != null ? (Number(v) / 1000).toFixed(3) : '—'}</span>,
              },
              {
                key: 'ttfb' as const,
                label: 'TTFB',
                align: 'right' as const,
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v != null ? `${v}ms` : '—'}</span>,
              },
            ]}
            data={vitalsByPage}
          />
        </div>
      )}
    </div>
  );
}
