'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

interface HelpTooltipProps {
  title: string;
  content: string;
  usage?: string;
}

export default function HelpTooltip({ title, content, usage }: HelpTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(false), 150);
  }, []);

  // Position the tooltip using fixed positioning relative to viewport
  useEffect(() => {
    if (!visible || !iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    const tooltipWidth = 280;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    // Clamp to viewport edges
    if (left < 8) left = 8;
    if (left + tooltipWidth > window.innerWidth - 8) left = window.innerWidth - tooltipWidth - 8;
    setPos({ top: rect.bottom + 8, left });
  }, [visible]);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  return (
    <>
      <button
        ref={iconRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setVisible(v => !v); }}
        style={{
          background: 'none',
          border: 'none',
          padding: '2px',
          cursor: 'help',
          color: 'var(--color-text-muted)',
          display: 'inline-flex',
          alignItems: 'center',
          verticalAlign: 'middle',
          transition: 'color 0.2s, opacity 0.2s',
          opacity: visible ? 1 : 0.5,
          marginLeft: '4px',
          position: 'relative',
          top: '-1px',
        }}
        aria-label={`Help: ${title}`}
      >
        <HelpCircle size={14} style={{ color: visible ? 'var(--color-accent)' : undefined }} />
      </button>

      {/* Portal fixing CSS transform containing block issues */}
      {visible && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={tooltipRef}
              onMouseEnter={show}
              onMouseLeave={hide}
              style={{
                position: 'fixed',
                top: `${pos.top}px`,
                left: `${pos.left}px`,
                width: '280px',
                background: 'var(--color-bg-raised, #1e293b)',
                border: '1px solid var(--color-border-subtle, #334155)',
                borderRadius: 'var(--radius-md, 8px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                padding: '0.875rem',
                zIndex: 99999,
                opacity: 1,
                animation: 'helpTooltipIn 0.2s ease-out',
                pointerEvents: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h4 style={{ margin: '0 0 0.375rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary, #f1f5f9)' }}>
                {title}
              </h4>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary, #94a3b8)', lineHeight: 1.5 }}>
                {content}
              </p>
              {usage && (
                <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--color-bg-base, #0f172a)', borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--color-border-subtle, #334155)' }}>
                  <span style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--color-accent, #10b981)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>How to use</span>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: 'var(--color-text-secondary, #94a3b8)', lineHeight: 1.4 }}>
                    {usage}
                  </p>
                </div>
              )}
            </div>,
            document.body
          )
        : null}

      {/* Inject keyframes once */}
      <style jsx global>{`
        @keyframes helpTooltipIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
