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

**2026-11-24, maintainer, later in the same session.**

> just created the photo-wall project in vercel, and added the turso integration. can you update the artifacts and plan accordingly.

Before that, the maintainer asked why Turso is needed at all when Bunny is already set up. The answer, recorded so nobody re-asks:
- Bunny holds the image bytes.
- The SQLite tables hold everything the manifest is built from: albums, photos, layout, draft status and tombstones.
- Vercel functions have no persistent disk, so `file:./data/photo-wall.db` can't live there.

This brings the **code-side** DB work into scope: env names, the auth token, migration bundling and connection resilience. Provisioning is done.

### Raised but not acted on

- **Vercel project creation and Turso provisioning (plan steps 1–2).** Done by the maintainer through the dashboard and the Vercel Marketplace "Turso Cloud" integration. The code changes those two steps require **are** in scope here; see D11–D13.
- **Importing the local `data/photo-wall.db` into Turso.** The integration creates an empty database. On first access the app's own Drizzle migration creates the schema. Whether to import local rows (Turso CLI or the dashboard, logged in through the integration's "Open in Turso") is the maintainer's call, and no code depends on it.
- **A static `wall.json` on Bunny instead of a database.** Raised as the Bunny-only alternative and rejected for now. It would make production permanently read-only and need a manifest/admin rework, while Turso costs two lines of config.
- **Local dev against production Turso (upload option 1).** The integration scoped the vars to Preview and Production only, and Sensitive vars can't be pulled with `vercel env pull`. Curating from the laptop against prod therefore needs a separately minted Turso token in a local `.env.local`. That's maintainer setup, not code.
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
| Turso env (integration) | `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`, injected by the Vercel Marketplace Turso integration into Preview and Production. | Something this repo sets or names. The integration owns them. Code reads them as a fallback behind `DATABASE_URL`/`DATABASE_AUTH_TOKEN`. |
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
| Turso via Vercel Marketplace integration | **Adopted (by maintainer)** | It provisions the DB, bills through Vercel and injects the credentials as Sensitive env, so the token never leaves Vercel. | 2026-11-24 |
| Turso via CLI + hand-entered env | Superseded | Equivalent result, but the token has to be copied by hand. Only still needed for a local-file import. | 2026-11-24 |
| Postgres (Neon/Supabase) | Rejected | It needs a schema rewrite to the pg dialect for a few hundred rows. The app already speaks libSQL. | 2026-11-24 |
| Static `wall.json` on Bunny, no DB | Rejected | It forces production to be read-only forever and needs a manifest/admin rework. | 2026-11-24 |
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
| Vercel project `photo-wall` exists and is Git-connected | `prj_vkzWzP9fRx0RYe0HVlcQIDlwNvJb`, framework `nextjs`, Node `26.x`. Domains: `photo-wall-phi.vercel.app` (the attached production domain), `photo-wall-joeshmo.vercel.app` (the automatic `<project>-<team>` alias) and `photo-wall-git-main-joeshmo.vercel.app` (branch alias). `get_project` listed all three on both reads this session, and `list_project_domains` still shows `-phi` as attached (PATCH-01). First production deploy `READY` from `main` (pre-change: root path, no `basePath`). | Vercel MCP `get_project` | 2026-11-24 | decays |
| Project env today | Only `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`: type `sensitive`, `integration-store-secret`, targets `preview` + `production` (**not** `development`). No `STORAGE_DRIVER`, `BUNNY_*`, `AUTH_SECRET`, `ADMIN_PASSWORD` or `TRUSTED_*` yet. | Vercel MCP `filter_project_envs` (names only, no decrypt) | 2026-11-24 | decays |
| Deployment Protection | `ssoProtection: all_except_custom_domains` (Standard Protection); password protection off | Vercel MCP `get_project` | 2026-11-24 | decays |
| DB client ignores any auth token | `createClient({ url })` (`src/db/index.ts:32`); URL from `process.env.DATABASE_URL ?? 'file:./data/photo-wall.db'` (`:12,:43`) | Read source | 2026-11-24 | stable |
| `drizzle.config.ts` reads only `DATABASE_URL` | `dialect: 'sqlite'`, `dbCredentials.url: process.env.DATABASE_URL ?? 'file:./data/photo-wall.db'` | Read source | 2026-11-24 | stable |
| Migrations run at runtime from a string path | `migrate(db, { migrationsFolder: './drizzle' })` inside `createDatabase` (`src/db/index.ts:13,:36`); `drizzle/` holds `0000_init.sql` + `meta/` | Read source, `ls drizzle` | 2026-11-24 | stable |
| No `outputFileTracingIncludes` in `next.config.ts` | Absent | `grep` | 2026-11-24 | stable |
| A failed DB init is cached forever per instance | `cachedDatabase = createDatabase(...)` stores the promise; nothing clears it on rejection (`src/db/index.ts:40-46`) | Read source | 2026-11-24 | stable |
| Album purge deletes child photos explicitly, not only via FK cascade | Existing `wall-manifest-and-db` requirement: "explicitly delete child photo rows in the same transaction on album purge" | Read `openspec/specs/wall-manifest-and-db/spec.md` | 2026-11-24 | stable |
| YouTube iframe origin | `https://www.youtube-nocookie.com/embed/…` (`SoundtrackPlaque.tsx:117`); thumbnails proxied through `/api/youtube/thumb/[id]` from `i.ytimg.com` server-side | Read source | 2026-11-24 | stable |
| Only `getImageData` call reads a local file | `FolderDropzone.tsx:121` per the plan | Plan author's grep (same session) | 2026-11-24 | decays |

## Unverified assumptions

- **Standard Protection may cover `photo-wall-joeshmo.vercel.app`.** If the production `*.vercel.app` alias sits behind Vercel Authentication, the portfolio's external rewrite receives the SSO page instead of the app, and `/photos` breaks for every visitor. A direct `curl` from this sandbox was not permitted. Checking costs one unauthenticated request from any browser in a private window. If it is protected, the fix is either a custom domain for photo-wall (custom domains are exempt under `all_except_custom_domains`) or narrowing protection to previews only.
- **Integration env var names are final.** `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` were observed on 2026-11-24. If the integration renames them, the fallback chain breaks silently and the app falls back to a file DB, which then fails on Vercel's read-only FS. The verification step asserts that the deployed `/photos/api/wall` returns `200`.
- **Turso DB region vs function region.** The integration's chosen region wasn't checked against the function region (default `iad1`). A mismatch adds round-trip latency per uncached manifest. It costs one look at the Turso dashboard.
- **`PRAGMA foreign_keys = ON` persisting on a remote libSQL connection.** Album purge already deletes child rows explicitly (Verified facts), so the cascade *delete* path doesn't depend on it. FK *insert* validation (a photo pointing at a non-existent album) does. It costs one deployed-DB probe, recorded in `verification.md`.
- **Concurrent first-boot migrations against the empty Turso DB.** Several cold instances can run `migrate()` at once on the first deploy. If one loses the race on `CREATE TABLE`, its init rejects. With the D13 retry fix it recovers on the next request instead of staying broken.

- **What `Host` / `x-forwarded-host` photo-wall sees behind the portfolio's external rewrite.** If Vercel forwards `x-forwarded-host: gregory-lazatin.com`, today's check already passes and `TRUSTED_ORIGIN_HOSTS` is belt-and-braces. If it doesn't, every admin mutation through `/photos` returns 403. Checking it costs one preview deploy and a logged request. The design handles both cases, so the result only changes the env value.
- **The `x-forwarded-for` depth behind the double Vercel hop.** It decides the `TRUSTED_PROXY_HOPS` value. Checking costs a temporary debug log on the preview (or reading the headers from a `/api/admin/auth` GET). It's a config value, not code.
- **Bunny purge-by-URL covers a custom hostname.** Purging `https://<zone>.b-cdn.net/<album>/*` is assumed to invalidate the same objects served via `cdn.gregory-lazatin.com`. If Bunny caches per hostname, a deleted photo could stay visible on the custom host until its TTL runs out. Checking costs one upload, delete and fetch cycle on the real zone.
- **The `connect-src` needs of the WebGL texture and mosaic loads.** Assumed covered by `img-src`, since they go through `new Image()`, not `fetch`. The CSP manual check will catch it if not.

## Superseded claims

- **"`photo-wall-phi.vercel.app` is gone from the project's Domains."** An earlier edit of this file, written from a maintainer message, said so and moved the rewrite to `-joeshmo`. It was wrong: `list_project_domains` still lists `-phi` as attached, and `get_project` did on both reads. The sound reason to prefer `photo-wall-joeshmo.vercel.app` is that it is the automatic `<project>-<team>` production alias, which does not depend on a manually attached domain, so it is the rewrite destination in D9 and the README. Both point at production. Re-check Domains before the portfolio PR either way.

- **"`DATABASE_URL=libsql://…` plus an auth token" (plan env table).** Superseded by the integration. The injected names are `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`, and the code reads neither, nor any token at all. It's replaced by the D11 fallback chain.
- **"Turso auth token: out of scope, flagged for the infra step."** Superseded. Provisioning happened, so the reader is now code this change must ship (D11).

- **"Update `CDN_BASE_URL` to match [the custom hostname]."** From the plan. Wrong as the code stands: `getCdnBase()` reads `BUNNY_PULL_ZONE_URL` first, and the bunny adapter requires that var, so `CDN_BASE_URL` is never consulted in production. Replaced by a requirement that the public CDN base prefers `CDN_BASE_URL`, while purges keep `BUNNY_PULL_ZONE_URL`.
- **"`photo-wall`'s own CSP needs `img-src` for the Pull Zone host."** It implied a CSP exists to amend. None exists, so this change introduces the CSP.
- **"The only YouTube surface is the `youtube-nocookie` iframe."** It was implied by the first CSP draft. It's wrong: the curator duration probe also loads `www.youtube.com/iframe_api` and embeds `www.youtube.com`. It's now an explicit, documented block (architecture D4), with a scoped-policy follow-up.
- **"`basePath` plus `serverActions.allowedOrigins`."** `allowedOrigins` is irrelevant (no Server Actions). It's replaced by `TRUSTED_ORIGIN_HOSTS` on the route-handler CSRF check.

## Links out

- `openspec/specs/admin-auth-and-crud-api/spec.md`: current auth and CSRF requirement.
- `openspec/specs/storage-and-cdn-pipeline/spec.md`: storage adapter requirements.
- `openspec/changes/admin-route-isolation/`: in-flight. It adds `src/proxy.ts` and moves admin fetches into `AdminWallApp`/`AdminLoginForm`. Coordinate as described in `architecture.md`.
