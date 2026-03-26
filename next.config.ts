import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.STANDALONE_OUTPUT !== 'false' ? { output: 'standalone' as const } : {}),
  async headers() {
    return [
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
        source: '/api/collect',
        headers: [
          {
            key: 'Timing-Allow-Origin',
            value: '*',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
