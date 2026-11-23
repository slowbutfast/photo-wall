## Purpose

Delivers a quiet, gallery-ephemera visitor HUD, an unobstructed Photo Focus label bar, and a lazy-loaded Curator Drawer supporting recursive folder uploads, draft resume/discard, and partial-failure retries.

## ADDED Requirements

### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger
The visitor interface SHALL omit top-left coordinate telemetry, check session status via `GET /api/admin/auth` on mount, show a subtle lock icon until authenticated (and `Curate` once authenticated), and present `Overview` + bottom Exhibition Room Directory.

#### Scenario: Unauthenticated visitor sees lock icon instead of Curate
- **WHEN** a visitor loads the gallery without an admin session cookie
- **THEN** the top-right HUD SHALL display `Overview` and a subtle lock icon rather than an active `Curate` label

### Requirement: Unobtrusive Photo Focus bar with lazy detail EXIF
Inspecting a single print SHALL fetch detail metadata lazily from `GET /api/albums/[id]/photos` (if not cached) and anchor `Prev`, `Next`, title, curated EXIF, and `Return (Esc)` to a full-width bottom bar without blurring the gallery background.

#### Scenario: Stepping through prints in Photo Focus
- **WHEN** a visitor clicks `Next` or presses `ArrowRight` while inspecting a print
- **THEN** the camera SHALL transition smoothly to the next print in that exhibition and update the bottom label bar

### Requirement: Lazy-loaded Curator Drawer with resilient folder upload
Admin UI code SHALL be code-split via `next/dynamic` and support recursive folder drag-and-drop (synchronous `dataTransfer.items` snapshot, looping `readEntries()` past 100 entries, leaf-folder grouping, `exifr` + `32px` ThumbHash, UUIDv7 + XHR `upload.onprogress`), sending explicit `PATCH` publish only when all photos succeed, and keeping incomplete albums in `draft` with per-file retry and draft Resume/Discard controls.

#### Scenario: Dropping a folder with >100 photos and mixed video files succeeds and publishes
- **WHEN** an authenticated admin drops a folder containing 120 photos and 3 `.mp4` videos onto the Curator dropzone
- **THEN** the uploader SHALL read all 120 photos, notify that the 3 videos were skipped, upload all 120 via XHR, send `PATCH` to publish the album, and mount it on the 3D wall

#### Scenario: Partial upload failure retains draft and offers retry
- **WHEN** 2 of 120 photo uploads fail after automatic retries
- **THEN** the album SHALL remain in `draft` status (never sent `PATCH` publish) and the Curator Drawer SHALL display the 2 failed files with a Retry action and a Discard Draft option
