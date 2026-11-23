## REMOVED Requirements

### Requirement: O(1) draw-call hybrid instanced renderer with unified mat and print lift
**Reason**: Replaced by the Zoom-Tiered CSS DOM world (`CssGalleryWorld`) paired with the baked-lightmap WebGL2 `PbrWallCanvas`, eliminating Three.js / R3F shader drift, 1:1 square cropping, and z-fighting.
**Migration**: Render absolutely positioned islands from `islandLayout.ts` inside a 2D-transformed `.world` container with Zoom-Tiered LOD (`macro` / `album` / `print`).

### Requirement: Priority-ordered actual-byte VRAM texture pool
**Reason**: Native `<img>` elements with `decoding="async"` and Bunny Optimizer LOD URLs (`lodUrl.ts`) handle image decoding, EXIF orientation, and Display P3 color profiles natively without a WebGL `ImageBitmap` VRAM pool.
**Migration**: Manage WebGL2 plaster/lightmap texture disposal in `PbrWallCanvas` and size `<img>` requests via Zoom-Tiered `lodUrl.ts` widths (`128` / `800` / `2048`).

### Requirement: Broad-phase album + O(1) cell hit-testing and tactile hover
**Reason**: Native DOM pointer events handle print/placard hit-testing directly without `hitTestWall`.
**Migration**: Use native DOM click/hover handlers on `.photo-frame` and `.museum-placard`, applying local 3D hover tilt (`max 5°`) and diagonal glass glare only on the hovered/focused print.

## ADDED Requirements

### Requirement: Zoom-tiered DOM LOD with true aspect-ratio prints and compositor hygiene
`CssGalleryWorld` SHALL position every album island and photo cell absolutely from `islandLayout.ts` (`100px = 1 world unit`) inside a 2D-transformed `.world` container (without `preserve-3d` on `.world`), render each print as an `<img>` (`object-fit: contain`) inside a recessed cotton mat sized to its true `aspectRatio`, apply `contain: layout paint` per island, toggle `will-change: transform` only during active gestures, and switch visual complexity by zoom tier (`macro` `scale < 0.25`: `?width=128`, flat single shadow, no `backdrop-filter`, hidden placard text, no iframes; `album`: `?width=800`, full shadows, glass blur, soundtrack facade; `print`: `?width=2048` on focused print only).

#### Scenario: Prints preserve portrait and landscape aspect ratios
- **WHEN** an album containing both `3:4` portrait and `16:9` landscape photographs mounts on the wall
- **THEN** each `.photo-frame` and its recessed cotton mat SHALL size proportionally to the photograph's `aspectRatio` rather than cropping into a `1:1` square

#### Scenario: Macro zoom strips expensive blur and multi-layer shadows for smooth panning
- **WHEN** a visitor zooms out to `macro` tier (`scale < 0.25`) across 50 albums / 2,000 photos
- **THEN** islands SHALL render `?width=128` LOD images with flat single shadows, zero `backdrop-filter` passes, hidden placard text, and zero mounted YouTube iframes, and drop `will-change: transform` on settle
