## Why

photo-wall is moving to `gregory-lazatin.com/photos`, served through the portfolio's Vercel external rewrite. Today the app assumes it owns the origin root. Every `fetch('/api/…')`, the WebGL textures, the fonts and the local and demo image bases resolve to `gregory-lazatin.com/api/…`, which is the portfolio SPA. On top of that, it ships no CSP of its own once the portfolio's header rule excludes `/photos`. The code-side work has to land before the portfolio rewrite can go live (see `research.md` → Source material).

## What Changes

- **BREAKING (URLs):** the app serves under `basePath: '/photos'`. Local dev moves from `localhost:3000/` to `localhost:3000/photos`. The value lives in one constant, `BASE_PATH` in `src/lib/basePath.ts`, which `next.config.ts` imports.
- Add a pure `withBase(path)` helper. Route every root-relative client URL through it: the `/api/*` fetches, the upload XHR, the YouTube thumb `src`, `/textures/wall/*.webp`, and the `/demo` and `/api/local-uploads` CDN bases.
- Move the TeX Gyre Heros `.woff2` files beside `globals.css` and reference them with relative `url()`, so the bundler emits hashed URLs that carry `basePath`.
- Introduce photo-wall's own static `Content-Security-Policy` through `next.config.ts` `headers()`. It allows the public CDN origin in `img-src` and `www.youtube-nocookie.com` in `frame-src`.
- The public CDN base prefers `CDN_BASE_URL` over `BUNNY_PULL_ZONE_URL`, so a custom hostname (`cdn.gregory-lazatin.com`) actually takes effect. Purges keep using `BUNNY_PULL_ZONE_URL`.
- **BREAKING (sessions):** the admin session cookie is renamed `photowall_session` and scoped to `Path=/photos`. Existing sessions are logged out once.
- The admin CSRF `Origin` check also accepts hosts listed in a new `TRUSTED_ORIGIN_HOSTS` env var, so mutations still work when the proxy doesn't forward the public host.
- The DB connection works on Vercel with the Turso integration's env:
  - The URL resolves `DATABASE_URL ?? TURSO_DATABASE_URL ?? file:./data/photo-wall.db`, and the auth token resolves `DATABASE_AUTH_TOKEN ?? TURSO_AUTH_TOKEN`. `drizzle.config.ts` uses the same chain.
  - `next.config.ts` bundles the `drizzle/` migrations folder into every function via `outputFileTracingIncludes`, since migrations run at runtime from a string path that file tracing can't see.
  - A failed DB init no longer poisons the instance: the cached promise is cleared on rejection, so the next request retries.
- Document the portfolio-side `vercel.json` snippet and the `TRUSTED_PROXY_HOPS` calibration procedure. No code change to `getClientKey`.

## Capabilities

### New Capabilities
- `subpath-deployment`: base-path constant, `withBase` URL routing for client fetches and assets, base-path-safe fonts, and photo-wall's own CSP.

### Modified Capabilities
- `admin-auth-and-crud-api`: session cookie name and path change, and the CSRF `Origin` check gains the `TRUSTED_ORIGIN_HOSTS` allow-list.
- `storage-and-cdn-pipeline`: the public CDN base prefers `CDN_BASE_URL`, and local and demo CDN bases carry `BASE_PATH`.
- `wall-manifest-and-db`: hosted libSQL connection resolution (integration env fallback and auth token), migrations bundled for serverless, and retry after a failed init.

## Impact

- **Code:** `next.config.ts`, `src/db/index.ts`, `drizzle.config.ts`, new `src/lib/basePath.ts`, `src/lib/auth.ts`, `src/lib/storage/index.ts`, `src/lib/dev/fakeManifest.ts`, `src/app/globals.css` (plus font files moved from `public/fonts/` to `src/app/fonts/`), `src/store/useWallStore.ts`, `src/components/PhotoWallApp.tsx`, `src/components/wall/{useWallManifest,SoundtrackPlaque,PlaygroundPbrWall}.tsx`, `src/components/admin/{FolderDropzone,AdminDrawer}.tsx`.
- **Env:** new optional `TRUSTED_ORIGIN_HOSTS` and `DATABASE_AUTH_TOKEN`. `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are read as fallbacks, and the Turso integration already sets them on the Vercel project. `CDN_BASE_URL` semantics change (it now wins when set). Existing names are unchanged.
- **Tooling:** local Playwright and review scripts must target `/photos`.
- **Cross-change:** `admin-route-isolation` (in flight) adds `src/proxy.ts` and new admin components with their own fetches. Whichever lands second must route its URLs through `withBase` (see `architecture.md`).
- **Out of repo:** the portfolio `vercel.json` rewrites and header exclusion, the remaining Vercel env (Bunny, auth and `TRUSTED_*`), Deployment Protection on the production alias, and the Bunny hostname and referrer settings. The Vercel project (`photo-wall`) and the Turso DB already exist.
