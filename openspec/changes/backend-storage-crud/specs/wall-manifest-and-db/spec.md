## Purpose

Provides SQLite/LibSQL persistence, deterministic non-overlapping album island layout in shared world units (`100px = 1 unit`), and a Next.js 16 cached compact wall manifest so macro rendering has all print geometry without N+1 fetches.

## ADDED Requirements

### Requirement: Relational schema with foreign keys and deletion tombstones
The database layer SHALL define `albums` (including `status: 'draft' | 'published' | 'deleting'`, `expectedCount`, and default timestamps) and `photos` (including `contentHash`, `thumbHash`, `exifJson`, and cascade delete on `albumId`), enforce `PRAGMA foreign_keys = ON` on every connection, and explicitly delete child photo rows in the same transaction on album purge.

#### Scenario: Deleting an album cascades to its photo records
- **WHEN** an album row is deleted from the database
- **THEN** all associated `photos` rows SHALL be deleted atomically in the same transaction and via foreign-key cascade

### Requirement: Compact cached wall manifest and published-only detail endpoint
`GET /api/wall` SHALL be cached via Next.js 16 `'use cache'` with `cacheTag('wall')` and return only `published` albums (with bounds, coordinates, grid columns, title, description, and compact per-photo arrays containing `id`, `storagePath`, `width`, `height`, `aspectRatio`, `dominantColor`, `thumbHash`, `sortOrder`) plus a single `cdnBase`. Detail metadata (`title`, `caption`, allowlisted `exifJson`) SHALL be served by `GET /api/albums/[id]/photos`, which SHALL enforce `status = 'published'`.

#### Scenario: Initial manifest excludes draft and deleting albums
- **WHEN** a visitor requests `GET /api/wall` while an album has `status = 'draft'` or `status = 'deleting'`
- **THEN** the response SHALL omit that album and return only `published` albums with compact photo arrays and `cdnBase`

#### Scenario: Detail endpoint rejects unpublished album IDs
- **WHEN** a visitor requests `GET /api/albums/[id]/photos` for an album in `draft` or `deleting` status
- **THEN** the endpoint SHALL respond with `404 Not Found`

### Requirement: Bounded non-overlapping island placement in world units
The shared spatial layout engine (`100px = 1 world unit`) SHALL compute placard-inclusive album bounding boxes and place new albums (including `draft` reservations) using a bounded spiral search with collision margin checks and a deterministic fallback ring.

#### Scenario: Sequential album creation never overlaps existing or draft islands
- **WHEN** a new album is created with an expected photo count and column count
- **THEN** its assigned `(posX, posY)` SHALL not overlap any existing `published` or `draft` album's bounding box plus margin
