# gallery-hud-and-curator-ui Specification

## Purpose
Delivers a quiet, gallery-ephemera visitor HUD, an unobstructed Photo Focus label bar, and a lazy-loaded Curator Drawer supporting recursive folder uploads, draft resume/discard, and partial-failure retries.
## Requirements
### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger
This change restyles the HUD chrome without altering its authentication boundary (which `admin-route-isolation` owns separately): the HUD SHALL present the playground's exact Swiss-label top-right segmented control (`11px`, `500`, `uppercase`, `0.1em`, `24px` inset), compact centered translucent bottom dock (`max-width: min(760px, calc(100vw - 48px))`, `rgba(18,18,18,0.85)`, `blur(8px)`, horizontal edge fade masks), tracked uppercase `PhotoFocusBar` (`← PREV` / `NEXT →` / `RETURN [ESC]`), Curator Settings with the real playground placard-material selector (**Beveled Glass** → `.mat-acrylic` default, **Brushed Aluminum** → `.mat-aluminum`, **Archival Foamcore** → `.mat-foamcore`), and a `FolderDropzone` that recovers cleanly (showing a clear validation error without getting stuck) when a single folder contains more than `MAX_PHOTOS_PER_ALBUM = 20` files.

#### Scenario: Switching placard material or dropping >20 files in one folder behaves cleanly
- **WHEN** a curator switches placard material in Settings or drops a folder with 25 images into `FolderDropzone`
- **THEN** placards SHALL switch immediately between `.mat-acrylic`, `.mat-aluminum`, and `.mat-foamcore`, and `FolderDropzone` SHALL display a clear 20-photo cap message and remain usable without getting stuck
### Requirement: Unobtrusive Photo Focus bar with album caption and optional manual metadata
Inspecting a single print SHALL anchor `Prev`, `Next`, the **album's caption** as the primary line, an optional subtle subtitle containing only owner-entered fields (**Camera**, **Date**, **Location**—all off/empty by default, with zero auto-extracted EXIF), and `Return (Esc)` to a full-width bottom bar without blurring the gallery background.

#### Scenario: Stepping through prints shows album caption and only populated manual fields
- **WHEN** a visitor inspects a print in an album where only `Camera` and `Location` were entered by the owner (and `Date` was left empty)
- **THEN** the bottom bar SHALL display the album caption as its title and `Camera • Location` underneath, omitting `Date` and any auto-extracted lens/shutter EXIF

### Requirement: Lazy-loaded Curator Drawer with resilient folder upload and soundtrack editor
Admin UI code SHALL be code-split via `next/dynamic` and support recursive folder drag-and-drop (synchronous `dataTransfer.items` snapshot, looping `readEntries()` past 100 entries, leaf-folder grouping, `32px` ThumbHash, UUIDv7 + XHR `upload.onprogress`), optional YouTube URL paste (`POST /api/admin/youtube/inspect` returning `{ videoId, artistGuess, titleGuess }` with hidden `YT.Player.getDuration()` capture in the browser) with editable **Artist** and **Song Title**, optional **Camera / Date / Location** inputs, client-local **Lighting Preview**, **Pending Deletions** retry list, explicit `PATCH` publish on all-success, and per-file retry + draft Resume/Discard on partial failure.

#### Scenario: Dropping a folder with >100 photos and mixed video files succeeds and publishes
- **WHEN** an authenticated admin drops a folder containing 120 photos and 3 `.mp4` videos onto the Curator dropzone
- **THEN** the uploader SHALL read all 120 photos, notify that the 3 videos were skipped, upload all 120 via XHR, send `PATCH` to publish the album, and mount it on the 3D wall

#### Scenario: Partial upload failure retains draft and offers retry
- **WHEN** 2 of 120 photo uploads fail after automatic retries
- **THEN** the album SHALL remain in `draft` status (never sent `PATCH` publish) and the Curator Drawer SHALL display the 2 failed files with a Retry action and a Discard Draft option

