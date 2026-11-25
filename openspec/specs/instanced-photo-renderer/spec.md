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

### Requirement: Coarse-pointer gyroscope rotational glare and physical print-focus tilt
On `(pointer: coarse)` devices when `prefers-reduced-motion: reduce` is not active, `GalleryCanvas` and `FramedPrint` SHALL drive glazed print reflections from `DeviceOrientationEvent` using relative-to-entry baseline calibration (`(beta0, gamma0)` captured on the first valid finite reading after entering `album` or `print` tier, and rebased with smoother reset on live `screen.orientation` changes) mapped through `screen.orientation.angle` (`0° / 90° / 180° / 270°`) into normalized `[-0.5, +0.5]` tilt coordinates (`DEFAULT_GYRO_MAX_DEG = 22`). Non-finite or `null` `beta`/`gamma` readings SHALL be ignored without corrupting the baseline or smoother state. Behavior SHALL be tiered by zoom level:
- **Macro tier (`scale < 0.25`):** Gyroscope sensor listening and tilt/glare effects SHALL be off.
- **Album tier (`album`):** Prints SHALL apply a subtle glare-only `.photo-sheen` translation (`30%` amplitude) with zero 3D frame rotation and zero cast-shadow shift.
- **Print Focus (`print`):** The `focused` print SHALL apply full physical tilt (`±4°` `rotateX`/`rotateY` + `translateZ(58px)`), dynamic wall cast-shadow offsets (`--tilt-sx`, `--tilt-sy`), and full 2D `.photo-sheen` specular translation (`PrintSharpOverlay` mirroring both automatically).

On iOS 13+ where `DeviceOrientationEvent.requestPermission` exists, permission SHALL be requested synchronously inside the tap handler entering Print Focus (at most once per session) and fall back silently with zero errors if denied or unsupported. Desktop `(pointer: fine)` behavior SHALL remain unchanged.

#### Scenario: Print Focus physically tilts frame, shadow, and glare with phone orientation
- **WHEN** a mobile visitor taps a print into Print Focus (granting iOS motion permission if prompted) and tilts the phone forward/backward or left/right from their entry holding angle
- **THEN** the focused print SHALL tilt smoothly up to `±4°` in `rotateX`/`rotateY`, shift `--tilt-sx`/`--tilt-sy` opposite the tilt, and sweep `.photo-sheen` in 2D across the glass (`PrintSharpOverlay` mirrored)

#### Scenario: Album View sweeps subtle glare without wobbling frames
- **WHEN** a mobile visitor tilts their phone in `album` tier
- **THEN** `.photo-sheen` SHALL sweep gently at `30%` amplitude while `.photo-frame` rotation and cast shadows remain stationary

#### Scenario: Screen orientation change rebases baseline without jumping
- **WHEN** the device rotates between portrait and landscape (`screen.orientation` changes) while `album` or `print` tier remains active
- **THEN** the controller SHALL reset the smoother to `{ nx: 0, ny: 0 }`, clear the entry baseline so the next valid `deviceorientation` sample becomes the new neutral `(beta0, gamma0)`, and remap subsequent tilts using the new `screen.orientation.angle` without a jump

#### Scenario: Reduced motion and desktop fine-pointer browsers stay unaffected
- **WHEN** `prefers-reduced-motion: reduce` is enabled OR the visitor uses a `(pointer: fine)` desktop browser
- **THEN** no `deviceorientation` tilt or glare SHALL be applied, and desktop computed styles / hover behavior SHALL remain identical

### Requirement: Event-driven PrintSharpOverlay sync with fixed 300 ms transition tail
While a print is focused (`active === true`), `PrintSharpOverlay` SHALL NOT poll `requestAnimationFrame` continuously at rest. Instead, it SHALL cache its resolved DOM references (`.photo-frame.focused`, `.photo-window`, `.photo-sheen`, `img.print-sharp-img`), skip inline style writes (`width`, `height`, `transformOrigin`, `transform`, sheen styles) whenever the newly formatted value equals the last written value, and schedule frame syncs ONLY when woken by a camera update (pan, zoom, or flight), a viewport resize (`ResizeObserver`), a focus change, or a pointer/gyroscope tilt update. After any focus, hover, or tilt wake, the scheduler SHALL keep syncing through a fixed `300 ms` settling tail (not truncated early by bubbling child/per-property `transitionend` events, so both `.photo-frame` `transform 0.24s` and `padding 0.25s` complete cleanly with zero ghosting), then park at `0` rAF callbacks/sec when clean.

#### Scenario: Idle Print Focus stops rAF and avoids redundant style writes
- **WHEN** a visitor enters Print Focus and stops moving the camera, mouse, and phone for more than `300 ms`
- **THEN** `PrintSharpOverlay` SHALL stop scheduling `requestAnimationFrame` callbacks (`0` idle rAF/s) and SHALL NOT rewrite unchanged inline styles

#### Scenario: Desktop focus entry and mouse-leave ease-back stay aligned without ghosting
- **WHEN** a desktop visitor enters Print Focus (animating `transform 0.24s` and `padding 0.25s`) or moves the mouse off a focused `.photo-frame`
- **THEN** `PrintSharpOverlay` SHALL continue syncing for the full `300 ms` settling tail before parking, so the sharp overlay tracks the in-world frame cleanly with zero ghosting

### Requirement: Bounded print prefetch LRU, incremental per-cell MacroIsland painting, and imperative rAF snapshot gating
The photo renderer SHALL bound memory and main-thread work during browsing and startup:
- `printImagePrefetch` SHALL cap held decoded `HTMLImageElement`s at `MAX_HELD = 3` (focused print ± 1 neighbor) instead of `8`.
- `MacroIsland` SHALL paint its placeholder frame/placard geometry once on creation and draw ONLY the newly loaded cell on each thumbnail `onload` (`O(N)` total `drawImage` calls regardless of arrival timing, never `O(N²)` full `clearRect` + redraws). `mosaicCache` SHALL refresh entry recency on cache hits (true LRU) and SHALL zero evicted or signature-replaced canvases (`canvas.width = 0; canvas.height = 0`) ONLY when `!canvas.isConnected` (deferring disposal of still-mounted canvases to unmount cleanup so visible islands are never blanked).
- `GalleryCanvas` SHALL compute visible island IDs, `ZoomTier`, projected `lodWidth` bucket, and interaction threshold booleans read by child click routing (including `scale < 0.52`) imperatively inside its camera rAF loop and SHALL call React `setSnapshot` only when that key changes (plus once on settle), while continuing to apply `world.style.transform` imperatively every frame.

#### Scenario: Prefetch LRU evicts beyond 3 held images
- **WHEN** `prefetchPrintImage` is called with 5 distinct URLs
- **THEN** the held map SHALL retain at most `3` `HTMLImageElement` entries (the 3 most recently requested URLs)

#### Scenario: MacroIsland draws incrementally per cell and safely disposes detached canvases
- **WHEN** an album with `16` photos resolves its macro mosaic thumbnails across multiple frames, or when `mosaicCache` evicts or replaces an entry
- **THEN** `MacroIsland` SHALL execute at most `16` `drawImage` calls (one per cell, zero `clearRect` after initial draw), refresh recency on cache hits, zero evicted/replaced canvases immediately when `!canvas.isConnected`, and NEVER blank a canvas that is still connected in the DOM

#### Scenario: Mid-gesture pan avoids React re-renders unless visible IDs, tier, LOD, or scale threshold changes
- **WHEN** the camera pans or zooms without changing the visible island ID set, `ZoomTier`, projected `lodWidth` bucket, or `scale < 0.52` threshold
- **THEN** `GalleryCanvas` SHALL update `world.style.transform` imperatively without invoking React `setSnapshot`; and WHEN `scale` crosses `0.52` (even if visible IDs, tier, and LOD remain unchanged), `GalleryCanvas` SHALL update `snapshot` immediately so `FramedPrint` click routing stays accurate
