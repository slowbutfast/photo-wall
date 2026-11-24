/**
 * Build-time base path the app is served under (portfolio proxies
 * `gregory-lazatin.com/photos/*` to this app). Dependency-free on purpose:
 * `next.config.ts` imports it by relative path, before the `@/` alias exists.
 *
 * Next inlines `basePath` into client bundles at build time, so this is a
 * constant rather than an env var: a forgotten env var would build a root-path
 * app and every proxied request would 404.
 */
export const BASE_PATH = '/photos';

/**
 * Prefix a root-relative app path with {@link BASE_PATH}. `next/link` and the
 * router already do this; raw `fetch`, `XMLHttpRequest`, `<img src>`, WebGL
 * texture loads and CSS `url()` do not.
 *
 * Absolute (`https:`, `data:`, `blob:`), protocol-relative (`//`) and relative
 * (`./a`) inputs pass through. Already-prefixed paths are returned unchanged,
 * so wrapping twice is harmless.
 */
export function withBase(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`) || path.startsWith(`${BASE_PATH}?`)) {
    return path;
  }
  return `${BASE_PATH}${path}`;
}
