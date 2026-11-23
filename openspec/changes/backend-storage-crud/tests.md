# Tests: `backend-storage-crud`

## Automated Tests

1. **Island Layout & Shared LOD URL Unit Tests (`vitest`)**:
   - Command: `npx vitest run src/lib/layout/__tests__/islandLayout.test.ts src/lib/cdn/__tests__/lodUrl.test.ts src/lib/storage/__tests__/bunny.test.ts`
   - Verifies `100px = 1 world unit` geometry, placard-inclusive bounds, bounded spiral non-overlapping placement, `/albums/{albumId}/{photoId}.{ext}` paths, wildcard purge URLs, and portrait/landscape longest-edge Optimizer URLs.
2. **Image Sanitization & Auth Unit Tests (`vitest`)**:
   - Command: `npx vitest run src/lib/upload/__tests__/sanitizeImage.test.ts src/lib/__tests__/auth.test.ts`
   - Verifies `413` oversize rejection, `415` magic-byte rejection of `.mp4`/spoofed files, lossless JPEG `APP1` GPS IFD + XMP GPS stripping (while keeping `APP2` ICC profile), PNG/WebP/AVIF EXIF/XMP chunk stripping, SHA-256 `timingSafeEqual`, rate limit (`429`), and `Origin` CSRF (`403`).
3. **Route Handler Integration Tests (`vitest` + temp `file:` LibSQL + `LocalStorageAdapter` + mocked Bunny)**:
   - Command: `npx vitest run src/app/api/__tests__/routes.test.ts`
   - Verifies:
     - `401` unauthenticated & `403` bad `Origin` on admin routes; `GET /api/admin/auth` status.
     - Multipart upload contract: server-derived `width`/`height`, EXIF allowlist dropping `GPSLatitude`/`GPSLongitude` from `exifJson`, idempotent retry (`200`), and `409` on hash mismatch.
     - `draft` exclusion from `GET /api/wall`, `404` on `GET /api/albums/[id]/photos` for drafts, publish completion rule (`expectedCount` vs `allowPartial`), and `updateTag('wall')` call.
     - Storage rollback when DB upsert fails, FK cascade + explicit child delete, and `'deleting'` tombstone + wildcard purge on delete.
4. **Full Typecheck & Lint**:
   - Command: `npm run lint && npx tsc --noEmit`

## Manual Verification

1. **Local Storage & Draft-to-Published Flow (`STORAGE_DRIVER=local`)**:
   - Upload a folder, inspect `GET /api/wall` and `GET /api/albums/[id]/photos`, verify `/api/local-uploads/[...path]` works in both `next dev` and `next start`.
   - Inspect saved JPEG on disk to confirm GPS EXIF & XMP tags were stripped while Display P3 ICC profile and pixel dimensions remain intact.
2. **Bunny.net Production Smoke Test**:
   - Switch to `STORAGE_DRIVER=bunny`, upload a test album, verify `Access-Control-Allow-Origin: *` and WebP/AVIF delivery on `?width=800`, verify raw URL without Optimizer params is blocked by Edge Rule, and confirm `?width=800` returns `404` after wildcard Pull Zone Purge on delete.
