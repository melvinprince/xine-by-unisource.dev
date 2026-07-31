// ============================================================
// Xine — Client IP resolution
//
// The client IP feeds both the visitor identity hash and the abuse ceiling,
// so taking a spoofable value here corrupts visitor counts and lets anyone
// bypass rate limiting by rotating a header.
//
// Trust order: headers written by an edge/CDN that overwrite whatever the
// client sent, then X-Forwarded-For read from the RIGHT (each proxy appends
// the peer it saw, so the rightmost entries are the ones we control).
// ============================================================

import type { NextRequest } from "next/server";

/**
 * Number of trusted reverse proxies between the client and this app.
 * 1 covers the common single-nginx / single-load-balancer deployment.
 * Increase if you run e.g. Cloudflare -> nginx -> app.
 */
const TRUSTED_PROXY_HOPS = Math.max(
  1,
  parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10) || 1
);

function clean(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  // Strip an IPv6 zone index and any surrounding brackets/port.
  return trimmed.replace(/^\[|\]$/g, "").split("%")[0];
}

/**
 * Resolve the originating client IP.
 *
 * Returns "" when no header is present (direct connection in local dev),
 * which callers treat as "unidentified" rather than as a shared bucket.
 */
export function getClientIp(request: NextRequest): string {
  const h = (name: string) => request.headers.get(name);

  // 1. Edge-set headers. These are overwritten by the edge on every request,
  //    so a client-supplied value cannot survive.
  const edge =
    clean(h("cf-connecting-ip")) ||
    clean(h("true-client-ip")) ||
    clean(h("x-real-ip"));
  if (edge) return edge;

  // 2. X-Forwarded-For, counted from the right.
  //    "client, proxy1, proxy2" -> with 1 trusted hop the last entry is the
  //    peer our own proxy observed; anything further left is client-supplied
  //    and therefore forgeable.
  const xff = h("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => clean(p))
      .filter(Boolean);
    if (parts.length > 0) {
      const index = parts.length - TRUSTED_PROXY_HOPS;
      return parts[index >= 0 ? index : 0];
    }
  }

  return "";
}
