'use client';

import SiteSelector from './SiteSelector';
import DateRangePicker from './DateRangePicker';
import type { Site } from '@/lib/types';

interface HeaderProps {
  title: string;
  sites: Site[];
  selectedSite: string;
  onSiteChange: (siteId: string) => void;
  onDateRangeChange?: (range: { from: string; to: string; label: string }) => void;
}

export default function Header({
  title,
  sites,
  selectedSite,
  onSiteChange,
  onDateRangeChange,
}: HeaderProps) {
  return (
    <header
      className="dashboard-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 2rem',
        minHeight: '64px',
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-base)',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        backdropFilter: 'blur(12px)',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <h1
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          margin: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </h1>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <SiteSelector
          sites={sites}
          selected={selectedSite}
          onChange={onSiteChange}
        />
        <DateRangePicker onChange={onDateRangeChange} />
      </div>
    </header>
  );
}

