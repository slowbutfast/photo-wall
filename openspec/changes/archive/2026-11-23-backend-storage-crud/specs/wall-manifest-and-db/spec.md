## Purpose

Provides SQLite/LibSQL persistence, deterministic non-overlapping album island layout in shared world units (`100px = 1 unit`), and a Next.js 16 cached compact wall manifest so macro rendering has all print geometry without N+1 fetches.

## ADDED Requirements

### Requirement: Relational schema with foreign keys and deletion tombstones
The database layer SHALL define `albums` (including `status: 'draft' | 'published' | 'deleting'`, `expectedCount`, `gridColumns`, `sortOrder`, optional nullable `cameraName`, `dateLabel`, `locationLabel`, optional nullable `youtubeVideoId`, `soundtrackArtist`, `soundtrackTitle`, `soundtrackDurationSec`, and default timestamps—omitting stored `posX`/`posY` columns) and `photos` (including `status: 'active' | 'deleting'`, `contentHash` of raw uploaded bytes, `thumbHash`, and cascade delete on `albumId`), enforce `PRAGMA foreign_keys = ON` on every connection, and explicitly delete child photo rows in the same transaction on album purge.

#### Scenario: Deleting an album cascades to its photo records
- **WHEN** an album row is deleted from the database
- **THEN** all associated `photos` rows SHALL be deleted atomically in the same transaction and via foreign-key cascade

### Requirement: Compact cached wall manifest
`GET /api/wall` SHALL be cached via Next.js 16 `'use cache'` with `cacheTag('wall')` (under `cacheComponents: true`) and return only `published` albums (with derived 3-column world positions/bounds, grid columns, title, caption/description, optional `cameraName`/`dateLabel`/`locationLabel`, optional soundtrack metadata, and compact active per-photo arrays containing `id`, `storagePath`, `width`, `height`, `aspectRatio`, `dominantColor`, `thumbHash`, `sortOrder`) plus a single `cdnBase`.

#### Scenario: Initial manifest excludes draft and deleting albums and deleting photos
- **WHEN** a visitor requests `GET /api/wall` while an album has `status = 'draft'` or `status = 'deleting'`, or an individual photo has `status = 'deleting'`
- **THEN** the response SHALL omit those draft/deleting albums and deleting photos and return only `published` albums with active compact photo arrays and `cdnBase`

### Requirement: Three-albums-per-row derived non-overlapping wall layout in world units
The shared spatial layout engine (`100px = 1 world unit`) SHALL compute placard-inclusive album bounding boxes and derive deterministic positions in `computeWallGridPositions(publishedAlbums sorted by sortOrder)` in a **3-albums-per-row** grid, centered horizontally with uniform non-overlapping row/column gaps calculated from the maximum album bounds in each row and column. Drafts SHALL NOT reserve wall space.

#### Scenario: Published albums wrap cleanly at 3 per row without draft holes
- **WHEN** 7 `published` albums (of 10–20 photos each) and 2 `draft` albums are passed to the wall manifest builder
- **THEN** `draft` albums SHALL be excluded, `published` albums 1–3 SHALL occupy row 0, 4–6 row 1, album 7 row 2, and no two album bounding boxes plus margin SHALL overlap
