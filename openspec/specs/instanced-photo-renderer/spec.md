# instanced-photo-renderer Specification

## Purpose
Enables smooth rendering of thousands of framed prints on an infinite wall using a viewport-culled, projected-size LOD CSS DOM world paired with a WebGL2 PBR wall and GPU-baked lightmap, with native DOM hit-testing and keyboard-accessible focus order.
## Requirements
### Requirement: Viewport-culled verbatim playground DOM islands with macro mosaic tier and projected-size LOD
`PlaygroundGallery` SHALL position visible islands absolutely from `islandLayout.ts` (`PLACARD_GAP = 0.44u`, `ISLAND_GAP = 2.2u`, `MAX_PHOTOS_PER_ALBUM = 20`, verified within `1px` of the playground's 4 demo albums), drop world `preserve-3d` and sway (keeping 2D `translate3d(...) scale(s)` on `.world` so `backdrop-filter` never breaks, and local `perspective` + `preserve-3d` only on `.photo-frame`), viewport-cull off-screen islands via `visibleIslands`, render `macroMosaic.ts` pre-baked canvases at `macro` tier (`scale < 0.25`: zero `backdrop-filter`, zero iframes, mosaics only, preserving `<= 100ms` settle hitch), request projected-size LODs (`ceil(cellPx * scale * DPR)` snapped to `256 / 800 / 2048`, backed by atomic temp-file-rename derivative caching in `/api/local-uploads/[...path]`), and map unknown numeric `?demo=` values (such as `?demo=2000`) to the `1000` fixture.

#### Scenario: Off-screen islands render zero DOM nodes
- **WHEN** the camera is zoomed into Album Focus on Row 0 with 50 albums on the wall
- **THEN** `visibleIslands` SHALL omit off-screen islands so they mount zero `.album-island` DOM nodes

#### Scenario: Projected-size LOD snaps an 800px cell at DPR 2 to 2048
- **WHEN** a visible print cell projects to `800px` CSS width on a `DPR = 2` display
- **THEN** `resolveProjectedLodWidth` SHALL request the `2048` backend bucket

#### Scenario: Macro zoom uses pre-baked mosaics with no blur or iframes
- **WHEN** a visitor zooms out to `scale < 0.25` on `?demo=1000` (or `?demo=2000` falling back to `1000`)
- **THEN** islands SHALL render `macroMosaic` canvases only with zero `backdrop-filter` passes, zero placard text, zero soundtrack thumbnails, and zero mounted iframes

#### Scenario: Real desktop clicks open albums and prints reliably
- **WHEN** a user performs a standard mouse click on a `.museum-placard` or `.photo-frame` (without dragging past 5px)
- **THEN** `PlaygroundGallery` SHALL NOT capture the pointer before drag threshold and SHALL trigger the album/print click handler immediately
