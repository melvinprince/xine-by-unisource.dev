'use client';

import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';

interface FunnelChartProps {
  data: { label: string; value: number; percentage: number }[];
  title?: string;
}

export default function FunnelChart({
  data,
  title = 'Distribution',
}: FunnelChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current.querySelectorAll('.funnel-bar'),
        { scaleX: 0, transformOrigin: 'left' },
        {
          scaleX: 1,
          duration: 0.6,
          stagger: 0.08,
          ease: 'power2.out',
        }
      );
    }
  }, [data]);

  if (data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.value), 1);

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {data.map((item, idx) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <span
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-text-secondary)',
                minWidth: '60px',
                fontWeight: 500,
              }}
            >
              {item.label}
            </span>
            <div
              style={{
                flex: 1,
                height: '28px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-bg-overlay)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                className="funnel-bar"
                style={{
                  height: '100%',
                  width: `${(item.value / maxValue) * 100}%`,
                  borderRadius: 'var(--radius-sm)',
                  background: `var(--color-chart-${(idx % 5) + 1})`,
                  opacity: 0.75,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: '0.5rem',
                  minWidth: '40px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'white',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.value.toLocaleString()}
                </span>
              </div>
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
                minWidth: '40px',
                textAlign: 'right',
              }}
            >
              {item.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
