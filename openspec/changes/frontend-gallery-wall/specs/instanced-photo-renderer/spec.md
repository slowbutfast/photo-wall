## Purpose

Enables smooth rendering of thousands of framed prints on an infinite wall using `O(1)` draw calls, unified mat+print pooling, priority-ordered byte-budgeted off-thread texture streaming, and `O(albums)` broad-phase + `O(1)` cell hit-testing.

## ADDED Requirements

### Requirement: O(1) draw-call hybrid instanced renderer with unified mat and print lift
The renderer SHALL draw wall-plane cast shadows, instanced mats with `32x32` ThumbHash atlas placeholders (falling back to dominant color), and pooled textured prints (`VisiblePrintPool`, rendering their own mat while hiding their instanced slot via `aVisible = 0`) in `O(1)` draw calls regardless of total photo count.

#### Scenario: Large gallery meets frame-time target at macro zoom
- **WHEN** a synthetic 50-album / 2,000-photo manifest (`?demo=2000`) is panned and zoomed at `1920x1080` on an integrated laptop GPU
- **THEN** the renderer SHALL achieve `p95 frame time <= 16.7ms` and `GPU texture memory < 256 MB`

#### Scenario: Pooled print and mat lift and tilt together
- **WHEN** a visitor hovers or focuses on a visible print rendered by `VisiblePrintPool`
- **THEN** the textured print and its archival mat SHALL elevate and tilt as one unified rigid object while its underlying instanced slot remains hidden

### Requirement: Priority-ordered actual-byte VRAM texture pool
The texture manager SHALL compute VRAM cost from actual decoded `ImageBitmap` dimensions (`width * height * 4 * 1.33`), enforce `256 MB` desktop / `96 MB` mobile (`viewport < 768px` heuristic) with eviction priority (`off-screen` → `visible thumbs` → `visible medium` → `focus` capped at 3), decode off-thread with `imageOrientation: 'from-image'` + shader V-flip, throttle `initTexture` to `<= 2` uploads/frame, and close bitmaps + dispose textures on eviction.

#### Scenario: Local mode full originals stay within byte budget
- **WHEN** the backend serves full-resolution images (`STORAGE_DRIVER=local`) and the pool reaches its byte budget
- **THEN** the pool SHALL account using decoded `ImageBitmap` dimensions and evict lowest-priority textures while closing bitmaps and disposing GPU textures

#### Scenario: Flying into an album streams textures without frame hitches
- **WHEN** the camera flies from macro view into an exhibition cluster
- **THEN** visible prints SHALL display their ThumbHash placeholder immediately and stream longest-edge LOD textures from shared `lodUrl.ts` with at most two GPU texture uploads per frame

### Requirement: Broad-phase album + O(1) cell hit-testing and tactile hover
Pointer hit-testing SHALL scan album AABBs (`O(albums)`) and resolve the hovered print cell arithmetically in `O(1)` time, driving physical Z-lift, subtle 3D tilt, and mouse-reactive glass glare.

#### Scenario: Hovering a print tilts it and glides glass reflection
- **WHEN** a pointer moves across a visible print frame
- **THEN** the print SHALL elevate along Z, tilt toward the pointer within configured degree bounds, and sweep a diagonal specular reflection across its glass surface
