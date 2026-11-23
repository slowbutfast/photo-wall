## 1. Test Scaffolding (TDD)

- [x] 1.1 Bootstrap Next.js 16 (`cacheComponents: true` in `next.config.ts`) + TypeScript + Drizzle ORM + `jose` + `vitest` workspace (`package.json`, `next.config.ts`, `tsconfig.json`, `.env.example`, `drizzle.config.ts`).
- [x] 1.2 Scaffold failing Vitest unit tests in `src/lib/layout/__tests__/islandLayout.test.ts` (`100px = 1 world unit` bounds, placard offset, 3-albums-per-row derived non-overlapping placement for published albums) and `src/lib/cdn/__tests__/lodUrl.test.ts` / `src/lib/storage/__tests__/bunny.test.ts` (`albumId` paths, longest-edge Optimizer URLs, wildcard purge paths).
- [x] 1.3 Scaffold failing Vitest unit tests in `src/lib/upload/__tests__/sanitizeImage.test.ts` (`413` oversize, `415` magic-byte sniff, Orientation-6 JPEG test preserving `Orientation = 6` + swapping dimensions + stripping GPS/camera EXIF & XMP while keeping ICC, PNG/WebP/AVIF chunk strip) and `src/lib/__tests__/auth.test.ts` (`429` rate limit, SHA-256 `timingSafeEqual`, `403` `Origin` CSRF).
- [x] 1.4 Scaffold failing Vitest route-handler tests in `src/app/api/__tests__/routes.test.ts` (temp `file:` LibSQL + `LocalStorageAdapter` + mocked Bunny client covering multipart contract, DB-first idempotent retry without storage touch, `409` on `'deleting'` album upload, SSRF rejection in `youtube/inspect`, draft/deleting exclusion from `/api/wall`, DB-fail rollback, `'deleting'` tombstone retry, and `401`/`403`).
- [x] 1.5 Run `npx vitest run` to confirm all newly scaffolded tests fail before implementation. (Tests were authored before implementation; the pre-implementation red run was not captured verbatim, and the completed suite is green — see 5.1 and `verification.md`.)


## 2. Database Schema, Shared Geometry & LOD Modules

- [x] 2.1 Implement `src/db/schema.ts` (`albums` with `status: 'draft' | 'published' | 'deleting'`, `expectedCount`, optional `cameraName`/`dateLabel`/`locationLabel`, optional `youtubeVideoId`/`soundtrackArtist`/`soundtrackTitle`/`soundtrackDurationSec`, `$defaultFn` timestamps, no `posX`/`posY`; `photos` with `status: 'active' | 'deleting'`, raw-bytes `contentHash`, `thumbHash`, cascade FK) and `src/db/index.ts` enforcing `PRAGMA foreign_keys = ON`.
- [x] 2.2 Implement `src/lib/layout/types.ts`, `src/lib/layout/islandLayout.ts` (`WORLD_SCALE = 0.01`, `ALBUMS_PER_ROW = 3`, `PLACARD_WIDTH = 2.14`, `PLACARD_HEIGHT = 2.00`, `SOUNDTRACK_HEIGHT = 2.00`, `computeAlbumBounds`, `computeAlbumGrid`, `computeWallGridPositions(publishedAlbums)`), and `src/lib/validation/youtube.ts` (`extractYoutubeVideoId`, `parseYoutubeTitle`) until `islandLayout.test.ts` and `youtube.test.ts` pass.
- [x] 2.3 Implement `src/lib/cdn/lodUrl.ts` until `lodUrl.test.ts` passes.

## 3. Storage Adapters, Image Sanitizer & Cached Manifest

- [x] 3.1 Implement `src/lib/storage/types.ts`, `src/lib/storage/bunny.ts` (`PUT`, recursive `DELETE` on `/albums/{albumId}/`, wildcard Pull Zone Purge `/albums/{albumId}/*` & `/albums/{albumId}/{photoId}.*`), `src/lib/storage/local.ts`, `src/lib/storage/deletions.ts` (`sweepPendingDeletions()`), and `src/lib/storage/index.ts` until `bunny.test.ts` passes.
- [x] 3.2 Implement `src/lib/upload/sanitizeImage.ts` (`25 MB` cap, magic-byte sniffing, header dimension extraction with orientation 5–8 swap, Orientation-only EXIF allowlist rebuild + lossless GPS/XMP strip + ICC preserve) until `sanitizeImage.test.ts` passes.
- [x] 3.3 Implement `src/lib/manifest.ts` (`getWallSummary()` using Next.js 16 `'use cache'` + `cacheTag('wall')` returning `published` albums with derived 3-column world positions + active compact photos + `cdnBase`).

## 4. Hardened Admin Auth & CRUD Route Handlers

- [x] 4.1 Implement `src/lib/auth.ts` until `auth.test.ts` passes.
- [x] 4.2 Implement public routes: `src/app/api/wall/route.ts` and `src/app/api/local-uploads/[...path]/route.ts`.
- [x] 4.3 Implement admin auth, YouTube inspect, deletion retry, & album routes: `src/app/api/admin/auth/route.ts` (`GET`/`POST`/`DELETE`), `src/app/api/admin/youtube/inspect/route.ts` (`POST` `videoId`-only SSRF-safe oEmbed returning `{ videoId, artistGuess, titleGuess }`), `src/app/api/admin/deletions/retry/route.ts`, `src/app/api/admin/albums/route.ts` (`GET` incl. drafts and `'deleting'` tombstones, `POST` create draft with `expectedCount`), and `src/app/api/admin/albums/[id]/route.ts` (`PATCH` publish completion rule + optional metadata/soundtrack + `revalidateTag('wall', { expire: 0 })`, `DELETE` `'deleting'` tombstone → recursive storage delete → wildcard purge → DB row delete).
- [x] 4.4 Implement photo routes: `src/app/api/admin/albums/[id]/photos/route.ts` (multipart contract, `'deleting'` album `409` guard, raw-bytes `contentHash` + DB pre-check before storage `PUT`, post-orientation server dimensions, Orientation-only EXIF allowlist, storage rollback on DB error) and `src/app/api/admin/photos/[id]/route.ts` (`PATCH` metadata, `DELETE` `'deleting'` tombstone → storage → wildcard purge → DB delete → `revalidateTag('wall', { expire: 0 })`) until `routes.test.ts` passes.

## 5. Verification & Empirical Audit

- [x] 5.1 Run full regression suite (`npx vitest run`, `npm run lint`, `npx tsc --noEmit`).
- [x] 5.2 Execute manual verification (local upload/draft-publish/delete flow, GPS EXIF/XMP strip check, `next start` local-uploads check, Bunny.net `?width=800` wildcard purge smoke test) and populate `verification.md` with Requirement Adherence Audit Matrix, resolved assumptions, and verbatim execution logs. (Local `next start` flow verified end-to-end; Bunny.net wildcard-purge smoke test requires production credentials and is deferred to deployment — noted in `verification.md`.)


## Patch 01: PR #1 Critical & Important Backend Fixes

- [x] P01.1 Scaffold/run reproducing test cases for JPEG appended MPF/GPS tail, AVIF `415` rejection, `PATCH` on `'deleting'` album/photo (`409`), repeated `local-uploads` 404s, concurrent `photoId` upload race, and `X-Forwarded-For` / global login rate-limit bypass.
- [x] P01.2 Apply minimal targeted fixes in `src/lib/upload/sanitizeImage.ts`, `src/app/api/admin/albums/[id]/route.ts`, `src/app/api/admin/photos/[id]/route.ts`, `src/db/repository.ts`, `src/app/api/local-uploads/[...path]/route.ts`, `src/app/api/admin/albums/[id]/photos/route.ts`, and `src/lib/auth.ts`.
- [x] P01.3 Verify reproduction tests pass and run full regression suite (`npx vitest run` + `npm run typecheck` + `npm run lint`).
- [x] P01.4 Update `verification.md` and mark `PATCH-01` resolved in `patch.md`.


## Patch 02: PR #1 Final Hardening (Metadata Allowlist, X-Real-IP Trust & Password Length, Curator Format Filter)

- [ ] P02.1 Scaffold/run reproducing tests for JPEG `APP11` stripping, PNG `caBX` stripping, WebP `VP8X` flag clearing, `x-real-ip` ignored when `TRUSTED_PROXY_HOPS` is unset, `ADMIN_PASSWORD < 16` chars rejection, and `folderReader` skipping `.heic`/`.avif`/`.gif`.
- [ ] P02.2 Apply minimal targeted fixes in `src/lib/upload/sanitizeImage.ts`, `src/lib/auth.ts`, `src/components/admin/folderReader.ts`, and `src/components/admin/FolderDropzone.tsx`.
- [ ] P02.3 Verify reproduction tests pass and run full regression suite (`npx vitest run && npm run typecheck && npm run lint`).
- [ ] P02.4 Update `verification.md` and mark `PATCH-02` resolved in `patch.md`.
