'use client';

import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { TimeseriesPoint } from '@/lib/types';

interface VisitorChartProps {
  data: TimeseriesPoint[];
  annotations?: { id: string; text: string; date: string; category: string }[];
  title?: React.ReactNode;
  primaryDataKey?: string;
  primaryLabel?: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; name?: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div
      style={{
        background: 'var(--color-bg-raised)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '0.75rem 1rem',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <p
        style={{
          fontSize: '0.75rem',
          color: 'var(--color-text-muted)',
          marginBottom: '0.375rem',
        }}
      >
        {label}
      </p>
      {payload.map((entry, i) => (
        <p
          key={i}
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color:
              entry.dataKey === 'visitors'
                ? 'hsl(217 91% 60%)'
                : 'hsl(271 81% 65%)',
            margin: '0.125rem 0',
          }}
        >
          {entry.dataKey === 'visitors' || entry.dataKey === 'count' ? (entry.name || 'Count') : 'Pageviews'}:{' '}
          {entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export default function VisitorChart({ 
  data, 
  annotations = [],
  title = "Visitor Trend",
  primaryDataKey = "visitors",
  primaryLabel = "Visitors",
}: VisitorChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, delay: 0.4, ease: 'power3.out' }
      );
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="glass-card"
      style={{ padding: '1.5rem', opacity: 0 }}
    >
      <h3
        style={{
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        {title}
      </h3>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <AreaChart
            data={data}
            margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
          >
            <defs>
              <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="hsl(217, 91%, 60%)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="hsl(217, 91%, 60%)"
                  stopOpacity={0}
                />
              </linearGradient>
              <linearGradient id="colorPageviews" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="hsl(271, 81%, 65%)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="hsl(271, 81%, 65%)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border-subtle)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              stroke="var(--color-text-muted)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <YAxis
              stroke="var(--color-text-muted)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)
              }
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={primaryDataKey}
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              fill="url(#colorVisitors)"
              animationDuration={1500}
            />
            <Area
              type="monotone"
              dataKey="pageviews"
              stroke="hsl(271, 81%, 65%)"
              strokeWidth={2}
              fill="url(#colorPageviews)"
              animationDuration={1500}
            />
            {annotations.map((ann) => {
              const dateStr = new Date(ann.date).toISOString().slice(0, 10);
              return (
                <ReferenceLine 
                  key={ann.id} 
                  x={dateStr} 
                  stroke="var(--color-accent)" 
                  strokeDasharray="3 3"
                  label={{ position: 'insideTopLeft', value: ann.text, fill: 'var(--color-text-secondary)', fontSize: 10, offset: 10 }}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
