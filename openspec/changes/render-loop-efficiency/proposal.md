# Proposal: Universal Render Loop & Memory Efficiency

## Why

Real-device Safari Web Inspector captures (`S1`–`S6` + Reduce Motion A/B) on an iPhone 16 Pro revealed five universal code-path inefficiencies that waste CPU, battery, and memory on both mobile and desktop with zero visual benefit:

1. `PrintSharpOverlay` polls `requestAnimationFrame` continuously while a print is focused — driving **~60 compositor commits/sec (~80% of idle cost in `S4`)** by rewriting identical inline styles every frame, and **~240 forced layouts/run in `S5`** via `querySelector` × 5, `getBoundingClientRect` × 2, and `getComputedStyle` × 2.
2. `printImagePrefetch` holds `MAX_HELD = 8` decoded `2048px` `HTMLImageElement` bitmaps simultaneously, matching `S6`'s **`+85 MB/run`** memory growth.
3. `MacroIsland`'s `mosaicFor()` clears and redraws all `N` cells on every thumbnail `onload` (`O(N²)` `drawImage` / `clearRect` = `24–37 ms` at `S1` startup) and never zeroes evicted canvas backing stores.
4. `GalleryCanvas` triggers React `setSnapshot` on small camera movements (`12px` pan / `0.4%` zoom) inside the rAF loop even when visible islands, zoom tier, and LOD buckets have not changed.
5. `PlaygroundPbrWall.paint()` calls `gl.texImage2D` on every draw, reallocating the `RGBA32F` spot data texture whenever it renders.

Fixing all five improves frame pacing, startup time, battery life, and memory usage across every device while preserving **0 pixel diffs** on desktop and mobile.

## What Changes

- **Event-Driven `PrintSharpOverlay` with Fixed `300 ms` Transition Tail (`PrintSharpOverlay.tsx`, `printSharpOverlaySync.ts` `[NEW]`):**
  - Cache DOM refs (`.photo-frame.focused`, `.photo-window`, `.photo-sheen`, `img`) and skip inline style writes when formatted values match the last write.
  - Wake sync only on camera changes (pan, zoom, flights), `ResizeObserver`, focus changes, and pointer/gyro tilt updates, keeping a fixed **`300 ms`** settling tail (never ending early on bubbling `transitionend` events) so desktop's `transition: transform 0.24s` and `padding 0.25s` never ghost, then stopping rAF completely when clean (`S4` target: ~0 composites/s & ~0 rAF/s).
- **Tighter Print Prefetch LRU (`printImagePrefetch.ts`):**
  - Reduce `MAX_HELD` from `8` → `3` (focused print ± 1 neighbor; `S6` target: `<= +40 MB/run`).
- **Incremental Per-Cell `MacroIsland` Repaints & Safe LRU Disposal (`MacroIsland.tsx`):**
  - Paint each thumbnail incrementally into its own cell on `onload` (guaranteed `O(N)` draws regardless of frame timing instead of `O(N²)` full `clearRect` + redraws), refresh `mosaicCache` recency on cache hits (true LRU), and zero evicted or signature-replaced canvas backing stores (`width = 0; height = 0`) **only when `!canvas.isConnected`** (deferring connected canvases to unmount cleanup so visible islands are never blanked).
- **Imperative rAF Snapshot Check (`GalleryCanvas.tsx`):**
  - Audit every reader of `snapshot` / `scale`, compute visible island IDs, `ZoomTier`, projected `lodWidth` bucket, **and interaction threshold booleans (including `scale < 0.52`)** imperatively inside the rAF loop, and call `setSnapshot` only when that key changes (plus once on settle).
- **Fixed-Capacity Spot Texture (`PlaygroundPbrWall.tsx`):**
  - Allocate `spotTexture` once at `MAX_SPOTS × 2` (`256 × 2`) and update active rows `[0, count)` via `gl.texSubImage2D` (addresses per-draw spotlight-data allocation only; distinct from the one-time `32–39 ms` startup plaster-map upload + mipmapping).

## Capabilities

### New Capabilities

- (None — extends existing renderer and lighting capabilities.)

### Modified Capabilities

- `instanced-photo-renderer`: ADDED requirement for event-driven idle-stopped `PrintSharpOverlay` synchronization (with desktop transition tail), bounded `MAX_HELD = 3` print prefetch, coalesced `MacroIsland` mosaic painting with evicted-canvas disposal, and imperative rAF snapshot gating in `GalleryCanvas`.
- `3d-pbr-wall-and-lighting`: ADDED requirement for fixed-capacity `MAX_SPOTS × 2` spot data texture updated via `gl.texSubImage2D` without per-frame texture reallocation.

## Impact

- **Sequencing:** Branches from `main` **after PR #13** (`mobile-touch-compatibility` + `mobile-gyroscope-glare` + `PATCH-02`) merges; prerequisite for `mobile-render-profile`.
- **Code:** `src/components/wall/printSharpOverlaySync.ts` (`[NEW]`), `src/components/wall/__tests__/printSharpOverlaySync.test.ts` (`[NEW]`), `src/components/wall/PrintSharpOverlay.tsx`, `src/components/wall/printImagePrefetch.ts`, `src/components/wall/MacroIsland.tsx`, `src/components/wall/GalleryCanvas.tsx`, `src/components/wall/PlaygroundPbrWall.tsx`.
- **Visual Impact:** Zero (0 pixelmatch / computed-style diffs on desktop and mobile; lowering hover-warm prefetch from 8 → 3 means clicking a print hovered 4+ prints ago may briefly show the soft thumbnail before `2048px` decodes).
- **Dependencies / DB / APIs:** Zero new packages, zero DB changes, zero API changes.

### Revision: 2026-11-25 20:58 UTC
- **Feedback Source**: Two-Agent Peer Review (`render-loop-efficiency` — NEEDS REVISION)
- **Key Changes**:
  - `specs/instanced-photo-renderer/spec.md` & `architecture.md` (D1): Dropped `endTransition()` early-stop (unsafe due to bubbling child `.photo-sheen` and per-property `transform`/`padding` events) and locked the fixed `300 ms` tail.
  - `specs/`, `proposal.md`, `architecture.md` (D3), `tests.md`: Committed to incremental per-cell `MacroIsland` drawing (`O(N)` draws), true-LRU cache-hit recency refresh, `!canvas.isConnected` guard with unmount-deferred disposal, and signature-mismatch canvas disposal.
  - `specs/`, `architecture.md` (D4), `tests.md`, `tasks.md`: Added `snapshot`/`scale` reader audit and folded `scale < 0.52` into the imperative snapshot key with unit test coverage.
  - `tasks.md`, `design.md`, `architecture.md` (D2/D5): Replaced stale line ranges with symbol anchors, added `S6 <= +40 MB/run` pass bar + duplicate `<img>` fallback note, clarified `texSubImage2D` scope vs. one-time plaster upload, and noted the desktop hover-warm 8 → 3 trade-off.
