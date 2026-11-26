---
name: Chiaroscuro Gallery — Softer, Corner-Resting Glare
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
  sheen:
    core: "rgba(255, 255, 255, calc(0.38 * var(--sheen-strength)))"   # was 0.38
    mid: "rgba(255, 253, 246, calc(0.14 * var(--sheen-strength)))"    # was 0.14
    edge: "rgba(255, 253, 246, 0)"
typography:
  fontFamily:
    sans: "unchanged"
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
  xl: "32px"
rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
  full: "9999px"
sheen:
  strength: "0.5"                 # --sheen-strength, all pointers (1 = previous look)
  restOpacity: "0.44"             # --sheen-intensity, unchanged
  activeOpacity: "0.92"           # inline hover/gyro opacity, unchanged
  ellipse: "46% 42%"              # unchanged
  anchor:
    fine: "50% 50%"               # fallback, unchanged
    coarse: "65% 35%"             # --sheen-anchor ≈ 84% across / 16% down the photo
  sweep: "translate3d(-nx * 38%, -ny * 38%, 0)"  # unchanged
---

## 1. Visual Overview & Philosophy

- **Aesthetic Tone**: The glass should read as glass, with a soft reflection caught at the edge. It shouldn't wash out the photograph. Halving the strength keeps the "glazed print" cue and lets the image carry the frame.
- **Target Surfaces**: Every `.photo-sheen` on `/photos`:
  - Desktop: hover sheen on wall prints and in Print Focus.
  - Mobile: Print Focus sheen and its `PrintSharpOverlay` mirror. Album View sheen is already hidden on touch.
- **Visual References**: The current sheen (`wall.css` `L1147-L1163`). The look of a framed print under a single gallery spot, where the reflection sits toward an upper corner rather than over the subject.

## 2. Color System & Contrast Rationale

There are no text or UI colours. The highlight is a translucent white overlay on the photograph, so WCAG text contrast doesn't apply. What matters is how much the photo is veiled.

| Token Name | Value | Semantic Role | Background Pair | Peak veil (active) | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `sheen.core` | `rgba(255,255,255, 0.38 × 0.5 = 0.19)` | Specular centre | Photo pixels | `0.92 × 0.19 ≈ 0.17` (was `≈ 0.35`) | Same in `screen` (desktop) and `normal` (coarse) up to blend shape |
| `sheen.mid` | `rgba(255,253,246, 0.14 × 0.5 = 0.07)` | Warm falloff at 44% radius | Photo pixels | `≈ 0.064` (was `≈ 0.13`) | |
| `sheen.edge` | `rgba(255,253,246, 0)` | Fade-out at 74% radius | — | `0` | Unchanged |

All three moods (`chiaroscuro`, `concrete`, `alabaster`) keep their palettes. There's no per-mood sheen override.

## 3. Typography Hierarchy

Unchanged. This change has no typographic surface.

## 4. Component Anatomy & States

### Component: `.photo-sheen` (frame and `.print-sharp-overlay` mirror)

- **Visual Hierarchy & Placement**:
  - The sheen is the top layer inside `.photo-window`, above the photo and paper grain.
  - Its box extends 65% past each edge of the photo.
  - The gradient centre is `var(--sheen-anchor, 50% 50%)` inside that box.
- **Component States**:
  - **Default / idle (fine pointer):**
    - centred at `50% 50%`;
    - rest opacity `0.44`;
    - half the previous peak.
  - **Hover (fine pointer, mouse only):**
    - sweeps opposite the cursor (`±38%` of the box);
    - opacity `0.92`;
    - half the previous peak.
  - **Default / idle (coarse pointer, Print Focus):**
    - rests at `65% 35%` of the box, the top-right corner of the photo;
    - rest opacity `0.44`, half the previous peak;
    - this is also the permanent state under Reduce Motion, with motion permission denied, or with no sensor.
  - **Active (coarse pointer, gyro tilting):** sweeps from the top-right anchor, opposite the tilt, with the same `±38%` amplitude, at opacity `0.92`.
  - **Album View (coarse):** hidden, unchanged.
  - **Focus / Disabled:** not applicable, because the sheen is decorative and never receives pointer input.

## 5. Responsive Layout & Breakpoints

| Viewport | Gate | Anchor | Strength |
| :--- | :--- | :--- | :--- |
| **Mobile / tablet** | `@media (pointer: coarse)` | `65% 35%` (top-right) | `0.5` |
| **Desktop** | `(pointer: fine)` | `50% 50%` (centred) | `0.5` |

Gating is by capability, never by width, so a narrow desktop window keeps the centred anchor. No touch targets change.

## 6. Interaction, Motion & Sound

- **Transitions:** unchanged (`opacity 0.25s ease` and `transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)` on desktop; `opacity 0.25s ease` on coarse). Neither the anchor nor the strength is transitioned, because both are static per device.
- **Motion:** the tilt mapping is unchanged. On mobile the sweep starts from the corner, so tilting the top of the phone away pulls the glare across the photo, and tilting the other way slides it off the edge.
- **Audio:** none.

## 7. Do's and Don'ts

- **DO** change intensity only through `--sheen-strength`, so the device pass stays a one-value tweak.
- **DO** set `--sheen-anchor` only inside the existing `(pointer: coarse)` rule that pairs `.photo-frame.focused .photo-sheen` with `.print-sharp-overlay .photo-sheen`, so frame and overlay can't diverge.
- **DON'T** edit the inline `'0.92'` opacity writes in `FramedPrint.tsx` or the gyro or mouse translation maths.
- **DON'T** move the desktop resting position, change the ellipse size, or reintroduce `mix-blend-mode: screen` on coarse pointers.
- **DON'T** add per-mood sheen overrides.
