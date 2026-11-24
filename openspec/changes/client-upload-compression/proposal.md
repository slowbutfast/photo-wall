## Why

On Vercel Serverless Functions, requests to `POST /photos/api/admin/albums/[id]/photos` whose total HTTP body exceeds the platform's 4.5 MB limit are rejected with a bare `HTTP 413` before the route handler's own 25 MB `MAX_UPLOAD_BYTES` check ever runs. Because typical camera and iPhone originals exceed 4.5 MB while the gallery wall's highest served LOD is `2048 px` (`LOD_BUCKETS = [256, 800, 2048]`), curating from the browser fails on real photos. Preparing and compressing oversized images client-side before upload solves browser curation on Vercel without adding external storage relays or changing the server upload API.

## What Changes

- Add a pure, browser-backed upload preparation module (`src/components/admin/imageCompressor.ts`) used by `FolderDropzone.tsx` before `uploadPhoto`.
- **Passthrough under threshold:** Accepted `JPEG`, `PNG`, and `WebP` files at or below `CLIENT_MAX_UPLOAD_BYTES` (`4 * 1024 * 1024` = 4.0 MiB) pass through byte-identically; ThumbHash and dominant color are still computed from a single decoded bitmap, and if decoding fails on a small file (`<= 4.0 MiB`), it still uploads byte-identically with `null` placeholder metadata (matching existing behavior).
- **Deterministic client compression ladder for oversized files (`> 4.0 MiB`):**
  - Inspect file header bytes (`hasAlphaChannel(bytes)`) to detect PNG (`IHDR` color type 4/6 or `tRNS` chunk) and WebP (`VP8X` alpha flag or `VP8L` alpha bit) alpha channels with zero pixel allocation.
  - Decode once via `createImageBitmap(file, { imageOrientation: 'from-image' })` and compute ThumbHash/dominant color from that same bitmap.
  - **Opaque images:** Resize to at most `4096 px` on the long edge and encode as `image/jpeg` across `(4096, 0.90)` → `(4096, 0.85)` → `(4096, 0.80)` → `(3072, 0.85)` → `(3072, 0.80)` until `blob.size <= CLIENT_MAX_UPLOAD_BYTES`, updating the uploaded filename extension to `.jpg`.
  - **Alpha-channel PNG/WebP images:** Never silently flatten onto JPEG. Encode as `image/webp` across the same dimension/quality ladder (updating the filename extension to `.webp`); if still above `CLIENT_MAX_UPLOAD_BYTES` or the browser does not support WebP canvas encoding (e.g. Safari), fail that file with an explicit per-file error (`"Transparent image could not be compressed under 4 MB in this browser. Try Chrome or export a smaller PNG."`).
  - **Color space:** Request `{ colorSpace: 'display-p3' }` on the 2D canvas context on a best-effort basis with automatic fallback to default `sRGB` if unsupported; treat P3 ICC retention as an empirical browser capability, not a hard guarantee.
  - **Memory, retry & cancellation hygiene:** Process files sequentially, always call `bitmap.close()` and zero temporary canvas dimensions (`width = 0; height = 0`) in `finally` blocks, expose a testable `ensurePrepared()` cache seam, retry only transient errors (`network_error`, `timeout`, `5xx`), support cancelling an active draft between steps / aborting in-flight XHRs via `AbortController`, and surface clear per-file errors (including a platform-neutral `HTTP 413` message).
- **Retry identity contract:** Cache the final `PreparedUpload` (`blob`, `filename`, `contentType`, `thumbHash`, `dominantColor`, `compressed`) on `DraftFile` once prepared and reuse that exact payload across automatic retries and manual "Retry failed" clicks so `(photoId, sha256(rawBytes))` stays identical and never triggers `409 photo_id_conflict`.
- **Server defense in depth:** Keep `POST /api/admin/albums/[id]/photos` unchanged (`MAX_UPLOAD_BYTES = 25 MB`, magic-byte sanitization, `sha256` contentHash idempotency). Improve client-side `HTTP 413` error mapping so a bare deployment 413 displays an actionable size-limit message.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `storage-and-cdn-pipeline`: Add client-side upload preparation and compression contract (`CLIENT_MAX_UPLOAD_BYTES = 4.0 MiB`, byte-identical passthrough under threshold, `4096 px` / `3072 px` compression ladder, alpha preservation vs explicit failure, cached retry payload identity, cancellation/resource cleanup, and actionable `413` / per-file error reporting) alongside existing server-side defense-in-depth validation.

## Impact

- **Code:** New `src/components/admin/imageCompressor.ts` and `src/components/admin/__tests__/imageCompressor.test.ts`; updated `src/components/admin/FolderDropzone.tsx` (cached `PreparedUpload` on `DraftFile`, shared decode with ThumbHash, abort on draft discard, human-readable `413` error).
- **Server / API / DB:** No schema or route changes; `POST /api/admin/albums/[id]/photos` continues hashing received bytes, enforcing `MAX_UPLOAD_BYTES = 25 MB`, and deriving storage extensions from magic bytes.
- **Dependencies:** Zero new runtime packages.
- **Cross-change:** Both this change and `admin-route-isolation` edit `FolderDropzone.tsx`. Land `client-upload-compression` **first** (it unblocks real Vercel uploads on `main`), and rebase `admin-route-isolation` onto it.

### Revision: 2026-11-24 17:53 UTC
- **Feedback Source**: Two-Agent Peer Review Critique
- **Key Changes**:
  - `specs/storage-and-cdn-pipeline/spec.md`: Added explicit small-file decode-failure passthrough scenario, replaced pixel-scan alpha wording with exact binary header alpha detection (`PNG` IHDR 4/6 or `tRNS`; `WebP` `VP8X` alpha / `VP8L` alpha), scoped client cancellation between steps + XHR abort with server tombstone race safety, and made `HTTP 413` error message platform-neutral.
  - `architecture.md`: Replaced 512px downsampled alpha scan with zero-allocation `hasAlphaChannel(bytes)` header parser (D2), added `ensurePrepared()` pure seam + transient-only retry filter (`network_error`, `timeout`, `5xx`) (D3), clarified Safari WebP fallback message, `AbortSignal` step boundaries, late-write tombstone cleanup (D5), and deferred `createImageBitmap` `resizeWidth` optimization.
  - `proposal.md`, `tests.md`, `tasks.md`: Updated cross-change landing order (`client-upload-compression` before `admin-route-isolation`), added `hasAlphaChannel` + `ensurePrepared` + small-file decode-failure + retry-filter unit tests and tasks, and labeled P3/Safari/48 MP checks as empirical maintainer checks.
