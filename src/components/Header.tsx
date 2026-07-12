'use client';

import { usePathname } from 'next/navigation';
import SiteSelector from './SiteSelector';
import DateRangePicker from './DateRangePicker';
import type { Site } from '@/lib/types';

interface HeaderProps {
  title: string;
  sites: Site[];
  selectedSite: string;
  onSiteChange: (siteId: string) => void;
  onDateRangeChange?: (range: { from: string; to: string; label: string }) => void;
  dateRangeLabel?: string;
}

/* Map route to page title */
const routeTitles: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/realtime': 'Realtime',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/performance': 'Web Vitals',
  '/dashboard/behavior': 'Behavior',
  '/dashboard/acquisition': 'Acquisition',
  '/dashboard/seo': 'SEO',
  '/dashboard/goals': 'Goals',
  '/dashboard/retention': 'Retention',
  '/dashboard/funnels': 'Funnels',
  '/dashboard/events': 'Events',
  '/dashboard/annotations': 'Annotations',
  '/dashboard/monitors': 'Monitors',
  '/dashboard/replay': 'Session Replay',
  '/dashboard/settings': 'Settings',
  '/dashboard/debug': 'Debug',
};

export default function Header({
  sites,
  selectedSite,
  onSiteChange,
  onDateRangeChange,
  dateRangeLabel,
}: HeaderProps) {
  const pathname = usePathname();
  const pageTitle = routeTitles[pathname] || 'Dashboard';

  return (
    <header
      className="dashboard-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2rem',
        minHeight: '64px',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-base)',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        gap: '1rem',
      }}
    >
      {/* Left: Page Title */}
      <h1
        style={{
          fontSize: '1rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          margin: 0,
          whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
        }}
      >
        {pageTitle}
      </h1>

      {/* Right: Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <SiteSelector
          sites={sites}
          selected={selectedSite}
          onChange={onSiteChange}
        />
        <div
          style={{
            width: '1px',
            height: '24px',
            background: 'var(--color-border-subtle)',
          }}
        />
        <DateRangePicker onChange={onDateRangeChange} value={dateRangeLabel} />
      </div>
    </header>
  );
}
