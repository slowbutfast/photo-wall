## Purpose

Delivers a quiet, gallery-ephemera visitor HUD, an unobstructed Photo Focus label bar, and a lazy-loaded Curator Drawer supporting recursive folder uploads, draft resume/discard, and partial-failure retries.

## ADDED Requirements

### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger
The visitor interface SHALL omit top-left coordinate telemetry, check session status via `GET /api/admin/auth` on mount, show a subtle lock icon until authenticated (and `Curate` once authenticated), and present `Overview` + bottom Exhibition Room Directory.

#### Scenario: Unauthenticated visitor sees lock icon instead of Curate
- **WHEN** a visitor loads the gallery without an admin session cookie
- **THEN** the top-right HUD SHALL display `Overview` and a subtle lock icon rather than an active `Curate` label

### Requirement: Unobtrusive Photo Focus bar with album caption and optional manual metadata
Inspecting a single print SHALL anchor `Prev`, `Next`, the **album's caption** as the primary line, an optional subtle subtitle containing only owner-entered fields (**Camera**, **Date**, **Location**—all off/empty by default, with zero auto-extracted EXIF), and `Return (Esc)` to a full-width bottom bar without blurring the gallery background.

#### Scenario: Stepping through prints shows album caption and only populated manual fields
- **WHEN** a visitor inspects a print in an album where only `Camera` and `Location` were entered by the owner (and `Date` was left empty)
- **THEN** the bottom bar SHALL display the album caption as its title and `Camera • Location` underneath, omitting `Date` and any auto-extracted lens/shutter EXIF

### Requirement: Lazy-loaded Curator Drawer with resilient folder upload and soundtrack editor
Admin UI code SHALL be code-split via `next/dynamic` and support recursive folder drag-and-drop (synchronous `dataTransfer.items` snapshot, looping `readEntries()` past 100 entries, leaf-folder grouping, `32px` ThumbHash, UUIDv7 + XHR `upload.onprogress`), optional YouTube URL paste (`POST /api/admin/youtube/inspect`) with editable **Artist** and **Song Title** + auto-derived fixed duration, optional **Camera / Date / Location** inputs, explicit `PATCH` publish on all-success, and per-file retry + draft Resume/Discard on partial failure.

#### Scenario: Dropping a folder with >100 photos and mixed video files succeeds and publishes
- **WHEN** an authenticated admin drops a folder containing 120 photos and 3 `.mp4` videos onto the Curator dropzone
- **THEN** the uploader SHALL read all 120 photos, notify that the 3 videos were skipped, upload all 120 via XHR, send `PATCH` to publish the album, and mount it on the 3D wall

#### Scenario: Partial upload failure retains draft and offers retry
- **WHEN** 2 of 120 photo uploads fail after automatic retries
- **THEN** the album SHALL remain in `draft` status (never sent `PATCH` publish) and the Curator Drawer SHALL display the 2 failed files with a Retry action and a Discard Draft option
