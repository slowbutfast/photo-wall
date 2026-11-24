# OpenCode Orchestration Handoff: OpenSpec Change 'client-upload-compression'

You are the orchestration agent for OpenSpec change 'client-upload-compression' running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

Read these before delegating anything, and pass the relevant ones to `spec-coder-sub`: `openspec/changes/client-upload-compression/{proposal,research,architecture,design,tests,tasks}.md` and `specs/storage-and-cdn-pipeline/spec.md`. `architecture.md` D1–D5 is the authoritative design. If this prompt and the artifacts disagree, the artifacts win. Record the disagreement in `verification.md`.

## 1. Orchestration Directive
- **Change Name**: client-upload-compression
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub client-upload-compression`)
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). All new logic lives in the admin upload slice (`src/components/admin/`). Do not create shared `src/lib/` abstractions for it.
- **Branch**: work on `feat/client-upload-compression`, created from `origin/main`. It must contain `aa88eb0` (portfolio-subpath-deploy archived) and `60aff63` (these artifacts). If `origin/main` lacks `60aff63`, stop and tell the maintainer to push `main` first.
- **Why this exists**: on Vercel, function request bodies over 4.5 MB are rejected with a bare 413 before the route runs, so real camera/iPhone JPEGs can't be uploaded. The wall never serves more than a 2048 px long edge (`LOD_BUCKETS = [256, 800, 2048]`), so compressing oversized files client-side to ≤ 4.0 MiB at ≤ 4096 px loses nothing visible.

## 2. Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/components/admin/imageCompressor.ts` | `[NEW]` | Pure module (D1). Exports `CLIENT_MAX_UPLOAD_BYTES = 4 * 1024 * 1024`, `COMPRESSION_LADDER` (`4096/0.90`, `4096/0.85`, `4096/0.80`, `3072/0.85`, `3072/0.80`), `UploadPreparationError`, `UploadHttpError` (carries `status`), `PreparedUpload` (`blob`, `filename`, `contentType`, `thumbHash`, `dominantColor`, `compressed`), `hasAlphaChannel(bytes)`, `ensurePrepared(draft, prepare, store)` (exact signature in D3), `isRetryableUploadError(error)`, `formatUploadHttpError(status, responseText)`, `normalizeFilenameForMime(name, mime)` and `prepareUploadFile(file, options)`. Browser APIs go behind injectable adapters (`decodeBitmap`, `encodeCanvas`, `readHeaderBytes`) whose defaults use `createImageBitmap` / `<canvas>`. The ThumbHash + dominant-colour math moves here from `FolderDropzone.tsx` unchanged. |
| `src/components/admin/__tests__/imageCompressor.test.ts` | `[NEW]` | Vitest in the **`node`** environment (`vitest.config` sets `environment: 'node'`; there is no jsdom). Drive every branch through fake adapters. `File`/`Blob` are native in Node. Hand-build header fixtures as byte arrays: PNG IHDR colour types 2/4/6, PNG with `tRNS`, WebP `VP8 ` / `VP8X` (alpha bit `0x10` set and clear) / `VP8L` (alpha bit 28 set and clear), JPEG. |
| `src/components/admin/FolderDropzone.tsx` | `L32-L40` | Add `prepared: PreparedUpload \| null` to `DraftFile`, and initialise it to `null` where draft files are created (around `L396`, next to `photoId: uuidv7()`). |
| `src/components/admin/FolderDropzone.tsx` | `L73-L147` | Delete `prepareThumbhash` (`L101-L147`) and its helpers once they've moved into `imageCompressor.ts`. Keep `MAX_ATTEMPTS = 2` and `errorMessage`. `errorMessage` must render `UploadPreparationError` / `UploadHttpError` messages as-is. |
| `src/components/admin/FolderDropzone.tsx` | `L149-L190` | `uploadPhoto` takes the `PreparedUpload` and an `AbortSignal`. It appends `prepared.blob` under `prepared.filename` (`L182`). On `abort`, it calls `xhr.abort()` and rejects with an abort error. On a non-2xx response it throws an `UploadHttpError` built through `formatUploadHttpError(status, responseText)`. Keep `xhr.open('POST', withBase(...))` exactly as it is now. |
| `src/components/admin/FolderDropzone.tsx` | `L283-L329` | `uploadDraftFiles` replaces `prepareThumbhash(current.file)` (`L300`) with `ensurePrepared(current, (f) => prepareUploadFile(f, { signal }), (p) => updateFile(albumId, current.key, (file) => ({ ...file, prepared: p })))`. Read `current` from `draftsRef.current` so a cached `prepared` from an earlier run is seen. Inner retry loop: break immediately unless `isRetryableUploadError(error)`. Check `signal.aborted` before each file and stop the loop when it's set. An abort must not mark the remaining files `'failed'`. |
| `src/components/admin/FolderDropzone.tsx` | `L228-L236`, `L350-L370`, `L536-L543` | Add `abortControllersRef = useRef(new Map<string, AbortController>())`, keyed by `albumId`. Create or replace the controller when `uploadDraftFiles` starts, including through `retryDraft`. `discardDraft` calls `controller.abort()` and removes the entry **before** its existing `DELETE` fetch. |
| `src/app/api/admin/albums/[id]/photos/route.ts` | — | **Read-only.** Confirm nothing in it changes (task 3.2). |
| `openspec/changes/client-upload-compression/verification.md` | `[NEW]` | Created in task 4.3. Section list in §7. |

No other files. Specifically, no changes to `sanitizeImage.ts`, the DB, any API route, `next.config.ts`, the CSP or `package.json`.

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions** (from `architecture.md`):
  - **D1:** one pure module with injectable browser adapters. Tests never touch real DOM globals.
  - **D2, passthrough:** files `≤ CLIENT_MAX_UPLOAD_BYTES` upload **byte-identically**: the same `File` instance, name and type. Decoding is best-effort and only feeds ThumbHash. If `createImageBitmap` is missing or throws, they still upload, with `thumbHash: null` and `dominantColor: null`. A small file must never end up `'failed'` because of client decoding.
  - **D2, oversized:** check alpha from the **file header only** with `hasAlphaChannel` (never a pixel scan). Decode once with `{ imageOrientation: 'from-image' }`, compute ThumbHash from that same bitmap, then step through the ladder, redrawing only when `maxEdge` changes. Never upscale: the long edge is `min(source, maxEdge)`.
    - Opaque files encode as `image/jpeg` with a `.jpg` name.
    - Files whose header has an alpha channel encode as `image/webp` with a `.webp` name.
    - If `blob.type !== 'image/webp'` (Safari falls back to PNG), fail with the exact message from D2.
    - If the ladder runs out, throw `UploadPreparationError`.
    - `bitmap.close()` and `canvas.width = canvas.height = 0` always run in `finally`.
  - **D3:** `ensurePrepared` caches `PreparedUpload` on the `DraftFile`. Both automatic retries and **Retry failed** resend the exact cached blob with the same `photoId`. Only `network_error`, `timeout` and 5xx are retried automatically. Never retry 400/409/413/415.
  - **D4:** request `getContext('2d', { colorSpace: 'display-p3' })` inside `try/catch`, falling back to plain `getContext('2d')` on a throw or `null`.
  - **D5:**
    - Abort works per draft. The signal is checked between steps, because it can't interrupt an active `createImageBitmap` / `toBlob`.
    - A bare or non-JSON 413 produces exactly `"Upload exceeded the server's request size limit. Try exporting a smaller copy."`.
    - JSON error bodies keep their `message` / `error`.
  - **Server stays unchanged:** `MAX_UPLOAD_BYTES = 25 MB`, sha256 idempotency and the `409 album_deleting` tombstone are the defense in depth.
- **Hard Exclusions / No-Go**:
  - Do NOT modify `.env`, `.env.*` or credential files. For local runs, pass the needed vars on the command line (see §5).
  - Do NOT add dependencies: no `browser-image-compression`, WASM codecs or workers (research.md → Candidate tech).
  - Do NOT change server routes, the schema, `sanitizeImage.ts`, `next.config.ts` or the CSP.
  - Do NOT change code outside the Target Context Map without task coverage.
  - Do NOT implement the deferred `createImageBitmap({ resizeWidth })` optimisation, or Web Worker offload. Both are explicitly deferred.
  - Do NOT touch `playgrounds/` (another agent owns `album_curator_playground.html` and `photo_wall_playground.html`), `openspec/changes/admin-route-isolation/`, or any other change directory.
  - Do NOT call Vercel, Turso or Bunny, or make requests to `*.vercel.app`, `*.turso.io` or `*.b-cdn.net`. The live Vercel check belongs to the maintainer.
  - Every new or changed root-relative client URL goes through `withBase` (`src/lib/basePath.ts`). `src/lib/__tests__/rawUrlAudit.test.ts` enforces this.

## 4. Visual & UI Design Specifications & Vision Verification
- **Status: Non-visual / Client-pipeline change.** No new components, layout, styling or CSS tokens. Per-file errors render through the existing `DraftFile.error` slot (`.admin-error` / `.admin-draft-status`). Do NOT generate UI components or CSS rules.

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: Vitest. Narrow run: `npx vitest run src/components/admin/__tests__/imageCompressor.test.ts`.
- **Full gates** (task 4.1 only): `npm run typecheck && npm run lint && npm test && npm run build`.
- **TDD Requirement**: Task group 1 MUST scaffold failing tests before any implementation. Confirm they fail (task 1.3), and keep the failing output for `verification.md`.
- **Resource & Concurrency Rules**:
  - While implementing a task, run ONLY the narrowest test file for the code you changed. No full discovery or browser E2E per checkbox.
  - Run Vitest **directly** (`npx vitest run …`), not through `safe-test`. The wrapper runs out of memory on this suite (recorded in `portfolio-subpath-deploy`). Where possible, use `--pool=forks --poolOptions.forks.singleFork` to serialise.
- **Local browser verification (task 4.2)**:
  - Build, then serve with `next start` under `/photos`. Use `http://localhost:3000/photos`, not `127.0.0.1`.
  - Pass env inline, for example `STORAGE_DRIVER=local ADMIN_PASSWORD=<16+ chars> AUTH_SECRET=<random> npm run start`. Never write it to a `.env*` file.
  - Headless Chromium in this sandbox needs the SwiftShader flags `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
  - Generate fixtures locally with `sharp` (already a dependency), for example a > 4 MiB noisy 6000×4000 JPEG, an Orientation-6 JPEG and a > 4 MiB RGBA PNG. Put them under the change directory's `parity/` or your scratch space, never under `public/`.
  - Simulate transient failures with Playwright `page.route` (abort the first POST, then let the retry through). Assert that the retried request body's sha256 matches the first attempt's and that the response isn't 409.
  - Next has no 4.5 MB body cap locally. Prove the size bound by asserting the intercepted request's `file` part is ≤ 4,194,304 bytes.

## 6. Implementation Task Checklist
- [ ] 1.1 Scaffold failing `src/components/admin/__tests__/imageCompressor.test.ts` covering:
  - byte-identical passthrough at or under `CLIENT_MAX_UPLOAD_BYTES = 4 * 1024 * 1024` (JPEG, PNG, WebP), with ThumbHash/dominantColor;
  - a small file whose decode fails, still passing through byte-identically with `null` ThumbHash/dominantColor;
  - exact header-based alpha detection with `hasAlphaChannel`: PNG IHDR 4/6, PNG `tRNS`, opaque PNG, WebP `VP8X` alpha, WebP `VP8L` alpha, opaque WebP, JPEG;
  - the opaque oversized ladder `(4096, 0.90)` → `(4096, 0.85)` → `(4096, 0.80)` → `(3072, 0.85)` → `(3072, 0.80)`, with `.jpg` normalisation;
  - the alpha-channel WebP ladder (`.webp`), and explicit failure when over the cap or when WebP is unsupported (Safari's PNG fallback);
  - the Display-P3 context falling back to sRGB;
  - `bitmap.close()` and canvas zeroing on success, on failure, and on `AbortSignal` cancellation between steps;
  - platform-neutral `HTTP 413` formatting.
- [ ] 1.2 In `imageCompressor.test.ts`, add failing unit tests for:
  - `ensurePrepared`: caches `PreparedUpload` once on the draft entry and never calls `prepare` again on later calls;
  - `isRetryableUploadError`: retries `network_error`, `timeout` and `5xx`, and does not retry `400`, `409`, `413` or `415`.
- [ ] 1.3 Run `npx vitest run src/components/admin/__tests__/imageCompressor.test.ts` and confirm the scaffolded tests fail before implementation.
- [ ] 2.1 Implement `src/components/admin/imageCompressor.ts`:
  - Exports: `CLIENT_MAX_UPLOAD_BYTES`, `COMPRESSION_LADDER`, `UploadPreparationError`, `UploadHttpError`, `PreparedUpload`, `hasAlphaChannel(bytes)`, `ensurePrepared`, `isRetryableUploadError`, `formatUploadHttpError(status, responseText)`, `normalizeFilenameForMime(name, mime)` and `prepareUploadFile(file, options)`.
  - `prepareUploadFile` behaviour:
    - small-file passthrough that tolerates decode failures;
    - exact header-based alpha detection;
    - a single `createImageBitmap(file, { imageOrientation: 'from-image' })` decode, shared by ThumbHash/dominant-colour extraction and compression;
    - best-effort `{ colorSpace: 'display-p3' }` with an sRGB fallback;
    - deterministic ladder stepping;
    - `AbortSignal` checks between steps;
    - `finally` teardown that calls `bitmap.close()` and zeroes the canvas dimensions.
- [ ] 2.2 Run `npx vitest run src/components/admin/__tests__/imageCompressor.test.ts` and iterate until all tests pass.
- [ ] 3.1 Update `src/components/admin/FolderDropzone.tsx`:
  - replace the inline `prepareThumbhash` with `prepareUploadFile` + `ensurePrepared`;
  - add `prepared: PreparedUpload | null` to `DraftFile`, and reuse the cached `prepared` across automatic retries and manual **Retry failed** clicks;
  - filter automatic retries with `isRetryableUploadError`, so deterministic `4xx` errors stop immediately;
  - pass `prepared.blob` and `prepared.filename` to `uploadPhoto`;
  - wire an `AbortController` per draft, so `discardDraft` stops preparation between steps and aborts the in-flight XHR (`xhr.abort()`);
  - format bare `HTTP 413` responses with `formatUploadHttpError`.
- [ ] 3.2 Confirm `POST /api/admin/albums/[id]/photos` is unchanged (defense-in-depth `MAX_UPLOAD_BYTES = 25 MB`, `sha256` contentHash idempotency, the `409 album_deleting` tombstone guard, magic-byte sanitisation), and that `rawUrlAudit.test.ts` stays green.
- [ ] 4.1 Run the full regression suite (`npm run typecheck && npm run lint && npm test && npm run build`) and confirm zero errors and clean pass counts.
- [ ] 4.2 Run local browser verification (Playwright against `next start` at `/photos`), confirming that:
  - a `> 4.0 MiB` opaque JPEG compresses to `<= 4.0 MiB`;
  - a transparent `> 4.0 MiB` PNG keeps its alpha as WebP (or fails cleanly);
  - an Orientation-6 JPEG renders right-side up;
  - a simulated transient failure followed by a retry reuses the cached blob without `409 photo_id_conflict`;
  - a deterministic `4xx` is not retried;
  - Discard aborts in-flight work cleanly.
- [ ] 4.3 Populate `openspec/changes/client-upload-compression/verification.md` with the Requirement Adherence Audit Matrix and verbatim execution logs. Add explicit `PENDING (maintainer — empirical)` rows for:
  - real Safari/iOS Orientation-6 validation;
  - Display-P3 ICC profile inspection;
  - the extreme-dimension / 48 MP mobile Safari memory check;
  - live Vercel `> 4.5 MB` upload verification.

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Check that every checkbox in `tasks.md` is `- [x]`, and only for work that genuinely ran and passed. A check that needs real Safari/iOS hardware or the live Vercel deployment stays unticked or `PENDING`, never ticked on assumption.
2. Data preservation: there's no schema or data change. Confirm `git diff origin/main -- src/app/api src/db src/lib/upload drizzle` is empty.
3. Make sure `openspec/changes/client-upload-compression/verification.md` contains:
   - an Executive Summary & Environment (Node/Next versions, Chromium version used, the note that Vercel and Safari were not exercised);
   - a Requirement Adherence Audit Matrix mapping every spec scenario (nine scenarios across two requirements in `specs/storage-and-cdn-pipeline/spec.md`) to its verifying test or Playwright step;
   - Resolved Assumptions & Empirical Proof: the measured compressed sizes and the ladder step reached for each fixture, and whether Chromium's JPEG `toBlob` from a `display-p3` canvas embeds an ICC profile (inspect the bytes for an `ICC_PROFILE` APP2 segment);
   - a Nomenclature & Code Symbol Audit (exported names match `architecture.md` D1–D5 exactly);
   - verbatim execution logs (the failing TDD run, the passing narrow run, the full gates, the Playwright run);
   - the `PENDING (maintainer — empirical)` rows from task 4.3.
4. Run verification through `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues**:
  1. Leave spec sync (`openspec specs apply`) for archive time, after the maintainer's PENDING rows pass. Note that in the PR body.
  2. **Open a Pull Request**:
     - Work on `feat/client-upload-compression`, never `main`.
     - Stage only the implementation files from §2 plus `openspec/changes/client-upload-compression/` (`git add src/components/admin/imageCompressor.ts src/components/admin/__tests__/imageCompressor.test.ts src/components/admin/FolderDropzone.tsx openspec/changes/client-upload-compression`), commit, then `git push -u origin HEAD`.
     - If `next-env.d.ts` shows up as modified from running `next dev`, restore it (`git checkout -- next-env.d.ts`). Don't commit it.
     - Open the PR with `gh pr create`. The body summarises `proposal.md` and `verification.md` and lists the PENDING maintainer rows. Report the PR URL.
- **If CRITICAL issues or failed test verification errors show up on the first pass**:
  1. Announce: "Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."
  2. Delegate a single-pass repair task to `spec-coder-sub` with the verification failure context:
     > "Fix the specific verification failures and test errors reported for change 'client-upload-compression'. Refer to the error log, make minimal targeted patches to resolve the failures, run verification commands, and update tasks.md."
  3. Re-run verification through `openspec-verify-change`.
  4. **If verification passes after the repair**: commit, push the branch and open the PR as above.
  5. **If verification STILL fails after the single repair pass**:
     - **HALT**. Do NOT loop or re-run. Give the user the Verification Report and the remaining blockers for manual guidance.
