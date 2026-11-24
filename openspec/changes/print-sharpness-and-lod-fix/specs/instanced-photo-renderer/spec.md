## MODIFIED Requirements

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
