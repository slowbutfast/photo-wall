## 1. Test Scaffolding (TDD)

- [ ] 1.1 Install `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` (used strictly in `src/components/admin/`).
- [ ] 1.2 Scaffold failing `src/components/admin/__tests__/photoOrderState.test.ts` covering `moveItem`, `moveToFirst`, `moveToLast`, `isOrderDirty`, `mergeStaleOrder` (concurrent upload + concurrent delete), and `formatCombinedDateLabel` / `parseCombinedDateLabel`.
- [ ] 1.3 Extend `src/app/api/__tests__/routes.test.ts` with failing tests for `GET /api/admin/albums/[id]`, `PUT /api/admin/albums/[id]/photo-order`, and `PUT /api/admin/album-order` (happy path, idempotency, `401`, `403`, `404`, `409 order_stale` for missing/duplicate/cross-album/deleting IDs, cross-album isolation).
- [ ] 1.4 Run `npx vitest run` and confirm the new tests fail before implementation.

## 2. Atomic Reorder Persistence & Admin API Routes

- [ ] 2.1 In `src/db/repository.ts`, add `getAlbumWithActivePhotos(albumId)`, `reorderAlbumPhotos(albumId, photoIds)` (full-permutation check + single `db.batch([...])` renumbering `0..n-1`), and `reorderAlbums(albumIds)` (full-permutation check over non-`deleting` albums + single `db.batch([...])` renumbering `0..m-1`).
- [ ] 2.2 Add `GET` to `src/app/api/admin/albums/[id]/route.ts`, create `src/app/api/admin/albums/[id]/photo-order/route.ts` (`PUT`), and create `src/app/api/admin/album-order/route.ts` (`PUT`), each guarded by `requireAdmin` / `guardAdminMutation` and calling `revalidateTag('wall', { expire: 0 })` once on mutation. Iterate until `routes.test.ts` passes.

## 3. Pure Order State, Fixed-Height Placard Anatomy & Studio Album Editor

- [ ] 3.1 Implement `src/components/admin/photoOrderState.ts` (`moveItem`, `moveToFirst`, `moveToLast`, `isOrderDirty`, `mergeStaleOrder`, `formatCombinedDateLabel`, `parseCombinedDateLabel`) until `photoOrderState.test.ts` passes.
- [ ] 3.2 Update placard rendering in `src/components/wall/GalleryCanvas.tsx` / `PlaygroundGallery.tsx` and `src/app/playground-wall.css` to enforce fixed `214×200px` height top-aligned beside the photo grid with unified bold **Caption**, optional muted **[Date · Time · Location]**, and bottom-pinned **Song Title — Artist** + **live-updating timecode** (`tabular-nums`, no green dot) above the two bottom standoffs.
- [ ] 3.3 Implement `src/components/admin/AlbumEditor.tsx` and wire it into `CuratorStudio.tsx`'s **Exhibitions** tab: Published/Draft filter + `@dnd-kit/sortable` + `↑`/`↓` cross-wall album ordering (**Save Wall Order / Discard**); two-tab Album Editor with **`Photos (N)`** (wall-matched `gridColumns` grid, `@dnd-kit/sortable`, top-right `×` delete overlay, 4-column `⤒`/`←`/`→`/`⤓` bar, Grid/List toggle, `+ Add Print` reusing `imageCompressor.ts`, read-only `<= 1` state, live `<GalleryCanvas>` overlay, sticky **Save Order / Discard**, `409 order_stale` merge banner + retry) and **`Details`** (required `*` labels on **Caption\*** and **Wall Grid Columns\***; bare labels on `<input type="date">`, `<input type="time">`, **Geotag / Location**, and full **YouTube Soundtrack** Video Link + Inspect + Song Title + Artist + Clear; Publish/Draft & 2-step Delete). All fetches wrapped in `withBase()`.

## 4. Verification & Empirical Audit

- [ ] 4.1 Run `npm run typecheck && npm run lint && npm test && npm run build` (confirming `publicBoundaryAudit.test.ts` verifies `0 KB` `@dnd-kit` leakage on `/photos` and `rawUrlAudit.test.ts` passes).
- [ ] 4.2 Run Playwright end-to-end verification on `next start` covering: photo drag/button reorder + reload persistence + Print Focus `← Prev` / `Next →` match, cross-wall album reorder, `409 order_stale` merge recovery, `Details` live placard updates + `<input type="date">`/`<input type="time">` persistence, fixed `214×200px` placard height, and live timecode without green dot.
- [ ] 4.3 Populate `openspec/changes/album-photo-management/verification.md` with Requirement Adherence Audit Matrix and verbatim execution logs.
