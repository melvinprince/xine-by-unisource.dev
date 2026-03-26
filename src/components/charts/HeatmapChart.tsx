'use client';

import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import type { HeatmapCell } from '@/lib/types';

interface HeatmapChartProps {
  data: HeatmapCell[];
  title?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, '0')
);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function HeatmapChart({
  data,
  title = 'Visitor Heatmap',
}: HeatmapChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current.querySelectorAll('.heatmap-cell'),
        { opacity: 0, scale: 0.5 },
        {
          opacity: 1,
          scale: 1,
          duration: 0.3,
          stagger: 0.003,
          ease: 'power2.out',
        }
      );
    }
  }, [data]);

  function getColor(value: number): string {
    if (value === 0) return 'var(--color-bg-surface)';
    const intensity = value / maxValue;
    if (intensity < 0.25) return 'hsl(217 91% 60% / 0.15)';
    if (intensity < 0.5) return 'hsl(217 91% 60% / 0.35)';
    if (intensity < 0.75) return 'hsl(217 91% 60% / 0.6)';
    return 'hsl(217 91% 60% / 0.85)';
  }

  return (
    <div
      ref={containerRef}
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
        {title}
      </h3>

      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `40px repeat(24, 1fr)`,
            gap: '2px',
            minWidth: '600px',
          }}
        >
          {/* Header row */}
          <div />
          {HOURS.map((h) => (
            <div
              key={h}
              style={{
                fontSize: '0.625rem',
                color: 'var(--color-text-muted)',
                textAlign: 'center',
                paddingBottom: '4px',
              }}
            >
              {Number(h) % 3 === 0 ? h : ''}
            </div>
          ))}

          {/* Grid rows */}
          {DAYS.map((day, dayIdx) => (
            <>
              <div
                key={`label-${day}`}
                style={{
                  fontSize: '0.6875rem',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  fontWeight: 500,
                }}
              >
                {day}
              </div>
              {HOURS.map((_, hourIdx) => {
                const cell = data.find(
                  (d) => d.day === dayIdx && d.hour === hourIdx
                );
                const value = cell?.value || 0;
                return (
                  <div
                    key={`${dayIdx}-${hourIdx}`}
                    className="heatmap-cell"
                    title={`${day} ${hourIdx}:00 — ${value} sessions`}
                    style={{
                      aspectRatio: '1',
                      borderRadius: '3px',
                      background: getColor(value),
                      cursor: 'default',
                      transition: 'transform 0.15s ease',
                      minHeight: '14px',
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.transform = 'scale(1.3)';
                      (e.target as HTMLElement).style.zIndex = '1';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.transform = 'scale(1)';
                      (e.target as HTMLElement).style.zIndex = '0';
                    }}
                  />
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginTop: '0.75rem',
          justifyContent: 'flex-end',
        }}
      >
        <span
          style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}
        >
          Less
        </span>
        {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
          <div
            key={intensity}
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '2px',
              background:
                intensity === 0
                  ? 'var(--color-bg-surface)'
                  : `hsl(217 91% 60% / ${intensity * 0.85})`,
            }}
          />
        ))}
        <span
          style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}
        >
          More
        </span>
      </div>
    </div>
  );
}
