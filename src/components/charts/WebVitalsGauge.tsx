'use client';

import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';

interface WebVitalsGaugeProps {
  metric: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  unit?: string;
}

const RATING_COLORS = {
  good: 'var(--color-success)',
  'needs-improvement': 'var(--color-warning)',
  poor: 'var(--color-danger)',
};

const RATING_LABELS = {
  good: 'Good',
  'needs-improvement': 'Needs Work',
  poor: 'Poor',
};

const METRIC_LABELS: Record<string, string> = {
  LCP: 'Largest Contentful Paint',
  FCP: 'First Contentful Paint',
  CLS: 'Cumulative Layout Shift',
  INP: 'Interaction to Next Paint',
  TTFB: 'Time to First Byte',
};

export default function WebVitalsGauge({
  metric,
  value,
  rating,
  unit = 'ms',
}: WebVitalsGaugeProps) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);

  const color = RATING_COLORS[rating];
  const circumference = 2 * Math.PI * 42;
  const ratingPercent =
    rating === 'good' ? 100 : rating === 'needs-improvement' ? 60 : 30;
  const dashOffset = circumference * (1 - ratingPercent / 100);

  useEffect(() => {
    if (valueRef.current) {
      gsap.fromTo(
        valueRef.current,
        { textContent: '0', opacity: 0 },
        {
          textContent: String(value),
          opacity: 1,
          duration: 1,
          ease: 'power2.out',
          snap: { textContent: 1 },
        }
      );
    }
    if (ringRef.current) {
      gsap.fromTo(
        ringRef.current,
        { strokeDashoffset: circumference },
        {
          strokeDashoffset: dashOffset,
          duration: 1.2,
          ease: 'power2.out',
        }
      );
    }
  }, [value, circumference, dashOffset]);

  const displayValue =
    metric === 'CLS' ? (value / 1000).toFixed(3) : String(value);
  const displayUnit = metric === 'CLS' ? '' : unit;

  return (
    <div
      className="glass-card glass-card-hover"
      style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      {/* Gauge ring */}
      <div style={{ position: 'relative', width: '96px', height: '96px' }}>
        <svg
          width="96"
          height="96"
          viewBox="0 0 96 96"
          style={{ transform: 'rotate(-90deg)' }}
        >
          <circle
            cx="48"
            cy="48"
            r="42"
            fill="none"
            stroke="var(--color-bg-surface)"
            strokeWidth="6"
          />
          <circle
            ref={ringRef}
            cx="48"
            cy="48"
            r="42"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            ref={valueRef}
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
            }}
          >
            {displayValue}
          </span>
          <span
            style={{
              fontSize: '0.625rem',
              color: 'var(--color-text-muted)',
            }}
          >
            {displayUnit}
          </span>
        </div>
      </div>

      {/* Label */}
      <span
        style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}
      >
        {metric}
      </span>
      <span
        style={{
          fontSize: '0.6875rem',
          color: 'var(--color-text-muted)',
          textAlign: 'center',
          lineHeight: 1.3,
        }}
      >
        {METRIC_LABELS[metric] || metric}
      </span>

      {/* Rating badge */}
      <span
        style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          color,
          padding: '0.125rem 0.5rem',
          borderRadius: 'var(--radius-full)',
          background: `${color}22`,
        }}
      >
        {RATING_LABELS[rating]}
      </span>
    </div>
  );
}
