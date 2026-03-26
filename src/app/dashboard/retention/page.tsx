"use client";

import { useEffect, useState } from "react";
import SiteSelector from "@/components/SiteSelector";
import HelpTooltip from "@/components/HelpTooltip";
import { useDashboardContext } from "@/components/DashboardContext";
import { format } from "date-fns";

export default function RetentionPage() {
  const { selectedSite: currentSite, sites, setSelectedSite } = useDashboardContext();
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentSite) return;

    fetch(`/api/dashboard/retention?siteId=${currentSite}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.cohorts) setCohorts(data.cohorts);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching cohorts:", err);
        setLoading(false);
      });
  }, [currentSite]);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.025em' }}>
            Retention Cohorts <HelpTooltip title="Retention Cohorts" content="Tracks how many visitors return to your site week over week. Each row represents a cohort of users who first visited in that week. Greener cells mean higher retention." />
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
            See how often users return to your site week over week.
          </p>
        </div>
        <SiteSelector sites={sites} selected={currentSite} onChange={setSelectedSite} />
      </div>

      <div className="glass-card p-6 min-h-[500px] overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-[300px]">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"/>
          </div>
        ) : sortedWeeks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px]" style={{ color: 'var(--color-text-muted)' }}>
            <p className="text-lg">No retention data available yet.</p>
            <p className="text-sm mt-2">Check back after users have returned for multiple sessions.</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                <th className="py-3 px-4 font-medium" style={{ color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border-subtle)' }}>Cohort Week</th>
                <th className="py-3 px-4 font-medium" style={{ color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border-subtle)' }}>Users</th>
                {Array.from({ length: maxWeek + 1 }).map((_, i) => (
                  <th key={i} className="py-3 px-4 font-medium text-center" style={{ color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border-subtle)' }}>
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
                  <tr key={week} className="hover-bg-surface" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td className="py-3 px-4 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {format(new Date(week), "MMM d, yyyy")}
                    </td>
                    <td className="py-3 px-4" style={{ color: 'var(--color-text-secondary)' }}>
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
                        <td key={i} className="py-2 px-1 text-center">
                          <div 
                            className="py-2 px-1 rounded-md flex flex-col items-center justify-center min-w-[60px]"
                            style={{ backgroundColor: bgColor }}
                          >
                            <span style={{ color: textColor, fontWeight: pct > 0 ? 600 : 400 }}>
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
