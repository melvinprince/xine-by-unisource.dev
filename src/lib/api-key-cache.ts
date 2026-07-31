/**
 * In-memory cache for API key → site lookups.
 * Avoids hitting the database on every /api/collect request.
 * TTL: 5 minutes.
 */

export interface CachedSite {
  siteId: string;
  /** Registered domain, used to verify request provenance. */
  domain: string;
}

interface CacheEntry extends CachedSite {
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

/**
 * Get the cached site for an API key.
 * Returns the entry if found and not expired, otherwise undefined.
 * An entry with an empty `siteId` is a cached "invalid key" marker.
 */
export function getCachedSite(apiKey: string): CachedSite | undefined {
  const entry = cache.get(apiKey);
  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    cache.delete(apiKey);
    return undefined;
  }

  return { siteId: entry.siteId, domain: entry.domain };
}

/**
 * Store an API key → site mapping in cache.
 */
export function setCachedSite(apiKey: string, siteId: string, domain: string): void {
  cache.set(apiKey, {
    siteId,
    domain,
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * Mark an API key as invalid (cache an empty entry to avoid repeated lookups).
 */
export function setCachedInvalid(apiKey: string): void {
  cache.set(apiKey, {
    siteId: "",
    domain: "",
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * Clear the entire cache (useful for testing or manual refresh).
 */
export function clearApiKeyCache(): void {
  cache.clear();
}
