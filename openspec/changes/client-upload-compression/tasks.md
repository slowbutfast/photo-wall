## 1. Test Scaffolding (TDD)

- [x] 1.1 Scaffold failing `src/components/admin/__tests__/imageCompressor.test.ts` covering: `CLIENT_MAX_UPLOAD_BYTES = 4 * 1024 * 1024` byte-identical passthrough (JPEG, PNG, WebP) with ThumbHash/dominantColor; small-file decode failure still passing through byte-identically with `null` ThumbHash/dominantColor; exact binary header alpha detection (`hasAlphaChannel` for PNG IHDR 4/6, PNG `tRNS`, opaque PNG, WebP `VP8X` alpha, WebP `VP8L` alpha, opaque WebP, JPEG); opaque oversized ladder `(4096, 0.90)` → `(4096, 0.85)` → `(4096, 0.80)` → `(3072, 0.85)` → `(3072, 0.80)` with `.jpg` normalization; alpha-channel WebP ladder (`.webp`) and explicit failure when over cap or WebP unsupported (Safari PNG fallback); Display-P3 context fallback to sRGB; `bitmap.close()` and canvas zeroing on success, failure, and `AbortSignal` cancellation between steps; and platform-neutral `HTTP 413` formatting.
- [x] 1.2 In `imageCompressor.test.ts`, add failing unit tests for `ensurePrepared` (caches `PreparedUpload` once on the draft entry and never re-invokes `prepare` on subsequent calls) and `isRetryableUploadError` (retries `network_error`, `timeout`, and `5xx`; does not retry `400`, `409`, `413`, `415`).
- [x] 1.3 Run `npx vitest run src/components/admin/__tests__/imageCompressor.test.ts` and confirm the scaffolded tests fail before implementation.

## 2. Client Upload Preparation & Compression (`imageCompressor.ts`)

- [x] 2.1 Implement `src/components/admin/imageCompressor.ts` exporting `CLIENT_MAX_UPLOAD_BYTES`, `COMPRESSION_LADDER`, `UploadPreparationError`, `UploadHttpError`, `PreparedUpload`, `hasAlphaChannel(bytes)`, `ensurePrepared`, `isRetryableUploadError`, `formatUploadHttpError(status, responseText)`, `normalizeFilenameForMime(name, mime)`, and `prepareUploadFile(file, options)` (small-file passthrough tolerant of decode failures; exact header-based alpha detection; single `createImageBitmap(file, { imageOrientation: 'from-image' })` decode shared across ThumbHash/dominant-color extraction and compression; best-effort `{ colorSpace: 'display-p3' }` with sRGB fallback; deterministic ladder stepping; `AbortSignal` checks between steps; and `finally` teardown calling `bitmap.close()` and zeroing canvas dimensions).
- [x] 2.2 Run `npx vitest run src/components/admin/__tests__/imageCompressor.test.ts` and iterate until all tests pass.

## 3. FolderDropzone Wiring, Retry Caching & Cancellation

- [x] 3.1 Update `src/components/admin/FolderDropzone.tsx` to: replace inline `prepareThumbhash` with `prepareUploadFile` + `ensurePrepared`; add `prepared: PreparedUpload | null` to `DraftFile` and reuse cached `prepared` across automatic retries and manual **Retry failed** clicks; filter automatic retries with `isRetryableUploadError` so deterministic `4xx` errors stop immediately; pass `prepared.blob` and `prepared.filename` to `uploadPhoto`; wire `AbortController` per draft so `discardDraft` aborts preparation between steps and aborts in-flight XHR (`xhr.abort()`); and format bare `HTTP 413` responses via `formatUploadHttpError`.
- [x] 3.2 Confirm `POST /api/admin/albums/[id]/photos` remains unchanged (defense-in-depth `MAX_UPLOAD_BYTES = 25 MB`, `sha256` contentHash idempotency, `409 album_deleting` tombstone guard, magic-byte sanitization) and `rawUrlAudit.test.ts` stays green.

## 4. Verification & Empirical Audit

- [x] 4.1 Run full regression suite (`npm run typecheck && npm run lint && npm test && npm run build`) and confirm zero errors and clean pass counts.
- [x] 4.2 Run local browser verification (Playwright against `next start` at `/photos`) confirming: a `> 4.0 MiB` opaque JPEG compresses to `<= 4.0 MiB`, a transparent `> 4.0 MiB` PNG preserves alpha as WebP (or fails cleanly), an Orientation-6 JPEG renders right-side-up, a simulated transient failure + retry reuses the cached blob without `409 photo_id_conflict`, deterministic `4xx` is not retried, and Discard aborts in-flight work cleanly.
- [x] 4.3 Populate `openspec/changes/client-upload-compression/verification.md` with the Requirement Adherence Audit Matrix, verbatim execution logs, and explicit `PENDING (maintainer — empirical)` rows for real Safari/iOS Orientation-6 validation, Display-P3 ICC profile inspection, extreme-dimension / 48 MP mobile Safari memory check, and live Vercel `> 4.5 MB` upload verification.

## Patch 01: Fail-closed PNG alpha scan, post-write tombstone re-check, 413 slug message

- [ ] P01.1 Scaffold the reproducing tests and confirm they fail:
  - `hasAlphaChannel` on a palette PNG whose `tRNS` sits after a 70 KiB `iTXt` chunk, truncated to the 64 KiB header buffer, expects `true`;
  - the same for a header that ends mid-chunk before `IDAT`;
  - `formatUploadHttpError(413, '{"error":"payload_too_large"}')` expects `SIZE_LIMIT_MESSAGE`;
  - a routes test where `putObject` completes and the album is then tombstoned (`markAlbumDeleting`) expects `409 album_deleting`, no stored object and no photo row.
- [ ] P01.2 Apply the minimal fixes:
  - PNG walk in `hasAlphaChannel`: anything other than reaching `IDAT` returns `true`;
  - `formatUploadHttpError`'s 413 branch;
  - post-`putObject` album re-check with compensating `deleteObject` in `src/app/api/admin/albums/[id]/photos/route.ts`.
- [ ] P01.3 Verify the reproduction tests pass and run the full regression suite (`npm run typecheck && npm run lint && npm test && npm run build`).
- [ ] P01.4 Update `verification.md` (audit matrix rows for the new scenarios, a Disagreements/Deviations note on the narrowed server non-goal, logs) and mark PATCH-01 RESOLVED in `patch.md`.
