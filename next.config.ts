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
          {
            key: 'Cache-Control',
            value: 'public, max-age=5184000, stale-while-revalidate=86400',
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
