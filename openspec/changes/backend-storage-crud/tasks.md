## 1. Test Scaffolding (TDD)

- [ ] 1.1 Bootstrap Next.js 16 + TypeScript + Drizzle ORM + `jose` + `vitest` workspace (`package.json`, `next.config.ts`, `tsconfig.json`, `.env.example`, `drizzle.config.ts`).
- [ ] 1.2 Scaffold failing Vitest unit tests in `src/lib/layout/__tests__/islandLayout.test.ts` (`100px = 1 world unit` bounds, placard offset, 3-albums-per-row non-overlapping placement) and `src/lib/cdn/__tests__/lodUrl.test.ts` / `src/lib/storage/__tests__/bunny.test.ts` (`albumId` paths, longest-edge Optimizer URLs, wildcard purge paths).
- [ ] 1.3 Scaffold failing Vitest unit tests in `src/lib/upload/__tests__/sanitizeImage.test.ts` (`413` oversize, `415` magic-byte sniff, JPEG GPS EXIF + XMP stripping preserving ICC, PNG/WebP/AVIF chunk strip) and `src/lib/__tests__/auth.test.ts` (`429` rate limit, SHA-256 `timingSafeEqual`, `403` `Origin` CSRF).
- [ ] 1.4 Scaffold failing Vitest route-handler tests in `src/app/api/__tests__/routes.test.ts` (temp `file:` LibSQL + `LocalStorageAdapter` + mocked Bunny client covering multipart contract, EXIF allowlist, draft exclusion, DB-fail rollback, idempotent retry, `'deleting'` tombstone, and `401`/`403`/`404`).
- [ ] 1.5 Run `npx vitest run` to confirm all newly scaffolded tests fail before implementation.

## 2. Database Schema, Shared Geometry & LOD Modules

- [ ] 2.1 Implement `src/db/schema.ts` (`albums` with `status: 'draft' | 'published' | 'deleting'`, `expectedCount`, `$defaultFn` timestamps; `photos` with `contentHash`, `thumbHash`, `exifJson`, cascade FK) and `src/db/index.ts` enforcing `PRAGMA foreign_keys = ON`.
- [ ] 2.2 Implement `src/lib/layout/types.ts` and `src/lib/layout/islandLayout.ts` (`WORLD_SCALE = 0.01`, `ALBUMS_PER_ROW = 3`, `computeAlbumBounds`, `computeAlbumGrid`, `computeWallGridPositions`) until `islandLayout.test.ts` passes.
- [ ] 2.3 Implement `src/lib/cdn/lodUrl.ts` until `lodUrl.test.ts` passes.

## 3. Storage Adapters, Image Sanitizer & Cached Manifest

- [ ] 3.1 Implement `src/lib/storage/types.ts`, `src/lib/storage/bunny.ts` (`PUT`, recursive `DELETE` on `/albums/{albumId}/`, wildcard Pull Zone Purge `/albums/{albumId}/*` & `/albums/{albumId}/{photoId}.*`), `src/lib/storage/local.ts`, and `src/lib/storage/index.ts` until `bunny.test.ts` passes.
- [ ] 3.2 Implement `src/lib/upload/sanitizeImage.ts` (`25 MB` cap, magic-byte sniffing, header dimension extraction, lossless JPEG GPS/XMP strip + chunk strip) until `sanitizeImage.test.ts` passes.
- [ ] 3.3 Implement `src/lib/manifest.ts` (`getWallSummary()` using Next.js 16 `'use cache'` + `cacheTag('wall')` returning `published` albums + compact photos + `cdnBase`, and `getAlbumPhotos(albumId)` enforcing `status = 'published'`).

## 4. Hardened Admin Auth & CRUD Route Handlers

- [ ] 4.1 Implement `src/lib/auth.ts` until `auth.test.ts` passes.
- [ ] 4.2 Implement public routes: `src/app/api/wall/route.ts`, `src/app/api/albums/[id]/photos/route.ts`, and `src/app/api/local-uploads/[...path]/route.ts`.
- [ ] 4.3 Implement admin auth & album routes: `src/app/api/admin/auth/route.ts` (`GET`/`POST`/`DELETE`), `src/app/api/admin/albums/route.ts` (`GET` incl. drafts, `POST` create draft with `expectedCount`), and `src/app/api/admin/albums/[id]/route.ts` (`PATCH` publish completion rule + overlap re-pack + `updateTag('wall')`, `DELETE` `'deleting'` tombstone → recursive storage delete → wildcard purge → DB row delete).
- [ ] 4.4 Implement photo routes: `src/app/api/admin/albums/[id]/photos/route.ts` (multipart contract, server dimensions, EXIF allowlist, UUIDv7 + `contentHash` idempotency, storage rollback on DB error) and `src/app/api/admin/photos/[id]/route.ts` (`PATCH` metadata, `DELETE` tombstone → storage → wildcard purge → DB delete) until `routes.test.ts` passes.

## 5. Verification & Empirical Audit

- [ ] 5.1 Run full regression suite (`npx vitest run`, `npm run lint`, `npx tsc --noEmit`).
- [ ] 5.2 Execute manual verification (local upload/draft-publish/delete flow, GPS EXIF/XMP strip check, `next start` local-uploads check, Bunny.net `?width=800` wildcard purge smoke test) and populate `verification.md` with Requirement Adherence Audit Matrix, resolved assumptions, and verbatim execution logs.
