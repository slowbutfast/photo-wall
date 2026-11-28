---
name: Glare Toggle Hint
colors:
  primary: "#eceae4"      # --color-primary: hint text
  secondary: "#9e9c95"    # --color-secondary: unused here
  background: "#141412"   # --color-wall-ambient: what the hint sits over in Print Focus
  surface: "rgba(24, 24, 22, 0.86)"   # --color-hud-surface: hint pill background
  text:
    primary: "#eceae4"
    muted: "#9e9c95"
  border: "rgba(255, 255, 255, 0.12)" # --color-hud-border
  status:
    success: "n/a"
    warning: "n/a"
    error: "n/a"
typography:
  fontFamily:
    sans: "var(--font-family-base)"
    mono: "n/a"
  scale:
    h1: "n/a"
    h2: "n/a"
    body: "13px, weight 500, letter-spacing 0.02em"
    caption: "n/a"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
rounded:
  sm: "0px"
  md: "0px"
  lg: "0px"
  full: "9999px"
---

## 1. Visual Overview & Philosophy

- **Aesthetic tone:** a quiet museum label, not an app toast. The hint confirms the toggle and gets out of the way.
- **Target surfaces:** coarse-pointer phones and tablets in Print Focus. Desktop never shows it.
- **Visual references:**
  - `.photo-focus-bar` (`hud.css:99+`): the same surface and border tokens;
  - the sheen itself, whose look is unchanged when on.

## 2. Color System & Contrast Rationale

| Token Name | Hex Value | Semantic Role | Background Pair | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `text.primary` (`--color-primary`) | `#eceae4` | Hint text | `surface` (`rgba(24,24,22,0.86)`) composited over `#141412`, about `#181816` | ≈ 15.6:1 | **PASS (AAA)** |
| `border` (`--color-hud-border`) | `rgba(255,255,255,0.12)` | Pill outline | `surface` | decorative | n/a |

**Glare off:** the `.photo-sheen` alpha stops become `0`. No other colour changes.

## 3. Typography Hierarchy

| Level | Font Family | Size | Weight | Line Height | Intended Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Body` | `var(--font-family-base)` | `13px` | `500` | `1.3` | The hint text, one line, never wrapped (`white-space: nowrap`) |

## 4. Component Anatomy & States

### Component: `.glare-hint`

- **Placement:**
  - absolutely positioned inside `.wall-viewport` (outside `.wall-world`), horizontally centred;
  - `top: calc(14px + env(safe-area-inset-top, 0px))`, so it clears the notch and stays away from the bottom `.photo-focus-bar`;
  - `z-index: 61`, above the focus bar's `60`.
- **Box:**
  - padding `6px 12px`;
  - `border-radius: 9999px`;
  - `background: var(--color-hud-surface)`;
  - `border: 1px solid var(--color-hud-border)`.
- **States:**
  - **Idle:** empty text, `opacity: 0`, `visibility: hidden` (still in the accessibility tree as a live region).
  - **Showing:** `opacity: 1`, `visibility: visible`, for `1600ms`.
  - **Hover, active, focus, disabled:** n/a. It's non-interactive (`pointer-events: none`), with no focus stop.

### Behaviour: focused print, glare off

- The sheen is fully transparent. Tilt, lift and shadow are unchanged.
- There's no visual mark on the print itself: the hint is the only feedback.

## 5. Responsive Layout & Breakpoints

| Viewport | Breakpoint | Layout Pattern | Rules |
| :--- | :--- | :--- | :--- |
| **Phone / tablet** | `(pointer: coarse)` | A centred pill at the top | The whole focused print is the tap target, far above 44 px |
| **Desktop** | `(pointer: fine)` | Never shown | The hint and the `data-glare` rule don't apply |

## 6. Interaction, Motion & Sound

- **Hint:** `transition: opacity 150ms ease-out` on `.glare-hint` only. That element has no `backdrop-filter`, so the postmortem's WebKit fade hazard doesn't apply.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, there's no transition and the hint appears and disappears instantly.
- **Glare:** it switches instantly. There's no transition: a `background` doesn't interpolate to `none`, so the sheen simply stops painting.
- **Audio:** none.

## 7. Do's and Don'ts

- **DO** scope every new rule to `@media (pointer: coarse)`. Fine-pointer CSS must be byte-identical.
- **DO** use `--color-hud-surface`, `--color-hud-border` and `--color-primary`. No raw hex.
- **DON'T** add `backdrop-filter` to the hint.
- **DON'T** touch `.photo-sheen` `opacity` or `transform`, the gyro callback, or `PrintSharpOverlay`.
- **DON'T** use `display: none` on the sheen to turn the glare off.
