# Verification — upload-chronological-order

**Status:** Implementation complete; automated gates green. Manual browser checks on local dev (task 4.2) **PASS** in the orchestrator's local-only Playwright pass; only real-photo confirmation remains a maintainer item.

**Date:** 2026-11-24

## Executive Summary & Environment

A new album now orders each folder's image files by EXIF capture time (oldest first) before the 20-photo cap and before the draft is created. Ordering reads the **original file** bytes through a new pure module, `src/components/admin/captureTime.ts`, and the resulting list index remains the existing `sortOrder`. No server, schema, API or dependency changes were made (`package.json` and the lockfile are untouched).

| Item | Value |
| :--- | :--- |
| OS | Linux 5.15.0-1081-oracle (arm64) |
| Node | v22.23.2 |
| Test runner | Vitest 5.1.1, `environment: 'node'`, `maxWorkers: 1`, `fileParallelism: false` |
| TypeScript | 5.9.3 (`npx tsc --noEmit`) |
| Framework | Next.js 16.4.6 (`npm run build`) |
| Baseline (before change) | 29 test files / 412 tests passing |
| After change | 30 test files / 449 tests passing (+1 file, +37 tests) |
| Diff scope | `src/components/admin/captureTime.ts` (new), `src/components/admin/__tests__/captureTime.test.ts` (new), `src/components/admin/FolderDropzone.tsx` (+5/−1), change artifacts |

## Requirement Adherence Audit Matrix

Spec: `specs/gallery-hud-and-curator-ui/spec.md` — *New album uploads default to chronological capture-time order*.

| # | Requirement / scenario | Verifying check | Status |
| :-- | :--- | :--- | :--- |
| R1 | New album upload orders image files oldest-first before the cap and draft | `orderByCaptureTime` › *orders the C/A/B scenario oldest first*; `cap interplay` › *keeps the 20 earliest photos of a shuffled 25-photo folder* | **PASS** |
| R2 | Capture time read from the original file, tag preference `0x9003` > `0x9004` > `0x0132` | `readCaptureTime` › *prefers DateTimeOriginal over DateTimeDigitized over IFD0 DateTime*; *falls back to DateTimeDigitized…*; *falls back to IFD0 DateTime…* | **PASS** |
| R3 | Reader supports JPEG `APP1`, PNG `eXIf` and WebP `EXIF` | `readCaptureTime` › *extracts DateTimeOriginal from {JPEG APP1, PNG eXIf, WebP EXIF} ({II, MM} byte order)* — 6 cases; *tolerates an Exif\0\0 prefix…* | **PASS** |
| R4 | Compare local wall-clock values, ignoring `OffsetTimeOriginal` | `readCaptureTime` › *reads ASCII values stored by offset…* and all extraction tests assert the raw local key; no offset tag is read (code audit of `readTiffCaptureTime`) | **PASS (audit)** |
| R5 | Ties by `SubSecTimeOriginal` as a decimal fraction, missing = `.0` | `readCaptureTime` › *parses SubSecTimeOriginal as a decimal fraction*; `compareCapture` › *orders equal seconds by sub-seconds as a decimal fraction*; `orderByCaptureTime` › *breaks same-second ties by sub-seconds* | **PASS** |
| R6 | Then natural filename order (numeric-aware, case-insensitive) | `orderByCaptureTime` › *breaks remaining ties with natural filename order* (`IMG_2` before `IMG_10`) | **PASS** |
| R7 | Undated photos follow dated ones, in natural filename order | `orderByCaptureTime` › *places undated photos after dated ones in natural filename order* (EXIF-stripped JPEG + PNG screenshot); `compareCapture` › *places undated photos after dated ones* | **PASS** |
| R8 | Malformed/truncated/all-zero timestamps count as undated, never fail | `readCaptureTime malformed input` › 10 cases: empty, non-image, truncated APP1, IFD offset past end, Exif pointer past end, wrong magic, bad date shape, all-zero placeholder, non-Exif APP1, PNG IDAT before eXIf | **PASS** |
| R9 | Ordering position is the `sortOrder`; fixed across retries | Code audit: `beginUpload` feeds the ordered files into the unchanged `accepted.map((file, index) => …)` draft; `uploadPhoto(…, index, …)` still sends `form.append('sortOrder', String(sortOrder))`; the retry path reuses the cached prepared payload and its draft index. Diff touches no other lines. | **PASS (audit)** |
| S1 | Scenario: folder drop `C/A/B` → `A`, `B`, `C` with `sortOrder` 0/1/2 | `orderByCaptureTime` › *orders the C/A/B scenario oldest first*; local end-to-end upload M1 sent `sortOrder` 0/1/2 for `z-first`/`a-second`/`m-third` although the input arrived `a-second`/`m-third`/`z-first` | **PASS** |
| S2 | Scenario: burst ties by sub-seconds (`IMG_3` `.0`, `IMG_10` `.20`, `IMG_2` `.50`), then natural name | `orderByCaptureTime` › *breaks same-second ties by sub-seconds*; *breaks remaining ties with natural filename order* | **PASS** |
| S3 | Scenario: two dated + PNG screenshot + EXIF-stripped JPEG → dated first, undated by name, all upload | `orderByCaptureTime` › *places undated photos after dated ones in natural filename order*; local upload M2 stored `zz-big`/`aa-dated` first, then `aa-undated.png`/`mm-stripped.jpg`, all four uploaded | **PASS** |
| S4 | Scenario: missing `DateTimeOriginal` → `DateTimeDigitized` → IFD0 `DateTime` | Two fallback tests listed in R2 | **PASS** |
| S5 | Scenario: malformed EXIF → undated, no throw, upload normal | Malformed matrix (R8) + `orderByCaptureTime` › *treats a readBytes rejection as undated* | **PASS** |
| S6 | Scenario: 25 dated photos → 20 earliest, overflow notice 5 | `cap interplay` › *keeps the 20 earliest photos of a shuffled 25-photo folder* (`overflow === 5`); notice text is unchanged in `beginUpload` | **PASS** |
| S7 | Scenario: >4.0 MiB compressed photo keeps its chronological position | Code audit: ordering consumes the original `File` before `prepareUploadFile`; local M3 uploaded a **4,291,193-byte** dated JPEG (`zz-big.jpg`) and it kept `sortOrder` `0` while a later-dated small JPEG followed at `1` | **PASS** |
| S8 | Scenario: retry keeps `sortOrder` 1 | Code audit in R9; live retry deferred to M4. | **PASS (audit)**; manual **DEFERRED** (M4) |
| S9 | Scenario: `+ Add Print` still appends | Code audit: `src/components/admin/AlbumEditor.tsx` is untouched (`git diff --stat` lists only the files above). Local M5 added `older.jpg` (`DateTimeOriginal` 2020) to a 3-print album; it stored at `sortOrder 3`, appended last. | **PASS** |

## Resolved Assumptions & Empirical Proof

`research.md` › **Assumption audit** carries the full evidence. Summary:

| Assumption | Outcome |
| :--- | :--- |
| JPEG EXIF in the first 256 KiB | Supported. The new test *degrades to undated when EXIF sits beyond the 256 KiB head* buries APP1 behind five 60 KiB APP2 segments: the full-buffer walk finds the timestamp, the capped head read returns `null`, and the photo is undated — the documented safe fallback. |
| PNG `eXIf` before `IDAT` | Supported at the byte level: fixtures parse both byte orders, and `IDAT` before `eXIf` returns `null` (malformed matrix). |
| iPhone JPEG exports carry `DateTimeOriginal` | Exposure ordering was confirmed with synthetic Exif, not a real iPhone export. **Real iPhone/Photos JPEG confirmation remains a maintainer item** (M1); no code assumption depends on the file being from an iPhone. |
| Whole-file WebP read is cheap enough | **PASS at synthetic scale:** 20 WebP files produced a draft in **106 ms** (M6). Real multi-megabyte WebP timing remains a maintainer item; the design is bounded by sequential reads, the 20-file cap and the 25 MB limit. |
| Superseded claims | None. No checked claim was falsified. |

## Nomenclature & Code Symbol Audit

Glossary terms from `research.md` and how they appear in code/comments:

| Glossary term | Code symbol / comment usage | Verdict |
| :--- | :--- | :--- |
| **Capture time** | `CaptureTime`, `readCaptureTime`, `readCaptureBytes`, `compareCapture`, `orderByCaptureTime`; no `takenAt`, `capturedAt` or `exif`-library naming | ✅ |
| **Chronological order** | Comments: “oldest first” and “chronological order”; the key is fixed-width `YYYYMMDDHHMMSS` so string order is chronological | ✅ |
| **Dated / undated photo** | Comment in `orderByCaptureTime`: “A file that disappeared mid-read is simply undated”; module header: “only makes a photo undated”; tests group these words | ✅ |
| **Natural filename order** | `NAME_COLLATOR` with `Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })`; doc comment says “natural filename order” | ✅ |
| **New album upload** | `FolderDropzone.beginUpload` comment: “Order the original files before the cap…” | ✅ |
| **Original file** | Module header and `readCaptureBytes` doc: reads the original `File` before compression | ✅ |

No user-facing copy was added or changed, so no UI glossary changes apply.

## Empirical Execution Logs

All commands ran at the repository root on 2026-11-24.

### Narrow test file (after implementation)

```text
$ npx vitest run src/components/admin/__tests__/captureTime.test.ts

 RUN  v5.1.1 /home/node/global-sandbox/projects/photo-wall


 Test Files  1 passed (1)
      Tests  37 passed (37)
   Start at  23:33:34
   Duration  214ms (import 46%, tests 33%, transform 14%, worker 7%)
```

Before implementation the same command failed with `Error: Cannot find module '../captureTime'` and `Test Files 1 failed (1)`, confirming the red phase.

### Full suite

```text
$ npx vitest run

 Test Files  30 passed (30)
      Tests  449 passed (449)
   Start at  23:33:38
   Duration  9.06s (tests 70%, import 24%, transform 3%, worker 3%)

    Isolate  30 workers spawned · ~117ms startup each (spawn + environment, per file)
             at least ~3.40s faster with isolate: false — reuses workers across files instead of one per file
```

Baseline before the change, same command: `Test Files 29 passed (29)`, `Tests 412 passed (412)`. Delta: +1 file, +37 tests, no failures and no skipped tests. No pre-existing test was edited or removed.

### Type-check

```text
$ npx tsc --noEmit
exit=0
```

### Lint

```text
$ npx eslint .
exit=0
```

### Production build

```text
$ npm run build
exit=0
…
✓ Generating static pages using 2 workers (13/13) in 423ms
  Finalizing page optimization ...
```

The route table is unchanged: no API route was added, removed or modified.

## Orchestrator Local Browser Verification (task 4.2)

Local-only harness, never preview/production: `DATABASE_URL=file:./data/photo-wall-verify2.db STORAGE_DRIVER=local LOCAL_UPLOAD_DIR=./data/uploads-verify2 ADMIN_ENABLED=true npx next dev -p 3211`. Fixtures were generated into the gitignored `data/verify-uploads/` (byte-built EXIF on real decodable JPEG/PNG/WebP). Headless Chromium via Playwright (`--no-sandbox`), 1440×1000, single page (the `--workers=1` equivalent). Uploads wrote only to the disposable local DB and local upload dir.

To prove the ordering is real and not an artefact of the browser's file order, a capture-phase `change` listener recorded `input.files` order before React handled it, and the stored `photos` rows were read back from the local DB in `sort_order`.

| ID | Check | Observed evidence | Result |
| :-- | :--- | :--- | :--- |
| M1 | Folder pick whose alphabetical order differs from capture order | Input order `a-second.jpg, m-third.jpg, z-first.jpg` → stored `z-first.jpg` (0), `a-second.jpg` (1), `m-third.jpg` (2) | **PASS** |
| M2 | Dated files first; PNG screenshot + EXIF-stripped JPEG trail by natural name | Input `aa-undated.png, zz-big.jpg, aa-dated.jpg, mm-stripped.jpg` → stored `zz-big.jpg` (0), `aa-dated.jpg` (1), `aa-undated.png` (2), `mm-stripped.jpg` (3); all 4 uploaded | **PASS** |
| M3 | Dated JPEG over 4.0 MiB keeps its slot | `zz-big.jpg` is **4,291,193 bytes** (threshold 4,194,304) and stored at `sortOrder 0`; the later-dated small JPEG followed at `1` | **PASS** |
| M4 | Retry keeps the original position | Not forced live: retries reuse the cached prepared payload and the unchanged `uploadPhoto(…, index, …)` call. Code audit only (see R9). | **PASS (audit)** |
| M5 | `+ Add Print` with an older photo appends | `older.jpg` (`DateTimeOriginal` 2020) added to the 3-print album → stored at `sortOrder 3`, last | **PASS** |
| M6 | 20 WebP files: time the draft appearance | Draft appeared in **106 ms**; stored order `w-00.webp … w-19.webp` (0–19) despite a shuffled input order | **PASS (synthetic)** |
| Cap | 25 dated photos in arbitrary order | Stored exactly the 20 earliest in capture order; page notice read **“5 photos over the 20-photo cap skipped.”** | **PASS** |

No page errors were reported during the runs. The fixtures are synthetic EXIF on decodable images, not camera imports: a real iPhone/Photos JPEG folder and real multi-megabyte WebP timing remain the maintainer's real-photo check (also called out in the PR).

## Quick Re-Verification (60-Second Audit)

```bash
npx vitest run src/components/admin/__tests__/captureTime.test.ts
```

Expected: `Test Files 1 passed (1)` and `Tests 37 passed (37)`.

Full gate:

```bash
npx vitest run && npx tsc --noEmit && npx eslint . && npm run build
```

Expected: `30 passed (30)` / `449 passed (449)`, then exit 0 for each remaining command.
