# Surgical Patch Handoff: OpenSpec Change 'backend-storage-crud' [PATCH-01]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: `backend-storage-crud` (`openspec/changes/archive/2026-11-23-backend-storage-crud`)
- **Patch ID**: `PATCH-01`
- **Objective**: Close the two privacy leaks in `sanitizeImage.ts` (JPEG post-SOS tail & AVIF metadata) and fix the four Important route/auth state bugs flagged in PR #1 review.
- **Feedback & Diagnostic Trace**:
  ```
  Critical:
  1. [src/lib/upload/sanitizeImage.ts:L262-L266, L320] JPEG sanitizing copies bytes.subarray(scanStart) to EOF, preserving MPF secondary images, gain maps, and appended motion-photo MP4s with GPS. Fix: scan entropy data to real EOI (FF D9) skipping FF 00 stuffing & RST markers and handling multi-scan progressive JPEGs, truncate there, drop APP2 starting with MPF\0, and add appended-JPEG GPS test.
  2. [src/lib/upload/sanitizeImage.ts:L476, L493-L522] AVIF_DROPPED_BOXES never matches HEIF/AVIF iinf/iloc/mdat metadata, and size==0/1 boxes break readBoxHeader. Fix: return 415 for AVIF until an item-graph rewriter exists (or reject any AVIF whose iinf contains Exif/mime).

  Important:
  3. [src/app/api/admin/albums/[id]/route.ts:L113-L135] PATCH can publish/update a tombstoned ('deleting') album. Fix: return 409 when status === 'deleting' and add ne(albums.status, 'deleting') to updateAlbum WHERE clause (apply same guard in photos/[id] PATCH).
  4. [src/app/api/local-uploads/[...path]/route.ts:L6] Shared NOT_FOUND Response fails on second 404 with "body is unusable". Fix: const notFound = () => new Response('Not found', { status: 404 }).
  5. [src/app/api/admin/albums/[id]/photos/route.ts:L75-L134] Concurrent upload of same photoId causes loser's catch block to delete winner's storage object. Fix: re-check getPhoto(photoId) inside insert catch; if row exists with same contentHash return 200 without deleting storage.
  6. [src/lib/auth.ts:L42-L49] getClientKey trusts client-controlled first X-Forwarded-For value. Fix: gate behind TRUSTED_PROXY_HOPS (take entry N hops from right), fallback without flag, and add global failure ceiling.
  ```

## 2. Strict Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/lib/upload/sanitizeImage.ts` | `L262-L320`, `L469-L530` | JPEG: scan entropy data across single/progressive scans to `FF D9` EOI (skipping `FF 00` & `FF D0`–`FF D7`), truncate at EOI, drop `APP2` `MPF\0`. AVIF: reject AVIF with `415` (`ImageValidationError`). |
| `src/app/api/admin/albums/[id]/route.ts` | `L113-L137` | Return `409` if `album.status === 'deleting'`. |
| `src/app/api/admin/photos/[id]/route.ts` | `L28-L64` | Return `409` if `photo.status === 'deleting'`. |
| `src/db/repository.ts` | `updateAlbum`, `updatePhoto` | Add `ne(albums.status, 'deleting')` / `ne(photos.status, 'deleting')` to `WHERE` clause. |
| `src/app/api/local-uploads/[...path]/route.ts` | `L6`, `L18`, `L32` | Replace shared `NOT_FOUND` with `const notFound = () => new Response('Not found', { status: 404 })`. |
| `src/app/api/admin/albums/[id]/photos/route.ts` | `L126-L134` | In `insertPhoto` catch, re-read `getPhoto(photoId)`; if found with matching `contentHash`, return `200 OK` without deleting storage. |
| `src/lib/auth.ts` | `L42-L68` | Gate `X-Forwarded-For` behind `TRUSTED_PROXY_HOPS` (N hops from right), fallback cleanly, and enforce a global failed-login ceiling. |
| `src/lib/upload/__tests__/sanitizeImage.test.ts`, `src/lib/__tests__/auth.test.ts`, `src/app/api/__tests__/routes.test.ts` | Test suites | Add reproducing tests for appended-JPEG GPS tail, AVIF `415`, `PATCH` `'deleting'` `409`, repeated 404s, concurrent `photoId` upload race, and `TRUSTED_PROXY_HOPS` / global rate limit. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the lines and files specified in the Target Context Map.
- **FORBIDDEN**:
  - Do NOT refactor surrounding working code.
  - Do NOT modify `.env` or credential files.
  - Do NOT modify existing passing tests unless a test explicitly asserted the old AVIF acceptance behavior (update that AVIF test to assert `415`).
- **INVARIANTS TO PRESERVE**: All existing passing unit/integration tests (Orientation-6 JPEG, ICC preservation, DB-first idempotency, tombstone sweep) MUST continue to pass.

## 4. Visual & UI Impact
Status: Non-visual patch. No styling or layout modifications permitted.

## 5. Reproduction & Verification Protocol
1. **Reproduce First**: Run `npx vitest run src/lib/upload/__tests__/sanitizeImage.test.ts src/lib/__tests__/auth.test.ts src/app/api/__tests__/routes.test.ts`. Confirm newly added reproducing tests fail.
2. **Apply Minimal Fix**: Make targeted edits in mapped files.
3. **Verify Fix**: Re-run `npx vitest run src/lib/upload/__tests__/sanitizeImage.test.ts src/lib/__tests__/auth.test.ts src/app/api/__tests__/routes.test.ts`. Confirm PASS.
4. **Full Regression Suite**: Run `npx vitest run && npm run typecheck && npm run lint`. Confirm 100% clean passes.

## 6. Surgical Patch Checklist
- [ ] P01.1 Add and run reproducing tests for all 6 backend findings and confirm initial failure.
- [ ] P01.2 Implement minimal fixes in `sanitizeImage.ts`, `albums/[id]/route.ts`, `photos/[id]/route.ts`, `repository.ts`, `local-uploads/[...path]/route.ts`, `albums/[id]/photos/route.ts`, and `auth.ts`.
- [ ] P01.3 Re-run targeted tests and confirm PASS.
- [ ] P01.4 Run full regression suite (`npx vitest run && npm run typecheck && npm run lint`) and confirm zero regressions.
- [ ] P01.5 Update `openspec/changes/archive/2026-11-23-backend-storage-crud/tasks.md` checkboxes to `- [x]`, update `verification.md`, and mark `PATCH-01` `RESOLVED` in `patch.md`.
