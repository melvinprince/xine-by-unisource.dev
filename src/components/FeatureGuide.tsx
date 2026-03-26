'use client';

import { BookOpen } from 'lucide-react';

interface Step {
  title: string;
  description: string;
  code?: string;
}

interface FeatureGuideProps {
  title: string;
  steps: Step[];
}

export default function FeatureGuide({ title, steps }: FeatureGuideProps) {
  return (
    <div
      style={{
        marginTop: '1.5rem',
        padding: '1.25rem',
        background: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border-subtle)',
        textAlign: 'left',
        maxWidth: '560px',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <BookOpen size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {steps.map((step, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%',
              background: 'var(--color-accent-subtle)', color: 'var(--color-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6875rem', fontWeight: 700, flexShrink: 0, marginTop: '1px',
            }}>
              {idx + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '2px' }}>
                {step.title}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                {step.description}
              </div>
              {step.code && (
                <code style={{
                  display: 'block', marginTop: '0.375rem', padding: '0.5rem 0.75rem',
                  background: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                  fontSize: '0.6875rem', color: 'var(--color-accent)',
                  fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {step.code}
                </code>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
