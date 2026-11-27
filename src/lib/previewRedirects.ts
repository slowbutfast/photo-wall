import { BASE_PATH } from './basePath';

/**
 * Redirect entry in the shape `next.config.ts` `redirects()` accepts. Declared
 * locally so this module stays dependency-free (it is imported by relative path
 * from `next.config.ts`, before the `@/` alias exists).
 */
export interface PreviewRedirect {
  source: string;
  destination: string;
  permanent: false;
  basePath: false;
}

/**
 * Vercel preview deployments are reached directly at `*.vercel.app`, with no
 * portfolio proxy in front, so the bare origin and `/admin` would 404 because
 * the app lives under {@link BASE_PATH}. On preview builds only, bounce those
 * unprefixed paths into the base path.
 *
 * These must stay redirects, never rewrites: `redirects()` runs before
 * `proxy.ts`, so the browser re-requests `/photos/admin`, which the admin gate's
 * base-path-prefixed matcher sees. A rewrite would run after the proxy and skip
 * auth. `307` (not `308`) so browsers never cache the hop.
 */
export function previewRootRedirects(vercelEnv: string | undefined): PreviewRedirect[] {
  if (vercelEnv !== 'preview') return [];
  return [
    { source: '/', destination: BASE_PATH, permanent: false, basePath: false },
    { source: '/admin', destination: `${BASE_PATH}/admin`, permanent: false, basePath: false },
    {
      source: '/admin/:path*',
      destination: `${BASE_PATH}/admin/:path*`,
      permanent: false,
      basePath: false,
    },
  ];
}
