## Source material

- **2026-11-25 — Real-Device Safari Web Inspector Profiling (`S1`–`S6` + Reduce Motion A/B on iPhone 16 Pro, PR #13 preview @ `133dd21`, pre-`PATCH-02`):**
  - **S4 (Print Focus Idle):** Baseline ran `~60` composites/sec with `2` rAF loops (`M:26051` + `i:19074`) and `60` orientation events/sec, with `0` paints, `0` style recalcs, and `0` forced layouts. Enabling OS Reduce Motion removed `M:26051` (`createGyroController`), leaving `i:19074` (`PrintSharpOverlay`) alone driving **~60 commits/sec (~80% of idle cost)**.
  - **S5 (Print Focus Active):** `~240` forced layouts per run; `PrintSharpOverlay` was top self-time in every run.
  - **S6 (10-Album Browse Memory — runs 04–06, no YouTube):** Consistent **`+85 MB` growth per run** while JS heap remained small (~6–8 decoded `2048px` bitmaps).
  - **S1 (Startup):** `24–37 ms` spent in `drawImage` / `clearRect` (and `32–39 ms` one-time `texImage2D` + `generateMipmap` uploading the 4 stucco PBR material maps).
  - **S2 (Pan):** `459–513` style recalcs across `786` frames (split between Album View gyro inline writes and camera `setSnapshot` React re-renders).
- **2026-11-25 — PR #13 merged to `main` as `1d923a2` (merge commit).** It carries `mobile-touch-compatibility`, `mobile-gyroscope-glare`, `PATCH-01` (`133dd21`) and `PATCH-02` (`b86d113`). Every code fact below was re-read on `origin/main` @ `1d923a2`; the `S1`–`S6` numbers above predate `PATCH-02`, so `S2`/`S4` must be re-baselined on production before claiming this change's deltas.

### Raised but not acted on

- **Touch-only visual simplifications** (Album View sheen removal, SVG `feTurbulence` grain/mat removal, 3D context flattening, single-layer shadows, static frosted placards, thumbnail LOD DPR cap, mobile wall DPR cap): intentionally split into the follow-up change **`mobile-render-profile`** so `render-loop-efficiency` stays 100% universal with **zero visual diff** on desktop and mobile.
- **Gyro dead-band (`0.004`), no-op `FramedPrint` write skip, and gesture-scoped pan/pinch rAF loop:** folded into PR #13 (`mobile-gyroscope-glare` **`PATCH-02`**, `b86d113`, now on `main`) because PR #13 introduced the resting gyro heartbeat and rewrote the pointer path.
- **Wall-shader pre-baking / settle-only rendering (`2B`):** deferred unless post-optimization traces show GPU-bound missed vsyncs with a quiet main thread.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Event-driven overlay sync** | `PrintSharpOverlay` runs a geometry sync only when camera moves, viewport resizes, or focus/tilt/hover updates occur, plus a fixed bounded settling tail (`300 ms` after the last wake), then parks rAF at `0` callbacks/s. | Removing `PrintSharpOverlay` or skipping sync during desktop CSS `transition: transform 0.24s` ease-back. |
| **Imperative rAF snapshot check** | Computing visible island IDs, `ZoomTier`, and projected `lodWidth` bucket inside `GalleryCanvas`'s rAF loop before calling React `setSnapshot`. | Dropping imperative `world.style.transform` updates during pan/zoom (those still run every rAF). |
| **Fixed-capacity spot texture** | Allocating `PlaygroundPbrWall`'s `RGBA32F` spot data texture once at `MAX_SPOTS × 2` (`256 × 2`) and uploading active rows `[0, count)` via `gl.texSubImage2D`. | Pre-baking the plaster wall or removing the live spotlight shader. |
| **Incremental mosaic paint** | Drawing only the newly loaded thumbnail's cell on each `MacroIsland` `onload` (`O(N)` draws regardless of frame timing) instead of `N` full `clearRect` + `N`-cell redraws. | Changing mosaic geometry, resolution, or macro scale threshold (`0.25`). |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| MDN WebGL2 `texSubImage2D` | Updating a sub-rectangle of an already-allocated texture avoids per-frame GPU texture reallocation. | CC-BY-SA 2.5 | 2026-11-25 |
| WebKit / Safari Web Inspector Timelines | Unconditional inline style writes (`style.width`, `style.transform`) dirty the layer tree and force compositor commits every frame even when values are unchanged. | Empirical (iPhone 16 Pro trace) | 2026-11-25 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Pure ref-based scheduler helper (`printSharpOverlaySync.ts`) | Adopted | Decouples wake/settle/transition-tail logic from React/DOM so Vitest can verify idle-stop and 300 ms tail deterministically. | 2026-11-25 |
| External animation / state library | Rejected | Zero new dependencies needed; existing rAF + `ResizeObserver` + a fixed `300 ms` tail cover every wake source. | 2026-11-25 |
| `transitionend` early stop of the settling tail | Rejected | `transitionend` bubbles from children (`.photo-sheen` `opacity 0.25s`) and fires per property; on focus entry `transform 0.24s` ends before `padding 0.25s`, so an early stop would park mid-transition and misalign the overlay. The fixed `300 ms` tail costs ~4 extra frames. | 2026-11-25 |

## Patterns adopted

- **Dirty-driven rAF with bounded transition tail** in `PrintSharpOverlay.tsx`: wakes on camera change, `ResizeObserver`, focus change, or pointer/gyro tilt write; stays alive for a fixed `300 ms` after the last wake so desktop's `0.24s` transform ease-back and the `0.25s` padding transition on focus entry never ghost; parks at `0` rAF/s when clean.
- **String-equality guard before inline style writes** in `PrintSharpOverlay.tsx`: skips rewriting `width`, `height`, `transformOrigin`, `transform`, and sheen styles when identical to the last written values.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `PrintSharpOverlay` polls rAF permanently while active | Calls `querySelector` 5×, `getBoundingClientRect` 2×, `getComputedStyle` 2×, and writes 4+ style props every frame | Read `src/components/wall/PrintSharpOverlay.tsx` (`L45-L103`, `@1d923a2`) + iPhone `S4`/`S5` traces | 2026-11-25 | stable |
| Desktop `.photo-frame` transitions `transform`/`box-shadow` over `0.24s` and `padding`/`background-color` over `0.25s` | `transition: transform 0.24s …, box-shadow 0.24s …, padding 0.25s ease, background-color 0.25s ease` | Read `src/styles/wall.css` (`.photo-frame` at `L978`, transition `L992-L996`, `@1d923a2`) | 2026-11-25 | stable |
| `printImagePrefetch` holds up to 8 decoded `HTMLImageElement`s | `const MAX_HELD = 8` | Read `src/components/wall/printImagePrefetch.ts` (`L9-L33`, `@1d923a2`) | 2026-11-25 | stable |
| `MacroIsland` redraws all cells on every thumbnail `onload` and never zeroes evicted canvases | `onload -> paint()` (`clearRect` + full loop); `mosaicCache.delete(oldest)` without `width = 0` | Read `src/components/wall/MacroIsland.tsx` (`L52-L92`, `@1d923a2`) | 2026-11-25 | stable |
| `mosaicCache` eviction is creation-order FIFO, not LRU | A cache hit returns early (`L39`) without delete/re-set, so the oldest *created* mosaic is evicted first even if it is mounted on screen | Read `src/components/wall/MacroIsland.tsx` (`L32-L94`, `@1d923a2`) | 2026-11-25 | stable |
| `PlaygroundPbrWall.paint()` calls `gl.texImage2D` every draw | Reallocates `width × 2` `RGBA32F` texture per frame | Read `src/components/wall/PlaygroundPbrWall.tsx` (`createSpotTexture` `L267-L272`; `paint()` `L335`, `@1d923a2`) | 2026-11-25 | stable |
| `GalleryCanvas` triggers `setSnapshot` on `12px` pan or `0.4%` zoom inside rAF | `threshold = Math.max(0.01, unit * 12)` | Read `src/components/wall/GalleryCanvas.tsx` (`L278-L282`, inside `requestFrame` after `PATCH-02`'s `flushPendingInputRef.current()`, `@1d923a2`) | 2026-11-25 | stable |
| `FramedPrint` click routing reads the React `scale` prop | `if (tier === 'macro' \|\| (scale < 0.52 && !albumFocused))` | Read `src/components/wall/FramedPrint.tsx` (`L189`, `@1d923a2`) | 2026-11-25 | stable |

## Unverified assumptions

- **Exact `S6` memory share of `printImagePrefetch` (`MAX_HELD` `8` → `3`):** `+85 MB/run` matches ~6–8 decoded `2048px` bitmaps, but exact post-fix delta must be confirmed by re-running `S6` (runs 04–06 route, no YouTube, reload between runs) on the preview deployment.
- **Exact remaining `S2` style recalc share after PR #13 `PATCH-02`:** `PATCH-02` is on production (`1d923a2`), so first re-baseline `S2` and `S4` on production (read-only) to separate its effect from this change, then re-measure after this change to verify how many recalcs the imperative rAF snapshot check removes.
- **`PATCH-02`'s pan fix on device:** The gesture-scoped loop should restore `~60 fps` panning under Reduce Motion (pre-fix baseline `36–39 fps`, `36–43%` missed vsyncs); not yet recorded on hardware. Capture the three-way `S2` (gyro on / Reduce Motion / motion permission denied) on production alongside the re-baseline.

## Superseded claims

- **"Idle Print Focus suffers from 120Hz forced-layout thrash":** Superseded by `S4` Reduce Motion A/B showing `0` forced layouts, `0` paints, and `0` style recalcs at idle; the real idle cost is `60` compositor commits/sec from `PrintSharpOverlay` rewriting identical inline styles every rAF (while `S5` active inspection incurs `~240` forced layouts/run).
- **"The second idle rAF loop (`M:26051`) is `PlaygroundPbrWall`":** Superseded by code inspection (`PlaygroundPbrWall` already idle-stops via `dirtyRef`) and Reduce Motion A/B removing `M:26051` (confirming `createGyroController`).
- **"S1 `drawImage`/`clearRect` (`24–37 ms`) is WebGL texture staging":** Superseded by reading `MacroIsland.tsx` (`O(N²)` mosaic redraws); the `32–39 ms` `texImage2D` is one-time stucco PBR map upload + mipmapping.

## Links out

- Master plan: `mobile_performance_optimization_plan.md`
- Prerequisite PR #13 (**merged**, `1d923a2`): `openspec/changes/mobile-touch-compatibility/` & `openspec/changes/mobile-gyroscope-glare/` (including `PATCH-02`)
- Follow-up touch-only profile: `openspec/changes/mobile-render-profile/`
