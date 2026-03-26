'use client';

import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { Calendar, ChevronDown } from 'lucide-react';

interface DateRangePickerProps {
  onChange?: (range: { from: string; to: string; label: string }) => void;
}

const presets = [
  { label: 'Last 1 hour', hours: 1 },
  { label: 'Last 3 hours', hours: 3 },
  { label: 'Last 12 hours', hours: 12 },
  { label: 'Today', days: 0 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

function getDateRange(preset: typeof presets[0]) {
  const to = new Date();
  const from = new Date();

  if ('hours' in preset && preset.hours) {
    // Hour-based: pass full ISO timestamp to preserve the exact time window
    from.setHours(from.getHours() - preset.hours);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
    };
  } else if ('days' in preset) {
    // Day-based: add 1 day to 'to' so today's data is always included
    to.setDate(to.getDate() + 1);
    from.setDate(from.getDate() - (preset.days || 0));
    return {
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
    };
  }

  // Fallback
  to.setDate(to.getDate() + 1);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export default function DateRangePicker({ onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState('Last 30 days');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const openMenu = () => {
    setIsOpen(true);
    requestAnimationFrame(() => {
      if (menuRef.current) {
        gsap.fromTo(
          menuRef.current,
          { opacity: 0, y: -8, scaleY: 0.95 },
          {
            opacity: 1,
            y: 0,
            scaleY: 1,
            duration: 0.25,
            ease: 'power2.out',
            transformOrigin: 'top center',
          }
        );
      }
    });
  };

  const closeMenu = () => {
    if (menuRef.current) {
      gsap.to(menuRef.current, {
        opacity: 0,
        y: -8,
        duration: 0.15,
        ease: 'power2.in',
        onComplete: () => setIsOpen(false),
      });
    } else {
      setIsOpen(false);
    }
  };

  const selectPreset = (preset: (typeof presets)[0]) => {
    setSelected(preset.label);
    const range = getDateRange(preset);
    onChange?.({ ...range, label: preset.label });
    closeMenu();
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        className="btn-ghost"
        style={{ gap: '0.5rem' }}
      >
        <Calendar size={16} />
        <span>{selected}</span>
        <ChevronDown
          size={14}
          style={{
            transition: 'transform 0.2s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.5rem)',
            right: 0,
            minWidth: '180px',
            background: 'var(--color-bg-raised)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '0.375rem',
            zIndex: 100,
          }}
        >
          {/* Hour-based presets */}
          <div style={{ padding: '0.25rem 0.75rem 0.375rem', fontSize: '0.625rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Hours
          </div>
          {presets.filter(p => 'hours' in p).map((preset) => (
            <button
              key={preset.label}
              onClick={() => selectPreset(preset)}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.5rem 0.75rem',
                textAlign: 'left',
                background:
                  selected === preset.label
                    ? 'var(--color-accent-subtle)'
                    : 'transparent',
                color:
                  selected === preset.label
                    ? 'var(--color-accent)'
                    : 'var(--color-text-secondary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontFamily: 'inherit',
                fontWeight: selected === preset.label ? 600 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              {preset.label}
            </button>
          ))}

          {/* Separator */}
          <div style={{ height: '1px', background: 'var(--color-border-subtle)', margin: '0.375rem 0.5rem' }} />

          {/* Day-based presets */}
          <div style={{ padding: '0.25rem 0.75rem 0.375rem', fontSize: '0.625rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Days
          </div>
          {presets.filter(p => 'days' in p).map((preset) => (
            <button
              key={preset.label}
              onClick={() => selectPreset(preset)}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.5rem 0.75rem',
                textAlign: 'left',
                background:
                  selected === preset.label
                    ? 'var(--color-accent-subtle)'
                    : 'transparent',
                color:
                  selected === preset.label
                    ? 'var(--color-accent)'
                    : 'var(--color-text-secondary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontFamily: 'inherit',
                fontWeight: selected === preset.label ? 600 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
