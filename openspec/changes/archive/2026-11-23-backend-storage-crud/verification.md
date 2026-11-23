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
