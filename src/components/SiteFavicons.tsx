'use client';

import type { Site } from '@/lib/types';

interface SiteFaviconsProps {
  siteIds: string[];
  sites: Site[];
}

export default function SiteFavicons({ siteIds, sites }: SiteFaviconsProps) {
  if (!siteIds || siteIds.length === 0) return null;

  // Resolve matching sites
  const matchedSites = siteIds
    .map((id) => sites.find((s) => s.id === id))
    .filter(Boolean) as Site[];

  if (matchedSites.length === 0) return null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        marginLeft: '0.5rem',
        verticalAlign: 'middle',
      }}
      className="site-favicons-container"
    >
      {matchedSites.slice(0, 3).map((site, index) => {
        // Fallback letter inside colored circle if domain fails to load
        const fallbackColor = `hsl(${(site.name.charCodeAt(0) * 23) % 360}, 65%, 45%)`;
        
        return (
          <div
            key={site.id}
            title={`${site.name} (${site.domain})`}
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginLeft: index > 0 ? '-6px' : '0',
              zIndex: 10 - index,
              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              position: 'relative',
              cursor: 'help',
            }}
          >
            <img
              src={`https://${site.domain}/favicon.ico`}
              alt={site.name}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
            {/* Fallback circle background with initial */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: fallbackColor,
                color: '#fff',
                fontSize: '8px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: -1,
                textTransform: 'uppercase',
              }}
            >
              {site.name.charAt(0)}
            </div>
          </div>
        );
      })}
      {matchedSites.length > 3 && (
        <span
          style={{
            fontSize: '0.65rem',
            color: 'var(--color-text-muted)',
            fontWeight: 600,
            marginLeft: '0.25rem',
          }}
          title={matchedSites.map((s) => s.name).join(', ')}
        >
          +{matchedSites.length - 3}
        </span>
      )}
    </div>
  );
}
