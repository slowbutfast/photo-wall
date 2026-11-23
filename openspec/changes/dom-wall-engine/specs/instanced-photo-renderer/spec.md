## REMOVED Requirements

### Requirement: O(1) draw-call hybrid instanced renderer with unified mat and print lift
**Reason**: Replaced by the Zoom-Tiered, viewport-culled CSS DOM world (`CssGalleryWorld`) paired with the GPU-baked-lightmap WebGL2 `PbrWallCanvas`, eliminating Three.js / R3F shader drift, 1:1 square cropping, and z-fighting.
**Migration**: Render viewport-culled islands positioned from `islandLayout.ts` inside a 2D-transformed `.world` container with projected-size image LOD (`256/800/2048`) and Zoom-Tiered styling.

### Requirement: Priority-ordered actual-byte VRAM texture pool
**Reason**: Native `<img>` elements with `decoding="async"`, `thumbHash`/`dominantColor` placeholders, projected-size LOD (`256/800/2048`), and local-mode derivative caching handle decoding, EXIF orientation, and Display P3 color profiles natively without a WebGL `ImageBitmap` VRAM pool.
**Migration**: Manage WebGL2 plaster/lightmap texture disposal in `PbrWallCanvas`, snap `<img>` requests to backend buckets (`256/800/2048`) by projected size (`ceil(cellPx * scale * DPR)`), and serve cached `?width=256|800|2048` derivatives from `/api/local-uploads/[...path]`.

### Requirement: Broad-phase album + O(1) cell hit-testing and tactile hover
**Reason**: Native DOM pointer and keyboard events handle print/placard hit-testing and accessibility directly without `hitTestWall`.
**Migration**: Use focusable `.photo-frame` button elements and native DOM hover/click handlers, applying local 3D hover tilt (`max 5°`) and diagonal glass glare only on the hovered/focused print.

## ADDED Requirements

### Requirement: Viewport-culled, projected-size LOD DOM world with aspect-fitted frames and compositor hygiene
`CssGalleryWorld` SHALL position every visible album island and photo cell absolutely from `islandLayout.ts` (`cssLeft = worldX * 100`, `cssTop = -worldY * 100` to map y-up world coordinates to y-down CSS) inside a 2D-transformed `.world` container (without `preserve-3d` on `.world`), compute island visibility via pure `visibleIslands(camera, viewport, placements, margin)` (omitting or rendering empty boxes for off-screen islands), and apply `contain: layout` (NOT `contain: paint`, so cast shadows and hover tilt are never clipped at island edges) plus gesture-only `will-change: transform`. Inside each `CELL_SIZE × CELL_SIZE` grid slot from `computeAlbumGrid`, the frame and recessed cotton mat SHALL size proportionally to `photo.aspectRatio`, constrained to fit within `CELL_SIZE × CELL_SIZE` and centered in the slot, displaying a `thumbHash` data-URL or `dominantColor` placeholder while the `<img>` loads. Image widths SHALL be derived from projected size (`lodWidth = ceil(cellPx * scale * DPR)`) snapped to the backend's `256 / 800 / 2048` buckets (supported by both Bunny Optimizer and disk-cached `?width=` resizing in `/api/local-uploads/[...path]`), while zoom tiers (`macro` `scale < 0.25`, `album`, `print`) control styling switches (blur, shadows, placard text, iframes). Prints SHALL be accessible focusable buttons with `alt` from title/caption and keyboard Tab order matching `sortOrder`.

#### Scenario: Aspect-fitted frame and mat center cleanly inside each neutral grid cell
- **WHEN** an album containing `3:4` portrait and `16:9` landscape photographs mounts on the wall
- **THEN** each `.photo-frame` and its recessed cotton mat SHALL size proportionally to `photo.aspectRatio`, constrained to `CELL_SIZE × CELL_SIZE` and centered in its `computeAlbumGrid` cell, with `thumbHash`/`dominantColor` visible until the image loads

#### Scenario: Projected-size LOD and viewport culling prevent memory cliffs on zoom
- **WHEN** a visitor crosses from `macro` (`scale < 0.25`) into `album` zoom across 50 albums
- **THEN** `visibleIslands` SHALL cull off-screen islands, each visible print SHALL request `ceil(cellPx * scale * DPR)` snapped to `256 / 800 / 2048` (never jumping all 1,000 prints straight to `800px`), and `/api/local-uploads` SHALL serve disk-cached resized derivatives when `STORAGE_DRIVER=local`

#### Scenario: Macro zoom meets frame-time, settle-hitch, and mobile memory targets
- **WHEN** a 50-album / 2,000-photo manifest backed by real JPEGs is panned and zoomed at `macro` tier (`scale < 0.25`)
- **THEN** islands SHALL strip `backdrop-filter`, use flat single shadows, hide placard text and soundtrack plaque thumbnails, mount zero iframes, and achieve `p95 frame time <= 16.7ms` during zoom gestures on the target iGPU machine, `<= 100ms` settle hitch when `will-change: transform` is removed, and zero tab reloads on the target iPhone/Safari device

#### Scenario: Keyboard and screen-reader users can traverse prints in exhibition order
- **WHEN** a visitor tabs through an album on the DOM wall
- **THEN** each `.photo-frame` SHALL be a focusable button in `sortOrder` sequence with an accessible `alt` derived from its title or album caption
