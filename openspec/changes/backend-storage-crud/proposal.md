## Why

An infinite 3D photo gallery needs a fast, privacy-safe persistence and media pipeline that serves thousands of print placements in a compact payload, preserves original pixel data while stripping GPS/XMP location leaks, and supports recoverable folder uploads and deletions.

## What Changes

- Bootstrap the **Next.js 16 (`cacheComponents: true`) + TypeScript + Drizzle ORM + Vitest** project foundation and shared pure modules (`src/lib/layout/islandLayout.ts` with `100px = 1 world unit`, `src/lib/cdn/lodUrl.ts`).
- Introduce **SQLite / LibSQL** persistence (self-hosted Node MVP target) with `PRAGMA foreign_keys = ON`, `albums` (`status: 'draft' | 'published' | 'deleting'`, `expectedCount`, optional `cameraName`/`dateLabel`/`locationLabel`, optional YouTube soundtrack fields; no `posX`/`posY` columns since 3-column layout is derived from `sortOrder`), and `photos` (`status: 'active' | 'deleting'`, `thumbHash`, `contentHash` of raw uploaded bytes, cascade FK).
- Implement **Next.js 16 cached manifest endpoint**: `GET /api/wall` (`'use cache'` + `cacheTag('wall')`) returning `published` album summaries with derived 3-column world positions, compact per-photo rendering metadata, and `cdnBase` (removing the vestigial `GET /api/albums/[id]/photos` endpoint).
- Add **`POST /api/admin/youtube/inspect`** with strict `videoId`-only SSRF-safe oEmbed fetching returning `{ videoId, artistGuess, titleGuess }` (client captures `durationSec` via hidden `YT.Player.getDuration()` and saves via `PATCH /api/admin/albums/[id]`).
- Implement **StorageAdapter** for **Bunny.net Storage + Optimizer + Wildcard Purge** (`/albums/{albumId}/*`, `/albums/{albumId}/{photoId}.*`) and **LocalStorageAdapter** (`/api/local-uploads/[...path]`).
- Add **binary image sanitization** (`25 MB` max buffer, `413` on oversize, `415` on magic-byte mismatch, Orientation-only EXIF allowlist rebuilding a minimal Orientation-only `APP1`/EXIF block while stripping GPS/camera tags + XMP and preserving ICC profiles, server-derived `width`/`height`/`aspectRatio` after orientation 5–8 swap).
- Add **hardened admin auth & CRUD** (`GET/POST/DELETE /api/admin/auth` with rate-limiting & SHA-256 `timingSafeEqual`, `Origin` CSRF check, draft resume/discard without wall-space reservation, publish completion rule with `revalidateTag('wall', { expire: 0 })`, DB idempotency pre-check before storage `PUT`, `409` on upload to `'deleting'` albums, and tombstone-backed recoverable delete with startup sweep + Pending Deletions retry).

## Capabilities

### New Capabilities
- `wall-manifest-and-db`: Next.js (`cacheComponents: true`)/Drizzle/LibSQL bootstrap, `albums` (`draft` / `published` / `deleting`, `expectedCount`, derived 3-column positions) and `photos` (`active` / `deleting`, raw `contentHash`) schema, Next.js 16 cached compact wall manifest, and shared world-unit layout math (`100px = 1 unit`).
- `storage-and-cdn-pipeline`: `StorageAdapter` for Bunny.net Storage/Optimizer/Wildcard Purge and local dev route streaming, shared `lodUrl.ts`, magic-byte validation (`413`/`415`), Orientation-only EXIF allowlist + lossless GPS/XMP stripping preserving ICC profiles, and tombstone-recoverable delete with startup sweep and retry.
- `admin-auth-and-crud-api`: Rate-limited `GET/POST/DELETE` admin auth, `Origin` CSRF checks, explicit multipart upload contract with DB idempotency pre-check, `'deleting'` upload guard, server-derived post-orientation dimensions, SSRF-safe YouTube `inspect` (`{ videoId, artistGuess, titleGuess }`), and `revalidateTag('wall', { expire: 0 })`.

### Modified Capabilities
<!-- None (greenfield repository) -->

## Impact

- **Dependencies**: `next@^16`, `react@^19`, `react-dom@^19`, `drizzle-orm`, `@libsql/client`, `drizzle-kit`, `jose`, `vitest`, `typescript`.
- **Downstream Dependency**: `frontend-gallery-wall` depends on this change for project bootstrap, shared `islandLayout.ts` / `lodUrl.ts`, and API contracts.
- **Deployment Target**: Self-hosted Node.js (MVP target); Vercel serverless is an explicit non-goal.

### Revision: 2026-11-23 16:45 UTC
- **Feedback Source**: Re-Review Audit
- **Key Changes**:
  - `youtube/inspect`: Fixed oEmbed claims—construct oEmbed URL strictly from parsed `videoId` (SSRF guard) and return `{ videoId, artistGuess, titleGuess }` (no `durationSec` from oEmbed; client captures via hidden `YT.Player.getDuration()`).
  - `3-albums-per-row`: Dropped stored `posX`/`posY`, draft wall reservations, and publish-time overlap auto-nudging; positions are derived deterministically in `computeWallGridPositions(publishedAlbums sorted by sortOrder)`.
  - `EXIF Orientation`: Switched from stripping all camera EXIF to an Orientation-only EXIF allowlist (rebuilding a minimal `APP1`/EXIF Orientation tag + swapping `width`/`height` for orientations 5–8).
  - `Next.js 16 cache`: Added `cacheComponents: true` in `next.config.ts` and switched Route Handlers from `updateTag('wall')` to `revalidateTag('wall', { expire: 0 })`.
  - `Manifest & Tombstones`: Dropped vestigial `GET /api/albums/[id]/photos`, added `photos.status = 'active' | 'deleting'`, `409` on upload to `'deleting'` albums, DB idempotency check *before* storage `PUT` with raw-bytes `contentHash`, and startup sweep + Pending Deletions retry UI/endpoint.

### Revision: 2026-11-23 15:45 UTC
- **Feedback Source**: Peer Review Audits (Two Agents)
- **Key Changes**:
  - `proposal.md` / `tasks.md`: Moved project bootstrap and shared `islandLayout.ts` (`100px = 1 unit`) + `lodUrl.ts` into `backend-storage-crud` so it runs standalone; declared self-hosted Node MVP target.
  - `specs/`: Added explicit `POST /api/admin/albums/[id]/photos` multipart contract, server-derived dimensions, EXIF allowlist, XMP GPS stripping, `GET /api/admin/auth`, `published`-only `/api/albums/[id]/photos`, compact photos in `/api/wall`, wildcard CDN purge, and `'deleting'` tombstone lifecycle.
  - `architecture.md` / `tests.md`: Updated to Next 16 `'use cache'` / `updateTag('wall')`, added Vitest route-handler integration tests against temp `file:` LibSQL + mocked Bunny client.
