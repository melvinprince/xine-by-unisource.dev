'use client';

import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { BrowserStat } from '@/lib/types';
import SectionHeader from '@/components/SectionHeader';

interface BarChartProps {
  data: BrowserStat[];
  title?: string;
  onBarClick?: (browserName: string) => void;
  selectedBrowsers?: string[];
}

const COLORS = [
  'hsl(217, 91%, 60%)',
  'hsl(271, 81%, 65%)',
  'hsl(152, 69%, 53%)',
  'hsl(38, 92%, 60%)',
  'hsl(340, 82%, 62%)',
];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { browser: string }; value: number }> }) {
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
        {payload[0].payload.browser}: {payload[0].value.toLocaleString()}
      </p>
    </div>
  );
}

export default function BarChart({ data, title = "Browsers", onBarClick, selectedBrowsers }: BarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, delay: 0.7, ease: 'power3.out' }
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

      <div style={{ width: '100%', height: 250 }}>
        <ResponsiveContainer>
          <RechartsBarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              stroke="var(--color-text-muted)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)
              }
            />
            <YAxis
              type="category"
              dataKey="browser"
              stroke="var(--color-text-muted)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={65}
              tick={(props) => {
                const { x, y, payload } = props;
                const isSelected = selectedBrowsers && selectedBrowsers.includes(payload.value);
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={-6}
                      y={4}
                      dy={0}
                      textAnchor="end"
                      fill={isSelected ? "var(--color-accent)" : "var(--color-text-muted)"}
                      fontWeight={isSelected ? 600 : 400}
                      fontSize={11}
                      style={{ transition: 'fill 0.2s ease, font-weight 0.2s ease', cursor: onBarClick ? 'pointer' : 'default' }}
                      onClick={() => onBarClick && onBarClick(payload.value)}
                    >
                      {payload.value}
                    </text>
                  </g>
                );
              }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-bg-raised)' }} />
            <Bar
              dataKey="count"
              radius={[0, 6, 6, 0]}
              animationDuration={1200}
              animationBegin={700}
              onClick={(barData: any) => {
                if (barData && onBarClick) {
                  const browser = barData.browser || barData.payload?.browser;
                  if (browser) onBarClick(browser);
                }
              }}
            >
              {data.map((entry, index) => {
                const isSelected = selectedBrowsers && selectedBrowsers.includes(entry.browser);
                const isAnySelected = selectedBrowsers && selectedBrowsers.length > 0;
                const fill = isAnySelected ? (isSelected ? COLORS[index % COLORS.length] : 'var(--color-border-subtle)') : COLORS[index % COLORS.length];
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={fill}
                    style={{
                      cursor: onBarClick ? 'pointer' : 'default',
                      transition: 'fill 0.2s ease',
                    }}
                  />
                );
              })}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
