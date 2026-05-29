'use client';

import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { DeviceBreakdown } from '@/lib/types';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import SectionHeader from '@/components/SectionHeader';

interface DonutChartProps {
  data: DeviceBreakdown;
  title?: string;
  onSegmentClick?: (segmentName: string) => void;
  selectedDevices?: string[];
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
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '0.5rem 0.75rem',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {payload[0].name}: {payload[0].value.toLocaleString()}
      </p>
    </div>
  );
}

export default function DonutChart({ data, title = "Devices", onSegmentClick, selectedDevices }: DonutChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const chartData = [
    { name: 'Desktop', value: data.desktop },
    { name: 'Mobile', value: data.mobile },
    { name: 'Tablet', value: data.tablet },
  ];

  const total = data.desktop + data.mobile + data.tablet || 1; // avoid division by 0

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
      <SectionHeader title={title} />

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
              onClick={(segmentData: any) => {
                if (segmentData && onSegmentClick) {
                  onSegmentClick(segmentData.name.toLowerCase());
                }
              }}
            >
              {chartData.map((entry, index) => {
                const isSelected = selectedDevices && selectedDevices.includes(entry.name.toLowerCase());
                const isAnySelected = selectedDevices && selectedDevices.length > 0;
                const fill = isAnySelected ? (isSelected ? COLORS[index] : 'var(--color-border-subtle)') : COLORS[index];
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={fill}
                    style={{
                      cursor: onSegmentClick ? 'pointer' : 'default',
                      transition: 'fill 0.2s ease',
                    }}
                  />
                );
              })}
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
          const isSelected = selectedDevices && selectedDevices.includes(entry.name.toLowerCase());
          const isAnySelected = selectedDevices && selectedDevices.length > 0;
          return (
            <div
              key={entry.name}
              onClick={() => onSegmentClick && onSegmentClick(entry.name.toLowerCase())}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.8125rem',
                cursor: onSegmentClick ? 'pointer' : 'default',
                opacity: isAnySelected && !isSelected ? 0.35 : 1,
                transition: 'all 0.2s ease',
              }}
              className="legend-item"
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: COLORS[index],
                  flexShrink: 0,
                  boxShadow: isSelected ? `0 0 0 2px var(--color-bg-base), 0 0 0 4px ${COLORS[index]}` : undefined,
                  transition: 'box-shadow 0.2s ease',
                }}
              />
              <Icon size={14} style={{ color: isSelected ? 'var(--color-accent)' : 'var(--color-text-muted)' }} />
              <span style={{ color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', flex: 1, fontWeight: isSelected ? 600 : 400 }}>
                {entry.name}
              </span>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
