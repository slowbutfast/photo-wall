# Architecture: Mobile Render Profile

> [!NOTE]
> This document specifies **technical system architecture only** (capability gating, gyro lifecycle scoping, LOD DPR capping, WebGL DPR budgeting, and CSS layer architecture).
> Visual tokens and exact mobile style trade-offs are specified in `design.md`.

## Context

After `render-loop-efficiency` eliminates idle `PrintSharpOverlay` commits, `O(N²)` mosaic repaints, and excess prefetch memory, real-device iPhone 16 Pro traces (`S2`, `S3`) show WebKit's main-thread `composite` step accounts for `75–86%` of main-thread time and `S3` incurs `~19 ms` post-zoom paint spikes. On touch devices (`(pointer: coarse)`), reducing the number of composited layers, offscreen blend passes, SVG `feTurbulence` filters, blurred shadow layers, live `backdrop-filter` blurs, and oversampled pixels directly attacks the measured compositing bottleneck while keeping desktop `(pointer: fine)` at 0 diffs.

## System Architecture Diagram

```mermaid
flowchart TD
  Cap{"matchMedia('(pointer: coarse)')"} -->|false (Desktop)| Desk["Verbatim Desktop Path\n(0 pixelmatch / computed-style diffs)"]
  Cap -->|true (Mobile Render Profile)| CSS["@media (pointer: coarse) in wall.css\n1. Album sheen off; Print sheen normal-blend\n2. No SVG feTurbulence grain/mat\n3. Flatten non-focused 3D + scale(1.0195)\n4. 1-layer directional shadows\n5. Static frosted placards (no backdrop-filter)"]
  Cap -->|true| Gyro["useGyroTilt.ts\nAttach listeners ONLY in print focus\n(tier === 'print' && focusedPhotoId !== null)"]
  Cap -->|true| Lod["zoomTier.ts\nCap non-focused thumbnail DPR at 2\n(Print Focus stays 2048px)"]
  Cap -->|true| Wall["PlaygroundPbrWall.tsx\nCap WebGL wall DPR (1.0 / 1.25 / 1.5)"]
```

## Goals / Non-Goals

**Goals:**
- Reduce composited layer count, `S2`/`S3` composite time, `S3` post-zoom paint spikes, and `S2`/`S4` Energy Impact on iPhone 16 Pro & Android Chrome.
- Preserve gallery composition, broad warm spotlight pools, Print Focus `2048px` sharpness + gyroscope tilt/glare, and **0 diffs** on desktop `(pointer: fine)`.

**Non-Goals:**
- Pre-baked world-space wall lightmap or settle-only wall rendering (`2B`) — explicitly **deferred** because `S1`–`S6` traces show main-thread compositing (not GPU shader fill) causes missed vsyncs.
- User-agent sniffing or screen-width-only gating.

## Technical Decisions

### D1. Print-Only Gyroscope Scope on Coarse Pointers (`useGyroTilt.ts`, `FramedPrint.tsx`)
- **Decision:** Update `createGyroController.setContext(tier, focusedPhotoId)` so listeners attach ONLY when `capable && tier === 'print' && focusedPhotoId !== null` (detaching in both `macro` and `album` tiers). In `FramedPrint.tsx`, subscribe to `gyroSubscribe` only when `tier === 'print' && focused` (removing the `album` branch).
- **Rationale:** Eliminates 12–20 oversized (`inset: -65%`) moving `.photo-sheen` layers and sensor wakeups during Album View browsing (`S2` recalcs + composite cost), while keeping full physical handling in Print Focus.

### D2. Capability-Gated CSS Profile (`src/styles/wall.css`)
- **Decision:** Group all mobile compositor simplifications under `@media (pointer: coarse)` in `src/styles/wall.css` (preserving `touchAudit.test.ts` and `cssBoundaryAudit.test.ts`, with `touchAudit` parsing all `@media (pointer: coarse)` blocks):
  1. Hide `.photo-sheen` on non-focused prints; set `mix-blend-mode: normal` on `.photo-frame.focused .photo-sheen` and `.print-sharp-overlay .photo-sheen`.
  2. Hide `.photo-paper-grain` (`display: none`) and set `background-image: none` on `.photo-frame` (removes both SVG `feTurbulence` surfaces).
  3. On non-focused `.photo-cell:not(.is-focused-cell)` and `.photo-frame:not(.focused)`, set `perspective: none; transform-style: flat;` and `transform: scale(1.0195)` to compensate for removing `translateZ(22px)` under `perspective: 1150px` (`1150 / 1128 ≈ 1.0195`). Keep 3D `perspective` / `preserve-3d` on `.photo-cell.is-focused-cell` and `.photo-frame.focused`. *(Note: `scale(1.0195)` is still a CSS transform and may still promote a composited layer in WebKit — treat actual layer-count reduction as an empirical acceptance measurement in Safari Layers-tab, not an assumed outcome.)*
  4. Collapse `.playground-wall-root .photo-frame.is-lit` to 1 directional `box-shadow` using `--sx`/`--sy`, simplify `.photo-window` inset shadow to 1 crisp hairline, and declare the focused Print Focus shadow with higher specificity **`.playground-wall-root .photo-frame.is-lit.focused`** (and `.is-focused`) so it beats `.photo-frame.is-lit` and preserves `--tilt-sx`/`--tilt-sy` during gyro tilt.
  5. Disable `backdrop-filter: none` and apply material-scoped frosted gradients ONLY on `.museum-placard.mat-acrylic` and the verified live beveled-glass selector (`[data-material='beveled-glass']` / `.mat-beveled-glass` — confirmed against `AlbumPlacard.tsx` markup in Task 3.1), never on `.museum-placard` globally so `.mat-aluminum` and matte-black placards remain untouched.
- **Rationale:** Directly targets the 75–86% main-thread `composite` share and `S3` `19 ms` paint spikes with zero desktop impact.

### D3. Hydration-Safe Non-Focused Thumbnail LOD DPR Cap (`zoomTier.ts`, `GalleryCanvas.tsx`)
- **Decision:** Add an optional `maxDpr` parameter (default `Infinity`; `2` on coarse pointers) to `resolveProjectedLodWidth(cellPx, scale, dpr, maxDpr)` and `resolvePrintLodWidth(...)`. Focused prints still bypass `resolveProjectedLodWidth` and return `PRINT_FOCUS_LOD_WIDTH` (`2048`). In `GalleryCanvas.tsx`, read `(pointer: coarse)` via `useSyncExternalStore` with a server snapshot of `false` so SSR HTML and initial client hydration match with zero hydration warnings (accepting a single post-mount bucket update on coarse pointers).
- **Rationale:** Prevents `dpr = 3` phones from prematurely stepping small Album View thumbnails into `800px` / `2048px` buckets without breaking SSR hydration.

### D4. Coarse-Pointer WebGL Wall DPR Budget (`PlaygroundPbrWall.tsx`)
- **Decision:** Export a pure helper `resolveWallCanvasDpr(viewportDpr: number, coarsePointer: boolean): number` (fine pointer: `Math.min(2, Math.max(1, viewportDpr))`; coarse pointer: `Math.min(MOBILE_WALL_MAX_DPR, Math.max(1, viewportDpr))` with `MOBILE_WALL_MAX_DPR = 1.0`). Canvas sizing runs imperatively inside an effect, so it has no SSR hydration impact. *(Positioned as a separate thermal/GPU experiment; retain only if real-device Energy Impact / visual checks confirm a benefit.)*

## Risks / Trade-offs

- **[Risk] `:has(.photo-frame.focused)` browser support.** → **Mitigation:** Safari 15.4+ and Chrome 105+ support `:has()`; alternatively pass a `.is-focused-cell` class on `.photo-cell` in `FramedPrint.tsx` to avoid `:has()` selector matching cost on every frame. Prefer `.photo-cell.is-focused-cell` class for zero selector overhead.
- **[Risk] Visual drift on `scale(1.0195)` flattened prints or `1.0` wall DPR.** → **Mitigation:** Verify on iPhone 16 Pro across all 3 moods (`chiaroscuro`, `concrete`, `alabaster`) and adjust `MOBILE_WALL_MAX_DPR` (`1.0` / `1.25` / `1.5`) if plaster softness is noticeable at close zoom.

## Migration & Rollback Plan

- Pure frontend profile sequenced after PR #13 and `render-loop-efficiency`; rollback is a single `git revert`.
