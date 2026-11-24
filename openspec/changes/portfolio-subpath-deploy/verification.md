# Verification: portfolio-subpath-deploy

## 1. Executive Summary & Environment

All code tasks (groups 1-3) are implemented and verified locally against a **production build** served by `next start` under `/photos`. Every spec scenario that can be checked without Vercel, Turso, Bunny credentials or outbound network is **PASS**. Scenarios that need the real deployments are left **PENDING** for the maintainer session, and one is **BLOCKED (network)**. Nothing in this run touched Vercel, Turso or Bunny.

| | |
| :--- | :--- |
| Branch / worktree | `feat/portfolio-subpath-deploy`, `projects/photo-wall-subpath-deploy` (cut from `main` @ `3f0a43e`) |
| Baseline (pre-change) | 18 files / 263 tests |
| After | **23 files / 300 tests** (+5 files, +37 tests), `tsc` exit 0, `eslint` exit 0, `next build` exit 0 |
| Runtime | Node 22.23, Next 16.4.6 (Turbopack), `next start -p 3113`, Chromium headless-shell with SwiftShader WebGL |
| Server env for checks | throwaway `ADMIN_PASSWORD`/`AUTH_SECRET`, `TRUSTED_ORIGIN_HOSTS=gregory-lazatin.com`; file DB; no Bunny env |
| Sandbox limits | no outbound network (YouTube thumbs return 502); `safe-test` wrapper OOMs on this suite (Wasm allocation), so vitest was run directly |

**Deviations from the plan**
- `.env.example` was **not** edited. A deny rule blocks reading it, and appending blind risks duplicating keys. The new variables are documented in the README Environment table instead, and the maintainer must add the lines listed in section 6.
- `LocalStorageAdapter.publicUrl()` (`src/lib/storage/local.ts:83`) still returns an unprefixed `/api/local-uploads/…`. It is unused outside tests and the adapter interface, so it was left alone (outside the Target Context Map).

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
| Curator soundtrack inspect degrades without the IFrame API | Injecting `https://www.youtube.com/iframe_api` as a script logs exactly 1 CSP violation (log 4.2b). Inspect route returns 200 under `/photos`. **Artist/title population could not be confirmed**: no outbound network, so oEmbed returned empty guesses (log 4.3b). | PASS (block) / BLOCKED (network) for the populated-values half |

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
| Rewrite destination domain | `photo-wall-phi.vercel.app` replaced by `photo-wall-joeshmo.vercel.app` (see research Superseded claims); re-verify before the portfolio PR |

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

1. Add to `.env.example` (not editable by this run): `# TRUSTED_ORIGIN_HOSTS=gregory-lazatin.com,www.gregory-lazatin.com`, `# DATABASE_AUTH_TOKEN=`, and a comment that `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are read as fallbacks and that `CDN_BASE_URL` now wins over `BUNNY_PULL_ZONE_URL`.
2. Run the PENDING rows above.
3. Local dev is now `http://localhost:3000/photos`.

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

### 4.3b curator inspect (sandbox has no outbound network)
```
inspect 200 {"videoId":"jfKfPfyJRdk","artistGuess":null,"titleGuess":""}
```
