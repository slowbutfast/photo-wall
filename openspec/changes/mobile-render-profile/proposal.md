# Proposal: Mobile Render Profile

## Why

Real-device Safari Web Inspector captures (`S2`, `S3`) on an iPhone 16 Pro show that WebKit's main-thread `composite` step accounts for **`75–86%`** of instrumented main-thread time (rising from `2–3 ms/frame` during pan to `3.4–5 ms/frame` while browsing), with `~19 ms` post-zoom paint spikes (`S3`) and missed vsyncs tracking main-thread overruns. Even after universal idle/memory fixes (`render-loop-efficiency`), mobile browsers still composite an expensive desktop CSS stack across 12–20 mounted prints per album (oversized `mix-blend-mode: screen` sheens, SVG `feTurbulence` mat + paper grain, per-cell 3D `perspective`/`preserve-3d` contexts, 9-layer shadows, live `backdrop-filter` placard blurs, and `3×` DPR thumbnail oversampling) for fine details that are barely visible on a small phone screen.

Introducing a capability-gated **mobile render profile** under `(pointer: coarse)` reduces composited layers, blend passes, SVG noise re-rasterization, shadow blurs, and oversampled pixels on touch devices while preserving broad warm spotlight pools, gallery composition, crisp `2048px` Print Focus inspection, and **0 pixel diffs** on desktop `(pointer: fine)`.

## What Changes

Ordered by composited layer count and measured main-thread impact (strictly under `(pointer: coarse)`):

1. **Album View Sheen OFF & Print-Only Gyro Scope (`useGyroTilt.ts`, `FramedPrint.tsx`, `wall.css`):** Remove per-print `.photo-sheen` in Album View and attach `deviceorientation` listeners only in `print` focus (`focusedPhotoId !== null`). In Print Focus, use normal-blended translucent glare instead of `mix-blend-mode: screen`.
2. **Remove SVG `feTurbulence` Grain & Mat Noise (`wall.css`):** Hide `.photo-paper-grain` (`feTurbulence` + `mix-blend-mode: soft-light`) and clear `.photo-frame`'s SVG `feTurbulence` mat background on touch, eliminating CPU-rasterized noise layers that trigger post-zoom paint spikes.
3. **Flatten 3D Contexts Outside Focused Print (`wall.css`):** Drop per-cell `perspective` / `preserve-3d` / `translateZ(22px)` on non-focused Album View prints and compensate with `transform: scale(1.0195)` (`1150 / 1128`) so apparent print size stays matched; keep 3D only on `.photo-frame.focused`.
4. **Single-Layer Directional Shadows (`wall.css`):** Collapse 4 outer `calc()` shadows + 5 inset shadows to **1 crisp directional shadow** (`--sx`/`--sy`) in Album View and **1 soft directional shadow via `.photo-frame.is-lit.focused`** (preserving `--tilt-sx`/`--tilt-sy` without being overridden by `.photo-frame.is-lit`).
5. **Static Frosted Placards (`wall.css`):** Replace live `backdrop-filter: blur(12px)` (beveled glass) and `blur(2.5px)` (acrylic, `.museum-placard.mat-acrylic`) with material-scoped translucent frosted gradients — never targeting brushed aluminum or matte black placards.
6. **Hydration-Safe Non-Focused Thumbnail LOD DPR Cap (`zoomTier.ts`, `GalleryCanvas.tsx`):** Cap non-focused thumbnail LOD DPR at `2` on coarse pointers using `useSyncExternalStore` (server snapshot `false`) so SSR and hydration never mismatch, while keeping `PRINT_FOCUS_LOD_WIDTH = 2048` unchanged.
7. **Separate Heat/GPU Experiment — Mobile Wall DPR Cap at `1.0` (`PlaygroundPbrWall.tsx`):** Distinct from the main-thread compositor fixes above (`S1`–`S6` do not show GPU-bound misses), cap the coarse-pointer WebGL wall canvas DPR at `1.0` to test thermal/battery savings while keeping DOM prints native Retina sharp; retain only if real-device Energy Impact / visual checks confirm a benefit (if `1.25` is preferred visually, adjust the single constant with evidence). *(Wall-shader pre-baking / settle-only rendering `2B` remains deferred.)*

## Capabilities

### New Capabilities

- (None — extends existing renderer and wall lighting capabilities.)

### Modified Capabilities

- `instanced-photo-renderer`: ADDED requirement for the `(pointer: coarse)` mobile render profile: print-only gyroscope scope (Album View sheen off, normal-blended Print Focus glare), no SVG `feTurbulence` grain/mat noise, flattened non-focused 3D contexts (`.photo-cell:not(.is-focused-cell)`) with `scale(1.0195)` compensation, single-layer directional shadows (`.photo-frame.is-lit.focused` preserving `--tilt-sx`/`--tilt-sy`), and hydration-safe `maxThumbDpr = 2` thumbnail LOD cap (keeping `2048px` Print Focus).
- `3d-pbr-wall-and-lighting`: ADDED requirement for `(pointer: coarse)` material-scoped static frosted placards (beveled glass & `.mat-acrylic` only, no live `backdrop-filter`) and coarse-pointer WebGL wall DPR cap fixed at `1.0` while keeping desktop `(pointer: fine)` byte-identical.

## Impact

- **Sequencing:** Branches from `main` **after PR #13** (`mobile-touch-compatibility` + `mobile-gyroscope-glare` + `PATCH-01` `133dd21` + `PATCH-02` `b86d113`) and **`render-loop-efficiency`** merge.
- **Code:** `src/components/wall/useGyroTilt.ts`, `src/components/wall/FramedPrint.tsx`, `src/components/wall/zoomTier.ts`, `src/components/wall/GalleryCanvas.tsx`, `src/components/wall/PlaygroundPbrWall.tsx`, `src/styles/wall.css`, plus updated unit and static CSS audit tests.
- **Visual Impact:** Desktop `(pointer: fine)` = **0 diffs**. Touch `(pointer: coarse)` = cleaner, flatter non-focused prints and frosted-gradient placards with identical composition, warm spotlight pools, and sharp `2048px` Print Focus inspection + gyro tilt/glare.
- **Dependencies / DB / APIs:** Zero new packages, zero DB changes, zero API changes.

### Revision: 2026-11-25 20:59 UTC
- **Feedback Source**: Two-Agent Peer Review (`mobile-render-profile` — NEEDS REVISION)
- **Key Changes**:
  - `architecture.md` (D3) & `specs/`: Added SSR/hydration-safe `useSyncExternalStore` (server snapshot `false`) plan for the `maxThumbDpr = 2` coarse-pointer LOD cap.
  - `specs/3d-pbr-wall-and-lighting/spec.md`, `architecture.md` (D2.5), `tasks.md`: Scoped frosted placard overrides strictly to `.museum-placard.mat-acrylic` and the verified live beveled-glass selector (never `.museum-placard` globally, protecting brushed aluminum).
  - `architecture.md` (D2.4), `specs/`, `tests.md`: Fixed focused shadow specificity to `.photo-frame.is-lit.focused` and added a coarse-emulation computed-style assertion that `--tilt-sx` shifts `box-shadow` offsets.
  - `architecture.md` (D2.3): Replaced `:has(.photo-frame.focused)` with `.photo-cell:not(.is-focused-cell)` consistently and framed `scale(1.0195)` layer-count impact as an acceptance measurement.
  - `research.md`, `proposal.md`, `specs/`, `tests.md`, `tasks.md`: Pinned `S1`–`S6` traces to PR #13 `133dd21` (pre-`PATCH-02`), added Task `1.0b` for post-Tier-1 Layers-tab & Energy Impact baseline, fixed testable wall DPR at `1.0` (explicitly framed as a separate heat/GPU experiment), added numeric before/after acceptance thresholds, and extended `touchAudit` to parse all `@media (pointer: coarse)` blocks.
