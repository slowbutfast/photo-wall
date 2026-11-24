## Source material

**2026-11-24, maintainer + review session (deploy plan for serving photo-wall at `gregory-lazatin.com/photos`).** The plan this change implements, quoted in the parts that drive requirements:

> The Vercel project for `photo-wall` has `basePath: '/photos'` […] The portfolio's `vercel.json` has the `/photos` and `/photos/:path*` rewrites, placed before the SPA fallback. They point at the photo-wall production domain, not a deployment URL.
>
> The portfolio's global header rule excludes `/photos` via `"source": "/((?!photos).*)"`. Its CSP would otherwise break Next's inline scripts, the Bunny images and the YouTube iframes.
>
> The raw-URL cleanup stays: route `/api/*` fetches, the XHR upload in `FolderDropzone.tsx:158` and the `/textures/wall/*.webp` paths through one `withBase()` helper.
>
> **Images skip the proxy.** Photos load straight from your Pull Zone, so the `basePath` and the rewrite don't apply to them. […] `photo-wall`'s own CSP needs `img-src` (and `media-src` if used) for the Pull Zone host. […] **Custom hostname (optional):** attach `cdn.gregory-lazatin.com` to the Pull Zone […] Update `CDN_BASE_URL` to match.
>
> **`TRUSTED_PROXY_HOPS`.** […] Requests now pass through Vercel's edge, then the portfolio's rewrite, then `photo-wall`'s own Vercel edge, so the real client IP sits deeper in `x-forwarded-for` than the default expects. Test it on the preview.
>
> **Cookie scope.** Name the session cookie distinctly and set `Path=/photos`.
>
> Updated steps […] 3. Add the `basePath` and `allowedOrigins` config and the `withBase()` refactor. 4. Add the Pull Zone host to `photo-wall`'s CSP, and the custom hostname if you want one.

This change covers steps 3 and 4 plus the code-side halves of the cookie and proxy-hop checks. Everything else in the plan is infrastructure.

### Raised but not acted on

- **Turso migration, Vercel project creation, env var entry (plan steps 1–2).** Dashboard and CLI work with no code in this repo. `src/db/index.ts` already takes `DATABASE_URL`. Note that the plan's "(+ auth token)" has no reader in the code yet; see Unverified assumptions.
- **Portfolio `vercel.json` rewrites and header exclusion (plan step 5).** These live in the portfolio repo. This change documents the exact snippet in `architecture.md`, so the portfolio PR is a copy-paste, but it does not edit that repo.
- **Upload size cap (4.5 MB Vercel body limit), options 1–3.** Deferred by the plan itself ("Merge, then decide"). Option 1 (curate from local dev against production Bunny and Turso) needs no code. Options 2 and 3 are their own change.
- **`serverActions.allowedOrigins`.** Dropped. `grep -rln "'use server'" src` returns nothing, so the app has no Server Actions and the setting would guard nothing. The CSRF check that does matter is `isSameOriginRequest` in `src/lib/auth.ts`, which this change extends instead.
- **`sharp` bundling.** Only `src/app/api/local-uploads/[...path]/route.ts` imports it, and that route only serves the local driver. Nothing to change. Vercel still bundles the route, so `sharp` ships but never runs on the production path.
- **Subdomain (`photos.gregory-lazatin.com`) instead of a subpath.** Raised as an alternative. The maintainer's plan commits to the subpath, so this change implements the subpath.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| `BASE_PATH` | The build-time constant `'/photos'` exported from `src/lib/basePath.ts` and fed to `next.config.ts` `basePath`. | A runtime-configurable env var. Next inlines `basePath` into client bundles at build time. |
| `withBase(path)` | Pure helper that prefixes a root-relative app path (`/api/…`, `/textures/…`, `/demo/…`) with `BASE_PATH`. | A URL builder for CDN images. Absolute `https://` URLs pass through unchanged. |
| Public CDN base | The origin the browser loads photos from: `CDN_BASE_URL` when set, otherwise `BUNNY_PULL_ZONE_URL`. | The purge target. Purges keep using `BUNNY_PULL_ZONE_URL`. |
| Portfolio proxy | The portfolio Vercel project's external rewrite `/photos/:path*` → photo-wall production domain. | A Next.js rewrite inside photo-wall. photo-wall has none. |
| Trusted origin host | A host allowed in `Origin` for admin mutations: the request's own `Host`/`x-forwarded-host`, plus hosts listed in `TRUSTED_ORIGIN_HOSTS`. | A CORS allow-list. No `Access-Control-*` headers are emitted. |
| CSP | The `Content-Security-Policy` header photo-wall sets on its own responses via `next.config.ts` `headers()`. | The portfolio's CSP, which is excluded from `/photos` by the portfolio header rule. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/basePath.md` (Next 16.4.6) | `basePath` is build-time and inlined into client bundles. `next/link` and the router apply it automatically. `next/image` `src` needs it added by hand. | MIT (docs bundled with package) | 2026-11-24 |
| `…/01-next-config-js/headers.md` L291–318 | `headers()` `source` is auto-prefixed with `basePath` unless `basePath: false`. | MIT | 2026-11-24 |
| Next docs on raw `fetch`, CSS `url()`, `new Image().src` | **Not found.** The bundled docs say nothing about basePath for these. They are plain browser URLs and get no prefixing. Treated as a fact from first principles: the browser resolves `/api/wall` against the origin, not the app. | — | 2026-11-24 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Hard-coded `BASE_PATH = '/photos'` constant shared by `next.config.ts` and `withBase` | **Adopted** | One source of truth that can't drift between the build config and the client helper. An env-driven base path that someone forgets to set on Vercel builds a root-path app, and every proxied request 404s. | 2026-11-24 |
| `NEXT_PUBLIC_BASE_PATH` env var | Rejected | Two places to keep in sync (Vercel env plus local `.env`), with no benefit for a single-deployment app. | 2026-11-24 |
| `next/font/local` for TeX Gyre Heros | Rejected for this change | It would fix the font URLs, but it changes how the font stack is declared and touches the typography that PATCH-01 just audited. Moving the files next to the CSS and using relative `url()` lets the bundler emit hashed `/_next/static/media` URLs, which carry `basePath`, with no typography change. | 2026-11-24 |
| CSP with per-request nonces (`proxy.ts`) | Rejected | Nonces force dynamic rendering of every page, which defeats `cacheComponents` and the static shell. A static header with `'unsafe-inline'` for scripts matches what Next emits without nonces. | 2026-11-24 |
| Static CSP via `next.config.ts` `headers()` | **Adopted** | It is evaluated at build time and applies to every route, including route handlers. It needs no middleware, and it doesn't collide with the `src/proxy.ts` that `admin-route-isolation` adds. | 2026-11-24 |
| `serverActions.allowedOrigins` | Rejected | The app has no Server Actions (see Raised but not acted on). | 2026-11-24 |

## Patterns adopted

- **Single-constant base path** (common Next.js subpath-deploy pattern, no code copied). It lands in `src/lib/basePath.ts` and `next.config.ts`.
- **Env-extended same-origin check.** Keep the strict `Origin` equals `Host` rule and add an explicit allow-list for known reverse proxies. This mirrors how Next's own `serverActions.allowedOrigins` works, applied to route handlers. It lands in `src/lib/auth.ts`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Next version | 16.4.6 | `node_modules/next/package.json` | 2026-11-24 | decays |
| photo-wall sets no CSP today | No `Content-Security-Policy` anywhere | `grep -rniE "csp\|content-security"` over `src` and `next.config.ts`: no hits. `next.config.ts` has no `headers()`. | 2026-11-24 | stable |
| No `src/proxy.ts`/`middleware.ts` on `main` yet | Absent | `ls src/proxy.ts src/middleware.ts` | 2026-11-24 | decays (`admin-route-isolation` adds `src/proxy.ts`) |
| No Server Actions | 0 files with `'use server'` | `grep -rln` over `src` | 2026-11-24 | decays |
| Raw root-relative client URLs that need `withBase` | `useWallStore.ts:148,239`, `PhotoWallApp.tsx:87`, `useWallManifest.ts:51`, `SoundtrackPlaque.tsx:102`, `FolderDropzone.tsx:80,158,207,351,464`, `AdminDrawer.tsx:59,105,126,136`, `PlaygroundPbrWall.tsx:33-36` | `grep` for `fetch('/`, `'/api/`, `/textures/`, `xhr.open` | 2026-11-24 | decays (re-grep before implementing; `admin-route-isolation` moves some of these) |
| Root-relative cdnBase values sent to the browser | `LOCAL_CDN_BASE = '/api/local-uploads'` (`src/lib/storage/index.ts:7`); fake manifest `cdnBase: '/demo'` (`src/lib/dev/fakeManifest.ts:328,332`) | Read source | 2026-11-24 | stable |
| Font URLs are absolute | `url('/fonts/texgyreheros-*.woff2')` at `src/app/globals.css:11,19,27,35` | Read source | 2026-11-24 | stable |
| Session cookie is `Path=/` with a generic-ish name | `pw_admin_session`, `Path=/` in `sessionCookie` and `clearedSessionCookie` (`src/lib/auth.ts:188-196`) | Read source | 2026-11-24 | stable |
| `getCdnBase()` prefers `BUNNY_PULL_ZONE_URL` over `CDN_BASE_URL` | `process.env.BUNNY_PULL_ZONE_URL ?? process.env.CDN_BASE_URL` (`src/lib/storage/index.ts:52`) | Read source | 2026-11-24 | stable |
| Bunny purge uses the pull zone URL | `buildPurgeUrl(this.options.pullZoneUrl, …)` (`src/lib/storage/bunny.ts:25-27,81`) | Read source | 2026-11-24 | stable |
| CSRF check compares `Origin` host to request hosts only | `allowedHosts()` collects `x-forwarded-host`, `host`, `request.url` host (`src/lib/auth.ts:151-168`) | Read source | 2026-11-24 | stable |
| `getClientKey` picks `parts[length - hops]` from XFF | `src/lib/auth.ts:57-67` | Read source | 2026-11-24 | stable |
| Curator duration probe loads a third-party script | `loadYouTubeIframeApi()` appends `<script src="https://www.youtube.com/iframe_api">` (`src/lib/youtube/iframeApi.ts:67-71`). `onerror` resolves `null`. `FolderDropzone.captureDuration` (`:492-494`) returns early on `null` and is commented best-effort. | Read source | 2026-11-24 | stable |
| No root-relative asset literals in `src/app` today | 0 hits | `grep -rnE "['\"\`]/(api\|textures\|demo\|fonts)/" src/app` | 2026-11-24 | decays (`admin-route-isolation` adds `src/app/admin`) |
| YouTube iframe origin | `https://www.youtube-nocookie.com/embed/…` (`SoundtrackPlaque.tsx:117`); thumbnails proxied through `/api/youtube/thumb/[id]` from `i.ytimg.com` server-side | Read source | 2026-11-24 | stable |
| Only `getImageData` call reads a local file | `FolderDropzone.tsx:121` per the plan | Plan author's grep (same session) | 2026-11-24 | decays |

## Unverified assumptions

- **What `Host` / `x-forwarded-host` photo-wall sees behind the portfolio's external rewrite.** If Vercel forwards `x-forwarded-host: gregory-lazatin.com`, today's check already passes and `TRUSTED_ORIGIN_HOSTS` is belt-and-braces. If it doesn't, every admin mutation through `/photos` returns 403. Checking it costs one preview deploy and a logged request. The design handles both cases, so the result only changes the env value.
- **The `x-forwarded-for` depth behind the double Vercel hop.** It decides the `TRUSTED_PROXY_HOPS` value. Checking costs a temporary debug log on the preview (or reading the headers from a `/api/admin/auth` GET). It's a config value, not code.
- **Bunny purge-by-URL covers a custom hostname.** Purging `https://<zone>.b-cdn.net/<album>/*` is assumed to invalidate the same objects served via `cdn.gregory-lazatin.com`. If Bunny caches per hostname, a deleted photo could stay visible on the custom host until its TTL runs out. Checking costs one upload, delete and fetch cycle on the real zone.
- **Turso auth token.** The plan says `DATABASE_URL` plus an auth token, but `src/db/index.ts:43` only reads `DATABASE_URL`. libSQL accepts `?authToken=` in the URL, which may be enough. If not, a separate reader is needed. That's out of scope here; it's flagged for the infra step.
- **The `connect-src` needs of the WebGL texture and mosaic loads.** Assumed covered by `img-src`, since they go through `new Image()`, not `fetch`. The CSP manual check will catch it if not.

## Superseded claims

- **"Update `CDN_BASE_URL` to match [the custom hostname]."** From the plan. Wrong as the code stands: `getCdnBase()` reads `BUNNY_PULL_ZONE_URL` first, and the bunny adapter requires that var, so `CDN_BASE_URL` is never consulted in production. Replaced by a requirement that the public CDN base prefers `CDN_BASE_URL`, while purges keep `BUNNY_PULL_ZONE_URL`.
- **"`photo-wall`'s own CSP needs `img-src` for the Pull Zone host."** It implied a CSP exists to amend. None exists, so this change introduces the CSP.
- **"The only YouTube surface is the `youtube-nocookie` iframe."** It was implied by the first CSP draft. It's wrong: the curator duration probe also loads `www.youtube.com/iframe_api` and embeds `www.youtube.com`. It's now an explicit, documented block (architecture D4), with a scoped-policy follow-up.
- **"`basePath` plus `serverActions.allowedOrigins`."** `allowedOrigins` is irrelevant (no Server Actions). It's replaced by `TRUSTED_ORIGIN_HOSTS` on the route-handler CSRF check.

## Links out

- `openspec/specs/admin-auth-and-crud-api/spec.md`: current auth and CSRF requirement.
- `openspec/specs/storage-and-cdn-pipeline/spec.md`: storage adapter requirements.
- `openspec/changes/admin-route-isolation/`: in-flight. It adds `src/proxy.ts` and moves admin fetches into `AdminWallApp`/`AdminLoginForm`. Coordinate as described in `architecture.md`.
