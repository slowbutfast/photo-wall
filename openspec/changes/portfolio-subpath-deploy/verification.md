# Verification: portfolio-subpath-deploy

## 1. Executive Summary & Environment

All code tasks (groups 1-3) are implemented and verified locally against a **production build** served by `next start` under `/photos`. Every spec scenario that can be checked locally is **PASS**. The PR preview was verified through the Vercel MCP (section 9). Scenarios that need the merged production deployment, the portfolio preview or real Bunny credentials remain **PENDING**. Local checks touched no Vercel, Turso or Bunny.

| | |
| :--- | :--- |
| Branch / worktree | `feat/portfolio-subpath-deploy`, `projects/photo-wall-subpath-deploy` (cut from `main` @ `3f0a43e`) |
| Baseline (pre-change) | 18 files / 263 tests |
| After | **23 files / 300 tests** (+5 files, +37 tests), `tsc` exit 0, `eslint` exit 0, `next build` exit 0 |
| Runtime | Node 22.23, Next 16.4.6 (Turbopack), `next start -p 3113`, Chromium headless-shell with SwiftShader WebGL |
| Server env for checks | throwaway `ADMIN_PASSWORD`/`AUTH_SECRET`, `TRUSTED_ORIGIN_HOSTS=gregory-lazatin.com`; file DB; no Bunny env |
| Sandbox limits | `safe-test` wrapper OOMs on this suite (Wasm allocation), so vitest was run directly. Outbound network works (an earlier note claiming otherwise was wrong). |

**Deviations from the plan**
- Task 4.3 was split into `4.3a` and `4.3b`; both are now verified (the 4.3b "network blocked" note was wrong, see section 9).
- `rawUrlAudit.test.ts` accepts a literal anywhere inside a `withBase(` argument list (needed for `withBase(options.manifestUrl ?? '/api/wall')`; see PATCH-01).
- *Resolved by PATCH-01:* `.env.example` is updated, and `LocalStorageAdapter.publicUrl()` is now prefixed.

## 2. Requirement Adherence Audit Matrix

### subpath-deployment

| Scenario | Verifier | Result |
| :--- | :--- | :--- |
| Pages and route handlers resolve under the base path | `next start` fetches: `/photos` 200, `/photos/api/wall` 200, `/photos/textures/wall/wall_albedo.webp` 200, `/` 404, `/api/wall` 404, `/textures/...` 404 (log 4.2a) | PASS |
| Base path has one source of truth | `rawUrlAudit.test.ts` "no '/photos' literal outside src/lib/basePath.ts" | PASS |
| API fetch is prefixed | `basePath.test.ts` | PASS |
| Absolute and already-prefixed URLs pass through | `basePath.test.ts` (also `/photosynthesis` is not mistaken for the prefix) | PASS |
| No raw root-relative client URLs remain | `rawUrlAudit.test.ts` over `src/app`, `src/components`, `src/store`, `src/lib/dev` (red before 2.2, 20 sites; green after) | PASS |
| Wall loads end-to-end under the base path | Playwright on `/photos?demo=4`: 55 frames, 4 placards, WebGL canvas; **0** app-origin requests outside `/photos/` of 19 (log 4.2a). The only failed response is the sandbox-offline YouTube thumb 502. | PASS |
| Fonts load under the base path | Both `.woff2` requests are `/photos/_next/static/media/texgyreheros-*.woff2`; `document.fonts` shows TeX Gyre Heros 400 and 700 loaded; computed font stack unchanged | PASS |
| Production policy allows the CDN and YouTube only | `csp.test.ts` | PASS |
| No CDN configured | `csp.test.ts` | PASS |
| CDN origin strips paths | `csp.test.ts` (`cdnOriginFrom`) | PASS |
| Header is present on pages and route handlers | CSP, `X-Frame-Options: DENY`, nosniff and Referrer-Policy on `/photos` and `/photos/api/wall`; 0 CSP console violations through load, print focus and soundtrack iframe start (logs 4.2a, 4.2b) | PASS |
| Curator soundtrack inspect degrades without the IFrame API | Injecting `https://www.youtube.com/iframe_api` as a script logs exactly 1 CSP violation (log 4.2b). `POST /photos/api/admin/youtube/inspect` with `dQw4w9WgXcQ` returns `{"artistGuess":"Rick Astley","titleGuess":"Never Gonna Give You Up"}` (log 4.3c). The first attempt used the fixture ID `jfKfPfyJRdk`, whose oEmbed has no title, hence empty guesses (log 4.3b). | PASS |

### admin-auth-and-crud-api

| Scenario | Verifier | Result |
| :--- | :--- | :--- |
| Session status endpoint reports authentication state | existing `routes.test.ts`; live `GET` with cookie returned `{"authenticated":true}` | PASS |
| Brute-force login attempts are rate-limited | existing `auth.test.ts` (unchanged, green) | PASS |
| Unauthenticated or cross-origin mutation is rejected | existing tests green; live: untrusted Origin gets 403 | PASS |
| Session cookie is scoped to the base path | `auth.test.ts`; live `Set-Cookie: photowall_session=...; Path=/photos; HttpOnly; SameSite=Lax` on login and the same name and path with `Max-Age=0` on logout (log 4.3a) | PASS |
| Proxy origin allowed through TRUSTED_ORIGIN_HOSTS | `auth.test.ts`; live: `Origin: https://gregory-lazatin.com` + wrong password gets 401, not 403 (log 4.3a) | PASS |
| Unlisted origin still rejected when TRUSTED_ORIGIN_HOSTS is set | `auth.test.ts`; live 403 for `https://evil.example` | PASS |

### storage-and-cdn-pipeline

| Scenario | Verifier | Result |
| :--- | :--- | :--- |
| Custom hostname wins for public URLs | `cdnBase.test.ts` + `bunny.test.ts` (purge stays on the pull zone) | PASS |
| Pull zone fallback | `cdnBase.test.ts` (empty and unset) | PASS |
| Local driver base carries the base path | `cdnBase.test.ts`; `routes.test.ts` expects `/photos/api/local-uploads` | PASS |
| Demo manifest base carries the base path | `fakeManifest.test.ts` | PASS |

### wall-manifest-and-db

| Scenario | Verifier | Result |
| :--- | :--- | :--- |
| Turso integration env is used when DATABASE_URL is unset | `connection.test.ts` | PASS |
| Explicit DATABASE_* overrides the integration | `connection.test.ts` | PASS |
| Local default is unchanged | `connection.test.ts`; the file-DB route suite and `next start` run both use it | PASS |
| Build trace contains the migration journal | `.nft.json` for `app/api/wall/route` and `app/page` each list `0000_init.sql`, `meta/0000_snapshot.json`, `meta/_journal.json` (log 4.1) | PASS |
| First request on an empty hosted DB creates the schema | Verified against an empty **file** DB only (`/photos/api/wall` 200 created the schema). The hosted Turso run is the maintainer's. | PENDING (infra) |
| Transient failure recovers on the next call | `connection.test.ts` | PASS |
| Concurrent callers share one attempt | `connection.test.ts` | PASS |

## 3. Font / layout parity (task 4.2)

`parity/before.png` is `/?demo=4&mood=concrete` from `next dev` on `main` before any change. `parity/after.png` is `/photos?demo=4&mood=concrete` from the production build. pixelmatch (threshold 0.1) reports 12,075 differing pixels of 1,600,000, but they sit in three boxes: two YouTube soundtrack thumbnails whose load state depends on the offline network, and the Next dev-mode badge present only in the "before" capture. **Outside those three boxes the diff is 1 pixel**, so the placards, HUD, wall and typography are unchanged. `parity/diff.png` shows the regions.

## 4. Resolved and Unresolved Assumptions

| Assumption (research.md) | Status |
| :--- | :--- |
| Next does not prefix raw fetch, CSS `url()` or texture URLs | Confirmed by the audit going red on 20 sites and the full wall loading only after they were wrapped |
| Bundler-relative `url()` yields basePath-prefixed font URLs | **Resolved**: `/photos/_next/static/media/texgyreheros-*.woff2` |
| `drizzle/` is untraced without `outputFileTracingIncludes` | Not re-proven red. After the change the traces contain it. |
| Standard Protection may cover the production alias | **PENDING (infra)** |
| Proxy forwards `x-forwarded-host`; XFF depth for `TRUSTED_PROXY_HOPS` | **PENDING (infra)**. `TRUSTED_ORIGIN_HOSTS` makes the first moot. |
| Purge covers the custom hostname | **PENDING (maintainer)** (needs real Bunny) |
| `PRAGMA foreign_keys` effective on remote libSQL | **PENDING (infra)** |
| Integration env names stable | Observed; asserted only by the future deployed `/photos/api/wall` 200 |
| Rewrite destination domain | **`photo-wall-phi.vercel.app`**. Verified unauthenticated: the automatic `photo-wall-joeshmo.vercel.app` alias is behind Vercel SSO (302), `-phi` is public. PATCH-01's preference for `-joeshmo` was wrong and is reversed. |

**PENDING (infra) rows for the maintainer session** (Vercel MCP): PR-preview build `READY` with `/photos/api/wall` 200 + headers + clean runtime logs; production-after-merge login, draft create/delete, FK probe; Deployment Protection check on the production alias; portfolio-preview `TRUSTED_PROXY_HOPS` calibration. **PENDING (maintainer)**: Bunny images under the CSP with real credentials.

## 5. Nomenclature & Code Symbol Audit

| Symbol | Where | Notes |
| :--- | :--- | :--- |
| `BASE_PATH`, `withBase` | `src/lib/basePath.ts` | dependency-free; imported by `next.config.ts` (relative), `auth.ts`, `storage/index.ts` and the client modules |
| `cdnOriginFrom`, `buildContentSecurityPolicy` | `src/lib/security/csp.ts` | dependency-free; imported by `next.config.ts` |
| `photowall_session` | `SESSION_COOKIE_NAME` in `src/lib/auth.ts` | `pw_admin_session` no longer appears in `src/` |
| `TRUSTED_ORIGIN_HOSTS` | `allowedHosts()` in `src/lib/auth.ts` | trimmed, lower-cased, empties dropped |
| `resolveDatabaseConfig`, `DatabaseConfig` | `src/db/index.ts` | `DATABASE_*` then `TURSO_*` then file; `createDatabase` now takes `{ url, authToken }` |
| `DATABASE_AUTH_TOKEN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | `src/db/index.ts`, `drizzle.config.ts` | the token is never placed in the URL or logged |

## 6. Maintainer follow-ups

1. Run the PENDING rows above.
2. Local dev is now `http://localhost:3000/photos`.

## 7. Verbatim Execution Logs

### 4.1 gates
```
$ npx vitest run            (baseline, before changes)
 Test Files  18 passed (18)
      Tests  263 passed (263)

$ npx vitest run            (final)
 Test Files  23 passed (23)
      Tests  300 passed (300)
   Duration  7.02s (tests 65%, import 29%, transform 3%, worker 3%)

$ npx tsc --noEmit
tsc exit 0

$ npx eslint .
eslint exit 0

$ npm run build   -> exit 0 (Compiled successfully; 9/9 static pages)
.next/static/media: texgyreheros-bold.3xwq0dpzywpc8.woff2, texgyreheros-bolditalic.3ha9om3io9v8e.woff2,
                    texgyreheros-italic.0rz4e_5lz6wf4.woff2, texgyreheros-regular.3m00skgbnuwb3.woff2
nft app/api/wall/route.js and app/page.js each: 0000_init.sql, meta/0000_snapshot.json, meta/_journal.json
```

### 4.2a subpath, headers, fonts (Playwright + fetch)
```
/photos 200 OK | csp true | xfo DENY | nosniff nosniff | ref strict-origin-when-cross-origin
/photos/api/wall 200 OK | csp true | xfo DENY | nosniff nosniff | ref strict-origin-when-cross-origin
/ 404 OK | csp false | xfo null | nosniff null | ref null
/api/wall 404 OK | csp false | xfo null | nosniff null | ref null
/textures/wall/wall_albedo.webp 404 OK | csp false | xfo null | nosniff null | ref null
/photos/textures/wall/wall_albedo.webp 200 OK | csp true | xfo DENY | nosniff nosniff | ref strict-origin-when-cross-origin
CSP: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
app-origin requests 19 outside /photos/: 0 []
woff2: [
  '/photos/_next/static/media/texgyreheros-regular.3m00skgbnuwb3.woff2',
  '/photos/_next/static/media/texgyreheros-bold.3xwq0dpzywpc8.woff2'
]
state {"frames":55,"placards":4,"font":"\"Helvetica Neue\", Helvetica, \"TeX Gyre Heros\", Arial, sans-serif","fonts":["TeX Gyre Heros 400","TeX Gyre Heros 700"],"canvas":true}
focused 1
plaque click skipped elementHandle.click: Timeout 3000ms exceeded.
Call log:
[2m  - attempting click
iframe 0
failed responses [ '502 http://localhost:3113/photos/api/youtube/thumb/jfKfPfyJRdk' ]
console errors 1
  - Failed to load resource: the server responded with a status of 502 (Bad Gateway)
```

### 4.2b CSP vs soundtrack iframe and the blocked IFrame API probe
```
facades 3 | iframe src https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?autoplay=1&rel=0&modestbranding=1
0 CSP violations
  error Failed to load resource: the server responded with a status of 502 (Bad Gateway)
after probe injection, CSP violations: 1
```

### 4.3a Origin allow-list and cookie scope
```
trusted proxy Origin + wrong password (expect 401)         401
untrusted Origin + wrong password (expect 403)             403
own Origin + wrong password (expect 401)                   401
trusted Origin + correct password (expect 200)             200
login Set-Cookie: photowall_session=<token>; Path=/photos; HttpOnly; SameSite=Lax; Max-Age=604800; Secure
GET with cookie -> {"authenticated":true}
DELETE 200 | Set-Cookie: photowall_session=; Path=/photos; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure
```

### 4.3b curator inspect with the fixture ID (empty oEmbed title; not a network failure)
```
inspect 200 {"videoId":"jfKfPfyJRdk","artistGuess":null,"titleGuess":""}
```

## 8. PATCH-01 verification (PR #4 review fixes)

Resolves `patch.md` PATCH-01. After the edits, on the same worktree:

```
 Test Files  23 passed (23)
      Tests  300 passed (300)
   Duration  6.94s (tests 66%, import 29%, worker 3%, transform 3%)
$ npm run build   -> exit 0
$ npx tsc --noEmit -> exit 0
$ npx eslint .     -> exit 0
$ git diff main -- next-env.d.ts   -> (empty)
```

The first full run after the `useWallManifest.ts` cleanup failed one test (`rawUrlAudit.test.ts`, "no unwrapped ... literals") because the literal in `withBase(options.manifestUrl ?? '/api/wall')` is not directly after `withBase(`. The matcher was widened to "inside a `withBase(` argument list", which still flags a bare `fetch('/api/x')`, and the suite is green again.

### 4.3c curator inspect with a video that has oEmbed metadata
```
inspect 200 {"videoId":"dQw4w9WgXcQ","artistGuess":"Rick Astley","titleGuess":"Never Gonna Give You Up"}
```

## 9. Vercel preview and domain verification (maintainer session, Vercel MCP, 2026-11-24)

Preview `dpl_2osJtPcLWKFAkRPrV2nZebMPgerX` (`photo-wall-ligagj3wk-joeshmo.vercel.app`, commit `e8bed02`, state `READY`).

| Check | Result |
| :--- | :--- |
| Build | `READY`. `next build` ran on Vercel (Next 16.4.6) with the project env. |
| `/photos/api/wall` | `200`, `{"cdnBase":"https://photo-wall-media.b-cdn.net","albums":[]}`, `x-vercel-cache: PRERENDER`. `cdnBase` resolves from `BUNNY_PULL_ZONE_URL` (no `CDN_BASE_URL` is set). `albums: []` proves the Turso connection works and the schema exists, since the build-time prerender called `getDb()` and ran the migration. |
| `/photos/api/admin/auth` | `200 {"authenticated":false}` from a function invocation (`x-vercel-cache: MISS`) |
| `/photos?demo=4` HTML | `200`, every asset URL under `/photos/_next/static/...`, icon under `/photos/icon.svg` |
| `/api/wall` (unprefixed) | `404` |
| Headers | CSP (with `img-src ... https://photo-wall-media.b-cdn.net`), `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin` on every `/photos` response |
| Runtime errors on the preview | none (`get_runtime_errors`, 2h window). Runtime logs for the deployment are empty. |
| Pre-change production | `get_runtime_errors` shows `ENOENT: mkdir './data'` (12 hits on `/`, plus the boot-time deletion sweep) on the old production deploy, which confirms the diagnosis that the file DB cannot work on Vercel and that this PR fixes it |
| Env inventory | Present (names only): `STORAGE_DRIVER`, `TRUSTED_ORIGIN_HOSTS`, `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_HOST`, `BUNNY_PULL_ZONE_URL`, `BUNNY_STORAGE_API_KEY`, `BUNNY_PULL_ZONE_API_KEY`, `AUTH_SECRET`, `ADMIN_PASSWORD`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. Not set: `CDN_BASE_URL` (optional), `TRUSTED_PROXY_HOPS` (after calibration). |
| Deployment Protection | **Finding.** Unauthenticated `GET /photos`: `photo-wall-joeshmo.vercel.app` → `302` to `vercel.com/sso-api` (protected); `photo-wall-phi.vercel.app` → `404` with no redirect (public). The rewrite destination must be `photo-wall-phi.vercel.app`. |

**Still PENDING**
- Production after merge: login, draft create/delete, `PRAGMA foreign_keys` probe on Turso, and `photo-wall-phi.vercel.app/photos` serving the new build (it is `404` until the merge deploys).
- Portfolio preview: `TRUSTED_PROXY_HOPS` calibration.
- Bunny images under the CSP with real photos (the manifest is empty, and the pull zone root returns `404`).
- A browser-level render of the preview (this pass checked HTML, headers and API responses, not the WebGL wall).
