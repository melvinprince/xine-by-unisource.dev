'use client';

import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import {
  Radio,
  Users,
  Eye,
  Globe,
  Bot,
} from 'lucide-react';
import { LoadingState, EmptyState, ErrorState } from '@/components/DataStates';
import HelpTooltip from '@/components/HelpTooltip';
import { useDashboardContext } from '@/components/DashboardContext';
import { useRealtimeData } from '@/hooks/use-advanced-data';

export default function RealtimePage() {
  const { selectedSite } = useDashboardContext();
  const { data, loading, error, refetch } = useRealtimeData(selectedSite);
  const pulseRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (pulseRef.current) {
      gsap.to(pulseRef.current, {
        scale: 1.5,
        opacity: 0,
        duration: 1.5,
        repeat: -1,
        ease: 'power2.out',
      });
    }
  }, []);

  useEffect(() => {
    if (countRef.current && data) {
      gsap.fromTo(
        countRef.current,
        { textContent: '0' },
        {
          textContent: String(data.activeVisitors),
          duration: 1,
          ease: 'power2.out',
          snap: { textContent: 1 },
        }
      );
    }
  }, [data?.activeVisitors]);

  if (loading) return <LoadingState message="Connecting to real-time feed..." />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data)
    return <EmptyState icon={<Radio size={48} />} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Live Indicator ─────────────────────────────── */}
      <div
        className="glass-card"
        style={{
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          textAlign: 'center',
        }}
      >
        {/* Pulsing dot */}
        <div style={{ position: 'relative', width: '20px', height: '20px' }}>
          <div
            ref={pulseRef}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'var(--color-success)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '4px',
              borderRadius: '50%',
              background: 'var(--color-success)',
              boxShadow: '0 0 10px var(--color-success)',
            }}
          />
        </div>

        <div>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--color-success)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            Live — Refreshes every 30s
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '3rem',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.25rem',
                justifyContent: 'center',
              }}
            >
              <Users size={20} style={{ color: 'var(--color-accent)' }} />
              <span
                ref={countRef}
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 700,
                  background:
                    'linear-gradient(135deg, var(--color-text-primary), var(--color-accent))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {data.activeVisitors}
              </span>
            </div>
            <span
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-text-muted)',
              }}
            >
              Real Visitors
            </span>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '2.5rem',
                fontWeight: 700,
                color: 'var(--color-chart-2)',
                marginBottom: '0.25rem',
              }}
            >
              {data.pageviewsLast30Min.toLocaleString()}
            </div>
            <span
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-text-muted)',
              }}
            >
              Real Pageviews (30m)
            </span>
          </div>

          {/* ── Bot Stats ── */}
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.25rem',
                justifyContent: 'center',
              }}
            >
              <Bot size={20} style={{ color: 'var(--color-warning, #f59e0b)' }} />
              <span
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 700,
                  color: 'var(--color-warning, #f59e0b)',
                }}
              >
                {data.activeBots}
              </span>
            </div>
            <span
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-text-muted)',
              }}
            >
              Active Bots
            </span>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '2.5rem',
                fontWeight: 700,
                color: 'var(--color-warning, #f59e0b)',
                marginBottom: '0.25rem',
                opacity: 0.8,
              }}
            >
              {data.botPageviewsLast30Min.toLocaleString()}
            </div>
            <span
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-text-muted)',
              }}
            >
              Bot Pageviews (30m)
            </span>
          </div>
        </div>
      </div>

      {/* ── Two Column: Active Pages + Countries ──────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
          gap: '1rem',
        }}
      >
        {/* Active Pages */}
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
            <Eye size={16} />
            Active Pages <HelpTooltip title="Active Pages" content="Pages being viewed right now by your visitors. Updates every 30 seconds." />
          </h3>
          {data.activePages.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
              }}
            >
              {data.activePages.map((page, idx) => (
                <div
                  key={page.url}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    background:
                      idx === 0
                        ? 'var(--color-accent-subtle)'
                        : 'var(--color-bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-subtle)',
                    transition: 'background 0.2s ease',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      color:
                        idx === 0
                          ? 'var(--color-accent)'
                          : 'var(--color-text-secondary)',
                      fontWeight: idx === 0 ? 600 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {page.url}
                  </span>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      color: 'var(--color-text-primary)',
                      marginLeft: '0.75rem',
                      flexShrink: 0,
                    }}
                  >
                    {page.viewers}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: '0.875rem',
              }}
            >
              No active pages
            </div>
          )}
        </div>

        {/* Countries */}
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
            <Globe size={16} />
            Live by Country <HelpTooltip title="Live by Country" content="Geographic distribution of your current active visitors." />
          </h3>
          {data.topCountries.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {data.topCountries.map((country) => (
                <div
                  key={country.country}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--color-bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>
                    {country.flag}
                  </span>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: 'var(--color-text-primary)',
                      flex: 1,
                    }}
                  >
                    {country.country}
                  </span>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      color: 'var(--color-chart-3)',
                    }}
                  >
                    {country.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: '0.875rem',
              }}
            >
              No country data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
