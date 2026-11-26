---
name: Chiaroscuro Gallery — Universal Render Loop Efficiency (Zero Visual Change)
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

- **Status:** Non-visual / performance-only engineering change. **Zero** color, typography, layout, shadow, or lighting changes on desktop or mobile.
- **Invariant:** Every rendered state — including desktop Print Focus entry (`transform 0.24s` + `padding 0.25s`) and mouse-leave ease-back — must produce **0 pixelmatch / computed-style diffs** against `main`. *(Minor desktop cache trade-off: lowering hover-warm prefetch from `8` → `3` means clicking a print hovered 4+ prints ago may briefly display the lower-res thumbnail before `2048px` decodes.)*

## 2. Color System & Contrast Rationale

Unchanged.

## 3. Typography Hierarchy

Unchanged.

## 4. Component Anatomy & States

- **`PrintSharpOverlay`:** Visually identical during camera flights, panning/zooming, mouse hover, gyroscope tilt, and the `0.24s` desktop mouse-leave ease-back (protected by the `transitionend` / `300 ms` settling window). Parks at `0` rAF/s and `0` style writes at rest.
- **`MacroIsland`:** Identical mosaic bitmap output; coalesces same-frame thumbnail draws instead of flashing `N` full redraws.
- **`PlaygroundPbrWall`:** Identical single-pass WebGL2 plaster output; uses fixed-capacity `texSubImage2D` internally.

## 5. Responsive Layout & Breakpoints

Unchanged across all viewports and pointer capabilities.

## 6. Interaction, Motion & Sound

- **Desktop mouse-leave transition:** `PrintSharpOverlay` stays aligned through `.photo-frame`'s `0.24s` ease-back transition before parking.
- **Print Focus Prev/Next switching:** `MAX_HELD = 3` keeps the focused print plus both immediate neighbors decoded for instant sequential stepping.

## 7. Do's and Don'ts

- **DO** preserve the `300 ms` / `transitionend` settling window on `PrintSharpOverlay` so desktop mouse-leave never ghosts.
- **DO** keep imperative `world.style.transform` updates running every rAF while gating only React `setSnapshot`.
- **DON'T** change any CSS token, shadow, blur, or visual fidelity in this change (those belong to `mobile-render-profile`).
