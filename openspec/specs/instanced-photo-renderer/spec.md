# instanced-photo-renderer Specification

## Purpose
Enables smooth rendering of thousands of framed prints on an infinite wall using a viewport-culled, projected-size LOD CSS DOM world paired with a WebGL2 PBR wall and GPU-baked lightmap, with native DOM hit-testing and keyboard-accessible focus order.
## Requirements
### Requirement: Viewport-culled, projected-size LOD DOM world with aspect-fitted frames and compositor hygiene
`CssGalleryWorld` SHALL enforce `MAX_PHOTOS_PER_ALBUM = 20` (`10–20` photo salon clusters in `4–5` columns) with generous inter-album breathing room (`ISLAND_GAP = 2.2u` / `220px`), position every visible album island and photo cell absolutely from `islandLayout.ts` (`cssLeft = worldX * 100`, `cssTop = -worldY * 100` to map y-up world coordinates to y-down CSS) inside a 2D-transformed `.world` container (without `preserve-3d` on `.world`), compute island visibility via pure `visibleIslands(camera, viewport, placements, margin)` (omitting or rendering empty boxes for off-screen islands), and apply `contain: layout` (NOT `contain: paint`, so cast shadows and hover tilt are never clipped at island edges) plus gesture-only `will-change: transform`. Inside each `CELL_SIZE × CELL_SIZE` grid slot from `computeAlbumGrid`, the frame and thinner `#F4F4F2` recessed cotton mat (with top inner shadow and downward-offset wall drop shadow) SHALL size proportionally to `photo.aspectRatio`, constrained to fit within `CELL_SIZE × CELL_SIZE` and centered in the slot, displaying a `thumbHash` data-URL or `dominantColor` placeholder while the `<img>` loads. During `print` focus, non-focused sibling `.photo-frame` elements SHALL dim per-element (`opacity: 0.45` + subtle desaturation) so the eye lands on the focused print without breaking `.world`/`.album-island` `backdrop-filter`. Image widths SHALL be derived from projected size (`lodWidth = ceil(cellPx * scale * DPR)`) snapped to the backend's `256 / 800 / 2048` buckets (supported by both Bunny Optimizer and disk-cached `?width=` resizing in `/api/local-uploads/[...path]`), while zoom tiers (`macro` `scale < 0.25`, `album`, `print`) control styling switches (blur, shadows, placard text, soundtrack thumbnails, iframes). Prints SHALL be accessible focusable buttons with `alt` from title/caption and keyboard Tab order matching `sortOrder`.

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
