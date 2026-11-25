---
name: Chiaroscuro Gallery — Mobile Gyroscope Glare
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

- **Aesthetic Tone:** Physical museum-glass handling on mobile. No new UI chrome or badges; existing `.photo-sheen`, 3D frame bevels, and `--tilt-sx`/`--tilt-sy` cast shadows respond organically to wrist tilt.
- **Target Surfaces:** `(pointer: coarse)` mobile devices in `album` and `print` zoom tiers (desktop `(pointer: fine)` and `prefers-reduced-motion: reduce` remain untouched).

## 2. Color System & Contrast Rationale

No color or contrast changes; reuses `.photo-sheen` (`rgba(255, 255, 255, 0.38)` radial bloom) and existing wall cast-shadow tokens.

## 3. Typography Hierarchy

Unchanged.

## 4. Component Anatomy & Per-Tier States

| Zoom Tier | Frame (`rotateX / rotateY`) | Wall Shadow (`--tilt-sx / --tilt-sy`) | Specular Glare (`.photo-sheen`) |
| :--- | :--- | :--- | :--- |
| **Macro (`scale < 0.25`)** | None (`MacroIsland` canvas) | Static | None |
| **Album View (`album`)** | None (`0°`, no wobble) | Static (`0px`) | Subtle `30%` amplitude (`translate3d(-nx * 11.4%, -ny * 11.4%, 0)`) |
| **Print Focus (`print`, focused)** | Full (`±4°` `rotateY`/`rotateX` + `translateZ(58px)`) | Dynamic (`-rotY * 2.4px`, `rotX * 2.4px`) | Full `100%` amplitude (`translate3d(-nx * 38%, -ny * 38%, 0)`, `opacity: 0.92`) |

*(In Print Focus, `PrintSharpOverlay` automatically mirrors the focused frame's transform and `.photo-sheen`.)*

## 5. Responsive Layout & Breakpoints

Capability-gated on `(pointer: coarse)` and `!prefers-reduced-motion: reduce`; portrait (`0° / 180°`) and landscape (`90° / 270°`) screen orientations remap `beta`/`gamma` axes automatically.

## 6. Interaction, Motion & Sound

- **Smoothing:** Exponential low-pass filter (`alpha = 0.18`) prevents sensor jitter.
- **Transition Hygiene:** While actively driven by gyroscope in `print` focus, CSS `transition` on `transform` / `box-shadow` stays subtle or instant so motion tracks wrist movement cleanly without lag.
- **Reduced Motion:** Disabled completely under `prefers-reduced-motion: reduce`.

## 7. Do's and Don'ts

- **DO** calibrate `(beta0, gamma0)` relative to the user's holding angle on focus entry.
- **DO** keep Album View glare-only (`0°` frame tilt) so neighboring prints never wobble.
- **DON'T** run `deviceorientation` listeners on `(pointer: fine)` desktop browsers.
- **DON'T** trigger React `setState` on every `deviceorientation` event.
