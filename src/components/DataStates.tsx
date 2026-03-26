'use client';

import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading data...' }: LoadingStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50vh',
        gap: '1rem',
      }}
    >
      <Loader2
        size={32}
        style={{
          color: 'var(--color-accent)',
          animation: 'spin 1s linear infinite',
        }}
      />
      <p
        style={{
          color: 'var(--color-text-secondary)',
          fontSize: '0.875rem',
        }}
      >
        {message}
      </p>
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

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
        height: '40vh',
        gap: '0.75rem',
        textAlign: 'center',
      }}
    >
      {icon && (
        <div style={{ opacity: 0.3, color: 'var(--color-text-muted)' }}>
          {icon}
        </div>
      )}
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
          color: 'var(--color-text-secondary)',
          fontSize: '0.8125rem',
          maxWidth: '320px',
        }}
      >
        {description}
      </p>
    </div>
  );
}

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
        height: '40vh',
        gap: '0.75rem',
      }}
    >
      <p
        style={{
          color: 'var(--color-danger)',
          fontSize: '0.875rem',
        }}
      >
        {message}
      </p>
      {onRetry && (
        <button className="btn-ghost" onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
}
