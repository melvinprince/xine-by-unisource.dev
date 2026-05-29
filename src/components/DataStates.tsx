'use client';

import { BarChart3, AlertTriangle } from 'lucide-react';

/* ============================================================
   LOADING STATE — Skeleton screens shaped like real content
   ============================================================ */

interface LoadingStateProps {
  message?: string;
  variant?: 'page' | 'cards' | 'chart' | 'table' | 'inline';
}

export function LoadingState({ message = 'Loading data...', variant = 'page' }: LoadingStateProps) {
  if (variant === 'inline') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '2rem 0' }}>
        <div className="skeleton" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{message}</span>
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div className="skeleton" style={{ width: '40px', height: '40px' }} />
              <div className="skeleton" style={{ width: '60px', height: '24px', borderRadius: '9999px' }} />
            </div>
            <div className="skeleton skeleton-stat" style={{ marginBottom: '0.5rem' }} />
            <div className="skeleton skeleton-text" style={{ width: '50%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div className="skeleton skeleton-heading" style={{ marginBottom: '1rem' }} />
        <div className="skeleton skeleton-chart" />
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div className="skeleton skeleton-heading" style={{ marginBottom: '1rem' }} />
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: '1rem',
              padding: '0.75rem 0',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}
          >
            <div className="skeleton skeleton-text" style={{ flex: 2 }} />
            <div className="skeleton skeleton-text" style={{ flex: 1 }} />
            <div className="skeleton skeleton-text" style={{ width: '60px' }} />
          </div>
        ))}
      </div>
    );
  }

  // Default: full page skeleton
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div className="skeleton" style={{ width: '40px', height: '40px' }} />
        <div>
          <div className="skeleton" style={{ width: '160px', height: '1.25rem', marginBottom: '0.375rem' }} />
          <div className="skeleton" style={{ width: '240px', height: '0.75rem' }} />
        </div>
      </div>

      {/* Stat cards skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div className="skeleton" style={{ width: '40px', height: '40px' }} />
              <div className="skeleton" style={{ width: '60px', height: '24px', borderRadius: '9999px' }} />
            </div>
            <div className="skeleton skeleton-stat" style={{ marginBottom: '0.5rem' }} />
            <div className="skeleton skeleton-text" style={{ width: '50%' }} />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div className="skeleton skeleton-heading" style={{ marginBottom: '1rem' }} />
        <div className="skeleton skeleton-chart" />
      </div>

      {/* Two-column skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: '1rem' }}>
        {[1, 2].map((i) => (
          <div key={i} className="glass-card" style={{ padding: '1.5rem' }}>
            <div className="skeleton skeleton-heading" style={{ marginBottom: '1rem' }} />
            {[1, 2, 3, 4].map((j) => (
              <div
                key={j}
                style={{
                  display: 'flex',
                  gap: '1rem',
                  padding: '0.625rem 0',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <div className="skeleton skeleton-text" style={{ flex: 2 }} />
                <div className="skeleton skeleton-text" style={{ flex: 1 }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   EMPTY STATE — Illustrated placeholder with context
   ============================================================ */

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
}

export function EmptyState({
  icon,
  title = 'No data yet',
  description = 'Start tracking visitors to see analytics here.',
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        gap: '1rem',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '64px',
          height: '64px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--color-bg-overlay)',
          color: 'var(--color-text-muted)',
        }}
      >
        {icon || <BarChart3 size={28} />}
      </div>
      <h3
        style={{
          fontSize: '1.125rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          margin: 0,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          color: 'var(--color-text-muted)',
          fontSize: '0.8125rem',
          maxWidth: '360px',
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {description}
      </p>
    </div>
  );
}

/* ============================================================
   ERROR STATE — With retry action
   ============================================================ */

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = 'Something went wrong',
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        gap: '1rem',
        padding: '2rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '56px',
          height: '56px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--color-danger-subtle)',
          color: 'var(--color-danger)',
        }}
      >
        <AlertTriangle size={24} />
      </div>
      <p
        style={{
          color: 'var(--color-text-secondary)',
          fontSize: '0.875rem',
          textAlign: 'center',
          maxWidth: '360px',
          margin: 0,
        }}
      >
        {message}
      </p>
      {onRetry && (
        <button className="btn-ghost" onClick={onRetry} style={{ marginTop: '0.5rem' }}>
          Try Again
        </button>
      )}
    </div>
  );
}
