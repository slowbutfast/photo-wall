## Source material

**Maintainer, 2026-11-24 (Claude Code session):**

> "propose a new change that is literally just making it so that the default order for when you upload a new album is just the chronological order in which the photos were taken using the timestamp of the photo"

The words that set the scope:

- **"default order"**: the order a new album starts with. Curators can still reorder afterwards in the Album Editor's Photos tab.
- **"upload a new album"**: the Upload tab (`FolderDropzone`). It is not `+ Add Print` in an existing album.
- **"timestamp of the photo"**: the capture time embedded in the image, not the file's filesystem date.

### Raised but not acted on

- **Re-sorting existing albums by capture time** (for example a "Sort by date" button in the Album Editor). The request was about the *default* for new uploads. The existing reorder tooling already covers manual changes. This needs its own change if wanted.
- **Pre-filling the Upload tab's Date field from EXIF.** It sounds related, but it changes what an album's placard says, not the print order. Deferred.
- **Persisting capture time in the DB** (a `photos.taken_at` column). The ordering is computed once, at upload time, into the existing `sortOrder`. A column is only worth adding if something later needs to read capture time back.
- **Time-zone normalisation via `OffsetTimeOriginal`.** See Technical Decisions D4 in `architecture.md`.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Capture time** | The EXIF timestamp the camera wrote when the shutter fired. That is `DateTimeOriginal` (tag `0x9003`) in the Exif sub-IFD, with fallbacks to `DateTimeDigitized` (`0x9004`), then IFD0 `DateTime` (`0x0132`). It is local wall-clock time, `YYYY:MM:DD HH:MM:SS`. | `File.lastModified`, the server's `createdAt`, or the UUIDv7 upload timestamp. |
| **Chronological order** | Ascending capture time. The oldest photo gets `sortOrder 0`. | Descending order (newest first), or upload completion order. |
| **Dated / undated photo** | Dated means a valid capture time was found in the original file's bytes. Undated means none was found, the tag is malformed, or it is the all-zero placeholder `0000:00:00 00:00:00`. | Whether the album has a `dateLabel`. |
| **Natural filename order** | A numeric-aware, case-insensitive filename compare (`Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })`), so `IMG_2` comes before `IMG_10`. | Plain `localeCompare` or code-point order, which puts `IMG_10` before `IMG_2`. |
| **New album upload** | A folder drop or file pick in the Studio's **Upload** tab that creates a draft album (`FolderDropzone.beginUpload`). | `+ Add Print` inside the Album Editor, which appends to an existing album. |
| **Original file** | The browser `File` the curator picked, before `prepareUploadFile` compresses or re-encodes it. | The prepared upload blob or the server-sanitized bytes. Both have lost the capture time. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| CIPA DC-008 (Exif 2.3x) | Tags `DateTimeOriginal` `0x9003`, `DateTimeDigitized` `0x9004`, `SubSecTimeOriginal` `0x9291`, `OffsetTimeOriginal` `0x9011` (Exif 2.31), and the `ExifIFDPointer` `0x8769` in IFD0. Timestamps are ASCII, 20 bytes, in `YYYY:MM:DD HH:MM:SS\0` form. | Standard (reference only) | 2026-11-24 (from prior knowledge; not re-fetched) |
| PNG spec, 3rd ed. `eXIf` chunk | The chunk carries a raw TIFF stream with no `Exif\0\0` prefix. | W3C (reference only) | 2026-11-24 (prior knowledge) |
| WebP container spec (RIFF `VP8X`) | Extended WebP keeps metadata in an `EXIF` chunk, which writers normally place **after** the image data. | Google, CC-BY (reference only) | 2026-11-24 (prior knowledge) |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| `exifr` (npm) | Rejected | It's a full parser (HEIC, XMP, IPTC) for a job that needs three ASCII tags. It would be the Studio's first metadata dependency. The repo already hand-parses TIFF IFDs (`sanitizeImage.ts:180` `parseExifOrientation`). | 2026-11-24 |
| `exif-js` | Rejected | Unmaintained and relies on globals. | 2026-11-24 |
| Server-side parse during `sanitizeImage` | Rejected | Uploads go one file per XHR and in sequence, so the server never sees the whole album at once and can't order it. It would also need a new persisted column plus a renumbering pass. | 2026-11-24 |
| Small client-side TIFF reader in `src/components/admin/captureTime.ts` | **Adopted** | A pure function that is testable in the Node Vitest environment, adds no dependency, and runs on the original `File` before compression strips EXIF. | 2026-11-24 |

## Patterns adopted

- **TIFF IFD walk with an endianness switch.** Taken from this repo's own `parseExifOrientation` (`src/lib/upload/sanitizeImage.ts:180-208`). The approach is reused; the module is not imported, because `sanitizeImage` is a server module and its byte helpers aren't exported.
- **A pure helper with an injected reader**, the same shape as `folderReader.ts`. Ordering runs over `{ name, readHead() }` structures, so tests don't need a DOM.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| A new album's print order is the file index in the dropped or picked list | `sortOrder = index` | Read `FolderDropzone.tsx`. Draft files are built as `accepted.map((file, index) => …)` (L413), and `uploadPhoto(albumId, current, prepared, index, …)` (L313–316) appends `form.append('sortOrder', String(sortOrder))` (L165). | 2026-11-24 | decays |
| That list order is whatever the browser hands back, never sorted | No `sort` / `Collator` in `folderReader.ts` | `grep -nE "sort\|localeCompare\|Collator" src/components/admin/folderReader.ts` returned nothing. `readEntryTree` (L116+) keeps `readEntries()` page order, and the file-input path keeps `event.target.files` order (`FolderDropzone.tsx:471`). | 2026-11-24 | decays |
| The 20-photo cap keeps the first 20 files in list order | `files.slice(0, limit)` | Read `splitAlbumCap` (`folderReader.ts:55-63`) and `MAX_PHOTOS_PER_ALBUM = 20` (`islandLayout.ts:38`). It runs before `createAlbum` (`FolderDropzone.tsx:393`). | 2026-11-24 | decays |
| The server honours a client-sent `sortOrder` and only falls back to the next slot if it's missing | `parsedSortOrder ?? getNextPhotoSortOrder(albumId)` | Read `src/app/api/admin/albums/[id]/photos/route.ts:127-133`. | 2026-11-24 | stable |
| By the time an upload reaches storage it has no capture time | Server keeps only Orientation EXIF and ICC | Read the `sanitizeImage.ts` header comment (L1-10) and `buildOrientationExifSegment`. The client compressor re-encodes through canvas above 4.0 MiB (`imageCompressor.ts` ladder L27-32). | 2026-11-24 | stable |
| Nothing in `src/` reads capture time today | No `DateTimeOriginal`, `exif` lib or `taken_at` | `grep -rnE "exif\|DateTimeOriginal\|capturedAt\|taken" src` found only `sanitizeImage.ts` (Orientation) and an unrelated `taken` Set in `db/repository.ts`. `package.json` has no EXIF dependency. | 2026-11-24 | decays |
| The Upload tab accepts JPEG, PNG and WebP only | MIME check or extension regex | Read `FolderDropzone.tsx:474-479` and `folderReader.ts` `IMAGE_EXTENSIONS`. | 2026-11-24 | stable |
| Vitest runs in the Node environment | `environment: 'node'` | Read `vitest.config.*` L14. Node 20+ provides `File`/`Blob` globals for fixtures. | 2026-11-24 | stable |

## Assumption audit

| Assumption | Status | Evidence | Still needed |
| :--- | :--- | :--- | :--- |
| **JPEG EXIF sits in the first 256 KiB.** | Supported; the failure mode is verified safe. | An APPn payload is capped at 65,533 bytes by JPEG (T.81), and cameras write the Exif APP1 ahead of the scan data. The `captureTime.test.ts` case `degrades to undated when EXIF sits beyond the 256 KiB head` puts five 60 KiB APP2 segments in front of the Exif APP1: the full buffer parses, the 256 KiB head read returns `null`, and the photo is ordered as undated instead of failing. | A real camera/phone JPEG folder in the local manual pass (task 4.2) confirms the normal placement. |
| **PNG `eXIf` sits before `IDAT` within the head read.** | Supported at the byte level. | The PNG 3rd edition recommends `eXIf` before `IDAT`. `readPngCaptureTime` stops at `IDAT`, and the malformed matrix covers `IDAT` before `eXIf` returning `null`. The `pngWithExif` fixtures parse in both byte orders. | A real PNG export that carries `eXIf`; screenshots, the likely PNG case, usually have no capture time. |
| **iPhone JPEG exports carry `DateTimeOriginal`.** | **Unverified.** | Not obtainable from this headless environment: no real photo library and no local dev upload session. | Task 4.2 manual pass: three real iPhone/Photos JPEG exports, confirm the draft order in the Upload tab. |
| **Reading a whole WebP file is cheap enough.** | **Unverified timing; design bounded.** | `readCaptureBytes` reads WebP in full by design (D3). `orderByCaptureTime` awaits one file at a time, and the 20-file cap plus the 25 MB server limit bound the worst case. The read-budget test proves the full read is intentional. | Task 4.2 latency check: 20 WebP files on local dev, record the draft-appearance time. |

## Superseded claims

None yet. No checked claim was falsified: the 256 KiB head read misses an artificially buried APP1 by design and degrades safely, which is the documented fallback rather than a wrong assumption.

## Links out

- `openspec/specs/gallery-hud-and-curator-ui/spec.md`: Studio Upload tab requirement.
- `openspec/specs/admin-auth-and-crud-api/spec.md` L33: multipart photo upload contract (`sortOrder` field).
- `openspec/changes/archive/*client-upload-compression*`: why the uploaded bytes have lost EXIF.
