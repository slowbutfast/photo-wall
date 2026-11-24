## Why

Exposing a lock icon and firing `GET /photos/api/admin/auth` on every public `/photos` load advertises admin controls to visitors and ships curator UI metadata/plumbing onto the public page. Moving all curator tools to a dedicated, server-gated **Curator Studio** at `/photos/admin` (with a persistent split workspace on desktop and Preview/Manage tabs on mobile) keeps `/photos` 100% read-only (`0 KB` admin JS shipped to visitors) while giving the curator a live draft-aware wall preview using the exact same WebGL2 PBR renderer (`PlaygroundGallery` + `PlaygroundPbrWall`).

**Ordering / Dependency:** Lands **after `client-upload-compression`** and **before `album-photo-management`**.

## What Changes

- **Two isolated route trees under `BASE_PATH = '/photos'`:** Move the public gallery into `src/app/(gallery)/page.tsx` and mount the Curator Studio at `src/app/admin/page.tsx` + `src/app/admin/login/page.tsx` (with its own admin layout).
- **Strictly read-only public `/photos`:** Remove `AdminDrawer`, the lock/`Curate` trigger, `curatorOpen`, and `refreshAuth()` from `PhotoWallApp.tsx` and `GalleryHud.tsx`. Enforce the boundary permanently with a static import-graph test (`publicBoundaryAudit.test.ts`) and a Playwright bundle check confirming `0` admin chunks load on `/photos`.
- **Pure `<GalleryCanvas>` renderer:** Extract a pure manifest-driven `<GalleryCanvas albums lodUrl theme mode="public" | "preview" />` from `PlaygroundGallery.tsx` + `PlaygroundPbrWall.tsx` so public `/photos` and `/photos/admin` share the exact same renderer. In `preview` mode, draft albums render with dashed mats and a `"Draft"` badge, and selection is shared between the wall and the sidebar.
- **Persistent Split Curator Studio (`/photos/admin`):** Replace the floating `AdminDrawer` with a persistent desktop split workspace (`<GalleryCanvas mode="preview" />` on the left, `440px` Studio Sidebar on the right; **Preview / Manage** tabs on `< 1024px` viewports preserving state) housing three sidebar tabs:
  - **Exhibitions** (published/draft album directory slot — expanded with full reordering and editing in `album-photo-management`),
  - **Upload** (existing `FolderDropzone` + `client-upload-compression` + optional `<input type="date">`/`<input type="time">`/Location/YouTube inspect),
  - **Settings** (Lighting Preview, Placard Material, Pending Deletions retry, and Sign Out).
- **Fail-closed `src/proxy.ts` gate + uncached preview manifest:** Add `src/proxy.ts` (`config.matcher = ['/admin/:path*', '/api/admin/:path*']`, auto-prefixed by `basePath`) returning `404` unless `process.env.ADMIN_ENABLED === 'true'`, verifying the `photowall_session` JWT via `jose` (redirecting unauthenticated `/admin` to `/photos/admin/login`, returning `401` on `/api/admin/*` except `/api/admin/auth`), and setting `X-Robots-Tag: noindex`. Retain `requireAdmin` / `guardAdminMutation` in every route handler as defense in depth. Add uncached `GET /api/admin/wall-preview` (`Cache-Control: private, no-store`, `X-Robots-Tag: noindex`) returning published + draft albums via `computeWallGridPositions(..., { includeStatuses: ['published', 'draft'] })`.
- **Studio-only CSP for YouTube duration probing:** Split `next.config.ts` `headers()` into a public negative-lookahead entry (keeping the strict CSP blocking `https://www.youtube.com` on `/photos`) and an `/admin/:path*` entry allowing `https://www.youtube.com` (`iframe_api`) so curator soundtrack duration probing works in Studio without loosening the public CSP.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `gallery-hud-and-curator-ui`: Make public `/photos` HUD strictly read-only (zero lock icon, zero `/api/admin/auth` fetch, zero admin imports); replace floating `AdminDrawer` with the persistent split Curator Studio at `/photos/admin` housing Exhibitions, Upload, and Settings tabs next to a live draft-aware `<GalleryCanvas mode="preview" />`.
- `admin-auth-and-crud-api`: Add fail-closed `src/proxy.ts` gate (`ADMIN_ENABLED` `404` kill switch + JWT check + `X-Robots-Tag: noindex`), draft-aware `computeWallGridPositions`, and uncached `GET /api/admin/wall-preview` (`Cache-Control: private, no-store`).
- `subpath-deployment`: Split `next.config.ts` CSP `headers()` so `/photos` keeps the strict public policy while `/photos/admin/:path*` allows `https://www.youtube.com` for curator soundtrack duration probing.

## Impact

- **Code:** `src/proxy.ts`, `next.config.ts`, `src/lib/security/csp.ts`, `src/app/(gallery)/page.tsx`, `src/app/admin/{layout,page}.tsx`, `src/app/admin/login/page.tsx`, `src/app/api/admin/wall-preview/route.ts`, `src/components/wall/GalleryCanvas.tsx`, `src/components/PhotoWallApp.tsx`, `src/components/hud/GalleryHud.tsx`, `src/components/admin/{CuratorStudio,AdminLoginForm}.tsx`, `src/lib/layout/islandLayout.ts`, `src/lib/__tests__/publicBoundaryAudit.test.ts`.
- **Env:** Adds `ADMIN_ENABLED="true"` (per-deploy switch on Vercel; absent or non-`"true"` returns `404` on `/photos/admin*` and `/photos/api/admin*`).
- **Removed from scope:** Unrelated PR #1 image-sanitizer hardening (`APP0`/`APP14`, arithmetic JPEG, animated WebP) is split out so this change stays cleanly reviewable.

### Revision: 2026-11-24 19:56 UTC
- **Feedback Source**: Architectural alignment + User Visual Playtest Sign-Off
- **Key Changes**:
  - Updated all paths to `BASE_PATH = '/photos'` (`withBase()`), `photowall_session`, and Vercel deployment semantics (removed stale self-hosted cloudflared/PbrWallCanvas assumptions).
  - Replaced floating `AdminDrawer` with the persistent split **Curator Studio** (`/photos/admin`, desktop split + mobile Preview/Manage tabs) folding in Upload and Settings beside the Exhibitions slot.
  - Added pure `<GalleryCanvas>` extraction over `PlaygroundGallery` + `PlaygroundPbrWall`, static `publicBoundaryAudit.test.ts`, and studio-only CSP for `https://www.youtube.com/iframe_api`.
  - Split out unrelated PR #1 sanitizer hardening (`specs/storage-and-cdn-pipeline/spec.md` removed).
