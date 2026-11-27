## MODIFIED Requirements

### Requirement: Viewport-culled verbatim playground DOM islands with macro mosaic tier and projected-size LOD
`GalleryCanvas` SHALL position visible islands absolutely from `islandLayout.ts` (`PLACARD_GAP = 0.94u`, `ISLAND_GAP = 2.2u`, `MAX_PHOTOS_PER_ALBUM = 20`, balanced `2×2` row chunking when exactly `4` published albums exist and `3` columns otherwise), drop world `preserve-3d` and sway (keeping 2D `translate3d(...) scale(s)` on `.world` so `backdrop-filter` never breaks, and local `perspective` + `preserve-3d` only on `.photo-frame`, with zero permanent `will-change` raster locks on `.wall-world`, `.photo-frame`, or `.photo-sheen`), viewport-cull off-screen islands via `visibleIslands`, render `MacroIsland` (`macroMosaic.ts`) pre-baked canvases at `macro` tier (entered when `scale < MACRO_DEMOTE_SCALE` (`0.22`) and left when `scale >= MACRO_PROMOTE_SCALE` (`0.25`), keeping the committed tier unchanged inside the hysteresis band `[0.22, 0.25)`: zero `backdrop-filter`, zero iframes, mosaics only, preserving `<= 100ms` settle hitch), request projected-size LODs (`ceil(cellPx * scale * DPR)` snapped to `256 / 800 / 2048` via `resolveProjectedLodWidth`, backed by atomic temp-file-rename derivative caching in `/api/local-uploads/[...path]`) while explicitly requesting `PRINT_FOCUS_LOD_WIDTH` (`2048`) via `resolvePrintLodWidth` for the `focused` print in Print Focus, and map unknown numeric `?demo=` values (such as `?demo=2000`) to the `1000` fixture.

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
- **WHEN** a visitor zooms out to `scale < 0.22` on `?demo=1000` (or `?demo=2000` falling back to `1000`)
- **THEN** islands SHALL render `macroMosaic` canvases only with zero `backdrop-filter` passes, zero placard text, zero soundtrack thumbnails, and zero mounted iframes

#### Scenario: Real desktop clicks open albums and prints reliably
- **WHEN** a user performs a standard mouse click on a `.museum-placard` or `.photo-frame` (without dragging past 5px)
- **THEN** `GalleryCanvas` SHALL NOT capture the pointer before drag threshold and SHALL trigger the album/print click handler immediately

#### Scenario: Pinch jitter inside the hysteresis band does not toggle the tier
- **WHEN** a visitor pinches in from Overview past `scale = 0.25` (islands promote to `album`) and then holds the pinch so `scale` wanders between `0.225` and `0.26` for several seconds
- **THEN** every visible island SHALL stay on the `album` tier with no `MacroIsland` remount, and the camera loop SHALL publish no snapshot whose only change is the tier

#### Scenario: Zooming out demotes below 0.22, not at 0.25
- **WHEN** a visitor zooms out from Album Focus and `scale` passes `0.24`, then `0.221`, then `0.219`
- **THEN** islands SHALL stay on a detail tier at `0.24` and `0.221`, and SHALL demote to `macro` on the first frame at `0.219`

#### Scenario: Zooming in from macro promotes at 0.25, not at 0.22
- **WHEN** a visitor at `macro` zooms in and `scale` passes `0.23`, then `0.249`, then `0.25`
- **THEN** islands SHALL stay `macro` at `0.23` and `0.249`, and SHALL promote on the first frame at `0.25`

#### Scenario: Render path and camera loop agree on the tier
- **WHEN** `GalleryCanvas` re-renders for a non-camera reason (a focus change, a manifest refresh) while `scale` is inside `[0.22, 0.25)`
- **THEN** the render-path tier SHALL equal the tier the camera loop last committed, and SHALL NOT be recomputed without `previous`

## ADDED Requirements

### Requirement: Macro mosaic reserves the album tier's placard and soundtrack footprint
`planMacroMosaic` SHALL return, alongside its existing cells and placard rect:
- a `soundtrack` rect: `computeAlbumGrid(...).soundtrack` mapped into buffer pixels, or `null` when `album.soundtrack === null`;
- `placardLines`: the greeked title bar always, plus two caption bars only when `album.description` is a non-empty string. Positions come from `design.md` and are expressed inside the placard rect.

`MacroIsland` SHALL paint, once at mosaic creation and before any thumbnail cell:
- **the placard plate:** the full placard rect, filled with the **mosaic palette** plate colours for the current `(theme, placardMaterial, coarsePointer)`, with the material's top and bottom edge highlights and the same flat offset shadow the mosaic already paints under print cells;
- **the greeked lines:** solid low-alpha bars in the palette ink colours;
- **the soundtrack slot**, when present: the plaque base `#161616` with a 1 px `rgba(255, 255, 255, 0.08)` stroke and the same flat offset shadow.

**Constraints**
- `MacroIsland` SHALL NOT call `fillText`.
- It SHALL NOT request any soundtrack thumbnail or iframe URL.
- It SHALL NOT paint the former pale `rgba(226, 242, 234, 0.18)` placard fill.

**The mosaic palette**
- The mosaic palette SHALL be a pure function of `(theme, placardMaterial, coarsePointer)`.
- Acrylic plate colours SHALL come from a `macroPlate` field on each `PlaygroundTheme`, with `fine` and `coarse` three-stop gradients.
- Aluminum and foamcore SHALL use fixed fills mirrored from their `wall.css` base backgrounds.
- The palette key SHALL be part of `mosaicSignature`, so a change of mood, material or pointer type replaces cached mosaics through the existing replace-and-defer-disposal path.

#### Scenario: Album with a soundtrack reserves both slots at macro
- **WHEN** an album with a soundtrack and a description renders at `macro` tier
- **THEN** its mosaic SHALL paint a plate covering exactly `grid.placard`, three greeked bars inside it, and a `#161616` slot covering exactly `grid.soundtrack` (each within 1 buffer pixel), with zero `fillText` calls and zero soundtrack image requests

#### Scenario: Album without a soundtrack or description paints only the plate and title bar
- **WHEN** an album with `soundtrack === null` and `description === null` renders at `macro` tier
- **THEN** `plan.soundtrack` SHALL be `null`, `plan.placardLines` SHALL contain exactly one bar, and nothing SHALL be painted below the placard rect in the placard column

#### Scenario: Alabaster and chiaroscuro plates differ, and both match wall.css
- **WHEN** the palette resolves for `acrylic` on a fine pointer under `chiaroscuro` and under `alabaster`
- **THEN** the chiaroscuro stops SHALL equal the base `.mat-acrylic` gradient stops in `wall.css`, the alabaster stops SHALL equal the `[data-mood='alabaster']` `.mat-acrylic` stops, and the two palette keys SHALL differ

#### Scenario: Coarse pointers use the coarse plate
- **WHEN** the palette resolves for `acrylic` with `coarsePointer = true` under `chiaroscuro` and under `concrete`
- **THEN** the stops SHALL equal the corresponding `@media (pointer: coarse)` `.mat-acrylic` rules in `wall.css`, and alabaster SHALL keep its alabaster stops on coarse pointers

#### Scenario: Switching mood repaints mosaics without blanking a visible island
- **WHEN** the mood changes from `chiaroscuro` to `alabaster` while macro islands are mounted
- **THEN** each visible island SHALL receive a new mosaic whose signature contains the new palette key, and the replaced canvas SHALL be zeroed only after it is detached
