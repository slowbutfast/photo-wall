# Architecture: Universal Render Loop & Memory Efficiency

> [!NOTE]
> This document specifies **technical system architecture only** (scheduler state machine, ref caching, imperative rAF gating, LRU sizing, and WebGL2 texture reuse).
> This change introduces zero visual or styling changes (`design.md` confirms pixel-identical parity).

## Context

Real-device iPhone 16 Pro traces (`S1`–`S6` + Reduce Motion A/B) showed that even when the user is idle in Print Focus (`S4`), `PrintSharpOverlay` forces ~60 compositor commits/sec (~80% of idle cost) by rewriting identical inline styles every rAF, and active inspection (`S5`) incurs ~240 forced layouts/run. Startup (`S1`) spends `24–37 ms` in `MacroIsland`'s `O(N²)` mosaic redraws, `S6` grows `+85 MB/run` with `MAX_HELD = 8` decoded `2048px` prefetch images, `GalleryCanvas` calls React `setSnapshot` mid-gesture on small deltas, and `PlaygroundPbrWall` calls `gl.texImage2D` on every draw.

## System Architecture Diagram

```mermaid
flowchart LR
  Cam["GalleryCanvas rAF\n(pan / zoom / flight)"] -->|wake()| Sync["printSharpOverlaySync.ts\n(dirty + 300ms / transitionend tail)"]
  Resize["ResizeObserver"] -->|wake()| Sync
  Tilt["Mouse / Gyro Tilt"] -->|wake(withTail=true)| Sync
  Sync -->|rAF only while dirty/tail| Overlay["PrintSharpOverlay\n(cached refs + diff-guarded style writes)"]
  Sync -->|clean & tail expired| Park["Idle (0 rAF/s, 0 commits/s)"]
  Cam -->|imperative check| Key{"visibleIds / tier /\nlodWidth changed?"}
  Key -->|yes or settled| Snap["setSnapshot(camera)"]
  Key -->|no| Skip["Skip React render"]
```

## Goals / Non-Goals

**Goals:**
- Reduce Print Focus idle (`S4`) to `~0` composites/sec and `~0` rAF/sec while preserving 0-diff desktop ease-back transitions.
- Cut `S6` per-run memory growth (`MAX_HELD` `8` → `3` + zeroing evicted `MacroIsland` canvases).
- Eliminate `O(N²)` startup `MacroIsland` `drawImage`/`clearRect` churn and unnecessary mid-gesture React `setSnapshot` re-renders.
- Eliminate per-frame `gl.texImage2D` reallocations in `PlaygroundPbrWall`.

**Non-Goals:**
- Any visual, CSS, or touch-specific simplification (owned by `mobile-render-profile`).
- Modifying the gyroscope dead-band or gesture-scoped pan loop (owned by PR #13 `PATCH-02`).

## Technical Decisions

### D1. Pure Scheduler + Diff-Guarded Writes (`printSharpOverlaySync.ts` & `PrintSharpOverlay.tsx`)
- **Decision:** Extract a framework-free `createOverlaySyncScheduler(adapter, onSync)` in `src/components/wall/printSharpOverlaySync.ts`. It tracks `dirty`, `tailUntilMs`, and `rafHandle`:
  - `wake(tailMs = 0)` marks `dirty = true`, extends `tailUntilMs = Math.max(tailUntilMs, now() + tailMs)`, and ensures a single rAF is queued.
  - Each rAF runs `onSync()`, clears `dirty = false`, and reschedules ONLY if `dirty || now() < tailUntilMs`; otherwise parks (`rafHandle = null`).
  - **No `transitionend` early-stop:** `transitionend` bubbles from child `.photo-sheen` (`opacity 0.25s`) and fires once per property (`transform 0.24s` vs `padding 0.25s` on focus entry), which would truncate the tail ~10 ms early while padding is still animating. Use a fixed **`300 ms`** tail window on focus/hover/tilt wakes (~4 extra frames / 60 ms) for guaranteed alignment.
  - `PrintSharpOverlay` caches DOM refs (re-querying only if disconnected), skips writing `width`, `height`, `transformOrigin`, `transform`, and sheen `transform`/`opacity` when identical to the last written string, and wakes on: camera motion/flight signal from `GalleryCanvas`, `ResizeObserver` on container, `pointermove`/`pointerleave` on `.photo-frame.focused` (`wake(300)`), focus entry (`wake(300)`), and gyro tilt ticks.
- **Rationale:** Guarantees desktop's `transition: transform 0.24s` and `padding 0.25s` stay 100% aligned with zero ghosting while parking at `0` rAF/s and `0` commits/s at rest.

### D2. `printImagePrefetch` Bounded to Current ± 1 (`MAX_HELD = 3`)
- **Decision:** Lower `MAX_HELD` from `8` to `3` in `src/components/wall/printImagePrefetch.ts`.
- **Rationale:** Print Focus only navigates sequentially (Prev / Next = current ± 1), so 3 held bitmaps give instant neighbor switching while cutting peak held `2048px` decoded bitmap memory by ~62% (`S6` target: `<= +40 MB/run`; if WebKit's decoded-image cache holds bitmaps independently, next suspect is `PrintSharpOverlay`'s duplicate `<img>`).

### D3. Incremental Per-Cell `MacroIsland` Painting + True-LRU Safe Canvas Disposal
- **Decision:**
  - Draw placeholder frames and placard once on canvas creation (`clearRect` once); on each thumbnail `onload`, draw **only that cell** (`drawImage(image, cell.x + 1, ...)`), guaranteeing `O(N)` draws regardless of whether thumbnails arrive in 1 frame or `N` frames.
  - Refresh recency on `mosaicCache` hits (delete and re-set in the `Map`) so eviction is true LRU rather than creation-order FIFO.
  - Zero evicted or signature-mismatched canvases (`canvas.width = 0; canvas.height = 0`) **only when `!canvas.isConnected`**. If an evicted/replaced canvas is still mounted (`canvas.isConnected === true`), mark it in a `pendingDisposal` `WeakSet` and zero it in `MacroIsland`'s `useEffect` unmount cleanup so visible islands are never blanked.
- **Rationale:** Guarantees linear `O(N)` startup draw cost (`S1`) and safe backing-store disposal without blanking visible islands.

### D4. Imperative rAF Snapshot Key Check Including `scale < 0.52` (`GalleryCanvas.tsx`)
- **Decision:** Audit every reader of `snapshot` and `scale` in `GalleryCanvas` / `FramedPrint` (specifically `FramedPrint`'s `scale < 0.52 && !albumFocused` click routing) and maintain an imperative `lastSnapshotKeyRef` string (`"${tier}|${lodBucket}|${scale < 0.52 ? 1 : 0}|${visibleIds.join(',')}"`) inside `requestFrame`'s rAF callback (after `flushPendingInputRef.current()`). Call `setSnapshot` only when that key changes (or once when `settled` becomes `true`).
- **Rationale:** Eliminates redundant mid-gesture React re-renders while ensuring crossing `scale = 0.52` updates `FramedPrint` click routing immediately.

### D5. Fixed-Capacity `RGBA32F` Spot Texture (`PlaygroundPbrWall.tsx`)
- **Decision:** Allocate `spotTexture` once at `MAX_SPOTS × 2` (`256 × 2`, `gl.RGBA32F`) in `createSpotTexture(gl)`. In `paint()`, when `count > 0`, upload only `gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, count, 2, gl.RGBA, gl.FLOAT, packed)` (with `UNPACK_ROW_LENGTH = 0`, `packFixtureDataTexture` packs `count × 4` floats per row cleanly). Note: this addresses per-draw spotlight-data allocation only, not the separate one-time `32–39 ms` startup plaster-map upload + `generateMipmap`.
- **Rationale:** Zero GPU texture reallocations when panning across albums changes `uSpotCount`.

## Risks / Trade-offs

- **[Risk] Missing a wake source for `PrintSharpOverlay` causes temporary misalignment.** → **Mitigation:** Wake on all 4 sources: every `applyCamera()` call in `GalleryCanvas`, `ResizeObserver` on container, `pointermove`/`pointerleave`/`transitionend` on focused frame, and gyro subscriber emissions, plus an initial sync on mount/photoId change.
- **[Risk] `texSubImage2D` row stride mismatch when `count < MAX_SPOTS`.** → **Mitigation:** `packFixtureDataTexture(visible)` packs `count * 4` floats for row 0 immediately followed by `count * 4` floats for row 1, which matches `texSubImage2D(..., xoffset=0, yoffset=0, width=count, height=2, ...)` exactly when `UNPACK_ROW_LENGTH` is `0`.

## Migration & Rollback Plan

- Pure frontend optimization sequenced after PR #13; rollback is a single `git revert`.
