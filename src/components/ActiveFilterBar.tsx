'use client';

import { useDashboardContext } from './DashboardContext';
import { X, Filter, Trash2 } from 'lucide-react';
import { useRef, useEffect } from 'react';
import gsap from 'gsap';

const dimensionLabels: Record<string, string> = {
  countries: 'Country',
  browsers: 'Browser',
  devices: 'Device',
  sources: 'Source',
  pages: 'Page',
};

export default function ActiveFilterBar() {
  const { activeFilters, toggleFilter, clearFilters, hasActiveFilters, dateRange } = useDashboardContext();
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasActiveFilters && barRef.current) {
      gsap.fromTo(
        barRef.current,
        { height: 0, opacity: 0 },
        { height: 'auto', opacity: 1, duration: 0.3, ease: 'power2.out' }
      );
    }
  }, [hasActiveFilters]);

  if (!hasActiveFilters) return null;

  // Flatten active filters into renderable items
  const filterItems: { dimension: string; value: string; label: string }[] = [];
  Object.entries(activeFilters).forEach(([dim, values]) => {
    const dimension = dim as keyof typeof activeFilters;
    const list = values as string[];
    list.forEach((val) => {
      filterItems.push({
        dimension,
        value: val,
        label: `${dimensionLabels[dim] || dim}: ${val}`,
      });
    });
  });

  const filterCount = filterItems.length;

  return (
    <div
      ref={barRef}
      className="filtered-view"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem',
        padding: '0.625rem 2rem',
        background: 'var(--color-accent-subtle)',
        borderBottom: '1px solid var(--color-border-subtle)',
        width: '100%',
      }}
    >
      {/* Filter icon + count badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginRight: '0.25rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-accent)',
            color: '#fff',
          }}
        >
          <Filter size={12} />
        </div>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-accent)',
            letterSpacing: '0.02em',
          }}
        >
          {filterCount} {filterCount === 1 ? 'Filter' : 'Filters'} Active
        </span>
        <span
          style={{
            fontSize: '0.6875rem',
            color: 'var(--color-text-muted)',
          }}
        >
          · {dateRange.label}
        </span>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', flex: 1 }}>
        {filterItems.map((item) => (
          <div
            key={`${item.dimension}-${item.value}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.1875rem 0.625rem 0.1875rem 0.5rem',
              borderRadius: '9999px',
              background: 'var(--color-bg-base)',
              border: '1px solid var(--color-accent)',
              color: 'var(--color-accent)',
              fontSize: '0.6875rem',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
          >
            <span
              style={{
                fontSize: '0.625rem',
                fontWeight: 700,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}
            >
              {dimensionLabels[item.dimension] || item.dimension}
            </span>
            <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
              {item.value}
            </span>
            <button
              onClick={() => toggleFilter(item.dimension as keyof typeof activeFilters, item.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                padding: '2px',
                color: 'var(--color-accent)',
                cursor: 'pointer',
                opacity: 0.6,
                borderRadius: '50%',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.background = 'var(--color-accent-subtle)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.6';
                e.currentTarget.style.background = 'none';
              }}
              title="Remove filter"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>

      {/* Clear All */}
      <button
        onClick={clearFilters}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          background: 'none',
          border: '1px solid var(--color-border-subtle)',
          padding: '0.25rem 0.625rem',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-secondary)',
          fontSize: '0.6875rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-bg-overlay)';
          e.currentTarget.style.color = 'var(--color-text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'none';
          e.currentTarget.style.color = 'var(--color-text-secondary)';
        }}
      >
        <Trash2 size={11} />
        <span>Clear All</span>
      </button>
    </div>
  );
}
