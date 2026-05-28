"use client";

import SiteSelector from "@/components/SiteSelector";
import EnableFeatureBanner from "@/components/EnableFeatureBanner";
import HelpTooltip from "@/components/HelpTooltip";
import { useDashboardContext } from "@/components/DashboardContext";
import { PlayCircle, Clock, Globe } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import gsap from "gsap";
import { useDashboardFetch } from "@/hooks/use-dashboard-data";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataStates";
import { useEffect, useMemo } from "react";

interface ReplaySummary {
  sessionId: string;
  url: string;
  startTime: string;
  eventsCount: number;
}

export default function SessionReplayPage() {
  const { selectedSite: currentSite, sites, setSelectedSite } = useDashboardContext();
  const { data, loading, error, refetch } = useDashboardFetch<{ replays: ReplaySummary[] }>(
    "/api/dashboard/replay",
    currentSite
  );

  const replays = useMemo(() => data?.replays ?? [], [data?.replays]);

  useEffect(() => {
    if (replays.length > 0) {
      gsap.fromTo(
        ".replay-item",
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.05 }
      );
    }
  }, [replays]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifycontent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            Session Replays
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
            Watch user behavior, clicks, and scrolling visually.
          </p>
        </div>
        <SiteSelector sites={sites} selected={currentSite} onChange={setSelectedSite} />
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', minHeight: '500px' }}>
        {loading ? (
          <LoadingState message="Loading Replays..." />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : replays.length === 0 ? (
          <EmptyState
            icon={<PlayCircle size={48} />}
            title="No replays recorded yet."
            description="Enable 'Session Replay' in Site Settings to start recording."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {replays.map((r, i) => (
              <div
                key={i}
                className="replay-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--color-bg-overlay)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', flexShrink: 0 }}>
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{r.url}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock className="w-3.5 h-3.5" />
                        {formatDistanceToNow(new Date(r.startTime), { addSuffix: true })}
                      </span>
                      <span>•</span>
                      <span>{r.eventsCount} events</span>
                    </div>
                  </div>
                </div>
                <Link href={`/dashboard/replay/${r.sessionId}`} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <PlayCircle className="w-4 h-4" />
                  Watch
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
