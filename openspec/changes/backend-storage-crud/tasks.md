## 1. Test Scaffolding (TDD)

- [ ] 1.1 Bootstrap Next.js 16 (`cacheComponents: true` in `next.config.ts`) + TypeScript + Drizzle ORM + `jose` + `vitest` workspace (`package.json`, `next.config.ts`, `tsconfig.json`, `.env.example`, `drizzle.config.ts`).
- [ ] 1.2 Scaffold failing Vitest unit tests in `src/lib/layout/__tests__/islandLayout.test.ts` (`100px = 1 world unit` bounds, placard offset, 3-albums-per-row derived non-overlapping placement for published albums) and `src/lib/cdn/__tests__/lodUrl.test.ts` / `src/lib/storage/__tests__/bunny.test.ts` (`albumId` paths, longest-edge Optimizer URLs, wildcard purge paths).
- [ ] 1.3 Scaffold failing Vitest unit tests in `src/lib/upload/__tests__/sanitizeImage.test.ts` (`413` oversize, `415` magic-byte sniff, Orientation-6 JPEG test preserving `Orientation = 6` + swapping dimensions + stripping GPS/camera EXIF & XMP while keeping ICC, PNG/WebP/AVIF chunk strip) and `src/lib/__tests__/auth.test.ts` (`429` rate limit, SHA-256 `timingSafeEqual`, `403` `Origin` CSRF).
- [ ] 1.4 Scaffold failing Vitest route-handler tests in `src/app/api/__tests__/routes.test.ts` (temp `file:` LibSQL + `LocalStorageAdapter` + mocked Bunny client covering multipart contract, DB-first idempotent retry without storage touch, `409` on `'deleting'` album upload, SSRF rejection in `youtube/inspect`, draft/deleting exclusion from `/api/wall`, DB-fail rollback, `'deleting'` tombstone retry, and `401`/`403`).
- [ ] 1.5 Run `npx vitest run` to confirm all newly scaffolded tests fail before implementation.

## 2. Database Schema, Shared Geometry & LOD Modules

- [ ] 2.1 Implement `src/db/schema.ts` (`albums` with `status: 'draft' | 'published' | 'deleting'`, `expectedCount`, optional `cameraName`/`dateLabel`/`locationLabel`, optional `youtubeVideoId`/`soundtrackArtist`/`soundtrackTitle`/`soundtrackDurationSec`, `$defaultFn` timestamps, no `posX`/`posY`; `photos` with `status: 'active' | 'deleting'`, raw-bytes `contentHash`, `thumbHash`, cascade FK) and `src/db/index.ts` enforcing `PRAGMA foreign_keys = ON`.
- [ ] 2.2 Implement `src/lib/layout/types.ts`, `src/lib/layout/islandLayout.ts` (`WORLD_SCALE = 0.01`, `ALBUMS_PER_ROW = 3`, `PLACARD_WIDTH = 2.14`, `PLACARD_HEIGHT = 2.00`, `SOUNDTRACK_HEIGHT = 2.00`, `computeAlbumBounds`, `computeAlbumGrid`, `computeWallGridPositions(publishedAlbums)`), and `src/lib/validation/youtube.ts` (`extractYoutubeVideoId`, `parseYoutubeTitle`) until `islandLayout.test.ts` and `youtube.test.ts` pass.
- [ ] 2.3 Implement `src/lib/cdn/lodUrl.ts` until `lodUrl.test.ts` passes.

## 3. Storage Adapters, Image Sanitizer & Cached Manifest

- [ ] 3.1 Implement `src/lib/storage/types.ts`, `src/lib/storage/bunny.ts` (`PUT`, recursive `DELETE` on `/albums/{albumId}/`, wildcard Pull Zone Purge `/albums/{albumId}/*` & `/albums/{albumId}/{photoId}.*`), `src/lib/storage/local.ts`, `src/lib/storage/deletions.ts` (`sweepPendingDeletions()`), and `src/lib/storage/index.ts` until `bunny.test.ts` passes.
- [ ] 3.2 Implement `src/lib/upload/sanitizeImage.ts` (`25 MB` cap, magic-byte sniffing, header dimension extraction with orientation 5–8 swap, Orientation-only EXIF allowlist rebuild + lossless GPS/XMP strip + ICC preserve) until `sanitizeImage.test.ts` passes.
- [ ] 3.3 Implement `src/lib/manifest.ts` (`getWallSummary()` using Next.js 16 `'use cache'` + `cacheTag('wall')` returning `published` albums with derived 3-column world positions + active compact photos + `cdnBase`).

## 4. Hardened Admin Auth & CRUD Route Handlers

- [ ] 4.1 Implement `src/lib/auth.ts` until `auth.test.ts` passes.
- [ ] 4.2 Implement public routes: `src/app/api/wall/route.ts` and `src/app/api/local-uploads/[...path]/route.ts`.
- [ ] 4.3 Implement admin auth, YouTube inspect, deletion retry, & album routes: `src/app/api/admin/auth/route.ts` (`GET`/`POST`/`DELETE`), `src/app/api/admin/youtube/inspect/route.ts` (`POST` `videoId`-only SSRF-safe oEmbed returning `{ videoId, artistGuess, titleGuess }`), `src/app/api/admin/deletions/retry/route.ts`, `src/app/api/admin/albums/route.ts` (`GET` incl. drafts and `'deleting'` tombstones, `POST` create draft with `expectedCount`), and `src/app/api/admin/albums/[id]/route.ts` (`PATCH` publish completion rule + optional metadata/soundtrack + `revalidateTag('wall', { expire: 0 })`, `DELETE` `'deleting'` tombstone → recursive storage delete → wildcard purge → DB row delete).
- [ ] 4.4 Implement photo routes: `src/app/api/admin/albums/[id]/photos/route.ts` (multipart contract, `'deleting'` album `409` guard, raw-bytes `contentHash` + DB pre-check before storage `PUT`, post-orientation server dimensions, Orientation-only EXIF allowlist, storage rollback on DB error) and `src/app/api/admin/photos/[id]/route.ts` (`PATCH` metadata, `DELETE` `'deleting'` tombstone → storage → wildcard purge → DB delete → `revalidateTag('wall', { expire: 0 })`) until `routes.test.ts` passes.

## 5. Verification & Empirical Audit

- [ ] 5.1 Run full regression suite (`npx vitest run`, `npm run lint`, `npx tsc --noEmit`).
- [ ] 5.2 Execute manual verification (local upload/draft-publish/delete flow, GPS EXIF/XMP strip check, `next start` local-uploads check, Bunny.net `?width=800` wildcard purge smoke test) and populate `verification.md` with Requirement Adherence Audit Matrix, resolved assumptions, and verbatim execution logs.
