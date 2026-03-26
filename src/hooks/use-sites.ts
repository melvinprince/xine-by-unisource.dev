'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Site } from '@/lib/types';

interface UseSitesReturn {
  sites: Site[];
  loading: boolean;
  error: string | null;
  addSite: (name: string, domain: string) => Promise<Site | null>;
  deleteSite: (siteId: string) => Promise<boolean>;
  refetch: () => void;
}

export function useSites(): UseSitesReturn {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSites = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/sites');
      if (!res.ok) {
        throw new Error('Failed to fetch sites');
      }
      const data = await res.json();
      setSites(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  const addSite = async (name: string, domain: string): Promise<Site | null> => {
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, domain }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create site');
      }
      const newSite: Site = await res.json();
      setSites((prev) => [newSite, ...prev]);
      return newSite;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  };

  const deleteSite = async (siteId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error('Failed to delete site');
      }
      setSites((prev) => prev.filter((s) => s.id !== siteId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  };

  return { sites, loading, error, addSite, deleteSite, refetch: fetchSites };
}
