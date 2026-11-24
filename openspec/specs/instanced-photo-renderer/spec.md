# instanced-photo-renderer Specification

## Purpose
Enables smooth rendering of thousands of framed prints on an infinite wall using a viewport-culled, projected-size LOD CSS DOM world paired with a WebGL2 PBR wall and GPU-baked lightmap, with native DOM hit-testing and keyboard-accessible focus order.
## Requirements
### Requirement: Viewport-culled verbatim playground DOM islands with macro mosaic tier and projected-size LOD
`GalleryCanvas` SHALL position visible islands absolutely from `islandLayout.ts` (`PLACARD_GAP = 0.94u`, `ISLAND_GAP = 2.2u`, `MAX_PHOTOS_PER_ALBUM = 20`, balanced `2×2` row chunking when exactly `4` published albums exist and `3` columns otherwise), drop world `preserve-3d` and sway (keeping 2D `translate3d(...) scale(s)` on `.world` so `backdrop-filter` never breaks, and local `perspective` + `preserve-3d` only on `.photo-frame`, with zero permanent `will-change` raster locks on `.wall-world`, `.photo-frame`, or `.photo-sheen`), viewport-cull off-screen islands via `visibleIslands`, render `MacroIsland` (`macroMosaic.ts`) pre-baked canvases at `macro` tier (`scale < 0.25`: zero `backdrop-filter`, zero iframes, mosaics only, preserving `<= 100ms` settle hitch), request projected-size LODs (`ceil(cellPx * scale * DPR)` snapped to `256 / 800 / 2048` via `resolveProjectedLodWidth`, backed by atomic temp-file-rename derivative caching in `/api/local-uploads/[...path]`) while explicitly requesting `PRINT_FOCUS_LOD_WIDTH` (`2048`) via `resolvePrintLodWidth` for the `focused` print in Print Focus, and map unknown numeric `?demo=` values (such as `?demo=2000`) to the `1000` fixture.

#### Scenario: Four-album exhibition arranges in balanced 2×2 rows with 94px placard breathing room and row-0 entry framing
- **WHEN** `computeWallGridPositions` lays out exactly 4 published albums (`?demo=4`) and the entry camera frames Overview on a wide desktop viewport (`aspect >= 1.4`, e.g., `1440×900`)
- **THEN** it SHALL arrange them in 2 rows of 2 islands (zero orphaned bottom-left row), entry framing SHALL derive its first-row count via `Math.min(aspectPerRow, albumsPerRowForCount(albums.length))` so only Row 0 (`2` albums, never Row 1's 3rd album) is included in `computeFirstRowBounds`, and each island SHALL maintain `PLACARD_GAP = 0.94u` (`94px`) so the placard does not overlap the viewport during single-photo inspection of column 0

#### Scenario: Off-screen islands render zero DOM nodes
- **WHEN** the camera is zoomed into Album Focus on Row 0 with 50 albums on the wall
- **THEN** `visibleIslands` SHALL omit off-screen islands so they mount zero `.album-island` DOM nodes

#### Scenario: Projected-size LOD snaps an 800px cell at DPR 2 to 2048
- **WHEN** a visible print cell projects to `800px` CSS width on a `DPR = 2` display
- **THEN** `resolveProjectedLodWidth` SHALL request the `2048` backend bucket

#### Scenario: Focused print in Print Focus requests 2048px LOD and settles with will-change auto
- **WHEN** a visitor enters Print Focus on a `DPR = 1` display (`~900px` height)
- **THEN** `resolvePrintLodWidth` SHALL return `2048` (`PRINT_FOCUS_LOD_WIDTH`) for the `focused` print while unfocused siblings keep their projected-size bucket (`800`), and `.photo-frame` / `.photo-sheen` SHALL have computed `will-change: auto` so Chromium re-rasterizes the settled frame at full resolution

#### Scenario: Macro zoom uses pre-baked mosaics with no blur or iframes
- **WHEN** a visitor zooms out to `scale < 0.25` on `?demo=1000` (or `?demo=2000` falling back to `1000`)
- **THEN** islands SHALL render `macroMosaic` canvases only with zero `backdrop-filter` passes, zero placard text, zero soundtrack thumbnails, and zero mounted iframes

#### Scenario: Real desktop clicks open albums and prints reliably
- **WHEN** a user performs a standard mouse click on a `.museum-placard` or `.photo-frame` (without dragging past 5px)
- **THEN** `GalleryCanvas` SHALL NOT capture the pointer before drag threshold and SHALL trigger the album/print click handler immediately

### Requirement: Physical single-photo inspection with 2D specular glare, 3D frame bevels, and full-fidelity neighbors
During single-photo inspection (`viewMode === 'print'`) and `PREV`/`NEXT` navigation, `GalleryCanvas` and `FramedPrint` SHALL keep all neighboring prints rendered at 100% opacity and full material fidelity (zero `.dimmed` ghosting or placeholder fades), drive transitions purely through continuous camera flight (`x, y, z`) without unmounting or resetting frame images, render explicit 3D frame side-edge bevel extrusion (`border-right` / `border-bottom` physical frame thickness) with tilt-reactive wall drop shadows (`--tilt-sx`, `--tilt-sy` bound to `-rotateY` and `rotateX`), and render `.photo-sheen` as a soft 2D elliptical `radial-gradient` specular highlight whose `X` and `Y` offsets track cursor tilt independently opposite the tilt angle (`translate3d(-nx * %, -ny * %, 0)`).

#### Scenario: Neighboring prints stay at 100% fidelity during single-photo inspection and NEXT navigation
- **WHEN** a visitor clicks a print to enter `print` view and presses `NEXT`
- **THEN** no `.photo-frame` SHALL receive a `.dimmed` class or reduced opacity (`opacity === '1'`), and the camera SHALL fly smoothly to the next print's wall coordinates without fading through a placeholder box

#### Scenario: Tilting a focused frame shifts 2D specular glare and cast shadow in both X and Y
- **WHEN** a visitor moves the pointer horizontally and vertically across a focused `.photo-frame`
- **THEN** `.photo-sheen` SHALL translate a soft 2D radial specular bloom along both X and Y axes opposite to the tilt direction, and `--tilt-sx` / `--tilt-sy` SHALL shift the frame's cast shadow opposite to `-rotateY` and `rotateX`
