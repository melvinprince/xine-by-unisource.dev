'use client';

import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ChevronDown, Globe } from 'lucide-react';
import type { Site } from '@/lib/types';

interface SiteSelectorProps {
  sites: Site[];
  selected: string;
  onChange: (siteId: string) => void;
}

export default function SiteSelector({
  sites,
  selected,
  onChange,
}: SiteSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedSite = sites.find((s) => s.id === selected);
  const label = selected === 'all' ? 'All Sites' : selectedSite?.name ?? 'Select Site';

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

  const handleSelect = (id: string) => {
    onChange(id);
    closeMenu();
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        className="btn-ghost"
        style={{ gap: '0.5rem' }}
      >
        <Globe size={16} />
        <span>{label}</span>
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
            left: 0,
            minWidth: '200px',
            background: 'var(--color-bg-raised)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '0.375rem',
            zIndex: 100,
          }}
        >
          {/* All Sites Option */}
          <button
            onClick={() => handleSelect('all')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              width: '100%',
              padding: '0.5rem 0.75rem',
              textAlign: 'left',
              background:
                selected === 'all'
                  ? 'var(--color-accent-subtle)'
                  : 'transparent',
              color:
                selected === 'all'
                  ? 'var(--color-accent)'
                  : 'var(--color-text-secondary)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: '0.8125rem',
              fontFamily: 'inherit',
              fontWeight: selected === 'all' ? 600 : 400,
              transition: 'all 0.15s ease',
            }}
          >
            All Sites
          </button>
          <div
            style={{
              height: '1px',
              background: 'var(--color-border-subtle)',
              margin: '0.25rem 0',
            }}
          />
          {sites.map((site) => (
            <button
              key={site.id}
              onClick={() => handleSelect(site.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                width: '100%',
                padding: '0.5rem 0.75rem',
                textAlign: 'left',
                background:
                  selected === site.id
                    ? 'var(--color-accent-subtle)'
                    : 'transparent',
                color:
                  selected === site.id
                    ? 'var(--color-accent)'
                    : 'var(--color-text-secondary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontFamily: 'inherit',
                fontWeight: selected === site.id ? 600 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              <span>{site.name}</span>
              <span
                style={{
                  fontSize: '0.6875rem',
                  opacity: 0.6,
                }}
              >
                {site.domain}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
