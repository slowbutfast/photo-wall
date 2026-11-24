/**
 * photo-wall's own Content-Security-Policy. The portfolio's header rule excludes
 * `/photos` (its CSP would break Next's inline scripts, Bunny and YouTube), so
 * nothing else sets one for this app.
 *
 * Static on purpose: per-request nonces would force every page dynamic and
 * throw away the `cacheComponents` static shell. `'unsafe-inline'` scripts stay,
 * but `connect-src`, `img-src`, `frame-src`, `object-src` and `frame-ancestors`
 * are locked down, which is what limits exfiltration and clickjacking.
 *
 * `https://www.youtube.com` is deliberately NOT allowed in the public policy:
 * only the curator Studio opts in (`allowYoutubeApi: true`) so the IFrame API
 * duration probe works there while `/photos` stays strict. Dependency-free:
 * `next.config.ts` imports this by relative path.
 */

export interface CspOptions {
  /** Public CDN origin (scheme + host) for photos, or `null` when none applies. */
  cdnOrigin: string | null;
  /** Dev needs `'unsafe-eval'` (React refresh) and `ws:` (HMR). */
  isDev: boolean;
  /** Studio-only: allow `https://www.youtube.com` for the IFrame API probe. */
  allowYoutubeApi?: boolean;
}

/** Scheme + host of a CDN base, or `null` for empty, root-relative or invalid input. */
export function cdnOriginFrom(base: string | undefined): string | null {
  if (!base) return null;
  try {
    const { origin } = new URL(base);
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy({
  cdnOrigin,
  isDev,
  allowYoutubeApi = false,
}: CspOptions): string {
  const youtubeApi = allowYoutubeApi ? ['https://www.youtube.com'] : [];
  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    [
      'script-src',
      ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : []), ...youtubeApi],
    ],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', ...(cdnOrigin ? [cdnOrigin] : [])]],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", ...(isDev ? ['ws:'] : [])]],
    ['frame-src', ['https://www.youtube-nocookie.com', ...youtubeApi]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}
