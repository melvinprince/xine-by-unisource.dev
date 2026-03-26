'use client';

import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label: React.ReactNode;
  value: number;
  change?: number;
  format?: 'number' | 'duration' | 'percent' | 'decimal';
  icon: React.ReactNode;
  delay?: number;
  suffix?: string;
}

function formatValue(value: number, format: string): string {
  switch (format) {
    case 'duration': {
      const mins = Math.floor(value / 60);
      const secs = Math.round(value % 60);
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'decimal':
      return value.toFixed(1);
    default:
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
      return value.toLocaleString();
  }
}

export default function StatCard({
  label,
  value,
  change,
  format = 'number',
  icon,
  delay = 0,
  suffix,
}: StatCardProps) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cardRef.current) return;

    // Card entrance
    gsap.fromTo(
      cardRef.current,
      { y: 30, opacity: 0, scale: 0.95 },
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.6,
        delay: delay,
        ease: 'power3.out',
      }
    );

    // Number counting animation
    if (valueRef.current) {
      const counter = { val: 0 };
      gsap.to(counter, {
        val: value,
        duration: 1.5,
        delay: delay + 0.3,
        ease: 'power2.out',
        onUpdate: () => {
          if (valueRef.current) {
            valueRef.current.textContent = formatValue(
              Math.round(counter.val * 10) / 10,
              format
            );
          }
        },
      });
    }
  }, [value, format, delay]);

  const isPositive = (change ?? 0) >= 0;
  const changeColor = label === 'Bounce Rate'
    ? ((change ?? 0) <= 0 ? 'var(--color-success)' : 'var(--color-danger)')
    : (isPositive ? 'var(--color-success)' : 'var(--color-danger)');
  const changeBg = label === 'Bounce Rate'
    ? ((change ?? 0) <= 0 ? 'var(--color-success-subtle)' : 'var(--color-danger-subtle)')
    : (isPositive ? 'var(--color-success-subtle)' : 'var(--color-danger-subtle)');

  return (
    <div
      ref={cardRef}
      className="glass-card glass-card-hover"
      style={{
        padding: '1.5rem',
        opacity: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      {/* Top Row: Icon + Change Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-accent-subtle)',
            color: 'var(--color-accent)',
          }}
        >
          {icon}
        </div>
        {change != null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.25rem 0.5rem',
              borderRadius: 'var(--radius-full)',
              background: changeBg,
              color: changeColor,
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {(label === 'Bounce Rate' ? (change ?? 0) <= 0 : isPositive) ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>

      {/* Value */}
      <span
        ref={valueRef}
        style={{
          fontSize: '2rem',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          lineHeight: 1.1,
        }}
      >
        0
      </span>

      {/* Label */}
      <span
        style={{
          fontSize: '0.8125rem',
          color: 'var(--color-text-secondary)',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
    </div>
  );
}
