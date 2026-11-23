# Architecture: `backend-storage-crud`

## Context

See `proposal.md` for motivation, `specs/` for behavioral contracts, and `research.md` for verified facts, glossary, and hosting boundaries.

## Goals / Non-Goals

**Goals:**
- Bootstrap the Next.js 16 (`cacheComponents: true`) + TypeScript + Drizzle + Vitest workspace and own the shared pure layout (`islandLayout.ts`, `100px = 1 world unit`) and CDN (`lodUrl.ts`) modules.
- Target **self-hosted Node.js** with local/persistent SQLite (`file:./data/photo-wall.db`) and `25 MB` buffered uploads.
- Serve compact macro & focus rendering data via `GET /api/wall` (Next.js 16 `'use cache'` + `cacheTag('wall')`, omitting `draft` and `'deleting'` rows).
- Guarantee zero GPS/XMP leakage (Orientation-only EXIF allowlist), DB-first idempotent retries (`photoId` + raw `contentHash`), and tombstone-backed recoverable deletes (startup sweep + Pending Deletions retry) with wildcard CDN purges.

**Non-Goals:**
- Vercel serverless deployment or Bunny S3 presigned PUTs (explicitly deferred).
- Multi-user OAuth or video transcoding.

## Decisions

1. **Relational Schema (`src/db/schema.ts` & `src/db/index.ts`)**:
   - Execute `PRAGMA foreign_keys = ON` on client initialization, and explicitly delete child `photos` inside the same transaction during album purge.
   - `albums`: `id`, `slug` (unique), `title`, `description`, `status` (`'draft' | 'published' | 'deleting'`), `expectedCount`, `cameraName`, `dateLabel`, `locationLabel`, `youtubeVideoId`, `soundtrackArtist`, `soundtrackTitle`, `soundtrackDurationSec`, `gridColumns`, `sortOrder`, `createdAt`/`updatedAt` (`$defaultFn(() => new Date())`). (`posX`/`posY` omitted; derived at manifest build time.)
   - `photos`: `id` (UUIDv7), `albumId` (FK cascade), `status` (`'active' | 'deleting'`), `storagePath`, `contentHash` (SHA-256 of raw uploaded bytes), `filename`, `title`, `caption`, `width`, `height`, `aspectRatio`, `dominantColor`, `thumbHash`, `sortOrder`, `createdAt`.
2. **Shared World-Unit 3-Column Wall Layout & LOD Modules**:
   - `src/lib/layout/islandLayout.ts` defines `WORLD_SCALE = 0.01` (`100px = 1 world unit`), `ALBUMS_PER_ROW = 3`, `CELL_SIZE`, `GUTTER`, `MAT_PADDING`, `PLACARD_WIDTH`, and `computeWallGridPositions(publishedAlbums sorted by sortOrder)` (arranging `published` albums 3 per row with row/column-max non-overlapping gaps; drafts do not reserve wall space).
   - `src/lib/cdn/lodUrl.ts` computes longest-edge Bunny Optimizer URLs (`?width=` or `?height=` from `aspectRatio`) for both server tests and client streaming.
3. **Buffered Image Sanitization (`src/lib/upload/sanitizeImage.ts`)**:
   - Enforces `MAX_UPLOAD_BYTES = 25 * 1024 * 1024` (`413` above limit), sniffs magic bytes (`JPEG`, `PNG`, `WebP`, `AVIF`; `415` otherwise), parses authoritative `width`/`height` from image headers *after* applying EXIF orientations 5–8, and losslessly strips XMP and all camera/GPS EXIF tags while rebuilding a minimal Orientation-only `APP1`/EXIF block and preserving compressed pixels and ICC profiles.
4. **Recoverable Upload & Tombstone Delete**:
   - *Upload*: Reject `409` if album `status === 'deleting'` → compute raw-bytes `contentHash` → DB idempotency pre-check on `(photoId, contentHash)` (`200 OK` if identical, `409` on mismatch) → `PUT` to Storage → DB upsert → on DB failure, delete uploaded Storage object in `catch`.
   - *Delete*: Mark `'deleting'` in DB → recursive Storage `DELETE` (`/albums/{albumId}/`) or object `DELETE` → wildcard Pull Zone Purge (`/albums/{albumId}/*` or `/albums/{albumId}/{photoId}.*`) → delete DB rows → `revalidateTag('wall', { expire: 0 })`. On server boot (`sweepPendingDeletions()`) or Curator Drawer retry (`POST /api/admin/deletions/retry`), resume any lingering `'deleting'` tombstones.
5. **Next.js 16 Cache Invalidation**:
   - `next.config.ts` sets `cacheComponents: true`. `getWallSummary()` uses `'use cache'` + `cacheTag('wall')`; publish/rename/reorder/delete route handlers call `revalidateTag('wall', { expire: 0 })` for immediate read-after-write visibility.

## Risks / Trade-offs

- **Abandoned Drafts**: Mitigated by excluding drafts from `GET /api/wall` (no wall holes) and listing them in `GET /api/admin/albums` with Curator Drawer Resume/Discard actions.
- **In-Memory Login Rate Limiter Reset on Restart** → Acceptable for single-owner personal gallery; easily backed by LibSQL if needed later.
