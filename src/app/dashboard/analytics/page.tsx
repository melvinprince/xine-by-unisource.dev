'use client';

import {
  Activity,
  Users,
  Layers,
  TrendingUp,
  Clock,
  Zap,
} from 'lucide-react';
import StatCard from '@/components/StatCard';
import HeatmapChart from '@/components/charts/HeatmapChart';
import FunnelChart from '@/components/charts/FunnelChart';
import DataTable from '@/components/DataTable';
import HelpTooltip from '@/components/HelpTooltip';
import { LoadingState, EmptyState, ErrorState } from '@/components/DataStates';
import { useDashboardContext } from '@/components/DashboardContext';
import { useAnalyticsData } from '@/hooks/use-advanced-data';
import { formatDuration } from '@/lib/utils';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function AnalyticsPage() {
  const { selectedSite, dateRange } = useDashboardContext();
  const { data, loading, error, refetch } = useAnalyticsData(
    selectedSite,
    dateRange
  );

  if (loading)
    return <LoadingState message="Computing deep analytics..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState icon={<Activity size={48} />} />;

  const { sessionStats, newVsReturning, sessionTimeseries, engagement, heatmap, peakHours } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Stat Cards ─────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          gap: '1rem',
        }}
      >
        <StatCard
          label={<>Sessions <HelpTooltip title="Sessions" content="A session groups all pageviews from a single visitor within a 30-minute inactivity window." /></>}
          value={sessionStats.totalSessions}
          change={sessionStats.sessionsChange}
          icon={<Activity size={20} />}
          delay={0.1}
        />
        <StatCard
          label={<>Pages / Session <HelpTooltip title="Pages Per Session" content="Average number of pages viewed during each session. Higher values indicate deeper engagement." /></>}
          value={sessionStats.avgPagesPerSession}
          change={sessionStats.pagesPerSessionChange}
          icon={<Layers size={20} />}
          delay={0.15}
          format="decimal"
        />
        <StatCard
          label={<>Avg. Session Duration <HelpTooltip title="Session Duration" content="Average time a visitor spends on your site in a single session." /></>}
          value={sessionStats.avgSessionDuration}
          change={sessionStats.sessionDurationChange}
          icon={<Clock size={20} />}
          delay={0.2}
          format="duration"
        />
        <StatCard
          label={<>New Visitors <HelpTooltip title="New Visitors" content="Percentage of visitors who are visiting your site for the first time in this period." /></>}
          value={sessionStats.newVisitorPercent}
          icon={<Users size={20} />}
          delay={0.25}
          format="percent"
        />
        <StatCard
          label={<>Engagement Score <HelpTooltip title="Engagement Score" content="Composite score (0-100) calculated from session duration, pages viewed, scroll depth, and interactions." /></>}
          value={engagement.avgEngagementScore}
          icon={<Zap size={20} />}
          delay={0.3}
          suffix="/100"
        />
      </div>

      {/* ── Sessions Trend ─────────────────────────────── */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <h3
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            marginBottom: '1rem',
          }}
        >
          Sessions Over Time <HelpTooltip title="Sessions Over Time" content="Trend of total sessions per day. Shows how visitor engagement changes over the selected period." />
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={sessionTimeseries}>
            <defs>
              <linearGradient id="sessionGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
            <XAxis
              dataKey="date"
              stroke="var(--color-text-muted)"
              fontSize={11}
              tickFormatter={(v) => {
                const d = new Date(v);
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <YAxis stroke="var(--color-text-muted)" fontSize={11} />
            <Tooltip
              contentStyle={{
                background: 'var(--color-bg-raised)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
              }}
            />
            <Area
              type="monotone"
              dataKey="sessions"
              stroke="var(--color-chart-2)"
              fill="url(#sessionGrad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Two-Column: Heatmap + Engagement ──────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
          gap: '1rem',
        }}
      >
        <HeatmapChart data={heatmap} title="Visitor Activity by Hour & Day" />

        <div
          className="glass-card"
          style={{ padding: '1.25rem' }}
        >
          <h3
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              marginBottom: '1rem',
            }}
          >
            Engagement Breakdown
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { label: 'Highly Engaged (70-100)', value: engagement.highlyEngaged, color: 'var(--color-success)' },
              { label: 'Moderate (40-69)', value: engagement.moderatelyEngaged, color: 'var(--color-warning)' },
              { label: 'Low Engagement (0-39)', value: engagement.lowEngagement, color: 'var(--color-danger)' },
            ].map((item) => {
              const total = engagement.highlyEngaged + engagement.moderatelyEngaged + engagement.lowEngagement || 1;
              const pct = Math.round((item.value / total) * 100);
              return (
                <div key={item.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{item.label}</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: item.color }}>{item.value} ({pct}%)</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--color-bg-overlay)', borderRadius: 'var(--radius-full)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: item.color, borderRadius: 'var(--radius-full)', transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--color-bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)' }}>
            <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
              New vs Returning
            </h4>
            <div style={{ display: 'flex', gap: '2rem' }}>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-chart-1)' }}>{newVsReturning.newPercent}%</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>New ({newVsReturning.newVisitors})</div>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-chart-3)' }}>{newVsReturning.returningPercent}%</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Returning ({newVsReturning.returningVisitors})</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Peak Hours ─────────────────────────────────── */}
      <DataTable
        title="Peak Traffic Hours"
        delay={0.7}
        columns={[
          { key: 'label' as const, label: 'Hour', render: (v) => <span style={{ fontWeight: 600 }}>{String(v)}</span> },
          { key: 'visitors' as const, label: 'Sessions', align: 'right' as const, render: (v) => Number(v).toLocaleString() },
        ]}
        data={peakHours}
      />
    </div>
  );
}
