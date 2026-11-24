## Automated Tests

- `npx vitest run src/components/admin/__tests__/imageCompressor.test.ts`:
  - **Passthrough under `CLIENT_MAX_UPLOAD_BYTES` (`4.0 MiB`)**: JPEG, PNG, and WebP files `<= 4,194,304` bytes return the original `File` instance, filename, and MIME type untouched (`compressed: false`), still populate `thumbHash` and `dominantColor`, and close the decoded bitmap.
  - **Small-file decode failure fallback**: A `<= 4.0 MiB` file where `createImageBitmap` throws or is unavailable still succeeds byte-identically with `thumbHash: null` and `dominantColor: null`.
  - **Exact binary header alpha detection (`hasAlphaChannel`)**:
    - PNG `IHDR` color types `4` and `6` → `true`; color types `0`, `2`, `3` without `tRNS` → `false`; color type `2` or `3` with a `tRNS` chunk before `IDAT` → `true`.
    - WebP `VP8X` with alpha bit `0x10` set → `true`, unset → `false`; `VP8L` with alpha bit set → `true`, unset → `false`; `VP8 ` lossy → `false`.
    - JPEG → `false`.
  - **Opaque oversized ladder**: A `> 4.0 MiB` opaque `6000x4000` JPEG (or opaque PNG without alpha/`tRNS`) resizes to `<= 4096 px` long edge and steps through `(4096, 0.90)` → `(4096, 0.85)` → `(4096, 0.80)` → `(3072, 0.85)` → `(3072, 0.80)`, stopping at the first result `<= 4.0 MiB`, emitting `image/jpeg` and a `.jpg` filename.
  - **Alpha-channel oversized PNG/WebP**: Never encoded as `image/jpeg`; encodes as `image/webp` (`.webp`) along the ladder, and throws an explicit `UploadPreparationError` (suggesting Chrome or a smaller PNG export) if still `> 4.0 MiB` or if the encoder returns a non-WebP fallback blob (simulating Safari).
  - **Retry payload caching (`ensurePrepared`)**: Calling `ensurePrepared` twice on the same draft entry invokes `prepare` exactly once and returns the identical cached `PreparedUpload` reference on the second call.
  - **Transient-only retry filter (`isRetryableUploadError`)**: Returns `true` for `network_error`, `timeout`, and HTTP `500`/`502`/`503`; returns `false` for deterministic `400`, `409`, `413`, and `415`.
  - **Display-P3 fallback**: When `getContext('2d', { colorSpace: 'display-p3' })` throws or returns `null`, falls back cleanly to default `getContext('2d')`.
  - **Resource cleanup & cancellation**: `bitmap.close()` and temporary canvas zeroing (`width = 0; height = 0`) run in `finally` on success, ladder exhaustion, decode error, and `AbortSignal` cancellation between steps.
  - **Platform-neutral `HTTP 413` formatting (`formatUploadHttpError`)**: Bare/non-JSON `413` maps to `"Upload exceeded the server's request size limit. Try exporting a smaller copy."`.
- `npx vitest run src/components/admin/__tests__/folderReader.test.ts`: Existing recursive drop and 20-photo album cap tests stay green.
- `npx vitest run src/app/api/__tests__/routes.test.ts`: Existing server-side `MAX_UPLOAD_BYTES = 25 MB`, magic-byte sanitization, and `(photoId, contentHash)` idempotency / `409 photo_id_conflict` tests stay green.
- `npm run typecheck && npm run lint && npm test && npm run build`: Full regression suite passes with zero errors and `rawUrlAudit.test.ts` stays green.

## Manual Verification

- **Oversized iPhone / camera JPEG on Vercel (`/photos`)** *(empirical maintainer check)*:
  - **WHEN** a curator drops a `> 5 MB` JPEG (including an EXIF Orientation-6 portrait photo) into the Curator Drawer on the Vercel deployment
  - **THEN** the file compresses client-side to `<= 4.0 MiB`, uploads with `201`, publishes cleanly, and renders right-side-up (neither sideways nor double-rotated) in both Chromium and Safari.
- **Retry identity (no `409 photo_id_conflict`)**:
  - **WHEN** an oversized photo is dropped, the network is interrupted mid-upload so the first attempt fails, and the curator clicks **Retry failed**
  - **THEN** the retry re-sends the exact cached `PreparedUpload` blob with the same `photoId` and succeeds without `409 photo_id_conflict`.
- **Transparent PNG over 4.0 MiB**:
  - **WHEN** a curator drops a `> 4.0 MiB` PNG with an alpha channel (including a tiny transparent edge feature)
  - **THEN** in Chromium it retains transparency as WebP (or fails explicitly if still `> 4.0 MiB`); in Safari it surfaces the explicit per-file error without silently flattening onto black JPEG.
- **Display-P3 profile & 48 MP mobile Safari check** *(empirical maintainer checks, not hard guarantees)*:
  - **WHEN** a wide-gamut Display-P3 JPEG `> 4.0 MiB` and a 48 MP iPhone photo are tested in Chromium and Safari / mobile Safari
  - **THEN** record the observed ICC profile retention, rendered appearance, and memory behavior (or clean per-file OOM error) in `verification.md`.
- **Draft discard cancellation**:
  - **WHEN** a curator drops a multi-file folder of large photos and clicks **Discard** mid-upload
  - **THEN** the in-flight XHR aborts immediately, remaining files do not start compressing/uploading, and the draft is tombstoned and removed cleanly.
