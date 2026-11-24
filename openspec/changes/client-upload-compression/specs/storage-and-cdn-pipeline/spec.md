## ADDED Requirements

### Requirement: Client-side upload preparation and size-bounded compression
Before sending a file to `POST /api/admin/albums/[id]/photos`, the Curator Drawer upload pipeline SHALL prepare each accepted image (`JPEG`, `PNG`, `WebP`) through a deterministic client-side preparation contract with a target payload ceiling of `CLIENT_MAX_UPLOAD_BYTES = 4 * 1024 * 1024` bytes (`4.0 MiB`), leaving headroom for multipart framing under serverless platform request-body caps while preserving the server's `25 MB` `MAX_UPLOAD_BYTES` check as defense in depth.

- Files whose original byte size is `<= CLIENT_MAX_UPLOAD_BYTES` SHALL pass through byte-identically with their original `File` blob, filename, and MIME type unchanged, while attempting to compute `thumbHash` and `dominantColor` from a decoded bitmap; if decoding fails or `createImageBitmap` is unavailable for a file `<= CLIENT_MAX_UPLOAD_BYTES`, the file SHALL still pass through byte-identically with `thumbHash: null` and `dominantColor: null`.
- Files larger than `CLIENT_MAX_UPLOAD_BYTES` SHALL be inspected via their binary file header (`hasAlphaChannel`) to determine alpha presence: PNG files with `IHDR` color type `4` or `6` or a `tRNS` chunk, and WebP files with the `VP8X` alpha flag or `VP8L` alpha bit set, SHALL be treated as alpha-channel sources.
- Oversized files (`> CLIENT_MAX_UPLOAD_BYTES`) SHALL be decoded once with `{ imageOrientation: 'from-image' }` (baking EXIF orientation into the pixels so orientation is never applied twice), have `thumbHash` and `dominantColor` computed from that same decoded bitmap, and be re-encoded along the deterministic ladder `(4096, 0.90)` → `(4096, 0.85)` → `(4096, 0.80)` → `(3072, 0.85)` → `(3072, 0.80)` (long-edge pixel cap, quality) stopping at the first result whose size is `<= CLIENT_MAX_UPLOAD_BYTES`.
- Opaque oversized images SHALL be encoded as `image/jpeg` with the uploaded filename extension normalized to `.jpg`.
- Alpha-channel `PNG` or `WebP` images (`> CLIENT_MAX_UPLOAD_BYTES`) SHALL NOT be silently flattened to JPEG; they SHALL be encoded as `image/webp` (with filename extension `.webp`) along the same ladder, and if the output remains `> CLIENT_MAX_UPLOAD_BYTES` or the browser cannot produce an `image/webp` blob (e.g., Safari falling back to PNG), preparation SHALL fail that file with an explicit per-file error.
- Canvas 2D contexts SHALL request `{ colorSpace: 'display-p3' }` on a best-effort basis and fall back silently to default `sRGB` when unsupported.
- Files SHALL be prepared and uploaded sequentially, releasing every `ImageBitmap` (`close()`) and temporary `<canvas>` (`width = 0; height = 0`) in `finally` blocks regardless of success or error.

#### Scenario: Small image passes through byte-identically
- **WHEN** a curator drops a `2.1 MiB` JPEG, PNG, or WebP file
- **THEN** the prepared upload SHALL reuse the original `File` bytes, original filename, and original MIME type without canvas re-encoding, and SHALL still populate `thumbHash` and `dominantColor`

#### Scenario: Small image that fails client decode still uploads byte-identically
- **WHEN** a curator drops a `<= 4.0 MiB` image and `createImageBitmap` throws or is unavailable
- **THEN** preparation SHALL NOT fail the file; it SHALL return the original `File` bytes, filename, and MIME type with `thumbHash: null` and `dominantColor: null`

#### Scenario: Oversized opaque photo compresses along the ladder
- **WHEN** a curator drops an opaque `9.5 MiB` `6000x4000` JPEG (or opaque PNG without alpha channel / `tRNS`)
- **THEN** the pipeline SHALL decode it once with `imageOrientation: 'from-image'`, resize its long edge to `<= 4096 px`, step through the JPEG quality/dimension ladder until `blob.size <= 4,194,304` bytes, set `contentType` to `image/jpeg` and the filename extension to `.jpg`, and release the `ImageBitmap` and temporary canvas

#### Scenario: Oversized alpha-channel PNG or WebP preserves alpha or fails explicitly
- **WHEN** a curator drops a `6.0 MiB` PNG with `IHDR` color type 4/6 or `tRNS` (or a WebP with `VP8X`/`VP8L` alpha)
- **THEN** the pipeline SHALL NOT convert it to `image/jpeg`; it SHALL encode as `image/webp` (`.webp`) to preserve transparency, or fail the file with an explicit per-file error if the WebP result still exceeds `4.0 MiB` or the browser does not encode `image/webp`

#### Scenario: Oversized ladder exhaustion or decode failure reports a clear per-file error
- **WHEN** an oversized file (`> 4.0 MiB`) still exceeds `CLIENT_MAX_UPLOAD_BYTES` after the `(3072, 0.80)` step, or decoding/canvas allocation throws
- **THEN** that file SHALL enter the `'failed'` state with a clear, human-readable per-file error message, all allocated bitmaps/canvases SHALL be released, and other files in the draft SHALL continue uploading

#### Scenario: Bare deployment 413 response produces an actionable platform-neutral error
- **WHEN** the upload XHR receives HTTP `413` with an empty or non-JSON body
- **THEN** the client SHALL surface an actionable, platform-neutral error message (`"Upload exceeded the server's request size limit. Try exporting a smaller copy."`) rather than a bare `HTTP 413`

### Requirement: Cached retry payload identity, transient-only retries, and draft cancellation
Once a `DraftFile` has been prepared, its resulting `PreparedUpload` (`blob`, `filename`, `contentType`, `thumbHash`, `dominantColor`) SHALL be cached on the `DraftFile` (via the pure `ensurePrepared` helper) and reused verbatim across every automatic retry and manual "Retry failed" attempt for the same `photoId`. Automatic retries SHALL only re-attempt transient failures (`network_error`, `timeout`, or HTTP `5xx`), never deterministic `4xx` rejections (`400`, `409`, `413`, `415`). Discarding an active draft SHALL signal cancellation on the client so no further preparation steps or file uploads start and any in-flight XHR is aborted; any server-side request already in flight before abort is guarded by the album tombstone (`status = 'deleting'` → `409 album_deleting`) and recursive prefix cleanup on delete/reconciliation.

#### Scenario: Retrying a failed upload reuses the exact cached blob and metadata
- **WHEN** an oversized photo is compressed once, its first XHR fails with a transient error, and either the automatic retry or a manual "Retry failed" click re-sends it
- **THEN** `ensurePrepared` SHALL NOT re-decode or re-encode the source `File`; it SHALL reuse the exact cached `Blob`, `filename`, `contentType`, `thumbHash`, `dominantColor`, and `photoId` so the server's `sha256(rawBytes)` idempotency check matches identically

#### Scenario: Deterministic 4xx responses are not retried automatically
- **WHEN** an upload XHR returns `413`, `415`, or `409`
- **THEN** the automatic retry loop SHALL stop immediately and mark the file `'failed'` without re-sending the payload

#### Scenario: Discarding an active draft cancels client work between steps and aborts XHR
- **WHEN** a curator clicks Discard while a draft is compressing or uploading
- **THEN** the draft's `AbortController` SHALL signal cancellation (stopping preparation between decode/encode steps), any in-flight XHR SHALL be aborted, no further files in that draft SHALL start, allocated bitmaps/canvases SHALL be released, and the server delete tombstone SHALL reject or purge any late-arriving write
