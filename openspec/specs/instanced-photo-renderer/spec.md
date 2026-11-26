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
On `(pointer: coarse)` devices when `prefers-reduced-motion: reduce` is not active, `GalleryCanvas` and `FramedPrint` SHALL drive glazed print reflections from `DeviceOrientationEvent` relative to an entry baseline. The entry baseline is the full orientation `(alpha0, beta0, gamma0)` captured on the first valid reading with finite `beta` and `gamma` after entering Print Focus (`tier === 'print'` with a non-null `focusedPhotoId`). It SHALL be cleared, together with a smoother reset, on tier or focus changes and on live `screen.orientation` changes.

Tilt SHALL be measured as the relative rotation `R_rel = R_baseᵀ · R_cur`, where each `R = Rz(alpha) · Rx(beta) · Ry(gamma)` (W3C intrinsic Z‑X′‑Y″). From the rotated device normal `v = R_rel · (0, 0, 1)` it SHALL take two unclamped device-frame angles:
- `aboutY = atan2(v.x, v.z)`;
- `aboutX = atan2(−v.y, v.z)`.

When the baseline or the current sample lacks a finite `alpha`, `aboutY` and `aboutX` SHALL instead fall back to the wrapped Euler deltas `wrapAngleDelta(gamma − gamma0)` and `wrapAngleDelta(beta − beta0)`.

The device-frame angles SHALL then be mapped through the existing `screen.orientation.angle` sign table (`0° / 90° / 180° / 270°`), clamped to `±DEFAULT_GYRO_MAX_DEG` (`22`), and normalized into `[-0.5, +0.5]` tilt coordinates.

Non-finite or `null` `beta`/`gamma` readings SHALL be ignored without corrupting the baseline or smoother state. A `null` `alpha` alone SHALL NOT cause a reading to be ignored.

Behavior SHALL be tiered by zoom level:
- **Macro and Album tiers (`macro`, `album`):** Gyroscope sensor listening and tilt/glare effects SHALL be off, as specified by the coarse-pointer mobile render profile.
- **Print Focus (`print`):** The `focused` print SHALL apply:
  - full physical tilt (`±4°` `rotateX`/`rotateY` + `translateZ(58px)`);
  - dynamic wall cast-shadow offsets (`--tilt-sx`, `--tilt-sy`);
  - full 2D `.photo-sheen` specular translation, with `PrintSharpOverlay` mirroring all of it automatically.

On iOS 13+ where `DeviceOrientationEvent.requestPermission` exists, permission SHALL be requested synchronously inside the tap handler that enters Print Focus, at most once per session. If permission is denied or unsupported, the feature SHALL fall back silently with zero errors. Desktop `(pointer: fine)` behavior SHALL remain unchanged.

#### Scenario: Print Focus physically tilts frame, shadow, and glare with phone orientation
- **WHEN** a mobile visitor taps a print into Print Focus (granting iOS motion permission if prompted) and tilts the phone forward/backward or left/right from their entry holding angle
- **THEN** the focused print SHALL tilt smoothly up to `±4°` in `rotateX`/`rotateY`, shift `--tilt-sx`/`--tilt-sy` opposite the tilt, and sweep `.photo-sheen` in 2D across the glass (`PrintSharpOverlay` mirrored)

#### Scenario: Single-axis tilt matches the previous Euler-delta mapping
- **WHEN** the baseline and the sample share `alpha`, and only `beta` changes by `d` (or only `gamma` changes by `d`, with `|gamma|` staying below `90°`)
- **THEN** `aboutX` (respectively `aboutY`) SHALL equal `d` within `1e-6°`, the other angle SHALL be `0` within `1e-6°`, and the emitted `{ nx, ny }` SHALL equal what the Euler-delta mapping produced for the same readings

#### Scenario: Landscape hold through a gimbal crossing stays continuous
- **WHEN** the entry baseline is `(alpha 0, beta 50, gamma 80)` and the phone physically rotates `+15°` about its y axis, so the browser reports the equivalent triple `(180, 130, −85)`
- **THEN** the device-frame tilt SHALL be `aboutY ≈ 15°` and `aboutX ≈ 0°` (within `1e-6°`), and the emitted tilt SHALL NOT saturate either axis

#### Scenario: Equivalent Euler triples produce identical tilt
- **WHEN** the same physical pose is reported as `(alpha, beta, gamma)` or as `(alpha + 180, 180 − beta, gamma + 180)` (normalized into the W3C ranges)
- **THEN** the computed tilt relative to any baseline with finite `alpha` SHALL be identical within `1e-6`

#### Scenario: In-plane twist does not register as tilt
- **WHEN** the current orientation equals the baseline rotated about the device z axis (the screen normal) by any angle up to `±90°`
- **THEN** both device-frame angles SHALL be `0` within `1e-6°`

#### Scenario: Missing alpha falls back to Euler deltas without dropping the reading
- **WHEN** a reading arrives with finite `beta`/`gamma` and `alpha: null`, or the baseline was captured without a finite `alpha`
- **THEN** the reading SHALL be accepted, and the tilt SHALL be computed from the wrapped Euler deltas exactly as before this change

#### Scenario: Screen orientation change rebases baseline without jumping
- **WHEN** the device rotates between portrait and landscape (`screen.orientation` changes) while Print Focus remains active
- **THEN** the controller SHALL:
  - reset the smoother to `{ nx: 0, ny: 0 }`;
  - clear the entry baseline, so the next valid `deviceorientation` sample becomes the new neutral orientation;
  - cancel any pending stillness recentre or glide;
  - remap subsequent tilts using the new `screen.orientation.angle` without a jump

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

### Requirement: Coarse-pointer mobile render profile for composited layers and thumbnail LOD
On `(pointer: coarse)` devices, the photo renderer SHALL apply a capability-gated mobile render profile that reduces composited layers, offscreen blend passes, SVG noise rasterization, shadow blurs, and oversampled thumbnail pixels while preserving album composition, warm spotlight pools, and full `2048px` Print Focus sharpness:
- **Print-only gyroscope scope & Album View sheen off:** On `(pointer: coarse)` devices, `createGyroController` / `useGyroTilt` SHALL attach `deviceorientation` listeners only when `tier === 'print'` and `focusedPhotoId !== null` (never in `album` or `macro` tier). Album View prints SHALL NOT display `.photo-sheen` on coarse pointers, and Print Focus `.photo-sheen` SHALL use normal blending (`mix-blend-mode: normal`) rather than `mix-blend-mode: screen`.
- **No SVG `feTurbulence` grain or mat noise:** On `(pointer: coarse)` devices, `.photo-paper-grain` SHALL be hidden (`display: none`) and `.photo-frame`'s inline SVG `feTurbulence` `background-image` SHALL be cleared (`background-image: none`), keeping solid `--frame-bg`.
- **Flattened non-focused 3D contexts with size compensation:** On `(pointer: coarse)` devices, non-focused `.photo-cell:not(.is-focused-cell)` and `.photo-frame:not(.focused)` elements SHALL drop `perspective` and `transform-style: preserve-3d` and replace `translateZ(22px)` with an equivalent `transform: scale(1.0195)` (`1150 / 1128`) so apparent print size stays matched; 3D `perspective` / `preserve-3d` SHALL remain active only on `.photo-cell.is-focused-cell` and `.photo-frame.focused`.
- **Single-layer directional shadows:** On `(pointer: coarse)` devices, `.photo-frame.is-lit` SHALL collapse its multi-layer outer shadows (and `.photo-window` inset shadows) to a single crisp directional shadow driven by baked `--sx`/`--sy`, and `.photo-frame.is-lit.focused` SHALL declare a single soft directional shadow that preserves `--tilt-sx`/`--tilt-sy` during Print Focus gyroscope tilt without being overridden by `.photo-frame.is-lit`.
- **Hydration-safe non-focused thumbnail LOD DPR cap:** On `(pointer: coarse)` devices, `GalleryCanvas` SHALL read coarse-pointer state via `useSyncExternalStore` (server snapshot `false`, zero SSR hydration mismatch) and pass `maxDpr = 2` to `resolveProjectedLodWidth` for non-focused prints while keeping `PRINT_FOCUS_LOD_WIDTH = 2048` unchanged for the focused print.

Desktop `(pointer: fine)` rendering SHALL remain byte-identical (0 computed-style / pixelmatch diffs).

#### Scenario: Gyroscope listens only in Print Focus on coarse pointers
- **WHEN** a coarse-pointer visitor navigates from `macro` → `album` → `print` (`focusedPhotoId = 'p1'`) → `album`
- **THEN** `createGyroController` SHALL attach zero `deviceorientation` listeners in `macro` and `album` tiers, attach listeners only in `print` focus, and detach them when returning to `album`

#### Scenario: Non-focused thumbnail LOD caps DPR at 2 while Print Focus keeps 2048
- **WHEN** `resolvePrintLodWidth` runs on a `dpr = 3` coarse-pointer phone for an Album View print vs. a focused Print Focus print
- **THEN** the non-focused print SHALL compute its projected bucket using `effectiveDpr = 2`, while the focused print SHALL still resolve to `2048`

#### Scenario: Desktop fine-pointer rendering is unaffected
- **WHEN** the gallery opens on a `(pointer: fine)` desktop browser (`1440×900`)
- **THEN** computed styles and `pixelmatch` screenshots across idle, album, print, and hovered states SHALL have `0` diffs against `main`

### Requirement: Glare intensity is reduced to 80% on every pointer through a single strength multiplier
`.photo-sheen` SHALL scale every alpha stop of its `radial-gradient` by a `--sheen-strength` custom property declared once on `.playground-wall-root` with value `0.8`, so the glare's visible intensity is 80% of the previous look on both `(pointer: fine)` and `(pointer: coarse)` devices while keeping the same gradient shape, ellipse size, blend mode per pointer, rest opacity (`--sheen-intensity: 0.44`), and hover/gyro inline opacity (`0.92`). This requirement supersedes the "byte-identical desktop" guarantee of the coarse-pointer mobile render profile for `.photo-sheen` only; every other desktop computed style and pixel SHALL remain identical.

#### Scenario: Sheen gradient alpha stops use the strength multiplier
- **WHEN** `wall.css` is parsed
- **THEN** the base `.playground-wall-root .photo-sheen` rule's `background` SHALL be a `radial-gradient` whose non-zero alpha stops are `calc(0.38 * var(--sheen-strength))` and `calc(0.14 * var(--sheen-strength))` (outer stop `0`), AND `.playground-wall-root` SHALL declare `--sheen-strength: 0.8` exactly once

#### Scenario: Desktop hover glare is 80% as strong but moves the same way
- **WHEN** a `(pointer: fine)` visitor hovers a focused print and moves the mouse across it
- **THEN** `.photo-sheen` SHALL translate exactly as before (`translate3d(-nx * 38%, -ny * 38%, 0)`, inline `opacity: 0.92`), its gradient centre SHALL stay at `50% 50%`, and the highlight's peak alpha SHALL be 80% of the previous baseline

#### Scenario: Only sheen pixels differ on desktop
- **WHEN** the fine-pointer computed-style and pixelmatch harness runs against the pre-change baseline (idle, album, print, hovered print, Studio)
- **THEN** the only computed-style differences SHALL be the `.photo-sheen` `background-image`, and pixel differences SHALL be confined to regions covered by `.photo-sheen`

### Requirement: Coarse-pointer glare rests in the top-right corner of the photo
On `(pointer: coarse)` devices, the focused print's `.photo-sheen` and the `.print-sharp-overlay .photo-sheen` SHALL set `--sheen-anchor: 65% 35%`, and the base `.photo-sheen` gradient SHALL position its centre at `var(--sheen-anchor, 50% 50%)`, so that with zero tilt the glare centre sits at ≈ `84%` across and ≈ `16%` down the photo window. Gyroscope tilt SHALL continue to translate the sheen relative to this anchor with unchanged sign and amplitude. `(pointer: fine)` devices SHALL NOT set `--sheen-anchor` and SHALL keep the centred `50% 50%` resting position.

#### Scenario: Coarse focused and overlay sheens declare the top-right anchor
- **WHEN** `wall.css` is parsed
- **THEN** inside an `@media (pointer: coarse)` block, a rule targeting both `.photo-frame.focused .photo-sheen` and `.print-sharp-overlay .photo-sheen` SHALL declare `--sheen-anchor: 65% 35%`, no rule outside a `(pointer: coarse)` block SHALL declare `--sheen-anchor`, and the base `.photo-sheen` gradient SHALL contain `at var(--sheen-anchor, 50% 50%)`

#### Scenario: Static glare rests top-right without gyroscope input
- **WHEN** a coarse-pointer visitor opens Print Focus with Reduce Motion enabled, or with motion permission denied, and holds the phone still
- **THEN** the glare SHALL sit in the top-right corner of the photo (sharp overlay included) at rest opacity, leaving the centre of the photo unobscured

#### Scenario: Gyroscope sweeps the glare from the top-right anchor
- **WHEN** a coarse-pointer visitor enters Print Focus with motion permission granted and tilts the phone from the entry angle
- **THEN** the glare SHALL start at the top-right anchor and move opposite the tilt with the same `±38%` sheen-box amplitude as before, and the `PrintSharpOverlay` sheen SHALL stay aligned with the frame's sheen

### Requirement: Print Focus tilt auto-recentres after 3 seconds of stillness
While the gyroscope controller is listening in Print Focus and has an entry baseline, it SHALL track stillness on the unclamped device-frame tilt angles (`aboutX`, `aboutY`). The stillness window SHALL start or restart whenever either angle deviates by more than `RECENTER_STILL_BAND_DEG` (`1.5°`) from its value at the start of the current window. When a window reaches `RECENTER_STILL_MS` (`3000 ms`) without restarting, the controller SHALL recentre.

A recentre SHALL:
- replace the entry baseline with the most recent valid reading;
- keep the current smoothed tilt, without an instant reset or a `{0, 0}` announcement;
- start a glide that eases the emitted tilt toward the new target with `smoothTilt` using `RECENTER_GLIDE_TAU_MS` (`450 ms`) instead of `DEFAULT_GYRO_TAU_MS` (`85 ms`).

Glide frames SHALL be driven by `requestAnimationFrame` using the last valid reading, so the glide completes even if no further `deviceorientation` events arrive. The glide SHALL end, returning to the tracking tau, when either:
- both axes of the smoothed tilt are within `0.002` of the target, at which point the target SHALL be emitted; or
- a reading deviates beyond the stillness band from the new baseline.

The stillness timer SHALL be driven by an injected adapter timer, not by sensor event arrival. One still period SHALL produce at most one recentre; the timer SHALL re-arm only after the band is broken.

A tier or focus change, a `screen.orientation` change, a detach, or `destroy()` SHALL cancel the pending timer and any glide. Emitted values SHALL still pass through `MIN_EMIT_DELTA` gating, except for the final settle emit.

#### Scenario: Holding still at an offset glides the print back to rest
- **WHEN** a visitor in Print Focus tilts the phone `+10°` about the device x axis from the entry baseline and then holds it within `1.5°` of that pose for `3000 ms`
- **THEN** the controller SHALL make the current reading the new baseline. The emitted tilt SHALL then ease monotonically toward `{ nx: 0, ny: 0 }` with a `450 ms` time constant: about 63% of the way after `450 ms`, and within `0.002` after at most about `2.8 s`. This returns the frame to `0°` rotation and the glare to its resting position, with no instant jump.

#### Scenario: Continuous motion never recentres
- **WHEN** the visitor keeps moving the phone so that some device-frame angle leaves the `1.5°` band at least once in every `3000 ms` window
- **THEN** no recentre SHALL occur, and the tilt SHALL keep tracking the original entry baseline with the `85 ms` tracking tau

#### Scenario: Glide completes without further sensor events
- **WHEN** a recentre fires and the browser then dispatches no further `deviceorientation` events
- **THEN** rAF-driven glide frames SHALL still carry the emitted tilt to the target, and SHALL stop requesting frames once it has settled

#### Scenario: Moving during a glide hands control straight back to the hand
- **WHEN** a glide is in progress and a reading deviates by more than `1.5°` from the new baseline
- **THEN** the glide SHALL end immediately, the tracking tau SHALL apply to that reading, and a new stillness window SHALL begin

#### Scenario: A still period recentres only once
- **WHEN** the phone stays within the band for `9000 ms` after a recentre
- **THEN** no second recentre SHALL fire until the band has been broken and a fresh `3000 ms` still window completes

#### Scenario: Context changes cancel pending recentres
- **WHEN** a stillness window is in progress or a glide is running and the visitor leaves Print Focus, focuses another photo, or rotates the screen
- **THEN** the pending timer SHALL be cleared, the glide SHALL stop requesting frames, and no recentre SHALL fire afterwards

#### Scenario: Devices that never stream a reading never arm the timer
- **WHEN** Print Focus is entered with motion permission denied or with no gyroscope, so that no valid reading arrives
- **THEN** no stillness timer SHALL be armed, and nothing SHALL be emitted
