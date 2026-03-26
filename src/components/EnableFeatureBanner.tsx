'use client';

import { useState } from 'react';
import { Settings, Zap } from 'lucide-react';
import { useDashboardContext } from '@/components/DashboardContext';

interface EnableFeatureBannerProps {
  featureKey: string;
  featureLabel: string;
  description: string;
}

export default function EnableFeatureBanner({ featureKey, featureLabel, description }: EnableFeatureBannerProps) {
  const { selectedSite: siteId } = useDashboardContext();
  const [enabling, setEnabling] = useState(false);
  const [enabled, setEnabled] = useState(false);

  if (!siteId || enabled) return null;

  const handleEnable = async () => {
    setEnabling(true);
    try {
      // Fetch current settings
      const res = await fetch(`/api/sites/${siteId}/settings`);
      const features = await res.json();

      // Enable the feature
      features[featureKey] = true;

      // Save back
      await fetch(`/api/sites/${siteId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
      });

      setEnabled(true);
    } catch (err) {
      console.error('Failed to enable feature:', err);
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      padding: '0.75rem 1.25rem',
      background: 'linear-gradient(135deg, rgba(var(--color-accent-rgb, 99,102,241), 0.08), rgba(var(--color-accent-rgb, 99,102,241), 0.02))',
      border: '1px solid rgba(var(--color-accent-rgb, 99,102,241), 0.2)',
      borderRadius: 'var(--radius-md)',
      marginBottom: '1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
        <Zap size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        <div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {featureLabel} is not enabled for this site
          </span>
          <p style={{ margin: '0.125rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {description}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        <button
          onClick={handleEnable}
          disabled={enabling}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.375rem 0.875rem',
            background: 'var(--color-accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: enabling ? 'wait' : 'pointer',
            opacity: enabling ? 0.7 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          <Zap size={12} />
          {enabling ? 'Enabling...' : 'Enable Now'}
        </button>
        <a
          href="/dashboard/settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.375rem 0.625rem',
            background: 'var(--color-bg-overlay)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.75rem',
            fontWeight: 500,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <Settings size={12} />
          Settings
        </a>
      </div>
    </div>
  );
}
