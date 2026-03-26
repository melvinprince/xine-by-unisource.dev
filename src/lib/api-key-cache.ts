/**
 * In-memory cache for API key → site_id lookups.
 * Avoids hitting Supabase on every /api/collect request.
 * TTL: 5 minutes.
 */

interface CacheEntry {
  siteId: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

/**
 * Get a cached site_id for an API key.
 * Returns the site_id if found and not expired, otherwise undefined.
 */
export function getCachedSiteId(apiKey: string): string | undefined {
  const entry = cache.get(apiKey);
  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    cache.delete(apiKey);
    return undefined;
  }

  return entry.siteId;
}

/**
 * Store an API key → site_id mapping in cache.
 */
export function setCachedSiteId(apiKey: string, siteId: string): void {
  cache.set(apiKey, {
    siteId,
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * Mark an API key as invalid (cache a null entry to avoid repeated lookups).
 */
export function setCachedInvalid(apiKey: string): void {
  cache.set(apiKey, {
    siteId: "",
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * Clear the entire cache (useful for testing or manual refresh).
 */
export function clearApiKeyCache(): void {
  cache.clear();
}
