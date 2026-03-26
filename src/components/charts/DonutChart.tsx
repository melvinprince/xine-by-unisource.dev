'use client';

import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { DeviceBreakdown } from '@/lib/types';
import { Monitor, Smartphone, Tablet } from 'lucide-react';

interface DonutChartProps {
  data: DeviceBreakdown;
}

const COLORS = [
  'hsl(217, 91%, 60%)',
  'hsl(271, 81%, 65%)',
  'hsl(152, 69%, 53%)',
];

const ICONS = [
  { icon: Monitor, label: 'Desktop' },
  { icon: Smartphone, label: 'Mobile' },
  { icon: Tablet, label: 'Tablet' },
];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.[0]) return null;
  return (
    <div
      style={{
        background: 'var(--color-bg-raised)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '0.5rem 0.75rem',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {payload[0].name}: {payload[0].value.toLocaleString()}
      </p>
    </div>
  );
}

export default function DonutChart({ data }: DonutChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const chartData = [
    { name: 'Desktop', value: data.desktop },
    { name: 'Mobile', value: data.mobile },
    { name: 'Tablet', value: data.tablet },
  ];

  const total = data.desktop + data.mobile + data.tablet;

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, delay: 0.6, ease: 'power3.out' }
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
        }}
      >
        Devices
      </h3>

      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              animationDuration={1200}
              animationBegin={600}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          marginTop: '0.75rem',
        }}
      >
        {chartData.map((entry, index) => {
          const Icon = ICONS[index].icon;
          const pct = ((entry.value / total) * 100).toFixed(1);
          return (
            <div
              key={entry.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.8125rem',
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: COLORS[index],
                  flexShrink: 0,
                }}
              />
              <Icon size={14} style={{ color: 'var(--color-text-muted)' }} />
              <span style={{ color: 'var(--color-text-secondary)', flex: 1 }}>
                {entry.name}
              </span>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
