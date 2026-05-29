'use client';

import {
  Megaphone,
  Star,
} from 'lucide-react';
import DataTable from '@/components/DataTable';
import HelpTooltip from '@/components/HelpTooltip';
import PageHeader from '@/components/PageHeader';
import SectionHeader from '@/components/SectionHeader';
import { LoadingState, EmptyState, ErrorState } from '@/components/DataStates';
import { useDashboardContext } from '@/components/DashboardContext';
import { useAcquisitionData } from '@/hooks/use-advanced-data';
import { formatDuration } from '@/lib/utils';

export default function AcquisitionPage() {
  const { selectedSite, dateRange, activeFilters } = useDashboardContext();
  const { data, loading, error, refetch } = useAcquisitionData(
    selectedSite,
    dateRange,
    activeFilters
  );

  if (loading) return <LoadingState message="Analyzing traffic sources..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data)
    return <EmptyState icon={<Megaphone size={48} />} />;

  const { campaigns, sourceQuality } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Acquisition"
        description="Traffic sources and campaign performance"
        icon={<Megaphone size={20} />}
      />

      {/* ── Source Quality ─────────────────────────────── */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <SectionHeader
          title="Traffic Source Quality"
          description="Compare traffic sources by engagement quality score (0–100)"
        />

        {sourceQuality.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sourceQuality.map((source) => (
              <div
                key={source.source}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto auto',
                  gap: '1rem',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  background: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                    {source.source}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {source.visitors} visitors · {source.sessions} sessions
                  </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: source.bounceRate > 70 ? 'var(--color-danger)' : source.bounceRate > 40 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                    {source.bounceRate}%
                  </div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>Bounce</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatDuration(source.avgDuration)}
                  </div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>Avg Duration</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {source.avgPages}
                  </div>
                  <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>Avg Pages</div>
                </div>

                {/* Quality Score Badge */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '44px',
                    height: '44px',
                    borderRadius: 'var(--radius-full)',
                    background:
                      source.qualityScore >= 70
                        ? 'var(--color-success-subtle)'
                        : source.qualityScore >= 40
                          ? 'var(--color-warning-subtle)'
                          : 'var(--color-danger-subtle)',
                    color:
                      source.qualityScore >= 70
                        ? 'var(--color-success)'
                        : source.qualityScore >= 40
                          ? 'var(--color-warning)'
                          : 'var(--color-danger)',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {source.qualityScore}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No referrer data found for this period.
          </div>
        )}
      </div>

      {/* ── Campaign Performance ──────────────────────── */}
      {campaigns.length > 0 && (
        <div>
          <SectionHeader title="Campaign Performance" />
          <DataTable
            title="Campaign Performance"
            delay={0.5}
            columns={[
              {
                key: 'campaign' as const,
                label: 'Campaign',
                render: (v) => (
                  <span style={{ fontWeight: 600, color: 'var(--color-chart-2)' }}>{String(v)}</span>
                ),
              },
              {
                key: 'source' as const,
                label: 'Source',
                render: (v) => (
                  <span style={{ color: 'var(--color-text-secondary)' }}>{String(v)}</span>
                ),
              },
              {
                key: 'medium' as const,
                label: 'Medium',
                render: (v) => (
                  <code
                    style={{
                      padding: '0.125rem 0.5rem',
                      background: 'var(--color-bg-surface)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border-subtle)',
                      fontSize: '0.75rem',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {String(v)}
                  </code>
                ),
              },
              {
                key: 'sessions' as const,
                label: 'Sessions',
                align: 'right' as const,
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(v).toLocaleString()}</span>,
              },
              {
                key: 'bounceRate' as const,
                label: 'Bounce',
                align: 'right' as const,
                render: (v) => (
                  <span
                    style={{
                      color:
                        Number(v) > 70 ? 'var(--color-danger)' : Number(v) > 40 ? 'var(--color-warning)' : 'var(--color-success)',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {Number(v)}%
                  </span>
                ),
              },
              {
                key: 'avgDuration' as const,
                label: 'Avg Duration',
                align: 'right' as const,
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDuration(Number(v))}</span>,
              },
              {
                key: 'pagesPerSession' as const,
                label: 'Pages/Sess',
                align: 'right' as const,
                render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{String(v)}</span>,
              },
            ]}
            data={campaigns}
          />
        </div>
      )}
    </div>
  );
}
