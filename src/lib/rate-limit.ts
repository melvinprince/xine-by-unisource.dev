/**
 * VULN-018 FIX: Per-session rate limiter for dashboard API routes.
 * Prevents authenticated users (or attackers with stolen tokens) from
 * overwhelming the database with rapid complex queries.
 */

const requestLog = new Map<string, { count: number; windowStart: number }>();

const WINDOW_MS = 60_000; // 1-minute sliding window
const MAX_REQUESTS = 120; // 120 requests per minute per session

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestLog.entries()) {
    if (now - entry.windowStart > WINDOW_MS * 2) {
      requestLog.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check if a session is rate limited.
 * @param sessionKey - A unique key for the session (e.g., truncated cookie hash)
 * @returns true if rate limited, false if allowed
 */
export function isDashboardRateLimited(sessionKey: string): boolean {
  if (!sessionKey) return false;

  const now = Date.now();
  const entry = requestLog.get(sessionKey);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    requestLog.set(sessionKey, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  return entry.count > MAX_REQUESTS;
}
