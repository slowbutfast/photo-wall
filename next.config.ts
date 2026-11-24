import type { NextConfig } from 'next';

import { BASE_PATH } from './src/lib/basePath';
import { buildContentSecurityPolicy, cdnOriginFrom } from './src/lib/security/csp';

// Evaluated at build time: a CDN host change needs a redeploy. The origin
// follows the same precedence as `getCdnBase()` (custom hostname first).
const cdnOrigin = cdnOriginFrom(process.env.CDN_BASE_URL || process.env.BUNNY_PULL_ZONE_URL);

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  cacheComponents: true,
  serverExternalPackages: ['@libsql/client', 'libsql'],
  // Migrations run at request time from a string path (`./drizzle`) that file
  // tracing can't see, so ship the folder with every function.
  outputFileTracingIncludes: { '/**': ['./drizzle/**/*'] },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [
      {
        // Auto-prefixed with `basePath`.
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: buildContentSecurityPolicy({
              cdnOrigin,
              isDev: process.env.NODE_ENV !== 'production',
            }),
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
