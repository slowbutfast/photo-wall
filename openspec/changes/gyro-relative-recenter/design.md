---
name: Chiaroscuro Gallery — Pose-Independent Tilt with Settling Recentre
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
tilt:
  maxDeg: "22"                    # DEFAULT_GYRO_MAX_DEG, unchanged
  frameRotation: "±4°"            # nx·8 / −ny·8, unchanged
  sheenSweep: "±38%"              # unchanged
  trackingTauMs: "85"             # DEFAULT_GYRO_TAU_MS, unchanged
  recenter:
    stillMs: "3000"               # RECENTER_STILL_MS
    stillBandDeg: "1.5"           # RECENTER_STILL_BAND_DEG
    glideTauMs: "450"             # RECENTER_GLIDE_TAU_MS (~1.3 s to 95%)
    settleEps: "0.002"            # GLIDE_SETTLE_EPS (normalized)
---

## 1. Visual Overview & Philosophy

- **Aesthetic Tone**: The print should feel like a sheet of glazed paper you're holding: it responds to your hand, whichever way you hold the phone. When you stop moving, it settles back to rest, the way a hanging frame stops swinging. It shouldn't feel like a spring snapping back.
- **Target Surfaces**: Mobile Print Focus only: the focused `.photo-frame` rotation, `--tilt-sx`/`--tilt-sy` cast shadow, `.photo-sheen` translation, and their `PrintSharpOverlay` mirror. Desktop, Album View and macro are untouched.
- **Visual References**:
  - Today's portrait Print Focus tilt is the reference feel, and it's unchanged during active tracking.
  - The `65% 35%` resting glare from `sheen-glare-tuning` is where the glare returns after a recentre.

## 2. Color System & Contrast Rationale

No colour changes. The sheen strength, anchor and blend are inherited from `sheen-glare-tuning`. Contrast doesn't apply, because no text or UI chrome is affected.

| Token Name | Value | Semantic Role | Background Pair | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| — | inherited | — | — | n/a | n/a |

## 3. Typography Hierarchy

Unchanged. This change has no typographic surface.

## 4. Component Anatomy & States

### Component: focused `.photo-frame` + `.photo-sheen` (and `.print-sharp-overlay` mirror)

- **Visual Hierarchy & Placement**: unchanged. The tilt is applied to the focused frame. The overlay copies `transform` and `opacity` inline.
- **Component States**:
  - **Default / rest (just entered, or recentred and settled):**
    - frame at `translateZ(58px) rotateY(0) rotateX(0)`;
    - shadow offsets `0px`;
    - glare at the top-right `--sheen-anchor`.
  - **Active / tracking (hand moving):**
    - tilt follows the phone relative to the entry or last-recentred pose, with the 85 ms smoothing;
    - up to `±4°` frame rotation and `±38%` sheen sweep;
    - identical in portrait, landscape, upright or reclined holds.
  - **Settling (glide):** after 3 s within 1.5°, the frame rotation, the shadow and the glare all ease back together toward rest with a 450 ms time constant:
    - about 63% of the way at 0.45 s;
    - about 95% at 1.35 s;
    - fully settled by about 2.5 s at the latest.
    No overshoot or bounce.
  - **Interrupted glide:** any movement beyond 1.5° hands control straight back to the hand at tracking speed. There's no lingering ease.
  - **Unavailable** (reduced motion, permission denied, no sensor): the CSS rest pose, unchanged.
  - **Hover / Focus / Disabled:** not applicable on this surface. The tilt is decorative and never takes input.

## 5. Responsive Layout & Breakpoints

| Viewport | Gate | Tilt source | Recentre |
| :--- | :--- | :--- | :--- |
| **Mobile / tablet** | `@media (pointer: coarse)`, motion allowed | Gyro, relative rotation (portrait and landscape) | 3 s stillness, then a 450 ms glide |
| **Desktop** | `(pointer: fine)` | Mouse hover, unchanged | none |

Gating is by capability, never by width. No layout or touch-target changes.

## 6. Interaction, Motion & Sound

- **Transitions:** no CSS transitions are added or changed. The glide is the existing exponential smoother run with a longer time constant, written imperatively per rAF. The frame, shadow, sheen and overlay therefore stay in lockstep.
- **Motion curve:** exponential ease-out (first-order low-pass), so the start is fast and the stop is soft. It isn't a linear or cubic tween.
- **Orientation flip:** unchanged. Rotating the device still resets to rest immediately and rebases.
- **Audio:** none.

## 7. Do's and Don'ts

- **DO** keep every tilt write flowing through `onTilt` → `FramedPrint`, so the overlay mirror and the write de-duplication keep working.
- **DO** tune the recentre feel only through the four exported constants.
- **DON'T** add CSS `transition` on `.photo-frame` `transform` for the glide. It would fight the per-tick inline writes.
- **DON'T** change the `±4°`, `±38%` or `±22°` amplitudes, or the sheen anchor and strength.
- **DON'T** emit `{0, 0}` as an instant snap on recentre. The glide is the whole point.
