---
name: Chiaroscuro Gallery — Mobile Render Profile (Coarse Pointer)
colors:
  primary: "inherit"
  secondary: "inherit"
  background: "inherit"
  surface: "inherit"
  text:
    primary: "inherit"
    muted: "inherit"
  border: "inherit"
  status:
    success: "n/a"
    warning: "n/a"
    error: "n/a"
typography:
  fontFamily:
    sans: "inherit"
    mono: "n/a"
  scale:
    h1: "unchanged"
    h2: "unchanged"
    body: "unchanged"
    caption: "unchanged"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "44px"
rounded:
  sm: "1px"
  md: "2px"
  lg: "4px"
  full: "9999px"
---

## 1. Visual Overview & Philosophy

- **Aesthetic Tone:** Preserve the gallery's composition, warm spotlight pools, crisp `2048px` Print Focus photography, and architectural placard identity on phones while removing fine-scale desktop effects that cause heavy compositing (`75–86%` main-thread `composite`) and post-zoom paint spikes (`19 ms`) on small screens.
- **Target Surface:** Strictly `@media (pointer: coarse)` and coarse-pointer runtime paths. Desktop `(pointer: fine)` remains **100% byte-identical**.

## 2. Color System & Contrast Rationale

All mood palettes (`chiaroscuro`, `concrete`, `alabaster`) stay intact. Mobile static frosted placards raise gradient opacity slightly (e.g. `~0.34–0.44` on dark moods, `~0.68–0.78` on `alabaster`) so typography stays high-contrast without live `backdrop-filter: blur(...)`.

## 3. Typography Hierarchy

Unchanged.

## 4. Component Anatomy & Coarse-Pointer Trade-Offs

| Surface | Desktop `(pointer: fine)` (Unchanged) | Mobile `(pointer: coarse)` Profile |
| :--- | :--- | :--- |
| **Album View `.photo-sheen`** | Hover-driven `mix-blend-mode: screen` | Hidden (`display: none`); gyro listeners off in `album` tier |
| **Print Focus `.photo-sheen`** | Hover-driven `mix-blend-mode: screen` | Normal-blended translucent white radial highlight (`mix-blend-mode: normal`) driven by gyro |
| **Print Paper Grain & Mat Noise** | `.photo-paper-grain` (`feTurbulence` + `soft-light`) + `.photo-frame` mat `feTurbulence` | Both removed (`display: none` / `background-image: none`); clean archival mat & photo |
| **Non-Focused Print 3D Context** | `perspective: 1150px`, `preserve-3d`, `translateZ(22px)` | Flattened (`perspective: none; transform-style: flat`) + `transform: scale(1.0195)` size compensation |
| **Focused Print 3D Context** | `perspective: 1150px`, `preserve-3d`, `translateZ(58px)` | Kept on `.photo-cell.is-focused-cell` / `.photo-frame.focused` for gyro tilt |
| **Print Shadows** | 4 `calc()` outer shadows + 5 `.photo-window` inset shadows | 1 crisp directional shadow (`--sx`/`--sy`) in Album View; 1 soft directional shadow keeping `--tilt-sx`/`--tilt-sy` in Print Focus |
| **Placards (Beveled Glass & Acrylic)** | `backdrop-filter: blur(12px)` / `blur(2.5px)` | `backdrop-filter: none` + static frosted translucent gradient (tint, bevel borders, standoff pins preserved) |
| **Thumbnail / Wall Resolution** | Thumbnail LOD DPR ≤ 3; Wall DPR ≤ 2 | Thumbnail LOD DPR ≤ 2 (Print Focus stays `2048px`); Wall DPR ≤ `1.0` (`1.0` / `1.25` / `1.5` tested on device) |

## 5. Responsive Layout & Breakpoints

Capability-gated strictly on `(pointer: coarse)`, never screen width or user-agent strings.

## 6. Interaction, Motion & Sound

- **Gyroscope:** Active only in Print Focus (`tier === 'print' && focusedPhotoId !== null`) and disabled under `prefers-reduced-motion: reduce`.
- **Print Focus Sharpness:** `PrintSharpOverlay` and `2048px` focused LOD remain untouched.

## 7. Do's and Don'ts

- **DO** keep every CSS override inside `@media (pointer: coarse)` so desktop computed styles and `pixelmatch` stay at `0` diffs.
- **DO** compensate flattened Album View prints with `scale(1.0195)` and verify spacing visually on a phone.
- **DO** keep `--tilt-sx`/`--tilt-sy` in Print Focus's single-layer shadow so PR #13's gyro shadow shift continues working.
- **DON'T** introduce ungated `:hover` rules (must keep `touchAudit.test.ts` green).
- **DON'T** lower `PRINT_FOCUS_LOD_WIDTH` (`2048px`) on mobile.
