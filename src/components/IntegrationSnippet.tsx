'use client';

import { useState, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Check, Copy, Code } from 'lucide-react';

gsap.registerPlugin(useGSAP);

interface IntegrationSnippetProps {
  apiKey: string;
  domain?: string;
}

export default function IntegrationSnippet({
  apiKey,
  domain,
}: IntegrationSnippetProps) {
  const resolvedDomain = domain || (typeof window !== 'undefined' ? window.location.host : 'your-analytics-domain.com');
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const checkRef = useRef<HTMLSpanElement>(null);

  const snippet = `<script defer src="https://${resolvedDomain}/t.js" data-api-key="${apiKey}"></script>`;

  const handleCopy = async () => {
    let success = false;

    // 1. Try modern Clipboard API
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(snippet);
        success = true;
      }
    } catch (err) {
      console.warn('Clipboard API failed, using fallback', err);
    }

    // 2. Fallback to execCommand for non-secure contexts (HTTP) or when Clipboard API rejects
    if (!success) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = snippet;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (err) {
        console.error('Fallback clipboard copy failed', err);
      }
    }

    // 3. Update UI if successful
    if (success) {
      setCopied(true);

      // Simple animation check
      setTimeout(() => {
        if (checkRef.current) {
          gsap.fromTo(
            checkRef.current,
            { scale: 0, rotate: -90 },
            { scale: 1, rotate: 0, duration: 0.4, ease: 'back.out(2)' }
          );
        }
      }, 0);

      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.625rem 1rem',
          background: 'var(--color-bg-surface)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <Code size={14} />
          HTML Snippet
        </div>
        <button
          onClick={handleCopy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.25rem 0.625rem',
            background: copied
              ? 'var(--color-success-subtle)'
              : 'var(--color-bg-overlay)',
            border: '1px solid',
            borderColor: copied
              ? 'var(--color-success)'
              : 'var(--color-border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: copied
              ? 'var(--color-success)'
              : 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontFamily: 'inherit',
            fontWeight: 500,
            transition: 'all 0.2s ease',
          }}
        >
          {copied ? (
            <>
              <span ref={checkRef}>
                <Check size={12} />
              </span>
              Copied!
            </>
          ) : (
            <>
              <Copy size={12} />
              Copy
            </>
          )}
        </button>
      </div>
      <pre
        style={{
          padding: '1rem',
          margin: 0,
          background: 'var(--color-bg-base)',
          color: 'var(--color-chart-3)',
          fontSize: '0.8125rem',
          fontFamily:
            "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
          overflowX: 'auto',
          lineHeight: 1.6,
          maxWidth: '100%',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        <code>{snippet}</code>
      </pre>
    </div>
  );
}
