"use client";
import { useState, useEffect } from "react";
import { useDashboardContext } from "@/components/DashboardContext";
import SiteSelector from "@/components/SiteSelector";
import HelpTooltip from "@/components/HelpTooltip";
import FeatureGuide from "@/components/FeatureGuide";
import { Bell, Activity, Send } from "lucide-react";

export default function MonitorsPage() {
  const { selectedSite: currentSite, sites, setSelectedSite } = useDashboardContext();
  const [uptime, setUptime] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentSite) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/dashboard/uptime?siteId=${currentSite}`).then(r => r.json()),
      fetch(`/api/dashboard/alerts?siteId=${currentSite}`).then(r => r.json()),
      fetch(`/api/dashboard/reports?siteId=${currentSite}`).then(r => r.json())
    ]).then(([u, a, r]) => {
      if (u.checks) setUptime(u.checks);
      if (a.alerts) setAlerts(a.alerts);
      if (r.reports) setReports(r.reports);
      setLoading(false);
    });
  }, [currentSite]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">Monitors & Alerts <HelpTooltip title="Monitors & Alerts" content="Monitor your site's uptime, set up traffic alerts, and configure automated email reports." /></h1>
          <p className="text-slate-400 mt-2">Manage uptime checks, triggered alerts, and email reports.</p>
        </div>
        <SiteSelector sites={sites} selected={currentSite} onChange={setSelectedSite} />
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
           <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"/>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-card p-6 border-slate-700/50">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-emerald-400"><Activity className="w-5 h-5"/> Uptime Checks <HelpTooltip title="Uptime Checks" content="Monitors your site by pinging it at regular intervals. Records response time and status (up/down). Requires the uptime cron job to be running on your server." /></h3>
            {uptime.length === 0 ? (
              <div>
                <p className="text-slate-500 text-sm mb-3">No checks recorded yet.</p>
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
              <div className="space-y-3">
                {uptime.slice(0, 5).map((u, i) => (
                  <div key={i} className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${u.status === 'up' ? 'bg-emerald-500' : 'bg-red-500'}`}/>
                      <span className="text-slate-300">{new Date(u.checked_at).toLocaleTimeString()}</span>
                    </div>
                    <span className="text-slate-400 font-mono">{u.response_time}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-6 border-slate-700/50">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-rose-400"><Bell className="w-5 h-5"/> Triggers & Alerts <HelpTooltip title="Triggers & Alerts" content="Set threshold-based alerts that notify you when metrics exceed or drop below configured values." /></h3>
            {alerts.length === 0 ? (
              <div>
                <p className="text-slate-500 text-sm mb-3">No alerts configured yet.</p>
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
              <div className="space-y-3">
                {alerts.map((a, i) => (
                  <div key={i} className="bg-slate-800/50 p-3 rounded-lg text-sm flex justify-between items-center">
                    <div>
                      <div className="text-slate-200 capitalize">{a.type.replace('_', ' ')}</div>
                      <div className="text-xs text-slate-500">{a.channel} &rarr; {a.channel_target}</div>
                    </div>
                    <span className="text-slate-400 font-mono">{a.threshold}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-6 border-slate-700/50">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-blue-400"><Send className="w-5 h-5"/> Email Reports <HelpTooltip title="Email Reports" content="Automated periodic emails summarizing your site's key metrics. Configure weekly or monthly delivery to any email address." /></h3>
            {reports.length === 0 ? (
              <div>
                <p className="text-slate-500 text-sm mb-3">No reports configured yet.</p>
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
              <div className="space-y-3">
                {reports.map((r, i) => (
                  <div key={i} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 text-sm flex justify-between items-center">
                    <div>
                      <div className="text-slate-200 capitalize">{r.schedule} Report</div>
                      <div className="text-xs text-slate-500">{r.recipients.length} recipients</div>
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
