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
