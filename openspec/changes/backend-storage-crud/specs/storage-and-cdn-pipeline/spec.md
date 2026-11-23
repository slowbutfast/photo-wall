## Purpose

Manages buffered original-pixel image uploads (`<= 25 MB`) with lossless GPS/XMP privacy stripping, immutable `albumId`-keyed storage paths, shared longest-edge LOD URLs, and tombstone-recoverable deletion with wildcard CDN purge.

## ADDED Requirements

### Requirement: Storage adapter keyed by immutable albumId
All uploaded objects SHALL be stored under `/albums/{albumId}/{photoId}.{ext}` via a unified `StorageAdapter` supporting Bunny.net Storage (`PUT`, recursive directory `DELETE`, wildcard Pull Zone Purge) and a local dev filesystem adapter served through `/api/local-uploads/[...path]`. Longest-edge Optimizer URL construction SHALL live in a single shared pure module (`lodUrl.ts`).

#### Scenario: Renaming an album preserves storage paths
- **WHEN** an admin renames an album's title or slug
- **THEN** all existing photo `storagePath` values under `/albums/{albumId}/` SHALL remain valid without moving objects in storage

### Requirement: Buffered magic-byte validation and lossless GPS/XMP stripping
The upload pipeline SHALL buffer uploads up to `25 MB` (returning `413 Payload Too Large` above `25 MB`), sniff magic bytes to accept only `JPEG`, `PNG`, `WebP`, and `AVIF` (rejecting videos or spoofed files with `415 Unsupported Media Type`), enforce max pixel-dimension caps, and strip GPS metadata from both EXIF and XMP while preserving pixel data and ICC color profiles.

#### Scenario: Oversized file is rejected with 413
- **WHEN** a client uploads a file larger than `25 MB`
- **THEN** the server SHALL reject the request with `413 Payload Too Large` before writing to storage

#### Scenario: Video or spoofed file is rejected with 415
- **WHEN** a client uploads a `.mp4` or non-image file even with an image extension
- **THEN** the server SHALL reject the request with `415 Unsupported Media Type` before writing to storage

#### Scenario: JPEG with EXIF GPS and XMP GPS retains pixels and ICC profile without location data
- **WHEN** a JPEG containing `APP1` GPS IFD tags, XMP `exif:GPSLatitude` / `exif:GPSLongitude`, and an `APP2` Display P3 ICC profile is uploaded
- **THEN** the stored object SHALL have all GPS EXIF tags and XMP GPS packets removed while preserving the compressed pixel data and ICC profile

### Requirement: Recoverable upload rollback and tombstone-backed wildcard purge
If storage `PUT` succeeds but DB upsert fails, the server SHALL delete the uploaded storage object in cleanup. Deletions SHALL mark the album or photo as `'deleting'` (tombstone), execute Storage `DELETE` and wildcard CDN Pull Zone purge (`/albums/{albumId}/*` for albums, `/albums/{albumId}/{photoId}.*` for photos), and then remove the database row(s).

#### Scenario: Failed DB write cleans up orphaned storage upload
- **WHEN** a photo upload succeeds to storage but the subsequent database upsert throws
- **THEN** the server SHALL delete the newly uploaded storage object and return an error response

#### Scenario: Album deletion purges all Optimizer variants via wildcard
- **WHEN** an admin deletes an album
- **THEN** the server SHALL mark the album `'deleting'`, invoke recursive storage `DELETE` on `/albums/{albumId}/`, purge `/albums/{albumId}/*` on the CDN Pull Zone, and delete the DB rows
