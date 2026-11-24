# Surgical Patch Handoff: OpenSpec Change 'client-upload-compression' [PATCH-01]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: client-upload-compression
- **Patch ID**: PATCH-01
- **Branch**: `feat/client-upload-compression` (PR #5), checked out at `/home/node/global-sandbox/projects/photo-wall`. Commit on this branch and push to update PR #5. Do NOT open a new PR.
- **Objective**: Make the PNG alpha scan fail closed. Close the discard/upload race that leaks an orphaned Bunny object with a post-write tombstone re-check. Stop the route's `payload_too_large` slug from reaching the curator.
- **Feedback & Diagnostic Trace**:
  ```
  [Important] imageCompressor.ts:35-36, 154-173 — PNG alpha detection reads only the first 64 KiB.
  A valid indexed PNG can place tRNS after a large pre-IDAT ancillary chunk. If the scan hits that
  limit, it returns false, and the compressor may convert a transparent image to JPEG. Treat an
  incomplete scan as "possibly alpha"; add a test with tRNS beyond the current scan limit.

  [Important] spec.md:39,49-51 — The discard contract says the tombstone rejects or purges any upload
  already in flight, but the upload route checks album.status only at the start (photos/route.ts:44-50).
  A request that passed the check can write after the delete prefix purge and race the album row
  deletion, leaving an orphaned object. Add server-side race protection and a test for a late upload.

  [Nit] formatUploadHttpError — the route's JSON 413 returns { error: 'payload_too_large' }, so the
  curator sees the raw slug instead of the size-limit sentence.
  ```
- **Root Cause Analysis**:
  1. **PNG scan.** In `hasAlphaChannel`, every way out of the chunk walk returns `false`: reaching `IDAT`, `next > bytes.length` (the chunk runs past the 64 KiB buffer), `next <= offset` (overflow), and the loop condition failing. "Couldn't finish reading" is treated the same as "proved opaque". Only reaching `IDAT` proves opaque.
  2. **Upload race.** `DELETE` runs `markAlbumDeleting` (t1), then `deletePrefix` (t2), `purgeWildcard`, then `deleteAlbumRows` (t3). A POST that passed the status check before t1, whose `putObject` lands after t2 and whose `insertPhoto` runs before t3, gets its row removed at t3 while its object survives. No sweep can find it, because the tombstone row is gone. Any write landing after t2 necessarily lands after t1, so re-reading the album after `putObject` always sees the tombstone, or a missing row, and closes the window. An insert after t3 already fails the FK, and the existing catch at L138-L155 rolls it back.
  3. **413 slug.** `formatUploadHttpError` returns the first non-empty `message` *or* `error` string before it looks at the status, so a slug beats the `SIZE_LIMIT_MESSAGE` mapping.

  The spec delta (`specs/storage-and-cdn-pipeline/spec.md`) and `architecture.md` (Non-Goals, D2, D5) are **already amended** with three new scenarios and the narrowed server non-goal. Implement against them; don't edit them.

## 2. Strict Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/components/admin/imageCompressor.ts` | `L145-L174` (`hasAlphaChannel` JSDoc + PNG branch) | In the PNG walk, keep `tRNS` → `true` and `IDAT` → `false`. Change **both** the `next <= offset \|\| next > bytes.length` early return and the post-loop `return false` to `return true`. Also change the `bytes.length < 26` path: a header too short to hold the IHDR colour type falls through to the walk and therefore returns `true`. Update the JSDoc line "Malformed or truncated input returns `false`" to say a PNG whose walk can't reach `IDAT` returns `true` (fail closed). Leave the WebP and JPEG branches **untouched**. |
| `src/components/admin/imageCompressor.ts` | `L199-L222` (`formatUploadHttpError`) | When `status === 413`, return the JSON `message` if it's a non-empty string, otherwise `SIZE_LIMIT_MESSAGE`, and ignore `error`. Non-413 behaviour is unchanged. Update the JSDoc to match. |
| `src/app/api/admin/albums/[id]/photos/route.ts` | Insert between `L113` (end of the `putObject` try/catch) and `L115` (`const sortOrderValue`) | Add: `const current = await getAlbum(albumId); if (!current \|\| current.status === 'deleting') { try { await storage.deleteObject(storagePath); } catch { /* best-effort */ } return jsonResponse({ error: 'album_deleting' }, 409); }`, plus a one-line comment that cites the post-`deletePrefix` race. `getAlbum` is already imported. Touch nothing else in the route. |
| `src/components/admin/__tests__/imageCompressor.test.ts` | Append inside `describe('hasAlphaChannel')` (~L309) and `describe('formatUploadHttpError')` (~L543) | Add tests, listed in §5. Reuse `pngHeader` / `pushChunk` (L181). Don't modify existing assertions, with one exception: if an existing test asserts `false` for a *truncated PNG*, that assertion encodes the defect, so flip it to `true` and record the flip in `verification.md` §7. |
| `src/app/api/__tests__/routes.test.ts` | Append one `it(...)` inside `describe('album deletion and tombstone retry')` (~L790) | Add the late-upload race test from §5. Reuse `loginCookie`, `createAlbum`, `uploadOne`, `markAlbumDeleting`, `storage`, `uploadRoot` and `db`. |
| `openspec/changes/client-upload-compression/verification.md` | §2 matrix, §7, §9 | Add matrix rows for the three new scenarios. In §7, note that the server route is now touched (one re-check, per the amended non-goal). Add the verbatim logs as a new §9.7. |
| `openspec/changes/client-upload-compression/tasks.md` | `## Patch 01` | Tick P01.1-P01.4 only when each has actually run and passed. |
| `openspec/changes/client-upload-compression/patch.md` | PATCH-01 `Status` | `PENDING` → `RESOLVED`, plus a one-line resolution note with the commit SHA. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the files and lines in the Target Context Map.
- **FORBIDDEN**:
  - Do NOT refactor surrounding working code: the ladder, `prepareUploadFile`, `FolderDropzone.tsx`, the retry loop, abort wiring, `purgeAlbumTombstone`, or the repository.
  - Do NOT modify `.env`, `.env.*`, credential files, `package.json`, the lockfile, `next.config.ts`, CSP, `drizzle/`, or `src/db/`.
  - Do NOT touch `playgrounds/`. `playgrounds/album_curator_playground.html` is untracked and belongs to another agent; never `git add` it and never `git add -A`.
  - Do NOT call Vercel, Turso or Bunny, and do NOT run anything against the preview. Previews share the production DB and storage.
  - Do NOT implement the deferred item (caching `UploadPreparationError` for manual Retry).
  - Do NOT modify existing passing tests, except for the single truncated-PNG flip allowed in §2.
- **INVARIANTS TO PRESERVE**:
  - The idempotent retry (`200` on the same `photoId` with the same bytes, no `putObject`) still short-circuits **before** the new re-check. It sits at ~L83, ahead of storage, so it's unaffected. Don't move it.
  - The existing tombstone tests still pass: an upload is `409` before any write when the album is already `deleting`.
  - The opaque-JPEG and opaque-PNG compression paths are byte-for-byte unchanged in behaviour. Only PNG headers that never reach `IDAT` change classification.
  - All 335 existing tests still pass.

## 4. Visual & UI Impact (if applicable)
- **Status: Non-visual patch. No styling or layout modifications permitted.** The only user-visible change is the 413 error string, which already exists as `SIZE_LIMIT_MESSAGE`.

## 5. Reproduction & Verification Protocol
Run Vitest directly, not through `safe-test`, which runs out of memory on this suite.

**New tests (write these first; each must FAIL before the fix):**
1. `hasAlphaChannel` → `'treats tRNS past the 64 KiB header buffer as possible alpha'`. Build `pngHeader(3, [{ type: 'iTXt', data: Array(70 * 1024).fill(0x20) }, { type: 'tRNS', data: [0] }])`, truncate it with `.slice(0, 64 * 1024)`, and expect `true`.
2. `hasAlphaChannel` → `'treats a PNG header that ends before IDAT as possible alpha'`. Build `pngHeader(2)`, take the IHDR only (slice to 33 bytes, i.e. signature + IHDR), and expect `true`.
3. `hasAlphaChannel` → `'still reports a fully-walked opaque palette PNG as opaque'`. Build `pngHeader(3)` untruncated and expect `false`. This is the guard against over-correcting.
4. `formatUploadHttpError` → `'maps a slug-only JSON 413 to the size-limit message'`. `formatUploadHttpError(413, '{"error":"payload_too_large"}')` must equal the size-limit sentence, and `formatUploadHttpError(413, '{"message":"Custom"}')` must equal `'Custom'`.
5. `routes.test.ts` → `'compensates an upload whose write lands after the album is tombstoned and purged'`:
   - Create an album, then `vi.spyOn(storage, 'putObject')` with an implementation that calls the original, then `await markAlbumDeleting(album.id)` and `await storage.deletePrefix(`/albums/${album.id}/`)`.
   - Call `uploadOne` and expect `409` with `{ error: 'album_deleting' }`.
   - Expect the album directory under `uploadRoot` to hold no file, and no `photos` row for `album.id`.

**Commands**
1. **Reproduce first:**
   ```bash
   npx vitest run src/components/admin/__tests__/imageCompressor.test.ts -t "possible alpha|slug-only JSON 413"
   npx vitest run src/app/api/__tests__/routes.test.ts -t "compensates an upload"
   ```
   Expect tests 1, 2, 4 and 5 to FAIL. Test 3 already passes; that's intended.
2. **Apply the minimal fix** in the mapped lines.
3. **Verify the fix:** re-run both commands above. All five pass.
4. **Full regression suite:** `npm run typecheck && npm run lint && npx vitest run && npm run build`. Expect zero errors and 340 or more tests passing, i.e. 335 plus the new ones.

## 6. Surgical Patch Checklist
- [ ] P01.1 Write the 5 tests in §5, run the two reproduction commands, and confirm tests 1, 2, 4 and 5 fail for the diagnosed reasons. Paste the output into `verification.md` §9.7.
- [ ] P01.2 Implement the minimal fixes in `imageCompressor.ts` (`hasAlphaChannel` PNG branch L145-L174, `formatUploadHttpError` L199-L222) and `photos/route.ts` (post-`putObject` re-check after L113).
- [ ] P01.3 Re-run the reproduction commands and confirm all five PASS.
- [ ] P01.4 Run `npm run typecheck && npm run lint && npx vitest run && npm run build` and confirm zero regressions. Update the `verification.md` matrix, §7 and §9.7, and mark PATCH-01 `RESOLVED` in `patch.md`.
- [ ] P01.5 Tick `## Patch 01` in `tasks.md` to `- [x]`. Then run `openspec validate client-upload-compression --strict`. Stage **only** the mapped files: `git add src/components/admin/imageCompressor.ts src/components/admin/__tests__/imageCompressor.test.ts 'src/app/api/admin/albums/[id]/photos/route.ts' src/app/api/__tests__/routes.test.ts openspec/changes/client-upload-compression`. Commit as `fix(upload): fail-closed PNG alpha scan, post-write tombstone re-check (PATCH-01)` and run `git push` to update PR #5.

**Out of scope, stays PENDING for the maintainer:** the live Vercel upload over 4.5 MB on the preview. It needs an authenticated admin session and writes to production Turso and Bunny.
