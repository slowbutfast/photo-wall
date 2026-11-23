### [PATCH-01] PR #1 Critical & Important Backend Fixes (Sanitizer Leaks, Tombstone PATCH Guard, 404 Reuse, Upload Race, Rate Limiter)
- **Date**: 2026-11-23 19:55:00 UTC
- **Feedback Source**: Code Review (PR #1 — Request Changes)
- **Feedback Summary**:
  - **Overview & Context**: PR #1 passed unit/integration tests and smoke checks, but code review uncovered two privacy leaks in `sanitizeImage.ts` (JPEG tail / MPF / motion-photo copy after `SOS` and non-functional AVIF `Exif`/`xml ` box stripping) plus four Important route/auth state bugs.
  - **Itemized Critique / Defect Breakdown**:
    1. **[Critical] JPEG tail leak** (`src/lib/upload/sanitizeImage.ts:L262-L266, L320`): Copies `bytes.subarray(scanStart)` verbatim to EOF, preserving MPF secondary images (`APP2` `MPF\0`), gain maps, and appended Pixel/Samsung motion-photo MP4s with GPS.
    2. **[Critical] AVIF sanitizer strips nothing** (`src/lib/upload/sanitizeImage.ts:L476, L493-L522`): `AVIF_DROPPED_BOXES` (`Exif`, `xml `) never matches HEIF/AVIF item-graph metadata (`iinf`/`infe` + `iloc` + `mdat`), and shrinking `meta` would corrupt `iloc` offsets; `size == 0` / `size == 1` boxes also truncate output.
    3. **[Important] `PATCH` can resurrect `'deleting'` albums/photos** (`src/app/api/admin/albums/[id]/route.ts:L113-L135`, `src/app/api/admin/photos/[id]/route.ts:L23-L67`, `src/db/repository.ts`): Missing `409` status guard and `ne(status, 'deleting')` in `WHERE`.
    4. **[Important] Shared 404 `Response` instance** (`src/app/api/local-uploads/[...path]/route.ts:L6`): Single module-level `NOT_FOUND` `Response` fails with "body is unusable" (`500`) on the second 404 request.
    5. **[Important] Concurrent upload race deletes live object** (`src/app/api/admin/albums/[id]/photos/route.ts:L75-L134`): Overlapping retries of the same `photoId` both pass `getPhoto`, both write storage, the loser fails PK insert, and its `catch` deletes the winner's live storage object.
    6. **[Important] Spoofable `X-Forwarded-For` rate limiter** (`src/lib/auth.ts:L42-L49`): Always trusts client-controlled first `X-Forwarded-For` entry and lacks a global failure ceiling.
- **Reported Issue / Raw Trace**: PR #1 Review Comments (Critical + Important items on `feat/photo-wall-mvp`).
- **Root Cause**: Incomplete binary container parsing (`SOS`-to-EOF copy and naive BMFF box-name matching), missing DB/route concurrency & tombstone guards, and single-instance `Response` / header-first IP extraction.
- **Target Files**: `src/lib/upload/sanitizeImage.ts`, `src/lib/upload/__tests__/sanitizeImage.test.ts`, `src/app/api/admin/albums/[id]/route.ts`, `src/app/api/admin/photos/[id]/route.ts`, `src/db/repository.ts`, `src/app/api/local-uploads/[...path]/route.ts`, `src/app/api/admin/albums/[id]/photos/route.ts`, `src/lib/auth.ts`, `src/lib/__tests__/auth.test.ts`, `src/app/api/__tests__/routes.test.ts`
- **Resolution Strategy**:
  1. JPEG: Scan entropy-coded scan(s) (handling `FF 00` byte stuffing, `FF D0`–`FF D7` restart markers, and multi-scan progressive JPEGs) to the real `FF D9` EOI, truncate there, and drop `APP2` segments starting with `MPF\0`.
  2. AVIF: Return `415 Unsupported Media Type` for AVIF (or reject any AVIF whose `iinf` contains an `Exif` or `mime` item) until a full item-graph rewriter exists.
  3. PATCH tombstones: Return `409` when `status === 'deleting'` and enforce `ne(status, 'deleting')` in `updateAlbum` / `updatePhoto` `WHERE` clauses.
  4. Local uploads 404: Replace shared `NOT_FOUND` constant with `const notFound = () => new Response('Not found', { status: 404 })`.
  5. Upload race: In `insertPhoto` `catch`, re-query `getPhoto(photoId)`; if a row exists with matching `contentHash`, return `200` without deleting storage.
  6. Rate limiter: Gate `X-Forwarded-For` behind `TRUSTED_PROXY_HOPS` (taking N hops from the right), fall back to socket/unforwarded key otherwise, and enforce a global failure ceiling.
- **Status**: RESOLVED (2026-11-23 15:08 UTC) — 64/64 targeted tests (sanitizeImage 12, auth 20, routes 32), full suite 178/178 across 13 files, `npm run typecheck` / `npx tsc --noEmit` exit 0, `npm run lint` exit 0, `openspec validate --all --strict` 7/7. See `verification.md` → **Patch 01 Verification**.


### [PATCH-02] PR #1 Final Hardening (Strict Metadata Allowlist, Trusted-Proxy X-Real-IP, Min Password Length, Curator Upload Filter Alignment)
- **Date**: 2026-11-23 20:30:00 UTC
- **Feedback Source**: Code Review (PR #1 — Final Approval + Hardening Request)
- **Feedback Summary**:
  - **Overview & Context**: PR #1 (`25a806d` + `b6ad1cb`) passed all 8 previous findings and 182/182 tests. Before merging, two Important backend security hardening items and one Curator image-filter alignment item should be patched (leaving R3F frontend nits untouched since `dom-wall-engine` replaces R3F right after merge).
  - **Itemized Critique / Defect Breakdown**:
    1. **[Important] Metadata filtering uses denylist instead of allowlist (`APP11`/C2PA leak & WebP VP8X flags)** (`src/lib/upload/sanitizeImage.ts:L304-L328, L383-L408, L432-L490`): JPEG keeps `APP3`–`APP12` (including `APP11` JUMBF/C2PA Content Credentials which can hold `stds.exif` GPS), PNG keeps unknown ancillary chunks including `caBX`, and WebP keeps unknown chunks and leaves `VP8X` EXIF (`0x08`) / XMP (`0x04`) bits set.
    2. **[Important] `X-Real-IP` trusted without proxy & no `ADMIN_PASSWORD` length check** (`src/lib/auth.ts:L35-L39, L54-L66`): `getClientKey` reads client-spoofable `x-real-ip` even when `TRUSTED_PROXY_HOPS` is unset; `verifyAdminPassword` does not enforce `>= 16` character password strength.
    3. **[Important] Curator accepts formats API rejects with 415** (`src/components/admin/folderReader.ts:L45-L57`, `src/components/admin/FolderDropzone.tsx:L437-L438`): Dropzone/reader accept GIF, AVIF, HEIC/HEIF, BMP, and TIFF, which now fail at upload with `415`.
- **Reported Issue / Raw Trace**: PR #1 Final Review Comments on head `b6ad1cb`.
- **Root Cause**: Denylist metadata filtering, unconditional `x-real-ip` header fallback, and client-side format list still matching pre-PATCH-01 formats.
- **Target Files**: `src/lib/upload/sanitizeImage.ts`, `src/lib/upload/__tests__/sanitizeImage.test.ts`, `src/lib/auth.ts`, `src/lib/__tests__/auth.test.ts`, `src/components/admin/folderReader.ts`, `src/components/admin/__tests__/folderReader.test.ts`, `src/components/admin/FolderDropzone.tsx`
- **Resolution Strategy**:
  1. Switch JPEG, PNG, and WebP sanitizers to strict allowlists (dropping `APP11`/`caBX` and clearing WebP `VP8X` EXIF/XMP flags `0x0c`), with a test planting an `APP11` segment.
  2. Read `x-real-ip` only when `TRUSTED_PROXY_HOPS` is configured; enforce `ADMIN_PASSWORD.length >= 16` in `verifyAdminPassword` (with test).
  3. Narrow `folderReader.ts` and `FolderDropzone.tsx` image filters to `jpg`/`jpeg`/`png`/`webp` so unsupported formats are skipped cleanly before upload.
- **Status**: PENDING
