import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.STANDALONE_OUTPUT !== 'false' ? { output: 'standalone' as const } : {}),
  async headers() {
    // Shared security headers (safe for all routes)
    const baseSecurityHeaders = [
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'X-DNS-Prefetch-Control',
        value: 'on',
      },
    ];

    return [
      // ── Public tracking assets ──
      {
        source: '/t.js',
        headers: [
          // t.js is served at an unversioned URL that is already embedded on
          // customer sites, so the browser TTL is the only lever for getting a
          // tracker fix to returning visitors. 60 days meant old and new
          // tracker data stayed mixed for two months after every deploy; one
          // day (plus a short background revalidation window) bounds that,
          // and the existing ETag keeps the daily recheck a cheap 304.
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=3600',
          },
          {
            key: 'Timing-Allow-Origin',
            value: '*',
          },
        ],
      },
      {
        source: '/api/collect/:path*',
        headers: [
          {
            key: 'Timing-Allow-Origin',
            value: '*',
          },
        ],
      },
      // ── Security headers for dashboard pages (NOT applied to public APIs) ──
      {
        source: '/dashboard/:path*',
        headers: [
          ...baseSecurityHeaders,
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
      {
        source: '/login',
        headers: [
          ...baseSecurityHeaders,
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
      // ── Protected API routes ── (HSTS but no CSP/X-Frame — they're JSON APIs)
      {
        source: '/api/dashboard/:path*',
        headers: [
          ...baseSecurityHeaders,
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
      {
        source: '/api/sites/:path*',
        headers: [
          ...baseSecurityHeaders,
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
