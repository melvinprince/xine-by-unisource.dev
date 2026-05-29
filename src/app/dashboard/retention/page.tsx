"use client";

import { Repeat } from "lucide-react";
import { useDashboardContext } from "@/components/DashboardContext";
import { useDashboardFetch } from "@/hooks/use-dashboard-data";
import SiteSelector from "@/components/SiteSelector";
import HelpTooltip from "@/components/HelpTooltip";
import PageHeader from "@/components/PageHeader";
import SectionHeader from "@/components/SectionHeader";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { format } from "date-fns";
import type { CohortRow } from "@/lib/types";

export default function RetentionPage() {
  const { selectedSite: currentSite, dateRange, sites, setSelectedSite, activeFilters } = useDashboardContext();

  const { data, loading } = useDashboardFetch<{ cohorts: CohortRow[] }>(
    "/api/dashboard/retention",
    currentSite,
    dateRange ? { from: dateRange.from, to: dateRange.to } : undefined,
    activeFilters
  );

  const cohorts = data?.cohorts || [];

  // Restructure the flat query results into a matrix
  // rows: cohortWeeks, cols: week numbers
  const matrix: Record<string, { totalUsers: number; weeks: Record<number, number> }> = {};
  let maxWeek = 0;

  cohorts.forEach((row) => {
    // cohortWeek comes as ISO string or Date
    const w = typeof row.cohortWeek === 'string' ? row.cohortWeek : row.cohortWeek.toISOString();
    if (!matrix[w]) {
      matrix[w] = { totalUsers: Number(row.totalUsers), weeks: {} };
    }
    const weekNum = Number(row.weekNumber);
    matrix[w].weeks[weekNum] = Number(row.returnedUsers);
    if (weekNum > maxWeek) maxWeek = weekNum;
  });

  const sortedWeeks = Object.keys(matrix).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Page Header ────────────────────────────────────── */}
      <PageHeader
        title="Retention"
        description="Visitor retention and cohort analysis"
        icon={<Repeat size={20} />}
        actions={
          <SiteSelector sites={sites} selected={currentSite} onChange={setSelectedSite} />
        }
      />

      {/* ── Cohort Retention Table ──────────────────────────── */}
      <div className="glass-card" style={{ padding: '1.5rem', minHeight: '500px', overflowX: 'auto' }}>
        <SectionHeader
          title="Retention Cohorts"
          description="Track how many visitors return to your site week over week"
          actions={
            <HelpTooltip
              title="Retention Cohorts"
              content="Tracks how many visitors return to your site week over week. Each row represents a cohort of users who first visited in that week. Greener cells mean higher retention."
            />
          }
        />

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '2px solid var(--color-accent)',
              borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : sortedWeeks.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--color-text-muted)' }}>
            <p style={{ fontSize: '1.125rem', margin: 0 }}>No retention data available yet.</p>
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Check back after users have returned for multiple sessions.</p>
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: '0.875rem', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border-subtle)' }}>Cohort Week</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border-subtle)' }}>Users</th>
                {Array.from({ length: maxWeek + 1 }).map((_, i) => (
                  <th key={i} style={{ padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'center' }}>
                    Week {i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedWeeks.map((week) => {
                const row = matrix[week];
                const total = row.totalUsers;
                return (
                  <tr key={week} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {format(new Date(week), "MMM d, yyyy")}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {total.toLocaleString()}
                    </td>
                    {Array.from({ length: maxWeek + 1 }).map((_, i) => {
                      const returned = row.weeks[i] || 0;
                      const pct = total > 0 ? (returned / total) * 100 : 0;
                      
                      // Calculate opacity based on retention (higher pct = more solid emerald)
                      let bgOpacity = 0;
                      if (i === 0) bgOpacity = 0.8; // Week 0 is always 100% implicitly recorded, but distinct counts could be lower if we count pageviews.
                      else if (pct > 0) bgOpacity = Math.max(0.1, Math.min(0.8, pct / 50)); 
                      
                      const bgColor = pct > 0 ? `rgba(16, 185, 129, ${bgOpacity})` : 'transparent';
                      const textColor = pct > 0 && bgOpacity > 0.4 ? '#fff' : 'var(--color-text-muted)';
                      
                      return (
                        <td key={i} style={{ padding: '0.5rem 0.25rem', textAlign: 'center' }}>
                          <div 
                            style={{
                              padding: '0.5rem 0.25rem',
                              borderRadius: 'var(--radius-md)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: '60px',
                              backgroundColor: bgColor,
                            }}
                          >
                            <span style={{ color: textColor, fontWeight: pct > 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                              {pct > 0 ? pct.toFixed(1) + '%' : '-'}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
