---
name: Chiaroscuro Gallery — Touch Parity (no new visual language)
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
    sans: "var(--font-family-base) / var(--font-helvetica), unchanged"
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
  lg: "24px"   # existing HUD edge offset; safe-area insets are ADDED to it
  xl: "44px"   # minimum coarse-pointer hit area (invisible)
rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
  full: "9999px"
---

## 1. Visual Overview & Philosophy

- **Aesthetic tone:** no change. The gallery should look identical on a phone, just behave natively: no stuck hover lifts, nothing hidden under the notch, and controls you can actually hit.
- **Target surfaces:** `/photos` on iPhone Safari and Android Chrome, in portrait and landscape, and the `/photos/admin` mobile tabs.
- **Visual references:** the existing `hud.css` mobile block (`≤ 767px`) and the Studio's `< 1024px` tab layout.

## 2. Color System & Contrast Rationale

No colour changes, so all existing contrast ratios hold.

| Token Name | Hex Value | Semantic Role | Background Pair | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| (all) | unchanged | unchanged | unchanged | unchanged | unchanged |

## 3. Typography Hierarchy

Unchanged. Font sizes deliberately do **not** grow on touch: the hit area grows instead (§4).

## 4. Component Anatomy & States

### Component: HUD controls (`.hud-button`, `.hud-top-right`, `.photo-focus-bar`)
- **Placement:** `.hud-top-right` uses `top: max(24px, env(safe-area-inset-top, 0px))` and `right: max(24px, env(safe-area-inset-right, 0px))` (`max(12px, ...)` inside `≤ 767px`). `.photo-focus-bar` keeps its bottom `env(safe-area-inset-bottom, 0px)` padding and sets horizontal padding to `max(22px, env(safe-area-inset-left, 0px))` / `max(22px, env(safe-area-inset-right, 0px))` (`max(14px, ...)` inside `≤ 767px`).
- **Default:** visually identical on desktop and devices without insets.
- **Hover:** wrapped in place under `@media (hover: hover) and (pointer: fine)` (preserving cascade order for `.hud-button.active` and `.hud-button-primary`).
- **Active / pressed (touch):** the existing `.active` state only. No hover styling after a tap.
- **Focus:** unchanged `:focus-visible` rings.
- **Hit area (coarse):** an invisible `::before` extends `.hud-button` and Photo Focus controls to at least 44 × 44 px, centred on the visible control.

### Component: `FramedPrint` and placard
- **Touch:** no tilt, sheen sweep or hover lift. A tap selects and focuses exactly as today.
- **Mouse:** unchanged tilt, lift and sheen.

### Component: Soundtrack facade and capture layer
- **Visual & playback:** unchanged (`playsinline=1` added on iOS). Scaled-world hit sizing follows camera zoom rather than screen-space CSS `::before` overlays.

### Component: Studio photo tile (`.album-editor-photo-media`)
- **Touch:** `touch-action: manipulation; -webkit-touch-callout: none; user-select: none;`. A swipe scrolls the panel. A long-press of 250 ms picks the tile up without opening iOS image callouts or Android context menus, using the existing `.is-dragging` visual.
- **Mouse and keyboard:** unchanged.

## 5. Responsive Layout & Breakpoints

| Viewport | Breakpoint | Layout Pattern | Navigation / Sizing Rules |
| :--- | :--- | :--- | :--- |
| Phone | `≤ 767px` (existing) | Existing compact HUD | Safe-area offsets, 44 px hit areas when `pointer: coarse` |
| Tablet / Studio mobile | `< 1024px` (existing Studio) | Existing tabs | Touch sensors and scrollable tiles |
| Desktop | `≥ 768px`, fine pointer | Unchanged | Hover effects enabled |

Gating is by **capability** (`pointer`, `hover`), not by width. A narrow desktop window keeps mouse hover.

## 6. Interaction, Motion & Sound

- **Pinch:** zoom and pan follow the fingers, so the content under the midpoint stays put, like a map.
- **One-finger lift:** the pan continues smoothly, with no jump.
- **Long-press reorder:** 250 ms. There's no extra haptic or audio, so we rely on the OS.
- **Soundtrack:** plays inline in the plaque on iPhone.

## 7. Do's and Don'ts

- **DO** gate on `(hover: hover) and (pointer: fine)` and `pointerType`, never on user-agent strings or width alone.
- **DO** move hover rules into the media block rather than copying them, so `cssBoundaryAudit` stays green.
- **DON'T** set `user-scalable=no` or `maximum-scale=1` on the viewport.
- **DON'T** enlarge visible HUD controls or fonts on touch. Expand only the invisible hit area.
- **DON'T** change any desktop computed style. The fine-pointer baseline must show 0 diffs.
