---
name: Chiaroscuro Gallery (DOM Wall Engine)
tokensRef: ../../../DESIGN.md
worldScale: "100px = 1 world unit (WORLD_SCALE = 0.01)"
colors:
  wall-base: "#2D2C29"
  wall-ambient: "#141412"
  primary: "#ECEAE4"
  secondary: "#9E9C95"
  mat-cotton: "#F6F4EF"
  placard-glass: "rgba(226, 242, 234, 0.22)"
  placard-backing-light: "rgba(244, 246, 244, 0.72)"
  placard-backing-dark: "rgba(20, 22, 20, 0.74)"
  placard-ink-alabaster: "#1D1E1C"
  placard-ink-dark: "#F4F6F4"
  placard-core: "#161616"
  hud-surface: "rgba(24, 24, 22, 0.86)"
  admin-surface: "#FFFFFF"
  admin-ink: "#1A1B19"
  admin-accent: "#2D3B36"
typography:
  placard-title: "TeX Gyre Heros 700 16px / 1.25 (-0.015em)"
  placard-caption: "TeX Gyre Heros 400 13px / 1.4"
  hud-label: "TeX Gyre Heros 600 13.5px"
  hud-meta: "TeX Gyre Heros 500 10.5px (0.06em, tabular-nums)"
rounded:
  sharp: 1px
  hud: 2px
  drawer: 3px
spacing:
  mat: 11px (0.11u)
  placard-pad: 22px (0.22u)
  gutter: 24px (0.24u)
  island-gap: 44px (0.44u)
---

## Visual Overview & Parity Baseline

Restores pixel-faithful visual parity with [photo_wall_playground.html](../../../playgrounds/photo_wall_playground.html) and [DESIGN.md](../../../DESIGN.md) using a full-viewport WebGL2 PBR plaster `<canvas>` (`PbrWallCanvas`) behind a 2D-transformed CSS DOM world (`CssGalleryWorld`).

## Mood & Lighting Tokens (60s Crossfade via `suncalc`)

| Mood | Wall Tint / Base | `ambientLevel` | `spotIntensity` | `poolAlpha` | `shadowOpacity` | `placardInk` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `alabaster` (Day) | `#ECE9E2` | `0.78` | `0.65` | `0.38` | `0.26` | `#1D1E1C` |
| `concrete` (Twilight) | `#6B6861` | `0.42` | `0.85` | `0.62` | `0.42` | `#F4F6F4` |
| `chiaroscuro` (Night) | `#2D2C29` | `0.18` | `1.10` | `0.88` | `0.58` | `#F4F6F4` |

## Component Anatomy & Zoom-Tier States

- **Print Frame (`.photo-frame`)**:
  - *True Aspect Ratio*: Sized directly from `photo.aspectRatio` inside each `islandLayout` cell (`object-fit: contain`), `11px` cotton mat (`#F6F4EF`), `3px` top recessed inner shadow, achromatic `.is-lit::after` directional falloff driven by `--lit-top/bot/l/r`, and directional umbra/penumbra `box-shadow` driven by `--sx`/`--sy`.
  - *Macro Tier (`scale < 0.25`)*: `?width=128`, flat single shadow, zero tilt/glare.
  - *Album Tier (`scale >= 0.25`)*: `?width=800`, full multi-layer umbra/penumbra shadow, local 3D hover tilt (`max 5°`) + diagonal glass glare.
  - *Print Focus*: `?width=2048`, surface darkening clears (`opacity: 0`), surrounding prints dim subtly (`0.26`) with zero modal blur.
- **Beveled Glass Standoff Placard (`.museum-placard`)**: `214px × 200px` (`2.14u × 2.00u`), translucent green-tinted beveled glass with corner standoffs and CSS `backdrop-filter: blur()` (`album`/`print` tiers only; blur & text hidden at `macro` tier) plus frosted text backing for `>= 4.5:1` contrast across all three moods.
- **Soundtrack Plaque (`.soundtrack-plaque`)**: `214px × 200px` (`2.14u × 2.00u`) matte-black `#161616` housing `12px` (`0.12u`) beneath the glass placard; static thumbnail facade at rest, single native `youtube-nocookie.com` `<iframe>` on click with `pointer-events: none` during active drag/wheel gestures.
- **HUD & Focus Bar**: Unchanged quiet ephemera HUD (`GalleryHud`), floating bottom Exhibition Room Directory (scrollable without clipping), and unobstructed full-width bottom `PhotoFocusBar`.

## Responsive Layout & Breakpoints

- Desktop (`>= 768px`): 3 albums per row, `340px` slide-over Curator Drawer, full hover tilt.
- Mobile (`< 768px`): `touch-action: none` viewport, pinch-to-zoom, `bottomInsetPx`-aware framing, touch targets `>= 44px`.
