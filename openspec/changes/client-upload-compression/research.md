## Source material

**2026-11-24, maintainer + review session (Vercel 413 on photo upload):**

> Yes, the 413 is Vercel's limit. Functions reject request bodies over 4.5 MB before our code runs, so the route's own 25 MB `MAX_UPLOAD_BYTES` check never fires. That's also why the error reads `HTTP 413` with no JSON body. Client-side compression is the right fix here, because of what the wall actually serves.
>
> The largest image the wall ever requests is 2048 px on the long edge: `LOD_BUCKETS = [256, 800, 2048]` in `zoomTier.ts`, served through Bunny Optimizer's `?width=` / `?height=`. Bunny resizes from whatever we store. An iPhone original at 4032×3024 (or 8064×6048 at 48 MP) only ever gets shrunk. If we cap the stored copy at a 4096 px long edge, we keep 2× headroom over the top tier for a future 4K LOD.
>
> 1. Only touch files that need it. If the file is under about 4 MB, send the original bytes.
> 2. Otherwise, resize and re-encode: decode with `createImageBitmap(file, { imageOrientation: 'from-image' })`, draw onto a canvas capped at 4096 px on the long edge, then `toBlob('image/jpeg', q)`, stepping quality down (`0.9`, `0.85`, `0.8`) then edge (`3072`). Target 4.0 MB, not 4.5 MB, to leave room for the multipart boundary and form fields.
> 3. Cache the compressed blob on the `DraftFile`. The route computes `contentHash` server-side and returns 409 `photo_id_conflict` when the same `photoId` arrives with different bytes.
> 4. Compute the thumbhash from the same decoded bitmap, so the placeholder matches what's stored.

**2026-11-24, second reviewer refinements (incorporated into this change):**

> - **Verify the 4.5 MB limit and how it's applied.** Confirm whether the limit applies to the whole request and whether this route runs as a Function on the intended deployment. A 4.0 MB file target is sensible margin, but don't present the exact limit as universal without checking the deployment/runtime.
> - **"Nothing visible is lost" is too strong.** Lossy JPEG re-encoding can change visible detail, and transparent PNG/WebP images lose transparency when converted to JPEG. Preserve alpha (or reject/fail with an explicit message) rather than silently flattening those images. Also keep PNG/WebP files under the threshold byte-identical.
> - **Make the retry identity rule explicit.** Cache the final `Blob` and its MIME type/extension on the draft file, and reuse both for every retry. Ensure the server's content hash is over the received bytes, and that the retry reuses the same photo ID and exact payload.
> - **Orientation needs browser validation.** `createImageBitmap(..., { imageOrientation: 'from-image' })` behavior and canvas encoding vary across browsers. Test EXIF-rotated JPEGs in Safari and Chromium, and avoid applying orientation twice.
> - **Color-space claim needs qualification.** Requesting a Display-P3 canvas does not by itself guarantee the JPEG blob retains an embedded P3 profile across browsers. Treat this as a measured capability with a safe sRGB fallback.
> - **Memory estimate is incomplete.** A 48 MP RGBA bitmap is roughly 192 MB before canvas backing storage and encoder buffers. Sequential processing helps, but mobile Safari can still run out of memory. Revoke/close resources promptly (`ImageBitmap.close()`), release canvases, and define a clear failure path.
> - **Spec scope:** Spec the upload contract and failure cases, not only the compression ladder: byte and pixel caps, accepted formats, alpha handling, resulting filename/MIME/dimensions, cancellation, retry reuse, and clear per-file errors. Keep server-side size validation as defense in depth, with a response the client can explain if a request still exceeds the deployment limit.

### Raised but not acted on

- **Vercel Blob / presigned direct-to-Bunny uploads:** Avoids the Vercel Function body cap and preserves full multi-ten-MB originals, at the cost of a two-step signed-upload flow or new vendor dependency. Deliberately skipped because the gallery wall's top LOD is `2048 px` (`4096 px` gives 2× headroom) and Bunny is a delivery CDN, not the curator's archival library.
- **Local-dev upload workaround (`STORAGE_DRIVER=bunny` pointed at prod Turso/Bunny):** Works with zero code as a temporary stopgap, but restricts curation to a laptop. Not a replacement for browser uploads.
- **Web Worker / `OffscreenCanvas` compression:** Deferred unless real-device testing shows main-thread jank during sequential encoding. Sequential processing with prompt `ImageBitmap.close()` and canvas release (`width = 0; height = 0`) is simpler and has uniform Safari support.
- **HEIC client-side decoding:** Out of scope; HEIC remains rejected by `folderReader.ts` (`IMAGE_EXTENSIONS = { jpg, jpeg, png, webp }`) and the server's magic-byte sanitizer (`415`).

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| `CLIENT_MAX_UPLOAD_BYTES` | Target ceiling (`4 * 1024 * 1024` = 4,194,304 bytes = 4.0 MiB) for the encoded file payload sent in `FormData`, leaving ~0.5 MB headroom under Vercel's 4.5 MB Function body cap for multipart headers and form fields. | A replacement for the server's `MAX_UPLOAD_BYTES` (`25 MB`) defense-in-depth limit. |
| Passthrough file | An accepted JPEG, PNG, or WebP whose byte length is `<= CLIENT_MAX_UPLOAD_BYTES`. Sent byte-identically to the server without canvas re-encoding. | Skipping ThumbHash/dominant-color extraction (passthrough files still compute ThumbHash from a decoded bitmap). |
| Prepared upload payload (`PreparedUpload`) | The cached, immutable `{ blob, filename, contentType, thumbHash, dominantColor, compressed }` object stored on `DraftFile` after first preparation and reused verbatim on every retry for the same `photoId`. | Re-encoding the source `File` on retry. |
| Alpha-bearing image | A PNG or WebP whose decoded pixels contain any pixel with `alpha < 255`. Must preserve transparency (WebP re-encode) or fail explicitly—never silently flattened onto black/opaque JPEG. | Every PNG/WebP regardless of opacity (an opaque PNG/WebP over 4.0 MiB may be re-encoded as JPEG or WebP). |
| Compression ladder | Deterministic sequence of `(maxLongEdge, quality)` steps tried in order until `blob.size <= CLIENT_MAX_UPLOAD_BYTES`: `(4096, 0.90)` → `(4096, 0.85)` → `(4096, 0.80)` → `(3072, 0.85)` → `(3072, 0.80)`. | Arbitrary unbounded quality degradation below `0.80` or resizing below `3072 px` without failing explicitly. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| Vercel Functions limits docs (deployment runtime) | Vercel Serverless Functions enforce a `4.5 MB` maximum request payload size on the entire HTTP body (including multipart boundaries and fields), rejecting larger requests with bare `413` before the route handler runs. | Public docs | 2026-11-24 |
| MDN `createImageBitmap` & `CanvasRenderingContext2DSettings.colorSpace` | `{ imageOrientation: 'from-image' }` bakes EXIF orientation into the decoded bitmap; `{ colorSpace: 'display-p3' }` is supported in Chromium and Safari with silent sRGB fallback in browsers that reject or ignore it, but JPEG `toBlob` ICC profile attachment varies by browser engine. | CC-BY-SA 2.5 | 2026-11-24 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Native browser `createImageBitmap` + 2D `<canvas>.toBlob` | **Adopted** | Zero new npm dependencies, shares the existing `createImageBitmap` decode path already in `FolderDropzone.tsx`, supports both `image/jpeg` and `image/webp` (for alpha preservation), and stays strictly client-side. | 2026-11-24 |
| `browser-image-compression` / WASM codecs (`squoosh`, `libvips`) | Rejected | Adds 100 KB–2 MB of bundle weight or WASM CSP/worker complexity for a single-curator admin drawer. | 2026-11-24 |
| Vercel Blob relay / direct Bunny signed upload | Rejected | Adds vendor/two-step complexity when the wall's max served LOD is `2048 px`. | 2026-11-24 |

## Patterns adopted

- **Prepare-once, cache-on-draft retry pattern:** Compute the final `Blob`, normalized `filename` (matching the output extension), `contentType`, `thumbHash`, and `dominantColor` once per `DraftFile`, store it on the draft entry, and reuse the exact cached payload across automatic retries and manual "Retry failed" clicks so `(photoId, sha256(rawBytes))` is deterministic. Lands in `src/components/admin/imageCompressor.ts` and `src/components/admin/FolderDropzone.tsx`.
- **Explicit resource teardown (`try / finally`):** Always call `bitmap.close()` and zero out temporary canvas dimensions (`canvas.width = 0; canvas.height = 0`) in `finally` blocks so sequential uploads do not accumulate decoded RGBA buffers in mobile Safari. Lands in `src/components/admin/imageCompressor.ts`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Top wall LOD bucket | `LOD_BUCKETS = [256, 800, 2048]` | Read `src/components/wall/zoomTier.ts` | 2026-11-24 | stable |
| Accepted client extensions | `jpg`, `jpeg`, `png`, `webp` (`IMAGE_EXTENSIONS`) | Read `src/components/admin/folderReader.ts:45` | 2026-11-24 | stable |
| Server upload route & idempotency | `POST /api/admin/albums/[id]/photos` hashes received `rawBytes` (`sha256`) and returns `409 photo_id_conflict` if `photoId` exists with different `contentHash`; `MAX_UPLOAD_BYTES = 25 * 1024 * 1024` | Read `src/app/api/admin/albums/[id]/photos/route.ts:70-84` and `src/lib/upload/sanitizeImage.ts:12` | 2026-11-24 | stable |
| Server extension derived from magic bytes | `storagePath = /albums/${albumId}/${photoId}.${sanitized.extension}` (`jpg`, `png`, `webp`), not from client filename extension; `filename` is stored as display metadata | Read `src/app/api/admin/albums/[id]/photos/route.ts:107,130` | 2026-11-24 | stable |
| Existing client decode path | `prepareThumbhash(file)` in `FolderDropzone.tsx:100-147` decodes via `createImageBitmap(file, { imageOrientation: 'from-image' })`, draws `<= 32px` canvas, closes bitmap | Read `src/components/admin/FolderDropzone.tsx:100-147` | 2026-11-24 | stable |
| Existing retry loop | `uploadDraftFiles` retries `uploadPhoto` up to `MAX_ATTEMPTS = 2` inside the loop and allows manual retry of failed files; `FolderDropzone` currently passes `draftFile.file` directly | Read `src/components/admin/FolderDropzone.tsx:182,283-329` | 2026-11-24 | stable |
| Current 413 error UX | When Vercel returns bare `413` with non-JSON body, `uploadPhoto` falls back to `HTTP 413` with no actionable explanation | Read `src/components/admin/FolderDropzone.tsx:169-176` | 2026-11-24 | stable |

## Unverified assumptions

- **Exact Vercel Function 4.5 MB multipart enforcement on `POST /photos/api/admin/albums/[id]/photos`:** Observed empirically as bare `HTTP 413` on a >4.5 MB photo; verify post-deploy that a `<= 4.0 MiB` compressed file + multipart fields (`photoId`, `thumbHash`, `dominantColor`, `sortOrder`) succeeds `201` on Vercel production.
- **Display-P3 ICC retention in `canvas.toBlob('image/jpeg')`:** Requesting `{ colorSpace: 'display-p3' }` on the 2D context is best-effort; whether Chromium and Safari embed a Display-P3 ICC profile in the resulting JPEG blob must be measured on real browsers rather than assumed.
- **EXIF-rotated JPEG orientation in Safari vs Chromium:** `createImageBitmap(file, { imageOrientation: 'from-image' })` should bake orientation once and omit EXIF on canvas output; verify with an Orientation-6 JPEG on both Safari and Chromium that the stored image is neither sideways nor double-rotated.
- **Mobile Safari memory ceiling on 48 MP photos:** A 48 MP decoded RGBA bitmap is ~192 MB before canvas backing storage and encoder buffers. Even with sequential processing and prompt `bitmap.close()` / canvas zeroing, mobile Safari may throw or abort on 48 MP inputs; verify the explicit per-file failure path handles decode/canvas OOM cleanly.

## Superseded claims

- **"Compressing loses nothing visible."** Too strong: lossy JPEG re-encoding alters pixel detail and would silently flatten alpha on transparent PNG/WebP files. Replaced with explicit alpha detection (encode alpha-bearing files as WebP or fail cleanly if still over cap) and byte-identical passthrough for files `<= 4.0 MiB`.
- **"The 4.5 MB limit is universal."** Specific to Vercel Serverless Functions request bodies; self-hosted Node deployments still enforce `MAX_UPLOAD_BYTES = 25 MB`. Both limits are now documented separately, with the server check retained as defense in depth.
- **"Display-P3 canvas guarantees P3 output."** Downgraded to a best-effort capability with automatic sRGB fallback and a browser verification step.

## Links out

- [openspec/specs/storage-and-cdn-pipeline/spec.md](../../specs/storage-and-cdn-pipeline/spec.md): server-side upload validation, lossless sanitization, and storage/CDN contracts.
- [openspec/specs/gallery-hud-and-curator-ui/spec.md](../../specs/gallery-hud-and-curator-ui/spec.md): Curator Drawer folder upload and draft retry requirements.
