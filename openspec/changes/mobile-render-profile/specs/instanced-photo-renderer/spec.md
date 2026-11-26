## ADDED Requirements

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
