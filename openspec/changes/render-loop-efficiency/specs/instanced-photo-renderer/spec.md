## ADDED Requirements

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
