## 1. Test Scaffolding (TDD)

- [x] 1.1 Create `src/components/admin/__tests__/captureTime.test.ts` with in-test byte-fixture builders. These build a TIFF block (`II`/`MM`, IFD0 `0x0132`, `0x8769` → Exif IFD `0x9003`/`0x9004`/`0x9291`, inline and offset values) and wrap it as JPEG `APP1`, PNG `eXIf` and WebP `EXIF`.
- [x] 1.2 Write failing `readCaptureTime` tests covering:
  - extraction from all three containers and both byte orders;
  - tag preference `0x9003` > `0x9004` > `0x0132`;
  - `SubSecTimeOriginal` parsing;
  - `null`, without throwing, for every malformed case listed in `tests.md`.
- [x] 1.3 Write failing `compareCapture` / `orderByCaptureTime` tests covering:
  - the `C/A/B` scenario;
  - the sub-second tie (`IMG_3` `.0` → `IMG_10` `.20` → `IMG_2` `.50`);
  - the natural filename tie (`IMG_2` before `IMG_10`);
  - undated files after dated ones;
  - equal names keeping input order;
  - a `readBytes` rejection counting as undated;
  - input not mutated.
- [x] 1.4 Write failing tests for cap interplay (25 shuffled → `splitAlbumCap` keeps the 20 earliest, `overflow === 5`) and for the read budget (JPEG/PNG request `256 KiB`, WebP the full file).
- [x] 1.5 Run `npx vitest run src/components/admin/__tests__/captureTime.test.ts` and confirm it fails because the module is missing.

## 2. Capture-time reader

- [x] 2.1 Implement `src/components/admin/captureTime.ts`: magic-byte sniffing, the JPEG/PNG/WebP container walks (D2) and a bounds-checked TIFF IFD reader, returning `CaptureTime | null` (`{ key: 'YYYYMMDDHHMMSS', subSec }`). Validate the `YYYY:MM:DD HH:MM:SS` shape and reject the all-zero placeholder.
- [x] 2.2 Implement `compareCapture` and `orderByCaptureTime(items, readBytes)`. The comparison order is (D5): dated first, then key, then subSec as a fraction, then `Intl.Collator` numeric/base, then original index. Catch failures per file.
- [x] 2.3 Implement the browser adapter `readCaptureBytes(file: File)`. Sniff 12 bytes, then read the 256 KiB head for JPEG/PNG or the full file for WebP (D3).
- [x] 2.4 Re-run the narrow test file and confirm everything passes.

## 3. Upload wiring

- [x] 3.1 In `src/components/admin/FolderDropzone.tsx` `beginUpload` (~L392–393), replace `splitAlbumCap(group.files, …)` with `splitAlbumCap(await orderByCaptureTime(group.files, readCaptureBytes), MAX_PHOTOS_PER_ALBUM)`. Change nothing else: draft construction, `photoId`s, retries and `uploadPhoto(…, index, …)` stay exactly as they are.
- [x] 3.2 Confirm by reading the code that `AlbumEditor` `+ Add Print` and the upload route are untouched (`git diff --stat` lists only `captureTime.ts`, its test and `FolderDropzone.tsx`).

## 4. Verification & Empirical Audit

- [x] 4.1 Run `npx vitest run` (full suite), `npx tsc --noEmit`, `npx eslint .` and `npm run build`. Confirm they're clean and that the pass count equals the baseline plus the new tests.
- [x] 4.2 Run the `tests.md` manual checks on **local dev only** (`STORAGE_DRIVER=local`, local DB). Never use the preview or production, which share the production Turso database and Bunny storage. Use real JPEGs, a file over 4.0 MiB, undated files, the 25-file cap folder, `+ Add Print`, and the 20-WebP latency check. — **DONE by the orchestrator** on a disposable local DB/storage (port 3211): ordering, mixed undated, 4,291,193-byte JPEG slot, 25→20 cap notice, `+ Add Print` append and 20-WebP timing. Full evidence in `verification.md` › *Orchestrator Local Browser Verification*. Real camera/phone photos remain a maintainer check.
- [x] 4.3 Resolve the `research.md` Unverified assumptions with evidence (real iPhone and camera exports, WebP timing). Move any that turn out wrong to Superseded claims. — Container placement is resolved at the byte level (JPEG fallback fixture, PNG `IDAT`/`eXIf` matrix; see the Assumption audit in `research.md`); iPhone `DateTimeOriginal` and WebP timing remain explicitly marked as needing real-photo confirmation (M1/M6).
- [x] 4.4 Populate `verification.md`: the Requirement Adherence Matrix (every scenario in `specs/gallery-hud-and-curator-ui/spec.md` mapped to a test or manual check), resolved assumptions, a nomenclature audit (glossary terms used in code and comments), and verbatim execution logs.
