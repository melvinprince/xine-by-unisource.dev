'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDashboardContext } from '@/components/DashboardContext';
import SiteSelector from '@/components/SiteSelector';
import HelpTooltip from '@/components/HelpTooltip';
import FeatureGuide from '@/components/FeatureGuide';
import PageHeader from '@/components/PageHeader';
import SectionHeader from '@/components/SectionHeader';
import { Bell, Activity, Send } from 'lucide-react';
import { LoadingState, ErrorState } from '@/components/DataStates';

interface UptimeCheck {
  id: string;
  status: string;
  checked_at: string;
  response_time: number;
}

interface AlertRule {
  id: string;
  type: string;
  channel: string;
  channel_target: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  threshold: any;
}

interface EmailReport {
  id: string;
  schedule: string;
  recipients: string[];
}

export default function MonitorsPage() {
  const { selectedSite: currentSite, sites, setSelectedSite } = useDashboardContext();
  const [uptime, setUptime] = useState<UptimeCheck[]>([]);
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [reports, setReports] = useState<EmailReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentSite) return;
    setLoading(true);
    setError(null);
    try {
      const [u, a, r] = await Promise.all([
        fetch(`/api/dashboard/uptime?siteId=${currentSite}`).then(res => {
          if (!res.ok) throw new Error("Failed to load uptime");
          return res.json();
        }),
        fetch(`/api/dashboard/alerts?siteId=${currentSite}`).then(res => {
          if (!res.ok) throw new Error("Failed to load alerts");
          return res.json();
        }),
        fetch(`/api/dashboard/reports?siteId=${currentSite}`).then(res => {
          if (!res.ok) throw new Error("Failed to load reports");
          return res.json();
        })
      ]);
      if (u.checks) setUptime(u.checks);
      if (a.alerts) setAlerts(a.alerts);
      if (r.reports) setReports(r.reports);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load monitors data");
    } finally {
      setLoading(false);
    }
  }, [currentSite]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <PageHeader
        title="Monitors"
        description="Uptime monitoring, alerts, and scheduled reports"
        icon={<Bell size={20} />}
        actions={
          <SiteSelector sites={sites} selected={currentSite} onChange={setSelectedSite} />
        }
      />

      {loading ? (
        <LoadingState message="Loading monitors & alerts..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.5rem' }}>
          {/* Uptime Checks */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <SectionHeader
              title="Uptime Checks"
              description="Automatic site pings"
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Activity size={16} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-accent)' }}>Live Monitoring</span>
              <HelpTooltip title="Uptime Checks" content="Monitors your site by pinging it at regular intervals. Records response time and status (up/down). Requires the uptime cron job to be running on your server." />
            </div>
            {uptime.length === 0 ? (
              <div>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>No checks recorded yet.</p>
                <FeatureGuide
                  title="How Uptime Checks Work"
                  steps={[
                    {
                      title: 'Automatic site monitoring',
                      description: 'The system pings your site\'s domain at regular intervals (configured via cron). It records the HTTP status code and response time.',
                    },
                    {
                      title: 'Set up the cron job',
                      description: 'The uptime cron runs at /api/cron/uptime. Set up a cron job or external service to call this endpoint periodically.',
                      code: '# Example: every 5 minutes\n*/5 * * * * curl https://analytics.example.com/api/cron/uptime?secret=YOUR_CRON_SECRET',
                    },
                    {
                      title: 'View history',
                      description: 'Once checks start recording, you\'ll see response times and status indicators here. Green = up, Red = down.',
                    },
                  ]}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {uptime.slice(0, 5).map((u, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-overlay)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: u.status === 'up' ? 'var(--color-accent)' : 'var(--color-error, #ef4444)' }}/>
                      <span style={{ color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{new Date(u.checked_at).toLocaleTimeString()}</span>
                    </div>
                    <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>{u.response_time}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Triggers & Alerts */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <SectionHeader
              title="Triggers & Alerts"
              description="Threshold-based notifications"
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Bell size={16} style={{ color: 'var(--color-error, #ef4444)' }} />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-error, #ef4444)' }}>Alert Rules</span>
              <HelpTooltip title="Triggers & Alerts" content="Set threshold-based alerts that notify you when metrics exceed or drop below configured values." />
            </div>
            {alerts.length === 0 ? (
              <div>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>No alerts configured yet.</p>
                <FeatureGuide
                  title="How to Set Up Alerts"
                  steps={[
                    {
                      title: 'Define a metric threshold',
                      description: 'Choose what to monitor: traffic drops, bounce rate spikes, error rate increases, or custom thresholds.',
                    },
                    {
                      title: 'Choose notification channel',
                      description: 'Set up email notifications so you get alerted when your threshold is breached.',
                      code: 'Type: traffic_drop\nThreshold: 50% decrease\nChannel: email → you@example.com',
                    },
                    {
                      title: 'Alerts are checked via cron',
                      description: 'Alerts are evaluated each time the cron job runs. Configure the cron to check at your desired frequency.',
                    },
                  ]}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-overlay)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                    <div>
                      <div style={{ color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>{a.type.replace('_', ' ')}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>{a.channel} &rarr; {a.channel_target}</div>
                    </div>
                    <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>{typeof a.threshold === 'object' ? a.threshold.value : a.threshold}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Email Reports */}
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <SectionHeader
              title="Email Reports"
              description="Automated periodic summaries"
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Send size={16} style={{ color: 'var(--color-chart-1)' }} />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-chart-1)' }}>Scheduled Delivery</span>
              <HelpTooltip title="Email Reports" content="Automated periodic emails summarizing your site's key metrics. Configure weekly or monthly delivery to any email address." />
            </div>
            {reports.length === 0 ? (
              <div>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>No reports configured yet.</p>
                <FeatureGuide
                  title="How Email Reports Work"
                  steps={[
                    {
                      title: 'Schedule automated reports',
                      description: 'Choose between weekly or monthly summary emails containing your site\'s key metrics: visitors, pageviews, top pages, and bounce rate.',
                    },
                    {
                      title: 'Add recipients',
                      description: 'Add email addresses of stakeholders who should receive the reports. Great for clients, managers, or team members.',
                      code: 'Schedule: weekly\nRecipients: team@example.com, boss@example.com',
                    },
                    {
                      title: 'Reports are sent via cron',
                      description: 'The reports cron job (/api/cron/reports) compiles analytics data and sends emails. Set up the cron to run daily — it will automatically send on the configured schedule.',
                    },
                  ]}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {reports.map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-overlay)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', border: '1px solid var(--color-border-subtle)' }}>
                    <div>
                      <div style={{ color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>{r.schedule} Report</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem', fontVariantNumeric: 'tabular-nums' }}>{r.recipients.length} recipients</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
