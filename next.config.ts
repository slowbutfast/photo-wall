import type { NextConfig } from 'next';

import { BASE_PATH } from './src/lib/basePath';
import { buildContentSecurityPolicy, cdnOriginFrom } from './src/lib/security/csp';

// Evaluated at build time: a CDN host change needs a redeploy. The origin
// follows the same precedence as `getCdnBase()` (custom hostname first).
const cdnOrigin = cdnOriginFrom(process.env.CDN_BASE_URL || process.env.BUNNY_PULL_ZONE_URL);
const isDev = process.env.NODE_ENV !== 'production';

/** Shared hardening headers; the CSP differs between public and Studio. */
function securityHeaders(allowYoutubeApi: boolean) {
  return [
    {
      key: 'Content-Security-Policy',
      value: buildContentSecurityPolicy({ cdnOrigin, isDev, allowYoutubeApi }),
    },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ];
}

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
        // Catch-all public fallback (covers the `/photos` root, which has no
        // trailing segment). Studio rules below override it for `/admin*`:
        // later rules win for the same header key.
        source: '/:path*',
        headers: securityHeaders(false),
      },
      {
        // Studio-only: allows the YouTube IFrame API for duration probing.
        source: '/admin',
        headers: securityHeaders(true),
      },
      {
        source: '/admin/:path*',
        headers: securityHeaders(true),
      },
    ];
  },
};

export default nextConfig;
