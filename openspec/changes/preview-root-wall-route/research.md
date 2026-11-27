## Source material

**2026-11-26, maintainer (chat):**
> can you now propose a new change where on preview deployments, you don't have to append `/photos` to the preview URL to view the photo wall? and then `<previewUrl>/admin` still functions as the admin page?

**Current state (origin/main @ cdeda3b):**
- `src/lib/basePath.ts` exports `BASE_PATH = '/photos'`. The comment explains why it is a constant: the portfolio proxies `gregory-lazatin.com/photos/*` to this app, and Next inlines `basePath` into client bundles at build time.
- `next.config.ts` sets `basePath: BASE_PATH` and defines `headers()`, but has no `redirects()` or `rewrites()`.
- `src/proxy.ts` is the only auth gate for the curator surface. Its matcher is `['/admin/:path*', '/api/admin/:path*']`, and Next prepends `basePath`, so at request time it matches `/photos/admin*` and `/photos/api/admin*`.
- `openspec/specs/subpath-deployment/spec.md` currently requires that unprefixed paths return `404` ("Pages and route handlers resolve under the base path").
- On a Vercel preview URL (`<project>-<hash>.vercel.app`), nothing sits in front of the app. That's why `/` returns 404 today and the wall only loads at `/photos`.

### Raised but not acted on
- **Removing `basePath` on preview builds** (`basePath: VERCEL_ENV === 'preview' ? '' : '/photos'`) is rejected. Preview would then ship a different client bundle, cookie scope and URL shape from production. The preview would stop testing the subpath deployment, which is the thing most likely to break on proxy. It would also contradict the "constant, not an env var" rationale in `basePath.ts`.
- **Root rewrites (URL stays `/`)** are rejected for `/admin`. Next runs `rewrites()` after the proxy, and the proxy's matcher is base-path-prefixed, so an incoming `/admin` would never match it. The rewritten request would reach the admin page with the auth gate skipped. A rewrite for `/` alone is safe but buys nothing over a redirect, since every client URL is `/photos/...` anyway.
- **`/api/admin/*` at the root** is not handled. No person types API URLs, and the client already calls `withBase('/api/...')`.
- **Production root behaviour** is unchanged. The portfolio owns `gregory-lazatin.com/`.

## Glossary
| Term | Meaning | Does NOT mean |
|---|---|---|
| Preview deployment | A Vercel build with `VERCEL_ENV === 'preview'` (PR or branch deploys). | Local `next dev`, or a production deploy viewed via its `*.vercel.app` alias. |
| Root URL | The bare deployment origin, `https://<preview-host>/`. | `/photos`, the base path. |
| Preview root redirect | A temporary (`307`) redirect from an unprefixed path to its `/photos` equivalent. | A rewrite, a proxy, or a change to `BASE_PATH`. |

## Assumptions
- Vercel exposes `VERCEL_ENV` during `next build`, so `next.config.ts` can branch on it at build time. This needs empirical confirmation on the first preview build (tasks 3.x).
- Next applies `redirects()` before `proxy.ts`. A redirected `/admin` therefore becomes a fresh `/photos/admin` request that the proxy gates as usual.
