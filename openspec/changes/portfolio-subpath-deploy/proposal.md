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
- Document the portfolio-side `vercel.json` snippet and the `TRUSTED_PROXY_HOPS` calibration procedure. No code change to `getClientKey`.

## Capabilities

### New Capabilities
- `subpath-deployment`: base-path constant, `withBase` URL routing for client fetches and assets, base-path-safe fonts, and photo-wall's own CSP.

### Modified Capabilities
- `admin-auth-and-crud-api`: session cookie name and path change, and the CSRF `Origin` check gains the `TRUSTED_ORIGIN_HOSTS` allow-list.
- `storage-and-cdn-pipeline`: the public CDN base prefers `CDN_BASE_URL`, and local and demo CDN bases carry `BASE_PATH`.

## Impact

- **Code:** `next.config.ts`, new `src/lib/basePath.ts`, `src/lib/auth.ts`, `src/lib/storage/index.ts`, `src/lib/dev/fakeManifest.ts`, `src/app/globals.css` (plus font files moved from `public/fonts/` to `src/app/fonts/`), `src/store/useWallStore.ts`, `src/components/PhotoWallApp.tsx`, `src/components/wall/{useWallManifest,SoundtrackPlaque,PlaygroundPbrWall}.tsx`, `src/components/admin/{FolderDropzone,AdminDrawer}.tsx`.
- **Env:** new optional `TRUSTED_ORIGIN_HOSTS`. `CDN_BASE_URL` semantics change (it now wins when set). Existing names are unchanged.
- **Tooling:** local Playwright and review scripts must target `/photos`.
- **Cross-change:** `admin-route-isolation` (in flight) adds `src/proxy.ts` and new admin components with their own fetches. Whichever lands second must route its URLs through `withBase` (see `architecture.md`).
- **Out of repo:** the portfolio `vercel.json` rewrites and header exclusion, the Vercel project, Turso, and the Bunny hostname and referrer settings.
