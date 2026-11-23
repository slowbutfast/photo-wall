# Architecture: `backend-storage-crud`

## Context

See `proposal.md` for motivation, `specs/` for behavioral contracts, and `research.md` for verified facts, glossary, and hosting boundaries.

## Goals / Non-Goals

**Goals:**
- Bootstrap the Next.js 16 + TypeScript + Drizzle + Vitest workspace and own the shared pure layout (`islandLayout.ts`, `100px = 1 world unit`) and CDN (`lodUrl.ts`) modules.
- Target **self-hosted Node.js** with local/persistent SQLite (`file:./data/photo-wall.db`) and `25 MB` buffered uploads.
- Serve compact macro rendering data (`GET /api/wall` via Next.js 16 `'use cache'` + `cacheTag('wall')`) and detail metadata (`GET /api/albums/[id]/photos` enforcing `status = 'published'`).
- Guarantee zero GPS/XMP leakage, idempotent retries (`photoId` + `contentHash`), and tombstone-backed recoverable deletes with wildcard CDN purges.

**Non-Goals:**
- Vercel serverless deployment or Bunny S3 presigned PUTs (explicitly deferred).
- Multi-user OAuth or video transcoding.

## Decisions

1. **Relational Schema (`src/db/schema.ts` & `src/db/index.ts`)**:
   - Execute `PRAGMA foreign_keys = ON` on client initialization, and explicitly delete child `photos` inside the same transaction during album purge.
   - `albums`: `id`, `slug` (unique), `title`, `description`, `status` (`'draft' | 'published' | 'deleting'`), `expectedCount`, `cameraName`, `dateLabel`, `locationLabel`, `youtubeVideoId`, `soundtrackArtist`, `soundtrackTitle`, `soundtrackDurationSec`, `posX`, `posY`, `gridColumns`, `sortOrder`, `createdAt`/`updatedAt` (`$defaultFn(() => new Date())`).
   - `photos`: `id` (UUIDv7), `albumId` (FK cascade), `storagePath`, `contentHash` (SHA-256), `filename`, `title`, `caption`, `width`, `height`, `aspectRatio`, `dominantColor`, `thumbHash`, `sortOrder`, `createdAt`.
2. **Shared World-Unit 3-Column Wall Layout & LOD Modules**:
   - `src/lib/layout/islandLayout.ts` defines `WORLD_SCALE = 0.01` (`100px = 1 world unit`), `ALBUMS_PER_ROW = 3`, `CELL_SIZE`, `GUTTER`, `MAT_PADDING`, `PLACARD_WIDTH`, and `computeWallGridPositions(albums)` (arranging `draft` + `published` albums 3 per row with row/column-max non-overlapping gaps).
   - `src/lib/cdn/lodUrl.ts` computes longest-edge Bunny Optimizer URLs (`?width=` or `?height=` from `aspectRatio`) for both server tests and client streaming.
3. **Buffered Image Sanitization (`src/lib/upload/sanitizeImage.ts`)**:
   - Enforces `MAX_UPLOAD_BYTES = 25 * 1024 * 1024` (`413` above limit), sniffs magic bytes (`JPEG`, `PNG`, `WebP`, `AVIF`; `415` otherwise), parses authoritative `width`/`height` from image headers, and losslessly strips GPS EXIF + XMP while preserving compressed pixels and ICC profiles.
4. **Recoverable Upload & Tombstone Delete**:
   - *Upload*: `PUT` to Storage → idempotent DB upsert on `(photoId, contentHash)` (`409` on hash mismatch) → on DB failure, delete uploaded Storage object in `catch`.
   - *Delete*: Mark `'deleting'` in DB → recursive Storage `DELETE` (`/albums/{albumId}/`) or object `DELETE` → wildcard Pull Zone Purge (`/albums/{albumId}/*` or `/albums/{albumId}/{photoId}.*`) → delete DB rows → `updateTag('wall')`.
5. **Next.js 16 Cache Invalidation**:
   - `getWallSummary()` uses `'use cache'` + `cacheTag('wall')`; publish/rename/delete route handlers call `updateTag('wall')` for immediate read-after-write visibility.

## Risks / Trade-offs

- **Abandoned Drafts Reserving Wall Space** → Mitigated by listing drafts in `GET /api/admin/albums` with Curator Drawer Resume/Discard actions, and re-packing/re-checking overlap at publish time.
- **In-Memory Login Rate Limiter Reset on Restart** → Acceptable for single-owner personal gallery; easily backed by LibSQL if needed later.
