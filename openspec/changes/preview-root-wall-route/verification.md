## Executive Summary
Preview builds redirect `/`, `/admin` and `/admin/:path*` into `/photos`. Non-preview builds register nothing. Verified at unit level and against the built `routes-manifest.json`. Live HTTP checks (3.2 curl, 3.3 preview) are pending.

## Requirement Adherence Matrix
| Scenario | Evidence |
|---|---|
| Preview root opens the wall | Unit test (exact 307 `/` → `/photos`, `basePath:false`); `.next/routes-manifest.json` from a `VERCEL_ENV=preview` build lists it with `statusCode: 307`. Live curl PENDING. |
| Preview admin path reaches the gated page | Manifest lists `/admin` → `/photos/admin`. Redirect-before-proxy ordering is documented Next behaviour; live check PENDING. |
| Nested paths and query preserved | Manifest lists `/admin/:path*` → `/photos/admin/:path*` (query forwarded by Next). Live check PENDING. |
| Non-preview registers no redirects | Unit tests for `'production'`, `'development'`, `undefined`, `''` → `[]`. A no-`VERCEL_ENV` build was not run separately. |

## Execution
- `npx vitest run`: 42 files, 626 tests passed (includes the 5 new cases).
- `npx tsc --noEmit`: clean. `npx eslint next.config.ts src/lib`: clean.
- `VERCEL_ENV=preview STORAGE_DRIVER=local npm run build`: success; manifest redirects as above.
- curl against `next start` was blocked by tool permissions, so 3.2 is not claimed.

## Notes
- Promoting a preview deployment to production reuses its build, so these rules ship with it. They are inert there: production traffic arrives at `/photos/*` via the portfolio.
- Whether `VERCEL_ENV` is visible at build is confirmed only on a real preview (3.3).
