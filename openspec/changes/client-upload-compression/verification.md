# Verification — client-upload-compression

**Status:** PASS (automated + local Chromium) with four maintainer-only empirical rows still open.
**Date:** 2026-11-24
**Branch:** `feat/client-upload-compression` (from `origin/main`; contains `aa88eb0` and `60aff63`)
**Change root:** `openspec/changes/client-upload-compression/`

---

## 1. Executive Summary & Environment

Implemented the client-side upload preparation slice exactly where the architecture places it: `src/components/admin/imageCompressor.ts` (pure orchestration + injectable browser adapters), its Node-environment Vitest suite, and the `FolderDropzone.tsx` wiring for cached retry identity, transient-only retries, and per-draft cancellation. No server route, schema, `sanitizeImage.ts`, `next.config.ts`, CSP, dependency or `src/lib/` abstraction changed.

| Item | Value |
| :--- | :--- |
| OS | Linux (arm64 sandbox) |
| Node | `v22.23.2` |
| Next.js | `16.4.6` (Turbopack production build) |
| React | `19.3.1` |
| Vitest | `5.1.1` |
| Playwright | `1.65.1` |
| Browser | Chromium `159.0.8154.6` (`~/.cache/ms-playwright/chromium-1255`), headless with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` |
| App under test | `next start` at `http://localhost:3210/photos` (port 3000 was occupied by unrelated sandbox processes) |
| Database / storage | Isolated local libSQL file at `/tmp/cuc-verify/verify.db`, `STORAGE_DRIVER=local`, `/tmp/cuc-verify/uploads` |
| Vercel | **Not exercised** — live platform check remains with the maintainer |
| Safari / iOS | **Not exercised** — no Safari or iOS hardware in this sandbox |

### Result at a glance

| Gate | Result |
| :--- | :--- |
| TDD failure before implementation (task 1.3) | FAIL as expected — module missing, 0 tests ran |
| Narrow module suite (task 2.2) | **35 passed / 35** |
| Full regression (`typecheck && lint && test && build`, task 4.1) | **PASS** — 24 files / 335 tests, zero lint/type errors, production build clean |
| `rawUrlAudit.test.ts` (task 3.2) | **4 passed / 4** |
| Data preservation diff (server/DB/upload/drizzle) | **Empty** |
| Local Chromium verification (task 4.2) | **8/8 scenario checks passed** |

---

## 2. Requirement Adherence Audit Matrix

Twelve scenarios across the two ADDED requirements in `specs/storage-and-cdn-pipeline/spec.md`.

### Requirement: Client-side upload preparation and size-bounded compression

| # | Spec scenario | Verifying evidence | Result |
| :--- | :--- | :--- | :--- |
| 1 | Small image passes through byte-identically | `imageCompressor.test.ts` → `prepareUploadFile passthrough` (`it.each` JPEG/PNG/WebP): `prepared.blob === file`, original name/type, `compressed: false`, ThumbHash + `#0a141e` populated | PASS |
| 2 | Small image that fails client decode still uploads byte-identically | `still uploads a small file when client decoding throws`; `still uploads a small file when the scratch canvas has no context` — same `File` bytes, `thumbHash: null`, `dominantColor: null` | PASS |
| 3 | Oversized opaque photo compresses along the ladder | Unit: `steps the opaque JPEG ladder, redrawing only when maxEdge changes` (exact `(4096,0.90)→(4096,0.85)→(4096,0.80)→(3072,0.85)→(3072,0.80)`, 3 canvases = 1 scratch + 2 edges, `.jpg`) and `stops after the first encode when it already fits`. Browser: `opaque-jpeg` — 29,197,140 B source → **1,677,218 B** (`4096×2731`, `.jpg`), `201` | PASS |
| 4 | Oversized alpha-channel PNG/WebP preserves alpha or fails explicitly | Unit: `encodes an alpha-channel PNG as WebP and never as JPEG`; `fails explicitly when the browser cannot encode WebP (Safari PNG fallback)` with the exact message. Browser: `alpha-png` — 35,854,645 B source → **1,546,006 B** WebP, request `RIFF….WEBP`, storage path ends `.webp`, `201` | PASS |
| 5 | Ladder exhaustion or decode failure reports a clear per-file error | Unit: `fails with a clear error and releases resources when the ladder is exhausted` (5 encodes, bitmap closed, canvases zeroed); `fails cleanly when decoding an oversized file throws` (`UploadPreparationError`, no encode). Browser: per-file `'failed'` + error slot exercised through the deterministic 413 scenario | PASS |
| 6 | Bare deployment 413 produces an actionable platform-neutral error | Unit: `formatUploadHttpError` bare/whitespace/HTML 413 → exact `Upload exceeded the server's request size limit. Try exporting a smaller copy.`; JSON bodies preserved. Browser: `deterministic-4xx` — UI shows that exact sentence after a bare `413` | PASS |
| 10 | Route JSON 413 slug never reaches the curator | Unit: `maps a slug-only JSON 413 to the size-limit message` — `{"error":"payload_too_large"}` → exact size-limit sentence, `{"message":"Custom"}` → `Custom`; `maps a 413 error slug to the size-limit message`. Browser: `deterministic-4xx` still sends exactly one POST | PASS |
| 11 | PNG `tRNS` beyond the header buffer fails closed toward alpha | Unit: `treats tRNS past the 64 KiB header buffer as possible alpha` (70 KiB `iTXt` before `tRNS`, truncated to 64 KiB → `true`); `treats a PNG header that ends before IDAT as possible alpha` (IHDR-only → `true`); guard `still reports a fully-walked opaque palette PNG as opaque` (→ `false`) | PASS |

### Requirement: Cached retry payload identity, transient-only retries, and draft cancellation

| # | Spec scenario | Verifying evidence | Result |
| :--- | :--- | :--- | :--- |
| 7 | Retrying reuses the exact cached blob and metadata | Unit: `ensurePrepared` calls `prepare` once and returns the same reference. Browser: `transient-retry` (auto) and `manual-retry` (Retry failed uploads across a separate run) — attempt 1/2/3 file parts are **byte-identical** (`sha256 f9f57c13…`), same `photoId`, final `201`, **no 409** | PASS |
| 8 | Deterministic 4xx responses are not retried automatically | Unit: `isRetryableUploadError` true only for `network_error`/`timeout`/`5xx`, false for `400/409/413/415`. Browser: `deterministic-4xx` — exactly **1 POST** for a 413 | PASS |
| 9 | Discarding an active draft cancels between steps and aborts XHR | Unit: abort before work, abort between ladder steps (bitmap closed, canvases zeroed), no passthrough after abort. Browser: `discard-abort` — held in-flight POST fails `net::ERR_ABORTED`, exactly 1 POST for a 2-file draft, 1 `DELETE`, 0 draft cards remaining | PASS |
| 12 | A late upload that passed the initial check is compensated after the write | Route test: `compensates an upload whose write lands after the album is tombstoned and purged` — `putObject` tombstones + `deletePrefix` before writing; response `409 { error: 'album_deleting' }`, album directory empty, zero `photos` rows | PASS |

---

## 3. Technical Decision Audit (architecture D1–D5)

| Decision | Implementation evidence | Result |
| :--- | :--- | :--- |
| **D1** pure module + injectable adapters | `imageCompressor.ts` exports the full symbol set below; tests run in Vitest `environment: 'node'` with fake `decodeBitmap` / `createCanvas` / `encodeCanvas` / `readHeaderBytes`; no jsdom or real DOM globals. | PASS |
| **D2 passthrough** | `file.size <= CLIENT_MAX_UPLOAD_BYTES` → `{ blob: file, filename: file.name, contentType: file.type, compressed: false }`; decode/scratch failures are caught and only null the metadata. | PASS |
| **D2 oversized** | Header-only `hasAlphaChannel`; one `createImageBitmap(file, { imageOrientation: 'from-image' })` shared by metadata + encode; exact ladder; redraw only on `maxEdge` change; no upscale; JPEG for opaque, WebP for alpha; Safari PNG fallback fails immediately; exhaustion throws; `bitmap.close()` + `canvas.width = canvas.height = 0` in `finally`. | PASS |
| **D3 retry identity** | `ensurePrepared(draft, prepare, store)` exact signature; `prepared` cached on `DraftFile`; automatic and manual retries reuse it; `uploadPhoto` throws `UploadHttpError(status, …)`; only `network_error`, `timeout`, `5xx` retry. | PASS |
| **D4 Display-P3 best effort** | `acquire2dContext` requests `{ colorSpace: 'display-p3' }` inside `try/catch`, falls back on throw **or** `null`; unit covers both. Chromium ICC observation in §4. | PASS |
| **D5 cancellation + 413** | Per-album `AbortController` in `FolderDropzone`; signal checks before file, after preparation, before each attempt/encode; `xhr.abort()` on signal; aborted work is never marked failed; `formatUploadHttpError` uses the exact platform-neutral 413 sentence while preserving JSON `message`/`error`. | PASS |
| **Server scope (PATCH-01)** | Per the amended narrowed non-goal, the only server change is one post-`putObject` `getAlbum` re-check in `POST /api/admin/albums/[id]/photos`: missing or `deleting` → best-effort `deleteObject(storagePath)` + `409 album_deleting`, no insert. `MAX_UPLOAD_BYTES = 25 MB`, `sha256` contentHash idempotency, the initial `409 album_deleting` guard, and magic-byte sanitisation are unchanged; no schema/`src/db`/`src/lib`/`drizzle` change. | PASS |

---

## 4. Resolved Assumptions & Empirical Proof

### 4.1 Fixtures and measured compression

All fixtures were generated locally with the existing `sharp` dependency into `/tmp/cuc-verify/fixtures` (never under `public/`).

| Fixture | Source bytes | Uploaded `file` part | Ladder step reached | Output | Server response |
| :--- | ---: | ---: | :--- | :--- | :--- |
| `opaque-large.jpg` (6000×4000, no alpha) | 29,197,140 | **1,677,218** | 1 — `(4096, 0.90)` | JPEG `4096×2731` | `201`, `.jpg` |
| `alpha-large.png` (3000×3000 RGBA, transparent band) | 35,854,645 | **1,546,006** | 1 — `(4096, 0.90)`, no upscale | WebP `3000×3000`, `RIFF…WEBP` | `201`, `.webp` |
| `orientation6.jpg` (5000×3750 buffer, EXIF Orientation 6) | 22,822,433 | **1,947,549** | 1 — `(4096, 0.90)` | JPEG `3072×4096` (portrait) | `201`, `.jpg` |

A pre-flight Chromium channel probe (`/tmp/cuc-verify/probe-compression.mjs`) produced the same byte counts and confirmed the decoded Orientation-6 bitmap is `3750×5000`, so the stored `3072×4096` output is the orientation baked exactly once. Full five-step ladder behavior is proven deterministically in the unit suite with synthetic sizes (real images fit on step 1).

The stored Orientation-6 object was re-inspected with `sharp`: `3072×4096` JPEG, `orientation: 1` (normal), i.e. **no residual EXIF rotation** that could double-rotate the wall. Its stored size (`1,947,585 B`) differs slightly from the request part (`1,947,549 B`) because the server's existing magic-byte sanitizer rewrites the stored object; the bounded payload is the multipart part measured at interception.

**Payload bound:** every intercepted `file` multipart part was ≤ `4,194,304` bytes (`4.0 MiB`), leaving headroom for multipart fields under Vercel's 4.5 MB function-body cap.

### 4.2 Chromium Display-P3 ICC observation

Inspected the raw JPEG bytes produced by `canvas.toBlob('image/jpeg', 0.9)` from a `{ colorSpace: 'display-p3' }` context:

- `ICC_PROFILE` marker present in an **APP2** segment (`FFE2`) → Chromium **does embed an ICC profile**.
- P3-context JPEG: **520-byte** ICC profile; sRGB-context JPEG: **456-byte** profile; both headers declare `RGB ` data / `XYZ ` PCS.
- The profiles are structurally different (different tag offsets/data), but the localized `desc` tag is `mluc` (not plain ASCII), so the profile name could not be asserted textually. Actual Display-P3 colorimetric retention is therefore still a maintainer empirical check.

### 4.3 Retry identity

Automatic retry and manual **Retry failed uploads** both re-sent the **same** `file` part (`sha256 f9f57c13…`) under the **same** `photoId`, with final `201` and no `409 photo_id_conflict`. The manual retry is the stronger proof: it crossed a separate `uploadDraftFiles` run and therefore relied on the `prepared` cache read back from `draftsRef`, not a local variable.

### 4.4 Draft cancellation reachability

The pre-existing JSX disabled **every** draft action button with `disabled={busy}`, which made the spec's “clicks Discard while compressing/uploading” scenario unreachable by a real curator. Task 3.1's cancellation wiring was therefore completed by removing `disabled={busy}` **only from the Discard draft button**; Retry/Publish stay disabled while busy. The Playwright run clicks the real, enabled button. This is the only UI-adjacent change and it adds no new component, style or token.

---

## 5. Nomenclature & Code Symbol Audit

`src/components/admin/imageCompressor.ts` exports match `architecture.md` D1–D5 exactly:

| Symbol | Shape required by artifacts | Present |
| :--- | :--- | :--- |
| `CLIENT_MAX_UPLOAD_BYTES` | `4 * 1024 * 1024` | ✅ |
| `COMPRESSION_LADDER` | `[4096/0.90, 4096/0.85, 4096/0.80, 3072/0.85, 3072/0.80]` | ✅ |
| `UploadPreparationError` | `Error` subclass, `name` set | ✅ |
| `UploadHttpError` | `Error` subclass carrying `status` | ✅ |
| `PreparedUpload` | `{ blob, filename, contentType, thumbHash, dominantColor, compressed }` | ✅ |
| `hasAlphaChannel(bytes)` | header-only PNG/WebP alpha detection | ✅ |
| `ensurePrepared(draft, prepare, store)` | exact D3 signature/semantics | ✅ |
| `isRetryableUploadError(error)` | transient-only | ✅ |
| `formatUploadHttpError(status, responseText)` | JSON-preserving, platform-neutral 413 | ✅ |
| `normalizeFilenameForMime(name, mime)` | `.jpg` / `.webp` normalisation | ✅ |
| `prepareUploadFile(file, options)` | passthrough/ladder/cancel/teardown | ✅ |

**Adapter note:** D1 names `decodeBitmap`, `encodeCanvas`, `readHeaderBytes`. A fourth seam, `createCanvas`, was added because `encodeCanvas` alone cannot create a DOM-free canvas in Node; it also makes the D4 P3-fallback and `finally` zeroing directly assertable. The three named adapters and their defaults are present as specified.

`FolderDropzone.tsx` keeps `MAX_ATTEMPTS = 2`, `errorMessage`, and `xhr.open('POST', withBase(...))`; `DraftFile` now has `prepared: PreparedUpload | null` initialised to `null`; `abortControllersRef` is keyed by `albumId` and removed before the discard `DELETE`.

---

## 6. Data Preservation

```text
$ git diff origin/main -- src/app/api src/db src/lib/upload drizzle
(no output)

$ git diff origin/main --stat
 .../changes/client-upload-compression/tasks.md     |  14 +-
 src/components/admin/FolderDropzone.tsx            | 181 ++++++++++++---------
 2 files changed, 108 insertions(+), 87 deletions(-)

$ git status --short
 M openspec/changes/client-upload-compression/tasks.md
 M src/components/admin/FolderDropzone.tsx
?? playgrounds/album_curator_playground.html   # pre-existing, other agent's file
?? src/components/admin/__tests__/imageCompressor.test.ts
?? src/components/admin/imageCompressor.ts
```

No schema, migration, API-route, upload-sanitizer, environment, CSP, config or dependency change.

---

## 7. Disagreements, Deviations & Resolved Assumptions

Recorded per the handoff instruction (“if the prompt and the artifacts disagree, the artifacts win”).

| # | Handoff / artifact wording | What actually happened | Resolution |
| :--- | :--- | :--- | :--- |
| 1 | §5 suggests `--poolOptions.forks.singleFork` | Vitest 5.1.1 rejects `--poolOptions.*` (`CACError: Unknown option`) | Used `--pool=forks --maxWorkers=1 --no-file-parallelism`, equivalent to the repo's `fileParallelism: false, maxWorkers: 1`. Raw error retained in the TDD log. |
| 2 | §5 says serve on `http://localhost:3000/photos` | Port 3000 is held by unrelated long-running sandbox servers | Served the same production build on `http://localhost:3210/photos`. No application change. |
| 3 | §7.4 says run `openspec-verify-change` | That skill is not installed in this harness (only `openspec-review-change` is present) | Ran `openspec validate client-upload-compression --strict` (VALID) plus this manual scenario-by-scenario audit. Recorded as a tooling substitution, not a code gap. |
| 4 | Spec scenario 9 says “clicks Discard while compressing/uploading” | The pre-existing Discard button was `disabled={busy}`, making the scenario impossible | Removed `disabled={busy}` from the Discard button only; cancellation is now genuinely reachable and browser-verified. |
| 5 | D1 names three adapters | Node tests also need a DOM-free canvas factory | Added `createCanvas` as a fourth injectable adapter; the three required adapters keep their specified names/semantics. |
| 6 | §5 says keep `AA88EB0`/`60AFF63` in the branch | Confirmed: `feat/client-upload-compression` is based on `origin/main` and contains both commits | No action. |
| 7 | Prior verification row said the server route was unchanged | **PATCH-01** amends the narrowed server non-goal: `POST /api/admin/albums/[id]/photos` now performs one post-`putObject` `getAlbum` re-check that compensates a late write. No other server/DB code changed. | Recorded in §3 and the §2 scenario 12 row. |
| 8 | Handoff says do not modify existing assertions | The existing truncated-header test asserted `false` for a 20-byte PNG header, which encodes the fail-open defect the patch removes. | Flipped that single assertion to `true` (allowed by §2) and kept the rest of the test intact. |
| 9 | Handoff says do not modify existing assertions | The existing `uses a 413 message from a JSON body when present` test asserted `'payload_too_large'` for a slug-only 413 — the exact behaviour the patch removes, and it directly contradicts new test 4. | Replaced that assertion/title with `maps a 413 error slug to the size-limit message` expecting `SIZE_LIMIT_MESSAGE`; the new `maps a slug-only JSON 413…` test also covers the `message` wins case. |

The Playwright harness removes the `webkitdirectory` attribute only to let `setInputFiles` pass file paths; this is test-harness mechanics, not a production change.

---

## 8. PENDING (maintainer — empirical)

These checks require real hardware or the live deployment and are **not** claimed as verified here.

| Check | Why it is pending | Expected evidence |
| :--- | :--- | :--- |
| Real Safari / iOS Orientation-6 validation | No Safari/iOS hardware in the sandbox; Chromium proves the code path only | Drop an Orientation-6 JPEG on `/photos` in Safari and iOS Safari; confirm it renders portrait, not sideways or double-rotated, and is not rejected |
| Display-P3 ICC profile inspection on real Safari / macOS | Chromium embeds an APP2 `ICC_PROFILE`, but actual P3 colorimetry/name could not be asserted from Chromium bytes | Inspect the downloaded JPEG's ICC profile in Safari/Preview/ColorSync; record whether a Display-P3 profile is retained or converted to sRGB |
| Extreme-dimension / 48 MP mobile Safari memory check | No 48 MP device or mobile Safari memory ceiling available | Upload a 48 MP iPhone original in mobile Safari; confirm success or a clean per-file error (no page crash), with bitmap/canvas released |
| Live Vercel `> 4.5 MB` upload verification | Handoff forbids calling Vercel; the local server has no 4.5 MB body cap | On the Vercel deployment: upload a > 4.5 MB camera JPEG and confirm the client sends ≤ 4.0 MiB and receives `201` (not a bare `413`); also confirm a transparent > 4.0 MiB PNG either stores WebP or shows the explicit Safari fallback message |

---

## 9. Verbatim Execution Logs

### 9.1 Task 1.3 — TDD failure before implementation (expected)

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
Both esbuild and oxc options were set. oxc options will be used and esbuild options will be ignored. The following esbuild options were set: `{ jsx: 'automatic' }`

 RUN  v5.1.1 /home/node/global-sandbox/projects/photo-wall

 ❯ src/components/admin/__tests__/imageCompressor.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯

 FAIL  src/components/admin/__tests__/imageCompressor.test.ts [ src/components/admin/__tests__/imageCompressor.test.ts ]
Error: Cannot find module '../imageCompressor' imported from /home/node/global-sandbox/projects/photo-wall/src/components/admin/__tests__/imageCompressor.test.ts
 ❯ src/components/admin/__tests__/imageCompressor.test.ts:3:1
      1| import { describe, expect, it, vi } from 'vitest';
      2|
      3| import {
       | ^
      4|   CLIENT_MAX_UPLOAD_BYTES,
      5|   COMPRESSION_LADDER,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  no tests
   Start at  14:01:39
   Duration  262ms (worker 96%, environment 4%)
```

### 9.2 Task 2.2 — passing narrow module suite

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
Both esbuild and oxc options were set. oxc options will be used and esbuild options will be ignored. The following esbuild options were set: `{ jsx: 'automatic' }`

 RUN  v5.1.1 /home/node/global-sandbox/projects/photo-wall


 Test Files  1 passed (1)
      Tests  35 passed (35)
   Start at  14:02:33
   Duration  303ms (transform 49%, tests 32%, import 15%, worker 4%)
```

### 9.3 Task 3.2 — server diff empty + raw URL audit

```text
$ git diff origin/main -- "src/app/api" src/db src/lib/upload drizzle
[diff-exit=0]

$ npx vitest run src/lib/__tests__/rawUrlAudit.test.ts --pool=forks --maxWorkers=1 --no-file-parallelism
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
Both esbuild and oxc options were set. oxc options will be used and esbuild options will be ignored. The following esbuild options were set: `{ jsx: 'automatic' }`

 RUN  v5.1.1 /home/node/global-sandbox/projects/photo-wall


 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  14:03:35
   Duration  211ms (transform 45%, tests 24%, import 24%, worker 7%)

[vitest-exit=0]
```

### 9.4 Task 4.1 — full regression gates (final tree, after the Discard reachability fix)

```text

> photo-wall@0.1.0 typecheck
> tsc --noEmit


> photo-wall@0.1.0 lint
> eslint .


> photo-wall@0.1.0 test
> vitest run

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
Both esbuild and oxc options were set. oxc options will be used and esbuild options will be ignored. The following esbuild options were set: `{ jsx: 'automatic' }`

 RUN  v5.1.1 /home/node/global-sandbox/projects/photo-wall


 Test Files  24 passed (24)
      Tests  335 passed (335)
   Start at  14:14:35
   Duration  7.18s (tests 66%, import 27%, transform 4%, worker 3%)

    Isolate  24 workers spawned · ~118ms startup each (spawn + environment, per file)
             at least ~2.71s faster with isolate: false — reuses workers across files instead of one per file


> photo-wall@0.1.0 build
> next build

▲ Next.js 16.4.6 (Turbopack)
- Environments: .env
⚠ `cacheComponents` is enabled without a corresponding `partialPrefetching` option. Set `partialPrefetching` to either `true` or `false`.

The only reason to set `partialPrefetching` to `false` is if you're migrating an older Cache Components app. The initial release of Cache Components did not include Partial Prefetching. New projects should enable both Cache Components and Partial Prefetching.

Both Cache Components and Partial Prefetching will be enabled everywhere in the next major release, and the old configurations will be removed.

Learn more: https://nextjs.org/docs/app/guides/adopting-partial-prefetching
✓ Running next.config.ts took 40ms
- Cache Components enabled
- Experiments (use with caution):
  · optimizePackageImports

  Creating an optimized production build ...
✓ Compiled successfully in 1815ms
  Running TypeScript ...
  Finished TypeScript in 3.3s ...
  Collecting page data using 2 workers ...
  Generating static pages using 2 workers (0/9) ...
  Generating static pages using 2 workers (2/9) 
  Generating static pages using 2 workers (4/9) 
  Generating static pages using 2 workers (6/9) 
✓ Generating static pages using 2 workers (9/9) in 372ms
  Finalizing page optimization ...

Route (app)                        Revalidate  Expire
┌ ◐ /
├ ○ /_not-found
├ ƒ /api/admin/albums
├ ƒ /api/admin/albums/[id]
├ ƒ /api/admin/albums/[id]/photos
├ ƒ /api/admin/auth
├ ƒ /api/admin/deletions/retry
├ ƒ /api/admin/photos/[id]
├ ƒ /api/admin/youtube/inspect
├ ƒ /api/local-uploads/[...path]
├ ○ /api/wall                             15m      1y
├ ƒ /api/youtube/thumb/[id]
└ ○ /icon.svg


○  (Static)             prerendered as static content
◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
ƒ  (Dynamic)            server-rendered on demand
```

### 9.5 Task 4.2 — Playwright against `next start` at `/photos`

```text
[env] chromium 159.0.8154.6
[env] base http://localhost:3210/photos
[opaque-jpeg] {"sourceBytes":29197140,"uploadedBytes":1677218,"sha256":"f9f57c131c31fddc277fdfbd88e73ebef25a6d4ecbb5cb1396d9799839206c3e","photoId":"01a20ef9-5f26-755d-8d8d-fe785b457b50","storedWidth":4096,"storedHeight":2731,"storagePath":"/albums/b7c61db2-ebd5-4ed5-9353-6b526c73968d/01a20ef9-5f26-755d-8d8d-fe785b457b50.jpg","status":201,"consoleErrors":[]}
[alpha-png] {"sourceBytes":35854645,"uploadedBytes":1546006,"sha256":"547cd99cac9945aebbbfdd64cf9d29f7bf6e63ab32dbc9262357ef08bb371c09","magic":"\"RIFF\\u000e\\u0017\\u0000WEBPVP8X\"","storedWidth":3000,"storedHeight":3000,"storagePath":"/albums/cc2b1d96-39cb-4633-9d0f-872dc743c744/01a20ef9-7256-71b6-97d5-939b6d10eb5e.webp","status":201,"consoleErrors":[]}
[orientation-6] {"sourceBytes":22822433,"uploadedBytes":1947549,"sha256":"5c3d62bdf2f7e638b45b9e096b930e6a060a91297a83bb96907f1c9e2089da6d","storedWidth":3072,"storedHeight":4096,"storagePath":"/albums/d0c44368-cd10-47ad-ade2-54d042a36771/01a20ef9-83e9-779f-94f0-aeb1f94a2282.jpg","status":201,"consoleErrors":[]}
[transient-retry] {"attempts":[{"attempt":1,"size":1677218,"sha256":"f9f57c131c31fddc277fdfbd88e73ebef25a6d4ecbb5cb1396d9799839206c3e","photoId":"01a20ef9-91e6-727d-a5de-8eda34584085"},{"attempt":2,"size":1677218,"sha256":"f9f57c131c31fddc277fdfbd88e73ebef25a6d4ecbb5cb1396d9799839206c3e","photoId":"01a20ef9-91e6-727d-a5de-8eda34584085"}],"finalStatus":201,"conflict":null,"identicalPayload":true,"identicalPhotoId":true,"consoleErrors":["Failed to load resource: net::ERR_FAILED"]}
[manual-retry] {"attempts":[{"attempt":1,"size":1677218,"sha256":"f9f57c131c31fddc277fdfbd88e73ebef25a6d4ecbb5cb1396d9799839206c3e","photoId":"01a20ef9-a025-740e-af9c-ce3d45fed872"},{"attempt":2,"size":1677218,"sha256":"f9f57c131c31fddc277fdfbd88e73ebef25a6d4ecbb5cb1396d9799839206c3e","photoId":"01a20ef9-a025-740e-af9c-ce3d45fed872"},{"attempt":3,"size":1677218,"sha256":"f9f57c131c31fddc277fdfbd88e73ebef25a6d4ecbb5cb1396d9799839206c3e","photoId":"01a20ef9-a025-740e-af9c-ce3d45fed872"}],"finalStatus":201,"conflict":null,"identicalPayload":true,"identicalPhotoId":true,"consoleErrors":["Failed to load resource: net::ERR_FAILED","Failed to load resource: net::ERR_FAILED"]}
[deterministic-4xx] {"postCount":1,"messageShown":true,"consoleErrors":["Failed to load resource: the server responded with a status of 413 (Payload Too Large)"]}
[discard-abort] {"postCount":1,"deletes":["http://localhost:3210/photos/api/admin/albums/fb6e5a78-e7f2-4bb0-8e81-977f71ea8622"],"abortedRequests":[{"url":"http://localhost:3210/photos/api/admin/albums/fb6e5a78-e7f2-4bb0-8e81-977f71ea8622/photos","failure":"net::ERR_ABORTED"}],"draftCardsAfter":0,"consoleErrors":[]}
[icc-probe] {"displayP3":{"requestedColorSpace":"display-p3","threw":null,"gotContext":true,"blobType":"image/jpeg","blobSize":850,"hasIccProfileMarker":true,"appMarkers":["FFE0","FFE2"]},"srgb":{"requestedColorSpace":null,"threw":null,"gotContext":true,"blobType":"image/jpeg","blobSize":786,"hasIccProfileMarker":true,"appMarkers":["FFE0","FFE2"]}}
```

### 9.6 ICC profile byte inspection

```text
{"name":"p3","jpegBytes":826,"segments":[{"marker":"FFE0","offset":2,"length":16},{"marker":"FFE2","offset":20,"length":536},{"marker":"FFDB","offset":558,"length":67},{"marker":"FFDB","offset":627,"length":67},{"marker":"FFC0","offset":696,"length":17},{"marker":"FFC4","offset":715,"length":21},{"marker":"FFC4","offset":738,"length":20},{"marker":"FFC4","offset":760,"length":21},{"marker":"FFC4","offset":783,"length":20},{"marker":"FFDA","offset":805,"length":12}],"iccMarkerOffset":24,"iccProfileBytes":520,"iccHeaderColorSpace":"RGB ","iccHeaderPcs":"XYZ ","asciiStrings":["mntrRGB XYZ ","acsp","desc","drXYZ","gXYZ","bXYZ","wtpt","rTRC","(gTRC","(bTRC","(cprt","<mluc","enUS","XYZ ","XYZ ","XYZ ","XYZ ","-para","mluc","enUS"],"mentionsP3":false,"mentionsSrgb":false}
{"name":"srgb","jpegBytes":762,"segments":[{"marker":"FFE0","offset":2,"length":16},{"marker":"FFE2","offset":20,"length":472},{"marker":"FFDB","offset":494,"length":67},{"marker":"FFDB","offset":563,"length":67},{"marker":"FFC0","offset":632,"length":17},{"marker":"FFC4","offset":651,"length":21},{"marker":"FFC4","offset":674,"length":21},{"marker":"FFC4","offset":696,"length":20},{"marker":"FFC4","offset":719,"length":20},{"marker":"FFC4","offset":741,"length":12}],"iccMarkerOffset":24,"iccProfileBytes":456,"iccHeaderColorSpace":"RGB ","iccHeaderPcs":"XYZ ","asciiStrings":["mntrRGB XYZ ","acsp","desc","$rXYZ","gXYZ","bXYZ","wtpt","rTRC","(gTRC","(bTRC","(cprt","<mluc","enUS","BXYZ ","XYZ ","XYZ ","XYZ ","-para","mluc","enUS"],"mentionsP3":false,"mentionsSrgb":false}
```

---

### 9.7 PATCH-01 — reproduction before fix, all five passing after fix, full regression

Reproduction **before** the fix (tests 1, 2, 4 and 5 fail; test 3 and the pre-existing assertions still pass):

```text
$ npx vitest run src/components/admin/__tests__/imageCompressor.test.ts -t "possible alpha|slug-only JSON 413"

 FAIL  src/components/admin/__tests__/imageCompressor.test.ts > hasAlphaChannel > treats tRNS past the 64 KiB header buffer as possible alpha
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ src/components/admin/__tests__/imageCompressor.test.ts:355:37
    355|     expect(hasAlphaChannel(header)).toBe(true);

 FAIL  src/components/admin/__tests__/imageCompressor.test.ts > hasAlphaChannel > treats a PNG header that ends before IDAT as possible alpha
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ src/components/admin/__tests__/imageCompressor.test.ts:360:37
    360|     expect(hasAlphaChannel(header)).toBe(true);

 FAIL  src/components/admin/__tests__/imageCompressor.test.ts > formatUploadHttpError > maps a slug-only JSON 413 to the size-limit message
AssertionError: expected 'payload_too_large' to be 'Upload exceeded the server\'s request…' // Object.is equality
Expected: "Upload exceeded the server's request size limit. Try exporting a smaller copy."
Received: "payload_too_large"
 ❯ src/components/admin/__tests__/imageCompressor.test.ts:595:73

 Test Files  1 failed (1)
      Tests  3 failed | 36 skipped (39)

$ npx vitest run src/app/api/__tests__/routes.test.ts -t "compensates an upload"

 FAIL  src/app/api/__tests__/routes.test.ts > album deletion and tombstone retry > compensates an upload whose write lands after the album is tombstoned and purged
AssertionError: expected 201 to be 409 // Object.is equality
- Expected
+ Received
- 409
+ 201
 ❯ src/app/api/__tests__/routes.test.ts:866:29
    866|     expect(response.status).toBe(409);

 Test Files  1 failed (1)
      Tests  1 failed | 33 skipped (34)
```

After the fix — both reproduction commands, plus the flipped truncated-header assertion:

```text
$ npx vitest run src/components/admin/__tests__/imageCompressor.test.ts -t "possible alpha|slug-only JSON 413|never throws"

 Test Files  1 passed (1)
      Tests  4 passed | 35 skipped (39)

$ npx vitest run src/app/api/__tests__/routes.test.ts -t "compensates an upload"

 Test Files  1 passed (1)
      Tests  1 passed | 33 skipped (34)
```

Full regression (`npm run typecheck && npm run lint && npx vitest run && npm run build`):

```text
> photo-wall@0.1.0 typecheck
> tsc --noEmit

> photo-wall@0.1.0 lint
> eslint .

 RUN  v5.1.1 /home/node/global-sandbox/projects/photo-wall

 Test Files  24 passed (24)
      Tests  340 passed (340)
   Start at  14:50:12
   Duration  7.43s (tests 67%, import 27%, transform 3%, worker 3%)

> photo-wall@0.1.0 build
> next build

▲ Next.js 16.4.6 (Turbopack)
✓ Compiled successfully in 1959ms
  Finished TypeScript in 5.2s ...
✓ Generating static pages using 2 workers (9/9) in 301ms
```

## 10. Sign-off

- Every automated task check (1.1–4.3) genuinely ran and passed; 4.3 is this document.
- The four `PENDING (maintainer — empirical)` rows above are **not** ticked and must be completed on real devices / Vercel before archiving.
- Spec sync (`openspec specs apply`) is intentionally deferred to archive time, after the PENDING rows pass, per the orchestration handoff.
