## Source material

- **2026-11-25 — Real-Device Safari Web Inspector Profiling (`S1`–`S6` + Reduce Motion A/B on iPhone 16 Pro, PR #13 preview @ `133dd21`, pre-`PATCH-02`):**
  - **Main-thread compositing dominance (`S2` & `S3`):** WebKit's `composite` step accounts for **`75–86%`** of instrumented main-thread time, rising from `~2–3 ms/frame` during pan/pinch (`S2`) to `3.4–5 ms/frame` while browsing (`S3`). Missed vsyncs closely track main-thread overruns (e.g. `S2`: `33` missed vs. `35` over-budget frames).
  - **Post-zoom paint spikes (`S3`):** `S3` exhibits `~19 ms` paint spikes after pinch-zoom settles (consistent with re-rasterizing SVG `feTurbulence` noise and multi-layer blurred shadows across 12–20 mounted prints when `will-change` releases).
  - **Album View style recalcs (`S2`, pre-`PATCH-02`):** `459–513` style recalcs across `786` frames while browsing; PR #13 `PATCH-02` (`b86d113`) subsequently added a `0.004` gyro dead-band and no-op write skip, so `S2` recalcs and Layers-tab counts MUST be re-baselined on the post-`render-loop-efficiency` preview (Task `1.0b`) before ranking/tuning Tier 2.
  - **User aesthetic guidance (2026-11-25):** On small phone viewports, broad warm spotlight pools, crisp Print Focus photography (`2048px`), album composition, and camera controls matter most; per-print paper/mat grain, multi-layer penumbra shadows, live placard glass blur, and Album View glare are barely visible on a phone and are acceptable to simplify on touch devices while keeping desktop `(pointer: fine)` 100% untouched.
- **2026-11-25 — PR #13 merged to `main` as `1d923a2`** (with `PATCH-01` `133dd21` and `PATCH-02` `b86d113`). Every code fact below was re-read on `origin/main` @ `1d923a2`.

### Raised but not acted on

- **Wall-shader pre-baked world-space lightmap or settle-only wall rendering (`2B`):** Explicitly **deferred**. Real-device `S1`–`S6` traces show missed vsyncs track main-thread `composite` overruns, not GPU shader fill. Revisit `2B` only if post-`mobile-render-profile` traces still drop frames with a quiet main thread.
- **Changing print resolution in Print Focus (`2048px`), album grid spacing, or camera framing:** Explicitly excluded — artwork sharpness and gallery composition stay intact.
- **Universal zero-visual-loss fixes (`PrintSharpOverlay` idle-stop, `printImagePrefetch` `MAX_HELD = 3`, `MacroIsland` coalescing, imperative rAF snapshot check, `texSubImage2D`):** Owned by prerequisite change **`render-loop-efficiency`**.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Mobile render profile** | A capability-gated set of `(pointer: coarse)` CSS and runtime simplifications that reduces composited layers, blend passes, SVG noise rasterization, shadow blurs, and oversampled thumbnail/wall pixels on touch devices. | User-agent sniffing, screen-width-only breakpoints, or any change to desktop `(pointer: fine)` rendering. |
| **Static frosted placard** | Replacing live `backdrop-filter: blur(...)` on mobile placards with a tuned translucent frosted gradient that preserves glass tint, bevel borders, and standoff pins. | Making placards opaque black boxes or changing placard typography/layout. |
| **Print-only gyroscope scope** | Attaching `deviceorientation` listeners and running gyro tilt/sheen only in `print` focus (`focusedPhotoId !== null`), turning Album View per-print `.photo-sheen` off on touch. | Disabling Print Focus gyroscope tilt/glare or changing desktop mouse hover. |
| **`scale(1.0195)` compensation** | Scaling flattened Album View prints by `1150 / (1150 - 22) ≈ 1.0195` when dropping per-cell `perspective: 1150px` + `translateZ(22px)` so prints keep the same apparent size (~3 px on a 158 px cell). | Assuming flat `translateZ(0)` is visually identical to `translateZ(22px)` without compensation. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| Safari Web Inspector Timelines (`S2`/`S3` on iPhone 16 Pro) | `composite` is 75–86% of main-thread time; `S3` shows 19 ms post-zoom paint spikes. | Empirical device trace | 2026-11-25 |
| CSS Media Queries Level 4 `(pointer: coarse)` | Standard capability gate matching `mobile-touch-compatibility` and `mobile-gyroscope-glare`, ensuring desktop `(pointer: fine)` stays 0-diff. | W3C | 2026-11-25 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| `@media (pointer: coarse)` CSS profile + coarse runtime caps | Adopted | Zero new dependencies, clean separation from desktop 0-diff parity harness, easy to measure before/after. | 2026-11-25 |
| Pre-baked world-space wall lightmap (`2B` Option I) / Settle-only wall (`2B` Option II) | Deferred | `S1`–`S6` traces show main-thread compositing (not GPU shader fill) drives missed vsyncs; defer until post-Tier-2 traces prove GPU-bound misses. | 2026-11-25 |

## Patterns adopted

- **Capability-gated progressive simplification** (`(pointer: coarse)`): ordered by composited layer reduction first (Album View sheen off → grain/mat noise/blend modes → 3D context flattening → single-layer shadows → frosted placards → thumbnail LOD DPR 2 → mobile wall DPR tuning).

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| The live placard materials are `acrylic`, `aluminum`, `foamcore`, rendered as `mat-${material}` classes | `PlacardMaterial = 'acrylic' \| 'aluminum' \| 'foamcore'`, default `'acrylic'` (UI label "Beveled Glass"); `'beveled-glass'` is only a legacy alias mapped to `'acrylic'`; `AlbumPlacard` emits `className="museum-placard mat-${material} is-lit…"` | Read `src/components/wall/placardMaterial.ts` (`L9-L33`) & `AlbumPlacard.tsx` (`L330`), `@1d923a2` | 2026-11-25 | stable |
| The only live placard `backdrop-filter` is acrylic's `blur(2.5px)` | `.playground-wall-root .museum-placard.mat-acrylic { … backdrop-filter: blur(2.5px) }` (`L708-L715`). The `.museum-placard[data-material='beveled-glass']` rules (`L234-L280`, incl. `blur(12px) saturate(120%)` at `L247`) are dead CSS: nothing in `src` sets `data-material` | Read `src/styles/wall.css` + `git grep data-material src`, `@1d923a2` | 2026-11-25 | stable |
| `.photo-frame` carries a separate SVG `feTurbulence` mat background | `background-image: url("data:image/svg+xml,...feTurbulence...")` (`L981`) | Read `src/styles/wall.css` (`.photo-frame` `L978-L1000`, `@1d923a2`) | 2026-11-25 | stable |
| `.photo-paper-grain` and `.photo-sheen` use `mix-blend-mode` | `soft-light` + `feTurbulence` (`L1137`); `screen` + `inset: -65%` (`L1147`) | Read `src/styles/wall.css` (`@1d923a2`) | 2026-11-25 | stable |
| Every `.photo-cell` / `.photo-frame` creates a 3D context | `perspective: 1150px`, `transform-style: preserve-3d` on `.photo-cell` (`L968`); frame `translateZ(22px)` (`L990`) | Read `src/styles/wall.css` (`@1d923a2`) | 2026-11-25 | stable |
| `.photo-frame.is-lit` has 4 outer `calc()` shadows + `.photo-window` has 5 inset shadows | 9 shadow layers per mounted print | Read `src/styles/wall.css` (`.photo-frame.is-lit` `L1064`, `.photo-window` `L1113`, `@1d923a2`) | 2026-11-25 | stable |
| A focused lit frame takes its `box-shadow` (and `--tilt-sx`/`--tilt-sy`) from `.photo-frame.is-lit`, not `.photo-frame.focused` | Equal specificity (`0,3,0`); `.is-lit` (`L1064`) comes after `.focused` (`L1009`), so it wins. A coarse override must target `.photo-frame.is-lit.focused` | Read `src/styles/wall.css` (`@1d923a2`) | 2026-11-25 | stable |
| `GalleryCanvas` passes `dpr` up to `3` into `resolveProjectedLodWidth`, measured in an effect | `dpr: Math.min(3, Math.max(1, window.devicePixelRatio \|\| 1))` inside the viewport-measure effect (`L356`); `lodWidth` computed at render (`L755`). A coarse-pointer flag read the same way (post-mount state) stays hydration-safe; reading `matchMedia` during render would not | Read `src/components/wall/GalleryCanvas.tsx` & `zoomTier.ts` (`L52-L59`), `@1d923a2` | 2026-11-25 | stable |
| `PlaygroundPbrWall` caps canvas DPR at `2` | `const dpr = Math.min(2, Math.max(1, viewport.dpr \|\| 1))` | Read `src/components/wall/PlaygroundPbrWall.tsx` (`L313`, `@1d923a2`) | 2026-11-25 | stable |

## Unverified assumptions

- **Exact Safari Layers-tab counts in Album View and Print Focus, plus Energy Impact on `S2`/`S4`:** Must be captured on the real iPhone 16 Pro before and after `mobile-render-profile` to verify exact layer-count reduction and battery/thermal win.
- **Optimal mobile wall DPR (`1.0` vs `1.25` vs `1.5`):** Must be visually inspected and profiled on iPhone 16 Pro across all 3 lighting moods (`chiaroscuro`, `concrete`, `alabaster`) before locking the final constant.
- **Visual parity of `scale(1.0195)` flattened Album View cells:** Must be checked via mobile screenshots to confirm spacing/overlap matches `translateZ(22px)` cleanly.

## Superseded claims

- **"Default beveled-glass placards run `backdrop-filter: blur(12px) saturate(120%)`":** Superseded by reading `placardMaterial.ts` / `AlbumPlacard.tsx` at `1d923a2`. The "Beveled Glass" option is the `acrylic` material (`.mat-acrylic`, `blur(2.5px)`); the `[data-material='beveled-glass']` block is never matched. The frosted-placard item therefore removes a 2.5px backdrop pass, a smaller win than assumed, and its overrides must target `.museum-placard.mat-acrylic`. Deleting the dead `[data-material]` block is a separate cleanup, outside this change's 0-diff scope.

- **"WebKit reads back the WebGL framebuffer for every placard `backdrop-filter`":** Superseded — internal WebKit readback mechanism is unverified; the defensible fact is that the backdrop under placards changes every camera frame, forcing blur recomputation every frame.
- **"WebGL spotlight math is the primary cause of dropped frames on iPhone 16 Pro":** Superseded by `S2`/`S3` traces showing `composite` at `75–86%` of main-thread time and missed vsyncs tracking main-thread overruns.

## Links out

- Master plan: `mobile_performance_optimization_plan.md`
- Prerequisites: `openspec/changes/mobile-touch-compatibility/` and `openspec/changes/mobile-gyroscope-glare/` (with `PATCH-02`), both **merged** in PR #13 (`1d923a2`); and `openspec/changes/render-loop-efficiency/` (not yet implemented)
