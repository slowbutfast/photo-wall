## Automated Tests

Runner: `npx vitest run` (Node environment). For the narrow loop, use `npx vitest run src/components/admin/__tests__/captureTime.test.ts`. Don't use `safe-test`: it runs out of memory on this suite.

Fixtures are built in-test from bytes: a minimal JPEG (`SOI` + `APP1 Exif` + `SOS`), a PNG (signature + `IHDR` + `eXIf` + `IDAT`) and a WebP (`RIFF/WEBP` + `VP8X` + `VP8L` + trailing `EXIF`). Each carries a TIFF block in both `II` and `MM` byte order. No binary fixture files are committed.

- `captureTime.test.ts` › `readCaptureTime`:
  - extracts `DateTimeOriginal` from JPEG `APP1`, PNG `eXIf` and WebP `EXIF`, in both byte orders;
  - reads values stored by offset (more than 4 bytes) correctly;
  - prefers `0x9003` over `0x9004` over IFD0 `0x0132`;
  - parses `SubSecTimeOriginal`.
- `captureTime.test.ts` › malformed input returns `null` without throwing for each of the following:
  - empty buffer
  - non-image bytes
  - truncated `APP1`
  - IFD offset past the end
  - Exif IFD pointer past the end
  - wrong TIFF magic
  - bad-shaped date string
  - `0000:00:00 00:00:00`
  - an `APP1` that isn't Exif (XMP)
  - a PNG whose `IDAT` comes before any `eXIf`
- `captureTime.test.ts` › `compareCapture` and `orderByCaptureTime`:
  - the spec's three-file scenario (`C/A/B` → `A, B, C`);
  - burst ties by sub-seconds, compared as a decimal fraction, with a missing value counting as `.0`;
  - natural filename tie-break (`IMG_2` before `IMG_10`);
  - undated files placed after dated ones, by natural name;
  - equal names keep their input order;
  - a `readBytes` rejection is treated as undated;
  - the result is a new array, and the input stays unmutated.
- `captureTime.test.ts` › cap interplay: `splitAlbumCap(await orderByCaptureTime(25 shuffled), 20)` keeps the 20 earliest and reports `overflow === 5`.
- Read budget: an injected spy confirms that JPEG and PNG request only the first `256 KiB`, and WebP requests the whole file.
- Full suite: `npx vitest run`. The existing `folderReader`, `imageCompressor`, `photoOrderState` and route tests must stay green with no changes.
- Also run `npx tsc --noEmit`, `npx eslint .` and `npm run build`, all clean.

## Manual Verification

Run local dev only (`STORAGE_DRIVER=local`, a local DB, `ADMIN_ENABLED=true`). **Never** run this against the preview or production. They share the production Turso database and the Bunny zone.

- **Folder drop orders by capture time:**
  - **WHEN** you drop a folder of 3+ real camera or phone JPEGs, renamed so that alphabetical order differs from shooting order
  - **THEN** the Upload draft list and the saved album's Photos tab show them oldest-first, and the preview wall shows the same order
- **Large file keeps position:**
  - **WHEN** the folder includes a dated JPEG over 4.0 MiB, so it goes through the compression ladder
  - **THEN** it sits in its chronological slot, not at the end
- **Undated files trail:**
  - **WHEN** the folder also contains a PNG screenshot and an EXIF-stripped JPEG
  - **THEN** both appear after every dated photo, in natural filename order, and upload successfully
- **Cap:**
  - **WHEN** you drop a 25-photo dated folder
  - **THEN** the 20 earliest are uploaded in order, and the existing notice reports 5 skipped
- **Add Print unchanged:**
  - **WHEN** you use `+ Add Print` with an older photo
  - **THEN** it's appended last
- **Latency check (WebP):**
  - **WHEN** you drop 20 WebP files
  - **THEN** the draft appears within roughly 2 s on a laptop. Record the observed time in `verification.md`.
