'use client';

import { useTheme } from './ThemeProvider';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{ height: '36px', width: '100%', marginBottom: '0.25rem' }}></div>
    );
  }

  const cycleTheme = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  const getIcon = () => {
    if (theme === 'light') return <Sun size={18} />;
    if (theme === 'dark') return <Moon size={18} />;
    return <Monitor size={18} />;
  };

  const getLabel = () => {
    if (theme === 'light') return 'Light Theme';
    if (theme === 'dark') return 'Dark Theme';
    return 'System Theme';
  };

  return (
    <button
      onClick={cycleTheme}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: '0.75rem',
        width: '100%',
        padding: '0.625rem 0.75rem',
        marginBottom: '0.25rem',
        background: 'none',
        border: 'none',
        color: 'var(--color-text-secondary)',
        fontSize: '0.8125rem',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      className="sidebar-nav-btn hover-bg"
      title={collapsed ? getLabel() : undefined}
    >
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {getIcon()}
      </div>
      {!collapsed && <span>{getLabel()}</span>}
      
      <style jsx>{`
        .hover-bg:hover {
          background: var(--color-bg-surface);
          color: var(--color-text-primary) !important;
        }
      `}</style>
    </button>
  );
}
