# Patch Log — client-upload-compression

### [PATCH-01] Fail-closed PNG alpha scan, post-write tombstone re-check, 413 slug message
- **Date**: 2026-11-24 19:45:00 UTC
- **Feedback Source**: Code Review (two independent PR #5 reviews)
- **Feedback Summary**:
  PR #5 matches the planned contract almost everywhere. Both reviews independently found the same compressor defect, and one found a gap between the spec's discard guarantee and what the server enforces. Itemised:
  1. **PNG alpha scan fails open (Edge Case, Important).** `hasAlphaChannel` sees only the first `HEADER_BYTE_COUNT = 64 KiB`. A valid palette or grayscale PNG can put `tRNS` after a large pre-`IDAT` ancillary chunk (`iCCP` profile, `iTXt` XMP from Lightroom/Photoshop, `eXIf`). When the chunk walk runs past the buffer, it returns `false` ("opaque"), and the image is flattened to JPEG. That's the silent transparency loss D2's header check exists to prevent. Colour types 4 and 6 are caught at byte 25 regardless, so the exposure is limited to `tRNS` images.
  2. **The discard contract overstates the server's guarantee (Spec / Invariant Mismatch, Important).** The spec says the delete tombstone "SHALL reject or purge any late-arriving write". The upload route checks `album.status` once, before any work (`route.ts` L45-L51). This PR also makes **Discard** clickable while uploads are in flight, so the race is now reachable from the UI. Tracing `DELETE` (`markAlbumDeleting` at t1, then `purgeAlbumTombstone`: `deletePrefix` at t2, `purgeWildcard`, `deleteAlbumRows` at t3) against a request that passed the status check before t1:
     - `putObject` finishes before t2: `deletePrefix` removes it. Safe.
     - `insertPhoto` runs after t3: the FK fails, and the existing catch deletes the object. Safe.
     - **`putObject` finishes after t2 and `insertPhoto` runs before t3: the row is inserted and then removed by `deleteAlbumRows`, but the object survives.** That's a publicly fetchable orphan under an unguessable UUID path that no sweep will ever find. This is the only leaking interleaving.
  3. **The 413 message shows a raw slug (UX, Minor).** The route's own JSON 413 (`{ error: 'payload_too_large' }`, reachable on self-hosted Node above 25 MB) makes `formatUploadHttpError` return the literal string `payload_too_large`, because the JSON `error` field wins over the 413 mapping.
  4. **Live Vercel upload over 4.5 MB is still unverified (Verification gap, not a code defect).** The preview sits behind Vercel SSO, so neither review could run it. It stays `PENDING (maintainer — empirical)`. The maintainer runs it from an authenticated browser.
- **Reported Issue / Raw Trace**:
  ```
  Review A (Important): imageCompressor.ts:35-36, 154-173 — PNG alpha detection reads only the first 64 KiB.
  A valid indexed PNG can place tRNS after a large pre-IDAT ancillary chunk. If the scan hits that limit,
  it returns false, and the compressor may convert a transparent image to JPEG. Treat an incomplete scan
  as "possibly alpha" and use WebP or fail safely; add a test with tRNS beyond the current scan limit.

  Review A (Important): spec.md:39,49-51 — The discard contract says the tombstone rejects or purges any
  upload already in flight, but the upload route checks album.status only at the start
  (photos/route.ts:44-50). Aborting XHR cannot guarantee the server stopped processing. A request that
  passed the check can write after the delete prefix purge and race the album row deletion, potentially
  leaving an orphaned object. Add server-side race protection and a test for a late upload, or narrow
  the contract.

  Review B (Important): hasAlphaChannel PNG chunk walk — a truncated header falls back to "opaque",
  the unsafe direction. Return true when the walk runs out of buffer before IDAT.
  Review B (Nit): formatUploadHttpError — the route's JSON 413 returns { error: 'payload_too_large' },
  so the curator sees the raw slug.
  Review B (Nit, deferred): manual Retry after an UploadPreparationError re-runs the full decode + ladder.
  ```
- **Root Cause**:
  1. The PNG chunk walk treats "couldn't finish reading" the same as "read everything and found no `tRNS`". Both paths `return false`. An unknown result should take the safe branch.
  2. The upload route only validates the tombstone *before* its storage write. Nothing re-checks after the write, so a write that lands between `deletePrefix` and `deleteAlbumRows` is never compensated. The client-side abort can't help, because it only stops the browser waiting.
  3. `formatUploadHttpError` checks the JSON `error` field before the status mapping, so for a 413, a machine slug beats the human sentence.
- **Target Files**: `src/components/admin/imageCompressor.ts`, `src/components/admin/__tests__/imageCompressor.test.ts`, `src/app/api/admin/albums/[id]/photos/route.ts`, `src/app/api/__tests__/routes.test.ts`, `openspec/changes/client-upload-compression/{verification.md,tasks.md,patch.md}`. The spec delta and `architecture.md` were already amended at planning time alongside this entry.
- **Resolution Strategy**:
  1. In `hasAlphaChannel`'s PNG branch, return `false` **only** when the walk reaches `IDAT` without seeing `tRNS`. Every other way out of the loop returns `true`: running out of buffer, a chunk length pointing past the buffer, or arithmetic overflow (`next <= offset`). That covers both the 64 KiB truncation and malformed headers. Leave the WebP branch alone: its alpha flags sit at fixed offsets ≤ 25 bytes. Accepted cost: an opaque palette PNG with more than 64 KiB of metadata now takes the WebP ladder, and fails cleanly on Safari instead of becoming a JPEG. That's rare, and it's the safe direction.
  2. In the upload route, after `putObject` succeeds, re-read the album. If it's missing or `status === 'deleting'`, best-effort `deleteObject(storagePath)` and return `409 { error: 'album_deleting' }` without inserting. Proof that this closes the window: if the write finished after t2, then t1 had already passed, so the re-check sees the tombstone (or a missing row) and compensates. If the write finished before t2, `deletePrefix` removes it. The FK-failure path already compensates for inserts after t3. The cost is one extra `getAlbum` read per upload.
  3. In `formatUploadHttpError`, for `status === 413`, return the JSON `message` when present, otherwise `SIZE_LIMIT_MESSAGE`. Ignore the `error` slug. Non-413 behaviour doesn't change.
  4. **Deferred (not in this patch):** caching `UploadPreparationError` to skip re-preparing on manual Retry. Decode failures on iOS can be transient memory pressure that succeeds on a retry, so caching the failure trades one cost for another. Recorded only.
- **Status**: RESOLVED
- **Resolution**: Shipped in commit `06859833950005b3c8734887807e105d67b61007` — PNG alpha walk now fails closed, the upload route re-checks the album after `putObject` and compensates, and slug-only 413s map to the size-limit sentence; 340/340 tests pass.
