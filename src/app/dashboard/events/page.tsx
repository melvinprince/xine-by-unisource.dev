'use client';

import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Zap, Download, TrendingUp, Hash, Users } from 'lucide-react';
import { LoadingState, ErrorState } from '@/components/DataStates';
import HelpTooltip from '@/components/HelpTooltip';
import FeatureGuide from '@/components/FeatureGuide';
import StatCard from '@/components/StatCard';
import { useDashboardContext } from '@/components/DashboardContext';
import VisitorChart from '@/components/charts/VisitorChart';

gsap.registerPlugin(useGSAP);

export default function EventsPage() {
  const { selectedSite, dateRange } = useDashboardContext();
  const [data, setData] = useState<{ topEvents: any[]; timeseries: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!loading && !error && data) {
      gsap.from('.event-card', { y: 20, opacity: 0, duration: 0.5, stagger: 0.1, ease: 'power3.out' });
      gsap.from('.event-row', { x: -20, opacity: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out', delay: 0.2 });
    }
  }, [loading, error, data]);

  const fetchData = async () => {
    if (selectedSite === 'all') return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/events?siteId=${selectedSite}&from=${dateRange.from}&to=${dateRange.to}`);
      if (!res.ok) throw new Error('Failed to load events data');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedSite, dateRange]);

  const handleExport = () => {
    if (!data?.topEvents.length) return;
    const csvContent = "data:text/csv;charset=utf-8,"
      + "Event Name,Total Count,Unique Users\n"
      + data.topEvents.map(e => `"${e.name}",${e.count},${e.uniqueUsers}`).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `events_${selectedSite}_${dateRange.from}_to_${dateRange.to}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (selectedSite === 'all') {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <Zap size={48} style={{ color: 'var(--color-accent)', opacity: 0.5, marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>Select a Site</h2>
        <p style={{ color: 'var(--color-text-secondary)', maxWidth: '400px', margin: '0.5rem auto 0' }}>Custom events are tracked per site. Select one from the top.</p>
      </div>
    );
  }

  const totalEvents = data?.topEvents.reduce((sum, e) => sum + e.count, 0) ?? 0;
  const totalUniqueUsers = data?.topEvents.reduce((sum, e) => sum + e.uniqueUsers, 0) ?? 0;
  const uniqueEventNames = data?.topEvents.length ?? 0;

  return (
    <div ref={pageRef} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            Custom Events <HelpTooltip title="Custom Events" content="Track specific user interactions using the SDK. Call wa.track('Event Name', { properties }) to record events." usage="Add wa.track('Sign Up', { plan: 'Pro' }) in your JavaScript code." />
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
            Track specific user interactions via the SDK <code style={{ background: 'var(--color-bg-surface)', padding: '0.125rem 0.375rem', borderRadius: '4px', fontSize: '0.75rem' }}>wa.track()</code> method.
          </p>
        </div>
        <button className="btn-secondary" onClick={handleExport} disabled={!data || data.topEvents.length === 0}>
          <Download size={16} style={{ marginRight: '0.5rem' }} /> Export CSV
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading Events Data..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : !data || data.topEvents.length === 0 ? (
        <div className="glass-card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', border: '1px solid var(--color-border-subtle)' }}>
            <Zap size={28} style={{ color: 'var(--color-text-muted)' }} />
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.5rem' }}>No custom events yet</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', maxWidth: '500px', margin: '0 auto' }}>
            To track custom events, add the tracking script to your site, then use the JavaScript SDK:
          </p>
          <FeatureGuide
            title="How to Track Custom Events"
            steps={[
              {
                title: 'Add the tracking script to your site',
                description: 'Go to Settings → Integration and copy the HTML snippet into your site\'s <head> tag.',
              },
              {
                title: 'Track a basic event',
                description: 'Call wa.track() anywhere in your JavaScript code when the user performs an action.',
                code: "wa.track('button_click')",
              },
              {
                title: 'Track events with properties',
                description: 'Pass an object as the second argument to attach metadata to the event.',
                code: "wa.track('purchase', {\n  product: 'Pro Plan',\n  amount: 29.99,\n  currency: 'USD'\n})",
              },
              {
                title: 'Common event examples',
                description: 'Track signups, button clicks, form submissions, downloads, or any user interaction.',
                code: "wa.track('signup_completed')\nwa.track('file_download', { file: 'report.pdf' })\nwa.track('form_submit', { form: 'contact' })",
              },
            ]}
          />
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
              gap: '1rem',
            }}
          >
            <StatCard
              label={<>Total Events <HelpTooltip title="Total Events" content="Total number of custom events fired across all event types in this period." /></>}
              value={totalEvents}
              icon={<TrendingUp size={20} />}
              delay={0.1}
            />
            <StatCard
              label={<>Unique Events <HelpTooltip title="Unique Events" content="Number of distinct event types tracked (e.g. 'Sign Up', 'Purchase', etc.)." /></>}
              value={uniqueEventNames}
              icon={<Hash size={20} />}
              delay={0.15}
            />
            <StatCard
              label={<>Unique Users <HelpTooltip title="Unique Users" content="Number of distinct visitors who triggered at least one custom event." /></>}
              value={totalUniqueUsers}
              icon={<Users size={20} />}
              delay={0.2}
            />
          </div>

          {/* Event Volume Trends Chart */}
          <VisitorChart
            title={
              <>
                <TrendingUp size={16} />
                Event Volume Trends
                <HelpTooltip title="Event Volume" content="Daily count of all custom events fired. Use this to spot trends or spikes in user interactions." />
              </>
            }
            primaryDataKey="count"
            primaryLabel="Events Fired"
            data={data.timeseries.map(t => ({ date: t.date, count: t.count, pageviews: 0, sessions: 0 })) as any}
          />

          {/* Top Events Table */}
          <div className="event-card glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={16} />
              Top Events
              <HelpTooltip title="Top Events" content="All custom events ranked by total count. Shows how many times each event was fired and by how many unique users." />
            </h3>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <th style={{ padding: '0.75rem 1rem 0.75rem 0', textAlign: 'left', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Event Name</th>
                    <th style={{ padding: '0.75rem 0', textAlign: 'right', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Count</th>
                    <th style={{ padding: '0.75rem 0 0.75rem 1rem', textAlign: 'right', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unique Users</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topEvents.map((event, idx) => {
                    const pct = totalEvents > 0 ? Math.round((event.count / totalEvents) * 100) : 0;
                    return (
                      <tr key={idx} className="event-row" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <td style={{ padding: '0.875rem 1rem 0.875rem 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Zap size={14} style={{ color: 'var(--color-accent)' }} />
                            </div>
                            <div>
                              <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{event.name}</span>
                              <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>{pct}% of total</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.875rem 0', textAlign: 'right' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>{event.count.toLocaleString()}</span>
                        </td>
                        <td style={{ padding: '0.875rem 0 0.875rem 1rem', textAlign: 'right' }}>
                          <span style={{ color: 'var(--color-text-secondary)' }}>{event.uniqueUsers.toLocaleString()}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
