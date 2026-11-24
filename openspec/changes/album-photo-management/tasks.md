## 1. Test Scaffolding (TDD)

- [x] 1.1 Install `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` (used strictly in `src/components/admin/`).
- [x] 1.2 Scaffold failing `src/components/admin/__tests__/photoOrderState.test.ts` covering `moveItem`, `moveToFirst`, `moveToLast`, `isOrderDirty`, `mergeStaleOrder` (concurrent upload + concurrent delete), and `formatCombinedDateLabel` / `parseCombinedDateLabel`.
- [x] 1.3 Extend `src/app/api/__tests__/routes.test.ts` with failing tests for `GET /api/admin/albums/[id]`, `PUT /api/admin/albums/[id]/photo-order`, and `PUT /api/admin/album-order` (happy path, idempotency, `401`, `403`, `404`, `409 order_stale` for missing/duplicate/cross-album/deleting IDs, cross-album isolation).
- [x] 1.4 Run `npx vitest run` and confirm the new tests fail before implementation.

## 2. Atomic Reorder Persistence & Admin API Routes

- [x] 2.1 In `src/db/repository.ts`, add `getAlbumWithActivePhotos(albumId)`, `reorderAlbumPhotos(albumId, photoIds)` (full-permutation check + single `db.batch([...])` renumbering `0..n-1`), and `reorderAlbums(albumIds)` (full-permutation check over non-`deleting` albums + single `db.batch([...])` renumbering `0..m-1`).
- [x] 2.2 Add `GET` to `src/app/api/admin/albums/[id]/route.ts`, create `src/app/api/admin/albums/[id]/photo-order/route.ts` (`PUT`), and create `src/app/api/admin/album-order/route.ts` (`PUT`), each guarded by `requireAdmin` / `guardAdminMutation` and calling `revalidateTag('wall', { expire: 0 })` once on mutation. Iterate until `routes.test.ts` passes.

## 3. Pure Order State, Fixed-Height Placard Anatomy & Studio Album Editor

- [x] 3.1 Implement `src/components/admin/photoOrderState.ts` (`moveItem`, `moveToFirst`, `moveToLast`, `isOrderDirty`, `mergeStaleOrder`, `formatCombinedDateLabel`, `parseCombinedDateLabel`) until `photoOrderState.test.ts` passes.
- [x] 3.2 Update placard rendering in `src/components/wall/GalleryCanvas.tsx` / `PlaygroundGallery.tsx` and `src/app/playground-wall.css` to enforce fixed `214×200px` height top-aligned beside the photo grid with unified bold **Caption**, optional muted **[Date · Time · Location]**, and bottom-pinned **Song Title — Artist** + **live-updating timecode** (`tabular-nums`, no green dot) above the two bottom standoffs.
- [x] 3.3 Implement `src/components/admin/AlbumEditor.tsx` and wire it into `CuratorStudio.tsx`'s **Exhibitions** tab: Published/Draft filter + `@dnd-kit/sortable` + `↑`/`↓` cross-wall album ordering (**Save Wall Order / Discard**); two-tab Album Editor with **`Photos (N)`** (wall-matched `gridColumns` grid, `@dnd-kit/sortable`, top-right `×` delete overlay, 4-column `⤒`/`←`/`→`/`⤓` bar, Grid/List toggle, `+ Add Print` reusing `imageCompressor.ts`, read-only `<= 1` state, live `<GalleryCanvas>` overlay, sticky **Save Order / Discard**, `409 order_stale` merge banner + retry) and **`Details`** (required `*` labels on **Caption\*** and **Wall Grid Columns\***; bare labels on `<input type="date">`, `<input type="time">`, **Geotag / Location**, and full **YouTube Soundtrack** Video Link + Inspect + Song Title + Artist + Clear; Publish/Draft & 2-step Delete). All fetches wrapped in `withBase()`.

## 4. Verification & Empirical Audit

- [x] 4.1 Run `npm run typecheck && npm run lint && npm test && npm run build` (confirming `publicBoundaryAudit.test.ts` verifies `0 KB` `@dnd-kit` leakage on `/photos` and `rawUrlAudit.test.ts` passes).
- [x] 4.2 Run Playwright end-to-end verification on `next start` covering: photo drag/button reorder + reload persistence + Print Focus `← Prev` / `Next →` match, cross-wall album reorder, `409 order_stale` merge recovery, `Details` live placard updates + `<input type="date">`/`<input type="time">` persistence, fixed `214×200px` placard height, and live timecode without green dot. — **Orchestrator Playwright pass:** 29/29 checks on production `next start` with a fresh libSQL DB, covering button reorder → `/api/wall` + reload persistence, Print Focus `← Prev`/`Next →` order, cross-wall Save Wall Order persistence, a two-client `409 order_stale` banner/merge/retry (4 prints, curator order preserved, upload appended), Details persistence + live unsaved placard overlay, computed `214px × 200px` placard on preview and public, live `0:02 / 3:25` timecode with no status dot, and public zero-admin-request/strict-CSP isolation. The optional `Inspect` duration probe requires a browser with `www.youtube.com` reachable; the timecode total was verified with a persisted `durationSec`.
- [x] 4.3 Populate `openspec/changes/album-photo-management/verification.md` with Requirement Adherence Audit Matrix and verbatim execution logs.

## Patch 01: Legacy date-label preservation, filtered wall reorder, basePath-doubled redirects

- [ ] P01.1 Scaffold the reproducing tests and confirm they fail:
  - `photoOrderState.test.ts`: `resolveDateLabel` keeps `"October 2025"` when inputs are untouched, and replaces it when the Date input changes;
  - `photoOrderState.test.ts`: `moveWithinSubset` keeps hidden drafts in their exact slots for a mixed published/draft list, and matches `moveItem` when everything is visible;
  - `publicBoundaryAudit.test.ts`: no `redirect(withBase(` anywhere under `src/app`.
- [ ] P01.2 Apply the minimal fixes:
  - `photoOrderState.ts`: add the two helpers;
  - `AlbumEditor.tsx`: `rawDateLabel`, the `Current:` label with **Clear date**, and drop the explicit `sortOrder` from `+ Add Print`;
  - `CuratorStudio.tsx`: visible-index drag, `↑` / `↓` and disabled states;
  - `src/app/admin/page.tsx` and `src/app/admin/login/page.tsx`: plain `redirect()`;
  - `next.config.ts`: drop the lookahead header rule;
  - `src/proxy.ts`: fix the comment.
- [ ] P01.3 Verify the reproduction tests pass. Run `npm run typecheck && npm run lint && npx vitest run && npm run build`. Re-run the Playwright checks for the signed-in `/photos/admin/login` redirect, the filtered reorder, legacy date preservation, and the public/Studio CSP headers.
- [ ] P01.4 Update `verification.md` (matrix rows for the two new scenarios and the redirect check, plus logs), and mark PATCH-01 RESOLVED in `patch.md`.
