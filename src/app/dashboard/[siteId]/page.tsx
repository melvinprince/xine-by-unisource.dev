'use client';

import { Users, Eye, Clock, ArrowDownUp, BarChart3 } from 'lucide-react';
import StatCard from '@/components/StatCard';
import VisitorChart from '@/components/charts/VisitorChart';
import DonutChart from '@/components/charts/DonutChart';
import BarChart from '@/components/charts/BarChart';
import DataTable from '@/components/DataTable';
import { LoadingState, EmptyState, ErrorState } from '@/components/DataStates';
import { useDashboardContext } from '@/components/DashboardContext';
import { useSiteDetail } from '@/hooks/use-dashboard-data';
import { formatDuration } from '@/lib/utils';
import { useParams } from 'next/navigation';
import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';

export default function SiteDetailPage() {
  const params = useParams();
  const siteId = params.siteId as string;
  const breadcrumbRef = useRef<HTMLDivElement>(null);
  const { dateRange } = useDashboardContext();
  const { data, loading, error, refetch } = useSiteDetail(siteId, dateRange);

  useEffect(() => {
    if (breadcrumbRef.current && data) {
      gsap.fromTo(
        breadcrumbRef.current,
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }
      );
    }
  }, [data]);

  if (loading) return <LoadingState message="Loading site analytics..." />;
  if (error === 'Site not found') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '50vh',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
          }}
        >
          Site Not Found
        </h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          The site you&apos;re looking for doesn&apos;t exist.
        </p>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return <EmptyState icon={<BarChart3 size={48} />} />;

  const { site, stats, customEvents } = data;
  const hasData = stats.pageviews > 0 || stats.visitors > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Breadcrumb */}
      <div
        ref={breadcrumbRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8125rem',
          color: 'var(--color-text-muted)',
          opacity: 0,
        }}
      >
        <a
          href="/dashboard"
          style={{
            color: 'var(--color-text-muted)',
            textDecoration: 'none',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = 'var(--color-accent)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = 'var(--color-text-muted)')
          }
        >
          Overview
        </a>
        <span>→</span>
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {site.name}
        </span>
        <span
          style={{
            padding: '0.125rem 0.5rem',
            background: 'var(--color-bg-surface)',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.6875rem',
            color: 'var(--color-text-muted)',
          }}
        >
          {site.domain}
        </span>
      </div>

      {!hasData ? (
        <EmptyState
          icon={<BarChart3 size={48} />}
          title="No data for this site"
          description="Install the tracking script on your website to start collecting analytics."
        />
      ) : (
        <>
          {/* ── Stat Cards ─────────────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
              gap: '1rem',
            }}
          >
            <StatCard
              label="Visitors"
              value={stats.visitors}
              change={stats.visitorsChange}
              icon={<Users size={20} />}
              delay={0.1}
            />
            <StatCard
              label="Pageviews"
              value={stats.pageviews}
              change={stats.pageviewsChange}
              icon={<Eye size={20} />}
              delay={0.15}
            />
            <StatCard
              label="Avg. Duration"
              value={stats.avgDuration}
              change={stats.durationChange}
              format="duration"
              icon={<Clock size={20} />}
              delay={0.2}
            />
            <StatCard
              label="Bounce Rate"
              value={stats.bounceRate}
              change={stats.bounceRateChange}
              format="percent"
              icon={<ArrowDownUp size={20} />}
              delay={0.25}
            />
          </div>

          {/* ── Visitor Trend ──────────────────────────────── */}
          <VisitorChart data={data.timeseries} />

          {/* ── Custom Events ──────────────────────────────── */}
          {customEvents.length > 0 && (
            <DataTable
              title="Custom Events"
              delay={0.5}
              columns={[
                {
                  key: 'name' as const,
                  label: 'Event Name',
                  render: (v) => (
                    <code
                      style={{
                        padding: '0.125rem 0.5rem',
                        background: 'var(--color-bg-surface)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8125rem',
                        color: 'var(--color-chart-2)',
                        fontFamily: 'monospace',
                      }}
                    >
                      {String(v)}
                    </code>
                  ),
                },
                {
                  key: 'count' as const,
                  label: 'Count',
                  align: 'right' as const,
                  render: (v) => Number(v).toLocaleString(),
                },
                {
                  key: 'lastTriggered' as const,
                  label: 'Last Triggered',
                  align: 'right' as const,
                  render: (v) => {
                    const d = new Date(String(v));
                    return d.toLocaleString();
                  },
                },
              ]}
              data={customEvents}
            />
          )}

          {/* ── Two-Column Tables ──────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
              gap: '1rem',
            }}
          >
            <DataTable
              title="Top Pages"
              delay={0.6}
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
                { key: 'views' as const, label: 'Views', align: 'right' as const },
                {
                  key: 'avgDuration' as const,
                  label: 'Duration',
                  align: 'right' as const,
                  render: (v) => formatDuration(Number(v)),
                },
              ]}
              data={data.topPages}
            />

            <DataTable
              title="Top Sources"
              delay={0.65}
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
                  render: (v) => `${Number(v).toFixed(1)}%`,
                },
              ]}
              data={data.topSources}
            />
          </div>

          {/* ── Three-Column Charts ────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
              gap: '1rem',
            }}
          >
            <DonutChart data={data.deviceBreakdown} />
            <BarChart data={data.browserStats} />
            <DataTable
              title="Top Countries"
              delay={0.8}
              columns={[
                {
                  key: 'flag' as const,
                  label: '',
                  sortable: false,
                  width: '30px',
                  render: (v) => <span style={{ fontSize: '1.125rem' }}>{String(v)}</span>,
                },
                {
                  key: 'country' as const,
                  label: 'Country',
                  render: (v) => <span style={{ fontWeight: 500 }}>{String(v)}</span>,
                },
                {
                  key: 'visitors' as const,
                  label: 'Visitors',
                  align: 'right' as const,
                  render: (v) => Number(v).toLocaleString(),
                },
              ]}
              data={data.countryStats}
            />
          </div>
        </>
      )}
    </div>
  );
}
