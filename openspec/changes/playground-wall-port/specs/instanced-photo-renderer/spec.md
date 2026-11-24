## REMOVED Requirements

### Requirement: O(1) draw-call hybrid instanced renderer with unified mat and print lift
**Reason**: Superseded by porting `playgrounds/photo_wall_playground.html`'s exact CSS DOM world + WebGL2 PBR plaster wall verbatim into Next.js, restoring 1:1 visual fidelity without R3F shader drift or 40-print pool starvation.
**Migration**: Render viewport-culled playground DOM islands (`PlaygroundGallery`) positioned from `islandLayout.ts` (`PLACARD_GAP = 0.44`, `ISLAND_GAP = 2.2`, `MAX_PHOTOS_PER_ALBUM = 20`) over `PlaygroundPbrWall`.

### Requirement: Priority-ordered actual-byte VRAM texture pool
**Reason**: Native `<img>` elements (`decoding="async"`) with projected-size `lodUrl.ts` widths (`256 / 800 / 2048`) and disk-cached `?width=` resizing in `/api/local-uploads/[...path]` handle decoding, orientation, and color profiles natively.
**Migration**: Size `<img>` requests by `ceil(cellPx * scale * DPR)` snapped to `256 / 800 / 2048` and serve cached derivatives in local storage mode.

### Requirement: Broad-phase album + O(1) cell hit-testing and tactile hover
**Reason**: Native DOM click/hover/focus events on `.photo-frame` and `.museum-placard` replace `hitTestWall`.
**Migration**: Use accessible `<button>` elements with deferred `setPointerCapture` (only after drag threshold > 5px) so real desktop clicks never get swallowed, plus the playground's exact hover tilt and diagonal glass glare.

## ADDED Requirements

### Requirement: Viewport-culled verbatim playground DOM islands with projected-size LOD and macro guard
`PlaygroundGallery` SHALL enforce `MAX_PHOTOS_PER_ALBUM = 20` (`4–5` columns), `PLACARD_GAP = 0.44u` (`44px`), and `ISLAND_GAP = 2.2u` (`220px`), viewport-cull off-screen islands via pure `visibleIslands(camera, viewport, placements, margin)`, render each print at its true `aspectRatio` using the playground's exact `.photo-frame.is-lit` CSS (recessed cotton mat, `.is-lit::after` directional shading, directional cast shadows, hover tilt + glass glare, and dimmed neighboring prints in Print Focus), request projected-size LODs (`256 / 800 / 2048`, backed by disk-cached `?width=` resizing in `/api/local-uploads/[...path]`), and apply a macro zoom guard (`scale < 0.25`: disable `backdrop-filter`, hide placard text, soundtrack thumbnails, and iframes).

#### Scenario: Prints preserve portrait and landscape aspect ratios and fill their cells cleanly
- **WHEN** an album containing mixed `4:5`, `3:2`, and `2:3` photographs mounts on the wall
- **THEN** each `.photo-frame` SHALL preserve its true aspect ratio with the playground's exact mat proportions and directional cast shadows without square cropping or 40-print pool starvation

#### Scenario: Real desktop clicks open albums and prints reliably
- **WHEN** a user performs a standard mouse click on a `.museum-placard` or `.photo-frame` (without dragging past 5px)
- **THEN** `PlaygroundGallery` SHALL NOT capture the pointer before drag threshold and SHALL trigger the album/print click handler immediately
