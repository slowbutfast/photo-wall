# storage-and-cdn-pipeline Specification

## Purpose
Manages buffered original-pixel image uploads (`<= 25 MB`) with lossless GPS/XMP privacy stripping, immutable `albumId`-keyed storage paths, shared longest-edge LOD URLs, and tombstone-recoverable deletion with wildcard CDN purge.
## Requirements
### Requirement: Storage adapter keyed by immutable albumId
All uploaded objects SHALL be stored under `/albums/{albumId}/{photoId}.{ext}` via a unified `StorageAdapter` supporting Bunny.net Storage (`PUT`, recursive directory `DELETE`, wildcard Pull Zone Purge) and a local dev filesystem adapter served through `/api/local-uploads/[...path]`. Longest-edge Optimizer URL construction SHALL live in a single shared pure module (`lodUrl.ts`).

#### Scenario: Renaming an album preserves storage paths
- **WHEN** an admin renames an album's title or slug
- **THEN** all existing photo `storagePath` values under `/albums/{albumId}/` SHALL remain valid without moving objects in storage

### Requirement: Buffered magic-byte validation, Orientation-only EXIF allowlist, and lossless GPS/XMP stripping
The upload pipeline SHALL buffer uploads up to `25 MB` (returning `413 Payload Too Large` above `25 MB`), sniff magic bytes to accept only `JPEG`, `PNG`, and `WebP`; AVIF SHALL return `415 Unsupported Media Type` until a full HEIF/AVIF item-graph rewriter exists (videos or spoofed files are also rejected with `415`) — enforce max pixel-dimension caps, strip all XMP packets and all GPS/camera EXIF tags while preserving an **Orientation-only EXIF allowlist** (rebuilding a minimal `APP1`/EXIF block containing only `Orientation`) and preserving compressed pixel data and ICC color profiles, and compute authoritative `width`, `height`, and `aspectRatio` *after* applying EXIF orientations 5–8.

#### Scenario: Oversized file is rejected with 413
- **WHEN** a client uploads a file larger than `25 MB`
- **THEN** the server SHALL reject the request with `413 Payload Too Large` before writing to storage

#### Scenario: Video or spoofed file is rejected with 415
- **WHEN** a client uploads a `.mp4` or non-image file even with an image extension
- **THEN** the server SHALL reject the request with `415 Unsupported Media Type` before writing to storage

#### Scenario: Orientation-6 JPEG preserves orientation and swaps authoritative dimensions without leaking GPS or camera tags
- **WHEN** a `4000x3000` JPEG with EXIF `Orientation = 6`, `GPSLatitude`/`GPSLongitude`, camera Make/Model, XMP packets, and an `APP2` Display P3 ICC profile is uploaded
- **THEN** the stored object SHALL retain only `Orientation = 6` in its minimal EXIF block alongside the intact pixels and ICC profile, strip all GPS/camera/XMP metadata, and record `width = 3000`, `height = 4000`, `aspectRatio = 0.75`

### Requirement: Recoverable upload rollback and tombstone-backed wildcard purge
If storage `PUT` succeeds but DB upsert fails, the server SHALL delete the uploaded storage object in cleanup (and only after a prior DB idempotency check confirms `(photoId, contentHash)` does not already exist). Deletions SHALL mark the album or photo as `'deleting'` (tombstone), execute Storage `DELETE` and wildcard CDN Pull Zone purge (`/albums/{albumId}/*` for albums, `/albums/{albumId}/{photoId}.*` for photos), and then remove the database row(s). Pending `'deleting'` tombstones SHALL be retried automatically on server startup and exposed via Curator Drawer **Pending Deletions** retry controls.

#### Scenario: Failed DB write cleans up orphaned storage upload
- **WHEN** a new photo upload succeeds to storage but the subsequent database upsert throws
- **THEN** the server SHALL delete the newly uploaded storage object and return an error response

#### Scenario: Album deletion purges all Optimizer variants via wildcard and supports retry
- **WHEN** an admin deletes an album (or retries a failed `'deleting'` tombstone)
- **THEN** the server SHALL mark the album `'deleting'`, invoke recursive storage `DELETE` on `/albums/{albumId}/`, purge `/albums/{albumId}/*` on the CDN Pull Zone, and delete the DB rows

### Requirement: Public CDN base resolution
`getCdnBase()` SHALL return the base the browser uses to load photos. With `STORAGE_DRIVER=bunny`, it SHALL return `CDN_BASE_URL` when set and non-empty, falling back to `BUNNY_PULL_ZONE_URL`, and it SHALL throw when neither is set. With the local driver, it SHALL return `withBase('/api/local-uploads')`. Bunny cache purges SHALL keep targeting `BUNNY_PULL_ZONE_URL` regardless of `CDN_BASE_URL`.

#### Scenario: Custom hostname wins for public URLs
- **WHEN** `STORAGE_DRIVER=bunny`, `BUNNY_PULL_ZONE_URL=https://zone.b-cdn.net` and `CDN_BASE_URL=https://cdn.gregory-lazatin.com`
- **THEN** `getCdnBase()` SHALL return `https://cdn.gregory-lazatin.com`, and `buildPurgeUrl` SHALL still be called with `https://zone.b-cdn.net`

#### Scenario: Pull zone fallback
- **WHEN** `STORAGE_DRIVER=bunny`, `BUNNY_PULL_ZONE_URL=https://zone.b-cdn.net` and `CDN_BASE_URL` is unset or empty
- **THEN** `getCdnBase()` SHALL return `https://zone.b-cdn.net`

#### Scenario: Local driver base carries the base path
- **WHEN** the local storage driver is active
- **THEN** `getCdnBase()` SHALL return `/photos/api/local-uploads`, and a `buildLodUrl` result built from it SHALL resolve to a `200` image under the running dev server

#### Scenario: Demo manifest base carries the base path
- **WHEN** a `?demo=` fake manifest is built
- **THEN** its `cdnBase` SHALL be `/photos/demo`

