---
name: Chiaroscuro Gallery — Flush-Mounted Print Frames (Dibond / Gatorboard)
colors:
  primary: "#161616"
  secondary: "#f6f4ef"
  background: "inherit"
  surface: "#f6f4ef"
  text:
    primary: "inherit"
    muted: "inherit"
  border: "#161616"
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
  xs: "2.5px (rigid backing edge)"
  sm: "11px (flat white margin)"
  md: "16px"
  lg: "24px"
  xl: "44px"
rounded:
  sm: "0px (flush-mounted sharp corners)"
  md: "0px"
  lg: "0px"
  full: "9999px"
---

## 1. Visual Overview & Philosophy

- **Aesthetic Tone:** Shift from a bulky molded picture frame / deep cutout mat to a **flush-mounted contemporary gallery print** (photograph mounted on rigid aluminum Dibond or archival Gatorboard) floating cleanly off the plaster wall on a hidden cleat.
- **Target Surfaces:** `.photo-frame` and `.photo-window` across all three lighting moods (`chiaroscuro`, `concrete`, `alabaster`) on both desktop and mobile.

## 2. Color System & Contrast Rationale

- **Flat Front Margin (`--frame-bg`):** `#f6f4ef` (clean archival paper plane, unchanged).
- **Rigid Backing Edge:** `border-right: 2.5px solid #161616; border-bottom: 2.5px solid #121212;` (matches the matte-black core edge of `.museum-placard.mat-aluminum`).
- **Floating Cleat Shadow:** Directional dark wall shadow (`rgba(0, 0, 0, ...)`) driven by `--sx`/`--sy` and `--tilt-sx`/`--tilt-sy`.

## 3. Typography Hierarchy

Unchanged.

## 4. Component Anatomy & States

- **Resting (`.photo-frame.is-lit`):**
  - `padding: var(--frame-padding)` (`11px` flat margin), `border: none`, `border-right: 2.5px solid #161616`, `border-bottom: 2.5px solid #121212`, `border-radius: 0`.
  - `.photo-window`: `box-shadow: none` (completely flat plane — zero recessed inner cutout drop shadow).
  - Floating two-layer cleat shadow (subtle `0.5px` hairline edge + tight contact shadow + soft directional downward shadow).
- **Desktop Hover (`.photo-frame.is-lit:hover` inside `@media (hover: hover) and (pointer: fine)`):**
  - Lifts to `translateZ(36px)` with 3D `rotateX`/`rotateY` tilt, shifts floating cleat shadow (`--tilt-sx`/`--tilt-sy`), and sweeps `.photo-sheen` across the flat print plane.
- **Print Focus (`.photo-frame.is-lit.focused`):**
  - Lifts to `translateZ(58px)` with 3D tilt (mouse on desktop, gyroscope on mobile), dynamic floating cleat shadow (`--tilt-sx`/`--tilt-sy`), and flat `.photo-sheen` specular highlight (`PrintSharpOverlay` mirrored).

## 5. Responsive Layout & Breakpoints

- **`@media (pointer: coarse)`:** Preserves `mobile-render-profile` (no SVG noise, flattened non-focused 3D with `scale(1.0195)`, single-layer directional shadow, `.photo-frame.is-lit.focused` preserving `--tilt-sx`/`--tilt-sy`), with `.photo-window { box-shadow: none }`.

## 6. Interaction, Motion & Sound

Unchanged — all hover lift, 3D tilt, Print Focus lift, mobile gyroscope tilt + 3 s auto-recenter, and `.photo-sheen` animations remain active.

## 7. Do's and Don'ts

- **DO** remove all light/medium gray outer bevel borders (`#d5d1c8` / `#c6c1b7`) and all `.photo-window` inset shadows.
- **DO** preserve `transform: translateZ(...)`, `rotateX`/`rotateY` tilt, `--tilt-sx`/`--tilt-sy` shadow shifts, and `.photo-sheen`.
- **DON'T** change `--frame-padding: 11px` or `fitFrameInCell` geometry.
- **DON'T** introduce ungated `:hover` rules in `wall.css`.
