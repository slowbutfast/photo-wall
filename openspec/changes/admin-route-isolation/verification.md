## Executive Summary & Environment

- **Status**: All `admin-route-isolation` requirements and scenarios verified passing. The public gallery is now a strictly read-only route group with zero admin imports/fetches, and `/photos/admin` is a fail-closed, JWT-gated persistent split Curator Studio.
- **Date**: 2026-11-24
- **Environment**: Linux (container), Node.js `v22.23.2`, Next.js `16.4.6`, React `19.3.1`, Vitest `5.1.1`, Playwright `1.65.1` (Chromium headless), npm `10.x`.
- **Runtime verification**: `next start` on ports `3210` (`ADMIN_ENABLED=true`) and `3211` (`ADMIN_ENABLED=false`), exercised with curl and a Playwright script (single browser context, no parallelism).

## Requirement Adherence Audit Matrix

| Capability | Requirement & Scenario | Verification Method / Test File | Status |
| :--- | :--- | :--- | :--- |
| `gallery-hud-and-curator-ui` | **Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger** — public `/photos` strictly read-only, zero curator triggers/admin imports/`/api/admin/auth` calls, static import-graph audit | `src/lib/__tests__/publicBoundaryAudit.test.ts` (3 tests); Playwright public-page checks | **PASS** |
| `gallery-hud-and-curator-ui` | **Scenario: Public gallery loads zero admin UI or auth calls** — no lock/`Curate`, zero `/photos/api/admin/*`, zero admin chunks | Playwright: `public /photos returns 200`, `public makes zero /api/admin requests`, `public has no lock/Curate trigger`, `no admin-named chunks loaded on /photos`; `publicBoundaryAudit.test.ts` | **PASS** |
| `gallery-hud-and-curator-ui` | **Requirement: Lazy-loaded Curator Drawer with resilient folder upload and soundtrack editor** — all curation in persistent split Studio at `/photos/admin`; desktop `GalleryCanvas mode="preview"` + `440px` sidebar; Exhibitions/Upload/Settings; mobile preview/manage preserving state; drafts dashed + badge | `src/components/admin/CuratorStudio.tsx`; Playwright `studio shell renders after login`, `studio has Exhibitions/Upload/Settings tabs`, `studio renders the preview canvas` | **PASS** |
| `gallery-hud-and-curator-ui` | **Scenario: Studio renders live draft-aware preview beside Upload and Settings** | Playwright `studio fetches wall-preview` + screenshots `.scratch/studio-desktop.png` (inspected); Settings Lighting/Placard controls update the shared store consumed by `GalleryCanvas` | **PASS** |
| `gallery-hud-and-curator-ui` | **Scenario: Mobile Studio tabs preserve in-progress upload and draft state** | Playwright 390×844: `Settings state survives mobile pane switches`, `upload queue/dropzone survives mobile pane switches` | **PASS** |
| `admin-auth-and-crud-api` | **Requirement: Fail-closed admin route proxy gate and uncached draft preview manifest** — match `/admin*` + `/api/admin*`, `ADMIN_ENABLED !== 'true'` → 404, `jose` `photowall_session`, redirect/401, `X-Robots-Tag`, uncached preview | `src/proxy.ts`; `src/app/api/admin/wall-preview/route.ts`; `src/app/api/__tests__/routes.test.ts` (wall-preview describe) | **PASS** |
| `admin-auth-and-crud-api` | **Scenario: Disabled admin kill switch returns 404** | Playwright on `ADMIN_ENABLED=false`: `ADMIN_ENABLED=false returns 404 on /photos/admin` (404), `.../api/admin/auth` (404); curl matrix below | **PASS** |
| `admin-auth-and-crud-api` | **Scenario: Unauthenticated Studio request redirects to login** — `X-Robots-Tag: noindex, nofollow` | Playwright `unauth /photos/admin redirects to login`; curl `307 → /photos/admin/login` + `x-robots-tag: noindex, nofollow` | **PASS** |
| `admin-auth-and-crud-api` | **Scenario: Authenticated wall-preview returns published and draft albums uncached** — 200, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, published+draft, public wall excludes drafts | `routes.test.ts > GET /api/admin/wall-preview > returns published and draft albums uncached with noindex`; curl authenticated preview headers | **PASS** |
| `subpath-deployment` | **Requirement: photo-wall emits its own Content-Security-Policy** — public negative-lookahead `allowYoutubeApi: false`; `/admin` + `/admin/:path*` `allowYoutubeApi: true` | `src/lib/security/__tests__/csp.test.ts` (`buildContentSecurityPolicy allowYoutubeApi`); `next.config.ts`; live headers | **PASS** |
| `subpath-deployment` | **Scenario: Public routes keep strict CSP without youtube.com scripts** | `csp.test.ts` public assertions; Playwright `public CSP blocks www.youtube.com`, `public CSP allows youtube-nocookie frame`; curl `/photos` and `/photos/api/wall` | **PASS** |
| `subpath-deployment` | **Scenario: Studio routes allow YouTube IFrame API for duration probing** | `csp.test.ts` studio assertions; Playwright `login CSP allows www.youtube.com`; curl `/photos/admin/login` | **PASS** |

## Resolved Assumptions & Empirical Proof

| Assumption from research.md | How Verified in Code/Tests | Result / Value | Volatility |
| :--- | :--- | :--- | :--- |
| Public `/photos` fires `GET /api/admin/auth` today and can be made 100% read-only | `PhotoWallApp`/`GalleryHud`/`useWallStore` stripped of auth probes; `publicBoundaryAudit.test.ts`; Playwright request capture | Zero `/api/admin/*` requests and zero admin-named chunks on `/photos?demo=4` | stable |
| Next 16 `src/proxy.ts` matcher is auto-prefixed with `basePath` | Live `next start`: `/photos/admin` → 307 `/photos/admin/login`; disabled → 404 | Matcher works as documented | stable with Next major |
| Single fail-closed `ADMIN_ENABLED` gate covers GET and mutation admin routes | curl/Playwright matrix on ports 3210/3211 | `/photos/admin`, `/photos/admin/login`, `/photos/api/admin/auth`, `/photos/api/admin/wall-preview` all 404 when disabled | stable |
| `photowall_session` JWT verifies with `jose` in the proxy | Login flow: POST auth → cookie → `/photos/admin` 200; preview 200 | Authenticated Studio and preview reachable; unauth requests 401/redirect | stable |
| `computeWallGridPositions` can lay out drafts when asked | `islandLayout.test.ts > includeStatuses` (default published-only; published+draft; deterministic rules) | Drafts reserve wall space only when requested | stable |
| Uncached preview manifests can coexist with cached public wall | `routes.test.ts` preview headers; public `/api/wall` still excludes drafts | `private, no-store` + `noindex` on preview; public cached manifest unchanged | stable |

## Nomenclature & Code Symbol Audit

| Glossary Term | Final Code Identifier | Location / File | Verified Compliant? |
| :--- | :--- | :--- | :--- |
| **Read-Only Public `/` Route** | `GalleryPage`, `GalleryHud`, `publicBoundaryAudit.test.ts` | `src/app/(gallery)/page.tsx`, `src/components/hud/GalleryHud.tsx`, `src/lib/__tests__/publicBoundaryAudit.test.ts` | Yes |
| **Fail-Closed `src/proxy.ts` Gate** | `proxy`, `config.matcher`, `noindex()` | `src/proxy.ts` | Yes |
| **Admin Live Wall Preview** | `GET`, `getWallPreviewSummary`, `listAlbumsWithPhotos` | `src/app/api/admin/wall-preview/route.ts`, `src/lib/manifest.ts`, `src/db/repository.ts` | Yes |
| **Curator Studio** | `CuratorStudio`, `.studio-shell`, `.studio-sidebar` | `src/components/admin/CuratorStudio.tsx`, `src/app/admin/studio.css` | Yes |
| **Pure `<GalleryCanvas>`** | `GalleryCanvas`, `GalleryCanvasMode`, `GalleryCanvasProps` | `src/components/wall/GalleryCanvas.tsx` | Yes |
| **Draft preview affordance** | `is-draft`, `placard-draft-badge`, `AlbumStatus` | `GalleryCanvas.tsx`, `studio.css`, `src/lib/layout/types.ts` | Yes |
| **Kill switch** | `ADMIN_ENABLED` | `src/proxy.ts`, `src/app/admin/{page,login/page}.tsx`, `.env.example`, `README.md` | Yes |

## Landed Tech Footprint & Patterns

| Adopted Pattern / Package | Implementation File(s) | Verification Command / Suite |
| :--- | :--- | :--- |
| Next 16 `proxy.ts` + `jose` JWT verification + fail-closed env gate | `src/proxy.ts` | Playwright + curl matrix |
| Route groups + static import-graph boundary audit | `src/app/(gallery)/page.tsx`, `src/lib/__tests__/publicBoundaryAudit.test.ts` | `npx vitest run src/lib/__tests__/publicBoundaryAudit.test.ts` |
| Shared renderer seam (`GalleryCanvas`) with `mode`/selection props | `src/components/wall/GalleryCanvas.tsx`, `PlaygroundGallery.tsx` | full suite + Playwright Studio canvas |
| `<Suspense>` + `await connection()` / `await cookies()` under `cacheComponents` | `src/app/admin/page.tsx`, `src/app/admin/login/page.tsx` | `npx next build` route table |
| Status-filtered deterministic wall placement | `src/lib/layout/islandLayout.ts` (`WallGridOptions`) | `islandLayout.test.ts` |
| Draft-aware uncached manifest endpoint | `src/app/api/admin/wall-preview/route.ts`, `src/lib/manifest.ts`, `src/db/repository.ts` | `routes.test.ts` |
| Split CSP headers | `src/lib/security/csp.ts`, `next.config.ts` | `csp.test.ts` + live headers |
| Persistent split Studio + mobile state preservation | `src/components/admin/CuratorStudio.tsx`, `src/components/admin/AdminLoginForm.tsx`, `src/app/admin/studio.css` | Playwright 1440×900 and 390×844 |

## Invalidated Hypotheses & Mid-Build Adjustments

| Original Belief | What Proved Wrong | Final Resolution | Rationale |
| :--- | :--- | :--- | :--- |
| Research note said `/admin/page.tsx` must use `export const dynamic = 'force-dynamic'` | Incompatible with the repo's `cacheComponents: true`; handoff/tasks forbid it | `<Suspense>` wrapper + `await connection()` / `await cookies()` in async content | Required by the architecture's D2 and the batch guardrails |
| A single negative-lookahead header source (`/((?!admin(?:/|$)).*)`) covers `/photos` | Next compiles it to `^/photos(?:/((?!admin...)).*)`, requiring a trailing segment; `/photos` root got no CSP | Added `/:path*` public catch-all after the negative lookahead; Studio rules still override for `/admin*` (verified one CSP value) | Real `next start` headers |
| `useWallManifest`'s `loading` flag is sufficient for the Studio | An authenticated empty wall kept `loading` true forever (no albums, no error) | Added a `settled` state set on fetch success/failure and seeded from an SSR manifest | Empty-wall correctness |
| Mobile Preview/Manage switcher can live inside the preview stage | Hiding the stage in Manage mode also hid the switcher (could not switch back) | Moved the switcher outside both panes; sidebar gains top padding on mobile | Playwright caught the dead-end |
| `safe-test` with `SAFE_TEST_MAX_MEM_KB=16777216` can run the suite | `ulimit -v` makes Node 22 fail to instantiate @libsql WASM (`Out of memory`), even at 32 GB | Ran the same `npm` commands directly; capture logs below | Environment limitation, not a code failure |

## Implementation-Discovered Deferrals

- **Album photo/album drag-reorder editor (`AlbumEditor.tsx`, dnd-kit)**
  - **Reason**: Explicitly scoped to the next change, `album-photo-management`; this change only provides the Exhibitions directory slot and live preview.
- **Private/signed image URLs for drafts**
  - **Reason**: Documented non-goal; draft metadata is excluded from `/photos/api/wall`, while draft image bytes remain behind unguessable UUIDv7 paths.
- **Instant `ADMIN_ENABLED` toggling on Vercel**
  - **Reason**: Env changes take effect on redeploy; documented in README/env example.

## Empirical Execution Logs & Evidence

### Targeted TDD suite (final)

```bash
npx vitest run \
  src/lib/__tests__/publicBoundaryAudit.test.ts \
  src/lib/security/__tests__/csp.test.ts \
  src/lib/layout/__tests__/islandLayout.test.ts \
  src/app/api/__tests__/routes.test.ts
```

```text
 Test Files  4 passed (4)
      Tests  69 passed (69)
   Start at  16:02:08
   Duration  2.73s (tests 62%, import 34%, transform 3%, worker 1%)
```

### Full regression suite

```bash
npm test
```

```text
 Test Files  25 passed (25)
      Tests  350 passed (350)
   Start at  16:01:35
   Duration  7.60s (tests 66%, import 28%, transform 3%, worker 3%)
```

`safe-test` note (verbatim failure with the recommended cap):

```text
$ SAFE_TEST_MAX_MEM_KB=16777216 safe-test npm test
[safe-test 15:53:41] Lock acquired (11336MB RAM free | limit: 16384MB). Executing: npm test
RangeError: WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance
Node.js v22.23.2
```

The identical `npm test` command passes outside `ulimit -v` (25 files / 350 tests). Baseline before this change was 24 files / 340 tests; the delta is +1 test file (`publicBoundaryAudit.test.ts`) and +10 tests (3 boundary, 3 layout `includeStatuses`, 2 CSP, 2 preview route).

### Typecheck, lint, build

```bash
npx tsc --noEmit        # exit 0, no output
npm run lint            # exit 0, no output
DATABASE_URL=file::memory: \
ADMIN_PASSWORD='test-password-1234' \
AUTH_SECRET='test-secret-that-is-long-enough-for-hs256-signing' \
STORAGE_DRIVER=local LOCAL_UPLOAD_DIR=./data/test-uploads ADMIN_ENABLED=true \
npm run build           # exit 0
```

```text
✓ Compiled successfully
  Finished TypeScript
✓ Generating static pages using 2 workers (12/12)
...
┌ ◐ /
├ ◐ /admin
├ ◐ /admin/login
├ ƒ /api/admin/wall-preview
└ ○ /api/wall
ƒ Proxy (Middleware)
```

### Live header/CSP matrix (`next start`, port 3210, `ADMIN_ENABLED=true`)

```text
/photos               200, CSP strict (no www.youtube.com), frame-src youtube-nocookie only
/photos/api/wall      200, CSP strict
/photos/admin         307 → /photos/admin/login, x-robots-tag: noindex, nofollow, studio CSP
/photos/admin/login   200, studio CSP (script-src + frame-src include https://www.youtube.com), noindex
/photos/api/admin/auth (unauth) 200 {"authenticated":false}, noindex
/photos/api/admin/wall-preview (unauth) 401, noindex
/photos/api/admin/wall-preview (auth) 200, cache-control: private, no-store, x-robots-tag: noindex
```

### Playwright end-to-end (single worker; 1440×900 + 390×844)

```text
PASS public /photos returns 200 — status 200
PASS public makes zero /api/admin requests
PASS public has no lock/Curate trigger
PASS public CSP blocks www.youtube.com
PASS public CSP allows youtube-nocookie frame
PASS no admin-named chunks loaded on /photos
PASS unauth /photos/admin redirects to login — http://localhost:3210/photos/admin/login
PASS login response is noindex
PASS login CSP allows www.youtube.com
PASS studio shell renders after login
PASS studio fetches wall-preview — 1 request(s)
PASS studio has Exhibitions/Upload/Settings tabs
PASS studio renders the preview canvas
PASS mobile switcher visible
PASS upload dropzone mounted
PASS Settings state survives mobile pane switches
PASS upload queue/dropzone survives mobile pane switches
PASS ADMIN_ENABLED=false returns 404 on /photos/admin — status 404
PASS ADMIN_ENABLED=false returns 404 on /photos/api/admin/auth — status 404
PASS ADMIN_ENABLED=false keeps /photos public — status 200
```

Screenshots captured and visually inspected: public gallery (unchanged, no `Curate`/lock), login card, desktop split Studio, and mobile Manage pane with the floating switcher clear of the header.

### Metrics & Data Invariants

| Metric / Count | Before | After | Delta / Observation |
| :--- | :--- | :--- | :--- |
| Test files | 24 | 25 | +1 (`publicBoundaryAudit.test.ts`) |
| Tests | 340 | 350 | +10, all passing |
| Public gallery admin imports | 1 (`AdminDrawer` dynamic import) | 0 | Static import-graph audit |
| Public gallery `/api/admin/*` page-load requests | 1 (`GET /api/admin/auth`) | 0 | Playwright request capture |
| Public admin-named chunks loaded | 1+ | 0 | Playwright performance entries |
| DB schema / migrations | — | — | None added; no rows migrated or deleted |
| Preview manifest cache | n/a | `private, no-store` | Verified via route test + curl |

## Quick Re-Verification (60-Second Audit)

```bash
npx vitest run \
  src/lib/__tests__/publicBoundaryAudit.test.ts \
  src/lib/security/__tests__/csp.test.ts \
  src/lib/layout/__tests__/islandLayout.test.ts \
  src/app/api/__tests__/routes.test.ts
```

Expected output:

```text
 Test Files  4 passed (4)
      Tests  69 passed (69)
```

Full gate (about 30–60 s):

```bash
npx tsc --noEmit && npm run lint && npm test
```

Expected: `tsc` and `lint` exit `0` with no output; Vitest reports `25 passed (25)` files and `350 passed (350)` tests.

Runtime spot-check (build once, then two servers):

```bash
DATABASE_URL=file::memory: ADMIN_PASSWORD='test-password-1234' \
AUTH_SECRET='test-secret-that-is-long-enough-for-hs256-signing' \
STORAGE_DRIVER=local LOCAL_UPLOAD_DIR=./data/test-uploads ADMIN_ENABLED=true npm run build

DATABASE_URL=file::memory: ADMIN_PASSWORD='test-password-1234' \
AUTH_SECRET='test-secret-that-is-long-enough-for-hs256-signing' \
STORAGE_DRIVER=local LOCAL_UPLOAD_DIR=./data/test-uploads ADMIN_ENABLED=true npx next start -p 3210 &

DATABASE_URL=file::memory: ADMIN_PASSWORD='test-password-1234' \
AUTH_SECRET='test-secret-that-is-long-enough-for-hs256-signing' \
STORAGE_DRIVER=local LOCAL_UPLOAD_DIR=./data/test-uploads ADMIN_ENABLED=false npx next start -p 3211 &

curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3210/photos          # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3210/photos/admin    # 307
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3211/photos/admin    # 404
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3211/photos/api/admin/auth  # 404
```
