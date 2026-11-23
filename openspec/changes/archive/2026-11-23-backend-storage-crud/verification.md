# Verification Report: `backend-storage-crud`

**Date:** 2026-11-23
**Verifier:** OpenCode orchestration agent (`openspec-verify-change` pass)
**Scope:** Implementation vs. `proposal.md`, `tasks.md`, `architecture.md`, `tests.md`, and the three delta specs.

## Summary

| Dimension    | Status |
| ------------ | ------ |
| Completeness | 1.1–1.5 and 2.1–4.4 complete; 5.1–5.2 complete (Bunny live smoke deferred to deployment credentials) |
| Correctness  | 10/10 requirements implemented and covered by automated tests |
| Coherence    | Follows VSA boundaries and architecture decisions; one layout deviation found and repaired in the single allowed repair pass |

**Final assessment:** No CRITICAL issues remain. Ready for `frontend-gallery-wall` (non-blocking transition per handoff).

## Empirical execution log

| Command | Result |
| ------- | ------ |
| `npx vitest run` | **7 files, 94/94 tests passed**, 0 failed (`islandLayout` 13, `lodUrl` 9, `youtube` 10, `sanitizeImage` 10, `auth` 15, `bunny` 11, `routes` 26) |
| `npx tsc --noEmit` | exit 0, 0 errors |
| `npm run lint` | exit 0, 0 errors, 0 warnings |
| `npm run build` (`next start` artifact) | success; `/api/wall` prerendered with `15m` revalidate + tag invalidation, admin routes dynamic |
| `next start` E2E (port 3457, `STORAGE_DRIVER=local`) | see below |

### `next start` end-to-end smoke (local storage)

| Step | Result |
| ---- | ------ |
| `POST /api/admin/auth` with mismatched `Origin` | `403` |
| `POST /api/admin/albums` without session | `401` |
| `POST /api/admin/auth` with correct password | `200` `{ authenticated: true }` + HttpOnly cookie |
| `GET /api/admin/auth` with cookie | `200` `{ authenticated: true }` |
| `POST /api/admin/albums` (`expectedCount: 1`) | `201`, status `draft` |
| `POST .../photos` valid PNG | `201`, server-derived `width: 32`, `height: 24`, `aspectRatio: 1.333333` |
| `POST .../photos` spoofed `.mp4` | `415` |
| `PATCH ...` `{status:"published"}` (1/1 uploaded) | `200`, status `published` |
| `GET /api/wall` | `200`, 1 published album with compact photo + derived position |
| `GET /api/local-uploads/albums/...png` | `200`, `image/png`, exact byte length |
| `GET /api/local-uploads/..%2F..%2Fpackage.json` | `404` (path traversal blocked) |
| Draft album created after publish | excluded from `GET /api/wall` |
| `DELETE /api/admin/albums/{id}` | `200`, storage file `404` afterwards, wall empty |
| Runtime DB bootstrap | `drizzle/0000_init.sql` applied automatically on first request |

## Requirement Adherence Audit Matrix

### `wall-manifest-and-db`

| Requirement | Evidence | Status |
| ----------- | -------- | ------ |
| Relational schema with foreign keys and deletion tombstones | `src/db/schema.ts`, `src/db/index.ts` (`PRAGMA foreign_keys = ON`), `src/db/repository.ts` transactional purge; route tests cover cascade + explicit child delete | PASS |
| Compact cached wall manifest | `src/lib/manifest.ts` (`'use cache'` + `cacheTag('wall')`), `src/app/api/wall/route.ts`; tests assert drafts/tombstones/deleting photos excluded and `cdnBase` present | PASS |
| Three-albums-per-row derived non-overlapping wall layout | `src/lib/layout/islandLayout.ts` (`ALBUMS_PER_ROW = 3`, row/column max bounds, no draft holes), 13 layout tests incl. pairwise non-overlap | PASS |

### `storage-and-cdn-pipeline`

| Requirement | Evidence | Status |
| ----------- | -------- | ------ |
| Storage adapter keyed by immutable `albumId` | `src/lib/storage/{types,bunny,local,index}.ts`, `/albums/{albumId}/{photoId}.{ext}`, `src/lib/cdn/lodUrl.ts` longest-edge URLs; 11 Bunny/local tests | PASS |
| Buffered magic-byte validation, Orientation-only EXIF allowlist, lossless GPS/XMP strip | `src/lib/upload/sanitizeImage.ts` (25 MB / `413`, magic bytes / `415`, JPEG APP1 rebuild + GPS/camera/XMP strip + ICC preserve + orientation 5–8 dimension swap, PNG/WebP/AVIF chunk handling); 10 tests | PASS |
| Recoverable upload rollback and tombstone-backed wildcard purge | Upload DB-failure rollback in photos route; `src/lib/storage/deletions.ts`, `src/instrumentation.ts`, `POST /api/admin/deletions/retry`; route tests cover rollback, purge paths, retry | PASS |

### `admin-auth-and-crud-api`

| Requirement | Evidence | Status |
| ----------- | -------- | ------ |
| Hardened route-handler auth and CSRF | `src/lib/auth.ts` (SHA-256 + `timingSafeEqual`, in-memory `429` limiter, JWT HttpOnly `SameSite=Lax`/`Secure` in prod, `Origin` check), `/api/admin/auth`; 15 auth tests + E2E `401`/`403` | PASS |
| Multipart upload contract, EXIF allowlist, DB-first idempotency | `src/app/api/admin/albums/[id]/photos/route.ts` (deleting guard `409` before I/O, raw-byte SHA-256, DB pre-check before storage `PUT`, same-hash retry `200` without storage touch, conflict `409`, rollback); 26 route tests | PASS |
| YouTube soundtrack inspect + manual metadata | `src/lib/validation/youtube.ts`, `/api/admin/youtube/inspect` (videoId-only oEmbed URL, SSRF rejection `400` with no fetch), `PATCH /api/admin/albums/[id]`; 10 YouTube tests + route tests | PASS |
| Draft lifecycle, completion rule, immediate tag revalidation | Albums route + `[id]` PATCH (`uploadedCount === expectedCount` or `allowPartial`), `revalidateTag('wall', { expire: 0 })`; route tests cover completion rule and revalidation call | PASS |

## Issues

### CRITICAL

None.

### WARNING

1. **AVIF Exif/XMP removal is best-effort** — dimensions are parsed from `ispe` and obvious metadata boxes are dropped, but full BMFF item-property graph rewriting is not implemented. JPEG/PNG/WebP (the common upload formats) are fully covered. Recommendation: validate with real AVIF samples before accepting AVIF uploads in production, or reject AVIF if the metadata guarantee is strict.
2. **Bunny.net live wildcard-purge smoke test not executed** — no production credentials in this environment. Purge paths are covered by mocked adapter tests. Recommendation: run the documented `?width=800` live smoke during first deployment.
3. **Pre-implementation red run not captured** — task 1.5 is marked complete based on tests being authored first, with the final green run recorded. No behavioral gap found.

### SUGGESTION

- JPEGs without an orientation tag receive a rebuilt `Orientation = 1` APP1 block. Harmless and keeps the allowlist invariant.
- `next build` rewrites `tsconfig.json` to `"jsx": "react-jsx"` and adds `.next/dev/types`; this is Next 16 behavior, not a manual deviation.

## Repaired during verification

- **Placard geometry:** `computeAlbumGrid` originally placed the placard below the grid and had no soundtrack rectangle. Repaired in the single bounded pass to match `DESIGN.md` / frontend spec: placard `2.14u × 2.00u` left of and top-aligned with the grid, `ISLAND_GAP = 0.44u` spacing, optional soundtrack plaque `2.00u` with `SOUNDTRACK_GAP = 0.12u`, bounds covering placard + gap + grid. Tests updated (94 passing) and the full suite re-run green.

## Resolved assumptions

- Self-hosted Node.js MVP, `file:./data/photo-wall.db`, migrations applied automatically at boot.
- `/api/wall` may be statically prerendered but is tag-invalidated by every publish/metadata/delete mutation.
- Session cookie is stateless JWT; login limiter is in-memory (acceptable for single-owner gallery, resets on restart).

---

# Patch 01 Verification

**Date:** 2026-11-23 15:08 UTC
**Patch:** `PATCH-01` (PR #1 critical + important backend fixes)
**Status:** RESOLVED

## Environment

| Item | Value |
| ---- | ----- |
| OS | Linux (container) |
| Node | v22.23.2 |
| Runner | Vitest 5.1.1 (`vitest.config.ts`: `fileParallelism: false`, `maxWorkers: 1`) |
| Typecheck | TypeScript 5.9.3 (`npm run typecheck` → `tsc --noEmit`) |
| Lint | ESLint 9.39.5 (`npm run lint` → `eslint .`) |

> Note: `safe-test npx vitest run …` aborted before running with
> `RangeError: WebAssembly.instantiate(): Out of memory` (the wrapper's 4096 MB
> address-space cap breaks the LibSQL Wasm instance). Suites were therefore run
> with plain `npx vitest run`; the Vitest config already enforces single-worker,
> non-parallel execution.

## Failure-first evidence (red run)

Tests were added before any production edit:

```
npx vitest run src/lib/upload/__tests__/sanitizeImage.test.ts src/lib/__tests__/auth.test.ts src/app/api/__tests__/routes.test.ts
 Test Files  3 failed (3)
      Tests  14 failed | 50 passed (64)
```

The 14 failing reproductions:

| Finding | Failing test | Observed (red) |
| ------- | ------------ | -------------- |
| JPEG tail leak | `sanitizeImage JPEG handling > truncates at the first EOI and drops APP2 MPF/gain-map + appended JPEG/GPS tails` | Output still contained `MPF`, `GAIN_MAP_DATA`, `APPENDED_MP4_GPS_ATOM`, appended `Canon`/`EOS R5` EXIF |
| JPEG multi-scan | `sanitizeImage JPEG handling > walks multi-scan progressive JPEGs to EOI and drops inter-scan COM metadata` | Output still contained `PROGRESSIVE_SECRET_COM` copied verbatim from `SOS`→EOF |
| AVIF acceptance | `sanitizeImage AVIF handling > rejects AVIF with 415…` | `expected ImageValidationError with status 415` (returned a sanitized image) |
| Album tombstone PATCH | `tombstone PATCH guards > rejects PATCH on a deleting album with 409…` | Patch applied to `'deleting'` album |
| Photo tombstone PATCH | `tombstone PATCH guards > rejects PATCH on a deleting photo with 409…` | Patch applied to `'deleting'` photo |
| Repository WHERE guard | `tombstone PATCH guards > updateAlbum/updatePhoto refuse tombstoned rows…` | `expected Album to be null` (row updated) |
| Shared 404 Response | `GET /api/local-uploads/[...path] > returns a fresh 404 on each repeated missing-file request` | `TypeError: Body is unusable: Body has already been read` |
| Upload race (winner 200) | `photo upload contract > returns 200 without deleting storage when a concurrent winner committed the same photoId` | `expected 500 to be 200` |
| Upload race (conflict 409) | `photo upload contract > returns 409 without deleting the live object when the racing row has different bytes` | `expected 500 to be 409` |
| Spoofed XFF | `client key extraction > ignores client-supplied X-Forwarded-For when TRUSTED_PROXY_HOPS is unset` (+ 3 sibling N-hop/fallback tests) | `getClientKey` trusted the first XFF entry |
| Global ceiling | `login rate limiting > enforces a global ceiling of 50 failures across distinct keys` | `GLOBAL_LOGIN_RATE_LIMIT` did not exist / fresh key not blocked |

## Fixed findings

| # | File | Fix |
| - | ---- | --- |
| 1 | `src/lib/upload/sanitizeImage.ts` | `sanitizeJpeg` now walks the whole stream: keeps SOS headers, copies entropy data up to the next real marker (`FF 00` stuffing and `FF D0`–`FF D7` restart markers handled), continues through DHT/DQT/SOS after each scan (progressive/multi-scan), stops at the first real `FF D9`, and appends exactly one EOI. Drops APP1 (EXIF/XMP), APP13, COM anywhere; keeps APP2 only with the `ICC_PROFILE\0` signature (MPF and gain maps dropped). Orientation-only APP1 rebuild and ICC preservation unchanged. |
| 2 | `src/lib/upload/sanitizeImage.ts` | AVIF/HEIF `ftyp` payloads now throw `ImageValidationError(415, …)`; the broken box-dropping parser (`readBoxHeader`/`rebuildBox`/`stripAvifBoxes`/`findAvifDimensions`) was removed. AVIF is no longer accepted. |
| 3 | `openspec/specs/storage-and-cdn-pipeline/spec.md` | Requirement wording now accepts only JPEG/PNG/WebP and states AVIF returns `415` until a full HEIF/AVIF item-graph rewriter exists. `openspec validate --all --strict` → 7/7. |
| 4 | `src/app/api/admin/albums/[id]/route.ts` | `PATCH` returns `409 { error: 'album_deleting' }` for tombstoned albums before parsing/applying the patch. |
| 5 | `src/app/api/admin/photos/[id]/route.ts` | `PATCH` returns `409 { error: 'photo_deleting' }` for tombstoned photos. |
| 6 | `src/db/repository.ts` | `updateAlbum` / `updatePhoto` add `ne(status, 'deleting')` to the `WHERE` clause; `markAlbumDeleting` / `markPhotoDeleting` still transition non-deleting rows. |
| 7 | `src/app/api/local-uploads/[...path]/route.ts` | Module-level shared `Response` replaced with `const notFound = () => new Response('Not found', { status: 404 })`; both miss paths allocate a fresh body. |
| 8 | `src/app/api/admin/albums/[id]/photos/route.ts` | `insertPhoto` catch re-reads `getPhoto(photoId)`: same `albumId` + `contentHash` → `200` with the winner DTO and no storage delete; differing row → `409 photo_id_conflict` with no delete; no row → delete the upload and `500`. |
| 9 | `src/lib/auth.ts` | `getClientKey` trusts `X-Forwarded-For` only when `TRUSTED_PROXY_HOPS` is a positive integer, taking `parts[parts.length - N]`, then falls back to `x-real-ip`/`'unknown'`. Added `GLOBAL_LOGIN_RATE_LIMIT = 50` per `LOGIN_RATE_WINDOW_MS`, checked by `isLoginRateLimited`, incremented by `recordFailedLogin`, cleared by `resetLoginRateLimits`. |

## Requirement Adherence (patch scope)

| Patch requirement | Verifying tests | Status |
| ----------------- | --------------- | ------ |
| JPEG truncates at EOI, drops MPF/gain map/appended tail, preserves orientation + ICC + entropy bytes | `sanitizeImage.test.ts`: `truncates at the first EOI…`; existing Orientation-6/ICC tests | PASS |
| Multi-scan/progressive JPEG walks past DHT/SOS to EOI | `sanitizeImage.test.ts`: `walks multi-scan progressive JPEGs…` | PASS |
| AVIF rejected with 415 | `sanitizeImage.test.ts`: `rejects AVIF with 415…` | PASS |
| Album/photo PATCH on tombstone → 409 + row unchanged | `routes.test.ts`: `tombstone PATCH guards` (2 route tests) | PASS |
| Repository refuses tombstoned updates | `routes.test.ts`: `updateAlbum/updatePhoto refuse tombstoned rows…` | PASS |
| Repeated local-upload 404s | `routes.test.ts`: `returns a fresh 404 on each repeated missing-file request` | PASS |
| Race loser returns 200 and keeps winner object | `routes.test.ts`: `returns 200 without deleting storage when a concurrent winner…` | PASS |
| Race with different bytes returns 409 and keeps live object | `routes.test.ts`: `returns 409 without deleting the live object…` | PASS |
| XFF spoof ignored without `TRUSTED_PROXY_HOPS`; N-hop extraction; global ceiling | `auth.test.ts`: `client key extraction` (4 tests) + `enforces a global ceiling…` | PASS |

## Empirical execution logs (green)

```
npx vitest run src/lib/upload/__tests__/sanitizeImage.test.ts src/lib/__tests__/auth.test.ts src/app/api/__tests__/routes.test.ts
 Test Files  3 passed (3)
      Tests  64 passed (64)

npx vitest run
 Test Files  13 passed (13)
      Tests  178 passed (178)

npx tsc --noEmit            → exit 0
npm run typecheck           → exit 0 (tsc --noEmit)
npm run lint                → exit 0 (eslint .)
openspec validate --all --strict → 7 passed, 0 failed
```

No pre-existing tests were removed: the only edited assertion is the AVIF
acceptance test, which the handoff explicitly authorises to switch to `415`.
Test counts moved from 50 → 64 in the three targeted files (14 added
reproductions; total suite 178).

## Quick re-verification (60-second audit)

```bash
cd /home/node/.local/share/opencode/worktree/c63da2794a700730e3a2cbe71e9e957277cb59ba/bold-pangolin
npx vitest run src/lib/upload/__tests__/sanitizeImage.test.ts src/lib/__tests__/auth.test.ts src/app/api/__tests__/routes.test.ts
# expected: Test Files 3 passed (3), Tests 64 passed (64)
npm run typecheck && npm run lint
# expected: exit 0 for both
```

## Deviations & remaining risks

- **`safe-test` wrapper unusable here** (Wasm OOM under its 4096 MB cap); direct `npx vitest run` used. The Vitest config still serialises files (`fileParallelism: false`, `maxWorkers: 1`).
- **AVIF uploads now fail with `415`** — intentional per handoff/spec; clients uploading AVIF will need JPEG/PNG/WebP until an item-graph rewriter lands.
- **Rate limiter remains in-memory** (per-process), so the global ceiling is per instance; a multi-instance deployment would need shared storage. No change to that pre-existing assumption.
- `sanitizeImage` retains `'image/avif'`/`'avif'` in its exported type unions for API compatibility even though AVIF is never returned.
- Bunny.net live wildcard-purge smoke test remains deferred (production credentials), unchanged from the original verification.


---

# Patch 02 Verification

**Date:** 2026-11-23 20:30 UTC
**Patch:** `PATCH-02` (PR #1 final hardening)
**Status:** RESOLVED

## Environment

| Item | Value |
| ---- | ----- |
| OS | Linux (container) |
| Node | v22.23.2 |
| Runner | Vitest 5.1.1 (`fileParallelism: false`, `maxWorkers: 1`) |
| Typecheck | TypeScript 5.9.3 (`npm run typecheck` → `tsc --noEmit`) |
| Lint | ESLint 9.39.5 (`npm run lint` → `eslint .`) |

> Suites were run with plain `npx vitest run` because the earlier patch
> documented `safe-test` aborting on a LibSQL Wasm OOM under its 4096 MB cap.
> The Vitest config already enforces single-worker, non-parallel execution.

## Failure-first evidence (red run)

Reproducing tests were added before any production edit:

```
npx vitest run src/lib/upload/__tests__/sanitizeImage.test.ts src/lib/__tests__/auth.test.ts src/components/admin/__tests__/folderReader.test.ts src/app/api/__tests__/routes.test.ts
 Test Files  3 failed | 1 passed (4)
      Tests  10 failed | 73 passed (83)
```

The 10 failing reproductions:

| Finding | Failing test | Observed (red) |
| ------- | ------------ | -------------- |
| JPEG APP11/JUMBF leak | `sanitizeImage JPEG handling > drops APP11/JUMBF C2PA, APP3 and APP15 metadata…` | Output still contained `jumb`, `c2pa`, `stds.exif`, `APP3_METADATA_SECRET`, `APP15_METADATA_SECRET` |
| PNG caBX leak | `sanitizeImage PNG handling > drops caBX JUMBF/C2PA and unknown ancillary chunks…` | Output still contained `caBX`, `jumb`, `c2pa`, `stds.exif`, `abcd`, `UNKNOWN_ANCILLARY_SECRET` |
| WebP unknown chunk + VP8X flags | `sanitizeImage WebP handling > clears VP8X EXIF/XMP flags and drops caBX/JUNK…` | Output still contained `caBX`, `JUNK`; VP8X flags byte remained `0x2c` (`& 0x0c !== 0`) |
| Password minimum missing | `verifyAdminPassword > requires a minimum configured password length of 16 characters` | `MIN_ADMIN_PASSWORD_LENGTH` was `undefined` |
| Short password accepted | `verifyAdminPassword > rejects a configured password shorter than the minimum without throwing` | `verifyAdminPassword('short-password')` returned `true` |
| X-Real-IP trusted without proxy | `client key extraction > ignores client-supplied headers when TRUSTED_PROXY_HOPS is unset` | Returned `10.0.0.5` / `unknown` instead of `'direct'` |
| Final client-key fallback | `client key extraction > uses x-real-ip only when proxy hops are configured and XFF is missing/too short` | Header-less request returned `'unknown'` |
| Malformed hops fallback | `client key extraction > ignores malformed TRUSTED_PROXY_HOPS values` | Fell through to `x-real-ip` (`10.0.0.5`) instead of `'direct'` |
| Curator extension allowlist | `image/video classification > accepts only jpg, jpeg, png and webp…` | `.heic`/`.avif`/`.gif`/`.bmp`/`.tiff` still classified as images |
| Curator skip reporting | `collectImagesFromEntries > skips unsupported image formats…` | Unsupported formats placed in `images`, not `skipped` |

## Fixed findings

| # | File | Fix |
| - | ---- | --- |
| 1 | `src/lib/upload/sanitizeImage.ts` | JPEG switched from a denylist to `isAllowedJpegSegment`: keep APP0 (`0xE0`), APP2 (`0xE2`) only with `ICC_PROFILE\0`, APP14 (`0xEE`), DQT (`0xDB`), DHT (`0xC4`), DRI (`0xDD`), SOS (`0xDA`), SOFn (`0xC0`–`0xCF` excluding `0xC8`/`0xCC`; `0xC4` handled as DHT). APP1 is parsed for Orientation then dropped; APP3–APP13/APP15 and COM are dropped; the Orientation-only APP1 rebuild is unchanged. |
| 2 | `src/lib/upload/sanitizeImage.ts` | PNG allowlist: critical `IHDR`/`PLTE`/`IDAT`/`IEND` plus ancillary `iCCP`/`sRGB`/`gAMA`/`cHRM`/`pHYs`/`tRNS`/`cICP`. Every other chunk (including `caBX`, `eXIf`, text chunks and unknown ancillary chunks) is dropped. |
| 3 | `src/lib/upload/sanitizeImage.ts` | WebP allowlist: `VP8 `, `VP8L`, `VP8X`, `ALPH`, `ANIM`, `ANMF`, `ICCP`. All other fourccs (`EXIF`, `XMP `, `caBX`, `JUNK`, …) are dropped. A `VP8X` payload copy has its flags byte rewritten `& ~0x0c`, clearing EXIF (`0x08`) and XMP (`0x04`) while preserving ICC/alpha/animation bits and canvas dimensions; RIFF size/padding stay consistent. |
| 4 | `src/lib/auth.ts` | Added `MIN_ADMIN_PASSWORD_LENGTH = 16`; `verifyAdminPassword` returns `false` when `ADMIN_PASSWORD` is missing or shorter than 16 (never throws per-request) while keeping constant-time comparison for valid lengths. `getClientKey` returns `'direct'` whenever `TRUSTED_PROXY_HOPS` is unset/malformed; with hops configured it keeps the N-from-right XFF logic, then the `x-real-ip` fallback, then `'direct'`. |
| 5 | `vitest.config.ts`, `src/app/api/__tests__/routes.test.ts`, `src/lib/__tests__/auth.test.ts` | Raised the shared test password fixture from `test-password` (13 chars) to `test-password-1234` (18 chars). `hashPassword('test-password')` digest literal kept unchanged because it only exercises SHA-256. |
| 6 | `src/components/admin/folderReader.ts` | `IMAGE_EXTENSIONS` restricted to `jpg`, `jpeg`, `png`, `webp`; videos remain skipped. |
| 7 | `src/components/admin/FolderDropzone.tsx` | `handleFileInput` now accepts only `image/jpeg`, `image/png`, `image/webp` (or matching extension), so `.heic`/`.avif`/`.gif`/`.bmp`/`.tiff` land in the existing skipped notice. No `accept` attribute exists on the input. |
| 8 | `openspec/specs/admin-auth-and-crud-api/spec.md` | Living requirement now states the 16-character minimum `ADMIN_PASSWORD` and trusted-proxy-only (`TRUSTED_PROXY_HOPS`) client key derivation. `openspec validate --all --strict` → 7/7. |
| 9 | `.env.example`, `README.md` | Documentation-only wording notes the 16+ character minimum. No credential files were read or changed. |

## Requirement Adherence (patch scope)

| Patch requirement | Verifying tests | Status |
| ----------------- | --------------- | ------ |
| JPEG drops APP11/JUMBF/C2PA + other APPn while preserving orientation/dimensions/ICC/pixels | `sanitizeImage.test.ts`: `drops APP11/JUMBF C2PA…` | PASS |
| PNG drops caBX + unknown chunks while preserving iCCP/IHDR dimensions | `sanitizeImage.test.ts`: `drops caBX JUMBF/C2PA…` | PASS |
| WebP drops EXIF/XMP/caBX/JUNK and clears VP8X EXIF/XMP flags, preserving ICC | `sanitizeImage.test.ts`: `reads VP8X dimensions…`, `clears VP8X EXIF/XMP flags…` | PASS |
| `ADMIN_PASSWORD < 16` / unset rejected without throwing | `auth.test.ts`: `requires a minimum…`, `rejects a configured password shorter…`, `rejects any candidate when ADMIN_PASSWORD is unset` | PASS |
| `x-real-ip` ignored without `TRUSTED_PROXY_HOPS`; fallback `'direct'` | `auth.test.ts`: `client key extraction` (5 tests) | PASS |
| Curator accepts only jpg/jpeg/png/webp and reports others skipped | `folderReader.test.ts`: classification + `collectImagesFromEntries` tests | PASS |

## Empirical execution logs (green)

```
npx vitest run src/lib/upload/__tests__/sanitizeImage.test.ts src/lib/__tests__/auth.test.ts src/components/admin/__tests__/folderReader.test.ts src/app/api/__tests__/routes.test.ts
 Test Files  4 passed (4)
      Tests  83 passed (83)

npx vitest run
 Test Files  13 passed (13)
      Tests  191 passed (191)

npm run typecheck           → exit 0 (tsc --noEmit)
npm run lint                → exit 0 (eslint .)
openspec validate --all --strict → 7 passed, 0 failed
```

Suite growth: 182 → 191 tests (+9: 3 sanitizer allowlist, 4 auth, 2 folderReader).
No pre-existing tests were deleted. The only rewritten assertions are the
client-key expectations (`'unknown'`/`x-real-ip` → `'direct'` when
`TRUSTED_PROXY_HOPS` is unset), the WebP fixture builder (now plants `caBX`/`JUNK`
and VP8X `0x2c` flags), and the three `ADMIN_PASSWORD` fixtures raised to 16+ chars.

## Quick re-verification (60-second audit)

```bash
cd /home/node/.local/share/opencode/worktree/c63da2794a700730e3a2cbe71e9e957277cb59ba/bold-pangolin
npx vitest run src/lib/upload/__tests__/sanitizeImage.test.ts src/lib/__tests__/auth.test.ts src/components/admin/__tests__/folderReader.test.ts src/app/api/__tests__/routes.test.ts
# expected: Test Files 4 passed (4), Tests 83 passed (83)
npx vitest run
# expected: Test Files 13 passed (13), Tests 191 passed (191)
npm run typecheck && npm run lint
# expected: exit 0 for both
```

## Deviations & remaining risks

- **Strict JPEG allowlist** also drops rarely-used structural markers such as DNL (`0xFFDC`), DHP (`0xFFDE`), EXP (`0xFFDF`) and reserved JPG extension markers. Camera/app JPEGs virtually never emit these; a malformed JPEG that relies on them would be rejected or degraded.
- **PNG allowlist drops APNG animation chunks** (`acTL`/`fcTL`/`fdAT`) and benign ancillary chunks (`tIME`, `bKGD`, etc.). Animated PNGs are stored as their first frame (still a valid static PNG).
- **WebP allowlist drops every unknown future fourcc**; only the seven listed rendering/metadata chunks survive. This is intentional for privacy but would need review if WebP gains a new required rendering chunk.
- **`TRUSTED_PROXY_HOPS` still assumes the proxy overwrites `x-real-ip`**; a misconfigured/absent trusted proxy combined with the env var could let clients spoof `x-real-ip`. The env var is the explicit trust boundary.
- **`.env.example` keeps the placeholder `ADMIN_PASSWORD="change-me"`** (11 chars) as a non-functional example; it will now always fail login until replaced with a 16+ character value (documented inline and in `README.md`).
- `sanitizeImage` still advertises `'image/avif'`/`'avif'` in its exported unions for API compatibility, unchanged from PATCH-01.
- R3F wall files were not touched; `dom-wall-engine` still replaces them after PR #1.
- No dependencies, commits, pushes, or `.env*` credential changes were made (`.env.example` documentation text only).
