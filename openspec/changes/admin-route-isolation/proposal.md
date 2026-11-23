## Why

Exposing a lock icon and firing `GET /api/admin/auth` on every public `/` page load advertises admin controls to visitors and adds unnecessary per-visitor auth requests. Moving all photo album CRUD UI (upload, edit, delete, draft preview, client-local Lighting Preview) to a dedicated server-gated `/admin` route keeps the public `/` gallery 100% read-only while preserving browser-based curation behind a fail-closed `ADMIN_ENABLED` switch and server-verified session auth.

**Ordering / Dependency:** PR #1 (`f04b2af`) is merged on `main`; apply in order **`dom-wall-engine` → `admin-route-isolation`** so `gallery-hud-and-curator-ui` deltas archive without conflict.

## What Changes

- Make public `/` strictly read-only: remove the lock icon, `Curate` trigger, `GET /api/admin/auth` mount call, and `AdminDrawer` import from `GalleryHud.tsx` and `PhotoWallApp.tsx`.
- Add a single fail-closed Next.js 16 `src/proxy.ts` gate matching `/admin`, `/admin/:path*`, `/api/admin`, and `/api/admin/:path*`, returning `404 Not Found` unless `process.env.ADMIN_ENABLED === 'true'` (extra gate alongside existing `requireAdmin`/`guardAdminMutation`, plus `X-Robots-Tag: noindex` on `/api/admin/*`).
- Add a request-time server-rendered `/admin` page (`src/app/admin/page.tsx`, `robots: { index: false, follow: false }`, wrapped in `<Suspense>` calling `await connection()` / `await cookies()` *before* reading `process.env.ADMIN_ENABLED` — never using `export const dynamic = 'force-dynamic'`, which breaks Next.js 16 `cacheComponents: true`) that renders either `<AdminLoginForm />` (with `router.refresh()` on login) or `<AdminWallApp />` (with Logout `DELETE /api/admin/auth` → `router.refresh()`, `AdminDrawer`, and Lighting Preview).
- Add a draft-aware option to `computeWallGridPositions(albums, { includeStatuses })` (defaulting to `['published']`) and an uncached, authenticated `GET /api/admin/wall-preview` (`Cache-Control: private, no-store`, `X-Robots-Tag: noindex`) returning published + draft albums so `/admin` previews the post-publish wall live (triggering `useWallManifest.refetch()` and `PbrWallCanvas` GPU lightmap re-bake on mutations).
- Fold pre-deployment hardening from PR #1's final review: fail-closed `.env.example` placeholders + `TRUSTED_PROXY_HOPS=1` docs, boot-time `ADMIN_PASSWORD`/`TRUSTED_PROXY_HOPS` checks in `src/instrumentation.ts`, no `X-Real-IP` fallback on short `X-Forwarded-For` chains in `src/lib/auth.ts`, strict JPEG `APP0` (JFIF 14-byte thumbnail strip / drop `JFXX`) & `APP14` payload validation + `415` for arithmetic JPEG / animated WebP + APNG first-frame note in `sanitizeImage.ts`, and shared `isAcceptedImageFile(file)` across `folderReader.ts` and `FolderDropzone.tsx`.

## Capabilities

### New Capabilities
<!-- None — modifies existing HUD, admin API, and storage/sanitizer capabilities -->

### Modified Capabilities
- `gallery-hud-and-curator-ui`: Rename & update public HUD to read-only `/` (zero lock icon, zero `/api/admin/auth` fetch, zero `AdminDrawer` chunk loaded on `/`); update Curator Drawer requirement to `/admin`-only with shared `isAcceptedImageFile`; add request-time server-gated `/admin` route with live draft preview and GPU lightmap re-bake.
- `admin-auth-and-crud-api`: Add fail-closed `src/proxy.ts` `ADMIN_ENABLED` `404` gate (plus `X-Robots-Tag: noindex`), draft-aware `computeWallGridPositions` option, uncached `GET /api/admin/wall-preview` (`Cache-Control: private, no-store`), fail-closed `.env.example` + boot-time `ADMIN_PASSWORD`/`TRUSTED_PROXY_HOPS` checks, and short-chain `'direct'` fallback in `getClientKey`.
- `storage-and-cdn-pipeline`: Harden JPEG `APP0`/`APP14` payload validation (strip JFIF thumbnails to 14 bytes, drop `JFXX`, validate 12-byte Adobe `APP14`), reject arithmetic-coded JPEGs (`SOF9–SOF15`) and animated WebP (`ANMF`) with `415`, and document APNG first-frame flattening.

## Impact

- **Security Boundary**: `ADMIN_ENABLED` is an optional off-switch between curation sessions; real protection remains server-side JWT cookie auth + rate limiting (and Cloudflare Access on a named tunnel with locked-down origin in production). Draft image URLs remain publicly fetchable by unguessable UUIDv7 path.
- **Dependencies**: None added.

### Revision: 2026-11-23 20:40 UTC
- **Feedback Source**: Two-Agent Peer Review Audit
- **Key Changes**:
  - `architecture.md` / `specs/`: Removed `export const dynamic = 'force-dynamic'` (incompatible with Next 16 `cacheComponents: true`); specified `<Suspense>` + `await connection()` / `await cookies()` before reading `process.env.ADMIN_ENABLED`.
  - `islandLayout.ts` / `wall-preview`: Added `computeWallGridPositions(albums, { includeStatuses })` defaulting to `['published']`; marked `getAdminWallPreview()` uncached with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`; specified `AdminDrawer` mutation → `useWallManifest.refetch()` + GPU lightmap re-bake; added dashed mat + `"Draft"` placard styling in `design.md`.
  - `tests.md` / `tasks.md`: Added `next start` integration test for `src/proxy.ts` `config.matcher` (incl. `/api/admin`, `/admin/`, `PATCH`/`DELETE`, nested photo paths), Playwright JS-sentinel check for zero admin code on `/`, `AdminLoginForm` `router.refresh()` + Logout entry point, `PR #1 + PATCH-02` prerequisite, and `adminPage.test.tsx` mocking notes.
