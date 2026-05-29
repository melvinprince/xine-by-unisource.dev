'use client';

import { useRef, useEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import SectionHeader from '@/components/SectionHeader';

interface Column<T> {
  key: keyof T;
  label: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  title?: string;
  delay?: number;
  onRowClick?: (row: T) => void;
  selectedValues?: string[];
  selectableKey?: keyof T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  title,
  delay = 0.5,
  onRowClick,
  selectedValues,
  selectableKey,
}: DataTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLTableSectionElement>(null);
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, delay, ease: 'power3.out' }
      );
    }
  }, [delay]);

  useEffect(() => {
    if (rowsRef.current) {
      const rows = rowsRef.current.querySelectorAll('tr');
      gsap.fromTo(
        rows,
        { opacity: 0, x: -10 },
        {
          opacity: 1,
          x: 0,
          duration: 0.3,
          stagger: 0.04,
          delay: delay + 0.3,
          ease: 'power2.out',
        }
      );
    }
  }, [data, delay]);

  const handleSort = (key: keyof T) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedData = [...data];
  if (sortKey) {
    sortedData.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }

  return (
    <div
      ref={containerRef}
      className="glass-card"
      style={{ padding: '1.5rem', opacity: 0, overflow: 'hidden' }}
    >
      {title && <SectionHeader title={title} />}

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.8125rem',
          }}
        >
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  style={{
                    padding: '0.625rem 0.75rem',
                    textAlign: col.align || 'left',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                    fontSize: '0.6875rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    cursor:
                      col.sortable !== false ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    width: col.width,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                    }}
                  >
                    {col.label}
                    {col.sortable !== false && (
                      <>
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? (
                            <ArrowUp size={12} />
                          ) : (
                            <ArrowDown size={12} />
                          )
                        ) : (
                          <ArrowUpDown size={12} style={{ opacity: 0.4 }} />
                        )}
                      </>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={rowsRef}>
            {sortedData.map((row, i) => {
              const isSelected = selectedValues && selectableKey && selectedValues.includes(String(row[selectableKey]));
              return (
                <tr
                  key={i}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`${onRowClick ? 'clickable-row' : ''} ${isSelected ? 'selected-row' : ''}`}
                  style={{
                    transition: 'background 0.15s ease',
                  }}
                >
                  {columns.map((col, colIdx) => (
                    <td
                      key={String(col.key)}
                      style={{
                        padding: '0.625rem 0.75rem',
                        textAlign: col.align || 'left',
                        color: 'var(--color-text-secondary)',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        whiteSpace: 'nowrap',
                        borderLeft: colIdx === 0 && isSelected ? '3px solid var(--color-accent)' : undefined,
                        paddingLeft: colIdx === 0 && isSelected ? 'calc(0.75rem - 3px)' : '0.75rem',
                        fontVariantNumeric: col.align === 'right' ? 'tabular-nums' : undefined,
                      }}
                    >
                      {col.render
                        ? col.render(row[col.key], row)
                        : String(row[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
