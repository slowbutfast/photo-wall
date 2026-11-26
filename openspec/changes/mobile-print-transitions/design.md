---
name: Continuous Print Focus Hand-off
colors:
  primary: "#F6F4EF"      # --frame-bg mat (unchanged)
  secondary: "#D5D1C8"    # mat right bevel (unchanged)
  background: "#141412"   # print-sharp-overlay backing (unchanged)
  surface: "#F6F4EF"      # frame surface (unchanged)
  text:
    primary: "#111111"    # Photo Focus bar ink (unchanged)
    muted: "rgba(17, 17, 17, 0.62)"
  border: "rgba(17, 17, 17, 0.12)"
  status:
    success: "#111111"
    warning: "#111111"
    error: "#111111"
  veil: "rgba(8, 7, 5, 1)"  # neighbour-dimming veil colour (same warm black as the light falloff overlay)
typography:
  fontFamily:
    sans: "Photo Focus bar stack (unchanged)"
    mono: "n/a"
  scale:
    h1: "n/a"
    h2: "n/a"
    body: "hud-button label (unchanged)"
    caption: "n/a"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
rounded:
  sm: "1px"
  md: "1px"
  lg: "1px"
  full: "9999px"
motion:
  flightEase: "smoothstep t²(3−2t) ≡ cubic-bezier(0.3333, 0, 0.6667, 1)"
  flightDurationMs: "clamp(round(300 + 380·S), 450, 1100)"
  handoffReleaseMs: 160
  touchLiftPx: "22 → 58 (translateZ(calc(22px + 36px·w)))"
  veilStrength: 0.38
  touchPortraitPrintPadding: 0.08
---

## 1. Visual Overview & Philosophy

- **Aesthetic tone:** the camera glides and the light goes with it. As the camera leaves a print, that print settles back and darkens into the wall's falloff. The print it arrives at rises, sharpens and brightens exactly as it lands. Nothing changes after the camera stops.
- **Target surfaces:**
  - Print Focus on iPhone Safari portrait, the primary target;
  - Print Focus on desktop, for the falloff and overlay hand-off and the flight timing;
  - Album↔Print flights on both.
- **Visual references:**
  - today's resting Print Focus look, which is the `w = 1` end state and must not change;
  - today's resting Album look, which is the `w = 0` end state.

## 2. Color System & Contrast Rationale

No new colours. Every hand-off quantity interpolates between two existing resting values.

| Token Name | Value | Semantic Role | Background Pair | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `veil` | `rgba(8, 7, 5, 0.38 · p · (1 − w))` | Touch neighbour dimming in Print Focus | Prints and mats | n/a (decorative) | n/a |
| Falloff overlay | Existing `--lit-*` gradient, opacity `1 − w` | Light falloff, hidden on the focused print | Print | n/a | n/a |
| Photo Focus bar ink | `#111111` on `rgba(244,244,242,0.92)` | `RETURN` label (unchanged colours) | Bar surface | Unchanged | **PASS (AAA)**, unchanged |

The veil's peak strength of 0.38 is a little stronger than the falloff overlay's own strongest edge (0.28 horizontal, 0.5 vertical gradient max). Neighbours read as receding into shadow without going black, and they stay recognisable as prints. It's tunable on device; it's a single token.

## 3. Typography Hierarchy

No change. The only text change is that `[ESC]` becomes a separate `<span class="hud-key-hint">` inside the existing return button, which inherits its typography. On fine pointers the text reads `RETURN [ESC]`, with the space inside the span, so the rendered text is identical to today.

## 4. Component Anatomy & States

### Component: `.photo-frame` during a focus hand-off

- **Placement:** unchanged. New child spans are added in this order inside the `<button>`: `.photo-shadow-rest`, `.photo-shadow-focus` (both `aria-hidden`, `pointer-events: none`), then `.photo-window` (existing), then `.photo-dim`. `.photo-dim` sits above the window and below `::after`.
- **States:**
  - **Resting unfocused (`w = 0`):** exactly as today.
  - **Resting focused (`w = 1`):** exactly as today on desktop. On touch, the only difference is that the resting lift is `translateZ(58px)` instead of `22px`, so it's about 3.3% larger. That's the size the gyro already gave it on its first tick.
  - **Hand-off (`0 < w < 1`, `.is-handoff`):**

    | Quantity | Desktop | Touch |
    | :--- | :--- | :--- |
    | Falloff `::after` opacity | `1 − w` | `1 − w` |
    | Crisp overlay opacity | `w` (once decoded) | `w` (once decoded) |
    | z-index | 40; incoming print 41 | 40; incoming print 41 |
    | Lift | unchanged (22 px both ends) | `translateZ(22 + 36·w px)` |
    | Gyro rotation | n/a | `rotate(--gyro-r* · w)` |
    | Outer shadow | unchanged (`.is-lit` wins at both ends) | rest span opacity `1 − w`; focus span opacity `w` |
    | Sheen | unchanged | opacity `0.92 · w` |
    | Neighbour veil (`.photo-dim`) | hidden | `0.38 · p · (1 − w)` |

  - **Hover (fine pointer):** unchanged. The mouse tilt still writes its inline transform. A hover during a hand-off is allowed, and the inline style wins as it does today.
  - **Focus-visible:** unchanged outline.
- **Touch shadow layer values:** these are copied from today's coarse rules (`wall.css:1143-1159`), outer layers only.
  - `.photo-shadow-rest`: `calc(var(--sx, 0px) * 1.15) calc(var(--sy, 8px) * 1.75) calc(5px + var(--sy, 8px) * 1.45) calc(var(--sy, 8px) * -0.35) rgba(0,0,0, calc(0.12 + 0.4 * var(--lit, 0.8)))`.
  - `.photo-shadow-focus`: `calc(var(--sx, 0px) + var(--tilt-sx, 0px)) calc(var(--sy, 8px) * 1.8 + var(--tilt-sy, 0px)) 36px -6px rgba(0,0,0,0.62)`.
  - Under `.is-handoff`, the frame keeps only the inset highlight `0 1px 0 rgba(255,252,242, calc(0.2 + 0.78 * var(--lit-top, 1))) inset`. That's the midpoint of the rest value (0.18) and the focused value (0.22), a 0.04 alpha difference, which is invisible.

### Component: `PhotoFocusBar` return button
- **Default:** fine pointers show `RETURN [ESC]`; coarse pointers show `RETURN`.
- **Hover/active/focus:** unchanged `hud-button-primary` states.
- **Touch target:** unchanged, at least 44 × 44 px.

## 5. Responsive Layout & Breakpoints

| Viewport | Breakpoint | Layout Pattern | Navigation / Sizing Rules |
| :--- | :--- | :--- | :--- |
| **Phone portrait** | `(pointer: coarse)` and aspect `< 0.9` | Print Focus padding `0.08`: the print fills 84% of the limiting axis. Side neighbours fall outside the 0.24 gutter for landscape prints; top/bottom neighbours are dimmed by the veil. | `RETURN` label. Touch targets unchanged. |
| **Phone landscape / tablet** | `(pointer: coarse)` and aspect `≥ 0.9` | Padding `0.14` (unchanged) | Veil, dither, settle snap and gyro hold still apply |
| **Desktop** | `(pointer: fine)` | Padding `0.14` (unchanged). No veil, no dither, no settle snap. | `RETURN [ESC]` |

## 6. Interaction, Motion & Sound

- **One clock:** camera position, zoom and every hand-off quantity read `e = flightEase(t)`. There are no CSS transitions on any hand-off quantity while `.is-handoff` is present.
- **Durations:**

  | Flight | Duration |
  | :--- | :--- |
  | Adjacent NEXT | 455 ms |
  | 4-column wrap | 746 ms |
  | 5-column wrap | 849 ms |
  | Album→Print | about 650 ms |
  | Overview→Album | about 730 ms |
  | Entry framing | 620 ms (unchanged) |

- **Short steps** pan at constant zoom; long jumps arc (zoom out, then in).
- **Interruption:** a drag, pinch or wheel mid-flight finishes the hand-off over 160 ms. A second NEXT mid-flight re-targets from the current weights.
- **Reduced motion:** weights jump to their targets on the first frame. Flights themselves are unchanged by this change.
- **Gyro:** tilt is still during flights and resumes from wherever the phone is held once the camera stops. There's no tilt step at landing.
- **Audio:** n/a.

## 7. Do's and Don'ts

- **DO** drive every hand-off quantity from `--focus-w` / `--print-w` written by `focusHandoff.ts`.
- **DO** keep resting rules (`w` at 0 or 1, no `.is-handoff`) byte-identical on desktop.
- **DO** use `var(--focus-w, 1)` fallbacks on `.focused` so a focused print without a hand-off renders at full weight.
- **DON'T** add `will-change`, `backface-visibility` or new transitions to `.photo-frame` or `.photo-cell`.
- **DON'T** animate `box-shadow`, `filter` or `background` per frame. Only `opacity` and `transform`, via custom properties.
- **DON'T** write per-frame styles to non-participant prints (`--print-w` on the grid is the single exception).
- **DON'T** add a moving spotlight or change `computePlaygroundLighting`.
- **DON'T** hide `[ESC]` from JS. It's CSS-only, to keep hydration identical.
