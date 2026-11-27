## Why
Every preview link needs `/photos` appended by hand before it shows anything, and `<preview>/admin` is a 404. The base path exists for the portfolio proxy in production. Preview URLs have no proxy in front of them, so the bare origin is a dead end.

## What Changes
- On preview builds only, `next.config.ts` adds `redirects()` entries with `basePath: false`:
  - `/` → `/photos`
  - `/admin` → `/photos/admin`
  - `/admin/:path*` → `/photos/admin/:path*`

  Each is a `307` (not permanent), and the query string is preserved.
- The redirect table comes from a pure helper, `previewRootRedirects(vercelEnv)`, in `src/lib/previewRedirects.ts`. It derives every destination from `BASE_PATH` and returns `[]` for any environment other than `preview`.
- `BASE_PATH`, `basePath`, `proxy.ts` and the CSP headers are unchanged. Production and local builds behave exactly as they do today.

## Capabilities
### New Capabilities
- None.

### Modified Capabilities
- `subpath-deployment`: unprefixed paths still 404 on production builds. On preview builds, the root and `/admin*` redirect into the base path.

## Impact
- Code: `next.config.ts`, new `src/lib/previewRedirects.ts` with a co-located Vitest test.
- Security: admin auth is unaffected. The redirect lands on `/photos/admin*`, which `proxy.ts` gates, and no rewrite bypasses the matcher.
- No new dependencies, no env-var additions, no data or storage access.
