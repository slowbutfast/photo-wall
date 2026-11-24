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
 * `https://www.youtube.com` is deliberately NOT allowed in `script-src`: the
 * curator's best-effort IFrame API duration probe is blocked and degrades to an
 * unset `durationSec`. Dependency-free: `next.config.ts` imports this by
 * relative path.
 */

export interface CspOptions {
  /** Public CDN origin (scheme + host) for photos, or `null` when none applies. */
  cdnOrigin: string | null;
  /** Dev needs `'unsafe-eval'` (React refresh) and `ws:` (HMR). */
  isDev: boolean;
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

export function buildContentSecurityPolicy({ cdnOrigin, isDev }: CspOptions): string {
  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', ...(cdnOrigin ? [cdnOrigin] : [])]],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", ...(isDev ? ['ws:'] : [])]],
    ['frame-src', ['https://www.youtube-nocookie.com']],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}
