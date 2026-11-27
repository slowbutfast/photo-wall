# wall-manifest-and-db Specification

## Purpose
Provides SQLite/LibSQL persistence, deterministic non-overlapping album island layout in shared world units (`100px = 1 unit`), and a Next.js 16 cached compact wall manifest so macro rendering has all print geometry without N+1 fetches.
## Requirements
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
The shared spatial layout engine (`100px = 1 world unit`) SHALL compute placard-inclusive album bounding boxes and derive deterministic positions in `computeWallGridPositions(publishedAlbums sorted by sortOrder)` in a **3-albums-per-row** grid, centered horizontally with uniform non-overlapping row/column gaps calculated from the maximum album bounds in each row and column. Each album box SHALL be **top- and left-aligned inside its grid cell** (cell = column max width × row max height), so mixed-size albums share a common row top edge and a common column left edge instead of being centred inside a moving cell. Drafts SHALL NOT reserve wall space.

#### Scenario: Published albums wrap cleanly at 3 per row without draft holes
- **WHEN** 7 `published` albums (of 10–20 photos each) and 2 `draft` albums are passed to the wall manifest builder
- **THEN** `draft` albums SHALL be excluded, `published` albums 1–3 SHALL occupy row 0, 4–6 row 1, album 7 row 2, and no two album bounding boxes plus margin SHALL overlap

#### Scenario: Mixed-size albums share the row top and column left
- **WHEN** Row 0 contains a short album in column 1, a taller album in column 2 and a medium album in column 3, and a later row makes column 1 wider than that short album
- **THEN** every Row-0 album's top edge (`position.y + bounds.height / 2`) SHALL be equal, and the short column-1 album's left edge (`position.x - bounds.width / 2`) SHALL equal the column's left edge rather than being inset by the column width difference

### Requirement: Hosted libSQL connection resolution
The database client SHALL resolve its URL as `DATABASE_URL`, then `TURSO_DATABASE_URL`, then `file:./data/photo-wall.db`. It SHALL resolve its auth token as `DATABASE_AUTH_TOKEN`, then `TURSO_AUTH_TOKEN`, then none. Empty strings SHALL count as unset at every step. The resolved token SHALL be passed to `createClient` as `authToken` and SHALL never be logged or embedded in the URL. `drizzle.config.ts` SHALL resolve `dbCredentials.url` and `dbCredentials.authToken` with the same precedence, using the `turso` dialect when the resolved URL starts with `libsql:` and `sqlite` otherwise.

#### Scenario: Turso integration env is used when DATABASE_URL is unset
- **WHEN** `DATABASE_URL` is unset, `TURSO_DATABASE_URL=libsql://photo-wall-x.turso.io` and `TURSO_AUTH_TOKEN=t0k`
- **THEN** `createClient` SHALL be called with `{ url: 'libsql://photo-wall-x.turso.io', authToken: 't0k' }`

#### Scenario: Explicit DATABASE_* overrides the integration
- **WHEN** `DATABASE_URL=libsql://other.turso.io`, `DATABASE_AUTH_TOKEN=a`, `TURSO_DATABASE_URL=libsql://photo-wall-x.turso.io` and `TURSO_AUTH_TOKEN=b`
- **THEN** `createClient` SHALL be called with `{ url: 'libsql://other.turso.io', authToken: 'a' }`

#### Scenario: Local default is unchanged
- **WHEN** none of the four variables is set (or all are empty strings)
- **THEN** `createClient` SHALL be called with `url: 'file:./data/photo-wall.db'` and `authToken` undefined, and the data directory SHALL be created as before

### Requirement: Migrations ship with serverless functions
Because `createDatabase` applies Drizzle migrations at runtime from `./drizzle`, `next.config.ts` SHALL declare `outputFileTracingIncludes` so that `drizzle/**/*` is copied into every server function's trace.

#### Scenario: Build trace contains the migration journal
- **WHEN** `npm run build` completes
- **THEN** the `.nft.json` trace for the `/api/wall` route handler (and the root page) SHALL list `drizzle/meta/_journal.json` and `drizzle/0000_init.sql`

#### Scenario: First request on an empty hosted DB creates the schema
- **WHEN** the deployed app with an empty Turso database receives `GET /photos/api/wall`
- **THEN** it SHALL respond `200` with an empty `albums` array, and the database SHALL then contain the `albums`, `photos` and `__drizzle_migrations` tables

### Requirement: Failed database initialisation is retried
`getDb()` SHALL NOT keep a rejected initialisation promise. If `createDatabase` rejects (network error, migration race, bad credentials), the cached promise SHALL be cleared, so the next `getDb()` call attempts a fresh connection. Concurrent callers during one in-flight attempt SHALL still share that single attempt.

#### Scenario: Transient failure recovers on the next call
- **WHEN** the first `createDatabase` call rejects and the second succeeds
- **THEN** the first `getDb()` SHALL reject, and a subsequent `getDb()` SHALL resolve to a working database, with `createClient` called exactly twice

#### Scenario: Concurrent callers share one attempt
- **WHEN** `getDb()` is called three times before the first initialisation settles
- **THEN** `createClient` SHALL be called exactly once

