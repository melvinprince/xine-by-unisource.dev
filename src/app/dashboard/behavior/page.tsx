'use client';

import {
  MousePointerClick,
  ArrowRightLeft,
  LogIn,
  LogOut as LogOutIcon,
} from 'lucide-react';
import StatCard from '@/components/StatCard';
import DataTable from '@/components/DataTable';
import FunnelChart from '@/components/charts/FunnelChart';
import HelpTooltip from '@/components/HelpTooltip';
import { LoadingState, EmptyState, ErrorState } from '@/components/DataStates';
import { useDashboardContext } from '@/components/DashboardContext';
import { useBehaviorData } from '@/hooks/use-advanced-data';

export default function BehaviorPage() {
  const { selectedSite, dateRange } = useDashboardContext();
  const { data, loading, error, refetch } = useBehaviorData(
    selectedSite,
    dateRange
  );

  if (loading) return <LoadingState message="Analyzing user behavior..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data)
    return <EmptyState icon={<MousePointerClick size={48} />} />;

  const { entryPages, exitPages, exitRates, scrollDepth, userFlows, pagesPerSession } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Scroll Depth + Pages Per Session ─────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
          gap: '1rem',
        }}
      >
        <FunnelChart
          title="Scroll Depth Distribution"
          data={scrollDepth.map((d) => ({
            label: `${d.depth}%`,
            value: d.count,
            percentage: d.percentage,
          }))}
        />
        <FunnelChart
          title="Pages Per Session"
          data={pagesPerSession.map((d) => ({
            label: `${d.pages} pages`,
            value: d.count,
            percentage: d.percentage,
          }))}
        />
      </div>

      {/* ── User Flow ─────────────────────────────────── */}
      {userFlows.length > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h3
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <ArrowRightLeft size={16} />
            Top User Flows <HelpTooltip title="User Flows" content="Most common page-to-page navigation patterns. Shows how visitors move through your site." />
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {userFlows.slice(0, 10).map((flow, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                  fontSize: '0.8125rem',
                }}
              >
                <span
                  style={{
                    color: 'var(--color-accent)',
                    fontWeight: 500,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {flow.from}
                </span>
                <span
                  style={{
                    color: 'var(--color-text-muted)',
                    flexShrink: 0,
                  }}
                >
                  →
                </span>
                <span
                  style={{
                    color: 'var(--color-chart-3)',
                    fontWeight: 500,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {flow.to}
                </span>
                <span
                  style={{
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                    flexShrink: 0,
                    minWidth: '40px',
                    textAlign: 'right',
                  }}
                >
                  {flow.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Two-Column: Entry + Exit Pages ────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
          gap: '1rem',
        }}
      >
        <DataTable
          title="Entry Pages"
          delay={0.5}
          columns={[
            {
              key: 'url' as const,
              label: 'Page',
              render: (v) => (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <LogIn size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>{String(v)}</span>
                </span>
              ),
            },
            { key: 'count' as const, label: 'Entries', align: 'right' as const, render: (v) => Number(v).toLocaleString() },
            {
              key: 'percentage' as const,
              label: '%',
              align: 'right' as const,
              render: (v) => `${Number(v)}%`,
            },
          ]}
          data={entryPages}
        />
        <DataTable
          title="Exit Pages"
          delay={0.55}
          columns={[
            {
              key: 'url' as const,
              label: 'Page',
              render: (v) => (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <LogOutIcon size={14} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>{String(v)}</span>
                </span>
              ),
            },
            { key: 'count' as const, label: 'Exits', align: 'right' as const, render: (v) => Number(v).toLocaleString() },
            {
              key: 'percentage' as const,
              label: '%',
              align: 'right' as const,
              render: (v) => `${Number(v)}%`,
            },
          ]}
          data={exitPages}
        />
      </div>

      {/* ── Exit Rate by Page ─────────────────────────── */}
      {exitRates.length > 0 && (
        <DataTable
          title="Exit Rate by Page"
          delay={0.7}
          columns={[
            {
              key: 'url' as const,
              label: 'Page',
              render: (v) => (
                <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>{String(v)}</span>
              ),
            },
            { key: 'views' as const, label: 'Views', align: 'right' as const, render: (v) => Number(v).toLocaleString() },
            { key: 'exits' as const, label: 'Exits', align: 'right' as const, render: (v) => Number(v).toLocaleString() },
            {
              key: 'exitRate' as const,
              label: 'Exit Rate',
              align: 'right' as const,
              render: (v) => (
                <span
                  style={{
                    color:
                      Number(v) > 70 ? 'var(--color-danger)' : Number(v) > 40 ? 'var(--color-warning)' : 'var(--color-success)',
                    fontWeight: 600,
                  }}
                >
                  {Number(v)}%
                </span>
              ),
            },
          ]}
          data={exitRates}
        />
      )}
    </div>
  );
}
