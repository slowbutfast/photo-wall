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

## Visual Overview & Component-Level Acceptance Criteria

Restores the visual look and feel of [photo_wall_playground.html](../../../playgrounds/photo_wall_playground.html) and [DESIGN.md](../../../DESIGN.md) using a full-viewport WebGL2 PBR plaster `<canvas>` (`PbrWallCanvas`) behind a 2D-transformed CSS DOM world (`CssGalleryWorld`), reusing the already self-hosted `@font-face` **`TeX Gyre Heros`** typography.

Because the production engine uses `islandLayout.ts` geometry and a GPU-baked lightmap rather than the playground's static demo scene, visual parity is verified at the **component level** against this checklist across `alabaster`, `concrete`, and `chiaroscuro`:
1. **Stucco Relief & Light Pools**: Normal-mapped plaster micro-relief is clearly lit overhead above each album, daytime `alabaster` preserves the playground's bright warm `#ECE9E2` exposure curve (never muddy mid-brown), and light falls off smoothly to ambient plaster outside the baked bounds with zero visible banding or edge smearing.
2. **Translucent Beveled Glass Placard**: At `album` and `print` zoom, the WebGL2 plaster wall blurs visibly through CSS `backdrop-filter: blur()` on `.museum-placard` with `>= 4.5:1` text contrast (never turning into an opaque box during print focus).
3. **Aspect-Fitted Frame & Recessed Mat**: Portrait and landscape prints render at their true `aspectRatio` centered inside each `CELL_SIZE × CELL_SIZE` grid cell, framed by an `11px` cotton mat with a `3px` top recessed inner shadow.
4. **Unclipped Directional Cast Shadows**: Umbra/penumbra shadows project away from each object's strongest fixture (`--sx`, `--sy`) and remain unclipped at the outer edges of `.album-island` (`contain: layout`, never `contain: paint`).
5. **Crisp Settled Typography**: After pan/zoom settles and `will-change: transform` is removed, placard titles, captions, and HUD labels render sharp without bitmap scaling blur.

## Mood & Lighting Tokens (60s Crossfade via `suncalc`)

| Mood | Wall Tint / Base | `ambientLevel` | `spotIntensity` | `poolAlpha` | `shadowOpacity` | `placardInk` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `alabaster` (Day) | `#ECE9E2` | `0.78` | `0.65` | `0.38` | `0.26` | `#1D1E1C` |
| `concrete` (Twilight) | `#6B6861` | `0.42` | `0.85` | `0.62` | `0.42` | `#F4F6F4` |
| `chiaroscuro` (Night) | `#2D2C29` | `0.18` | `1.10` | `0.88` | `0.58` | `#F4F6F4` |

## Component Anatomy & Zoom-Tier States

- **Print Frame (`.photo-frame`)**:
  - *True Aspect Ratio*: Focusable `<button>` sized proportionally to `photo.aspectRatio` inside its `CELL_SIZE × CELL_SIZE` grid slot (centered), `11px` cotton mat (`#F6F4EF`), `3px` top recessed inner shadow, `thumbHash`/`dominantColor` placeholder while loading, achromatic `.is-lit::after` falloff (`--lit-top/bot/l/r`), and directional `--sx`/`--sy` `box-shadow`.
  - *Image Width*: Projected size `ceil(cellPx * scale * DPR)` snapped to `256 / 800 / 2048`.
  - *Macro Tier (`scale < 0.25`)*: Flat single shadow, zero tilt/glare.
  - *Album Tier (`scale >= 0.25`)*: Full multi-layer umbra/penumbra shadow, local 3D hover tilt (`max 5°`) + diagonal glass glare.
  - *Print Focus*: Surface darkening clears (`opacity: 0`), non-focused sibling `.photo-frame` elements dim per-element (`0.26`) with zero opacity on `.world` or `.album-island`.
- **Beveled Glass Standoff Placard (`.museum-placard`)**: `214px × 200px` (`2.14u × 2.00u`), translucent green-tinted beveled glass with corner standoffs and CSS `backdrop-filter: blur()` (`album`/`print` tiers only; blur & text hidden at `macro` tier) plus frosted text backing for `>= 4.5:1` contrast.
- **Soundtrack Plaque (`.soundtrack-plaque`)**: `214px × 200px` (`2.14u × 2.00u`) matte-black `#161616` housing `12px` (`0.12u`) beneath the glass placard; hidden at `macro` tier (preventing floating bright squares), resting thumbnail proxied via `/api/youtube/thumb/[id]` at `album`/`print` tiers, single native `youtube-nocookie.com` `<iframe>` on click with transparent gesture capture layer.
- **HUD & Focus Bar**: Unchanged quiet ephemera HUD (`GalleryHud`), scrollable bottom Exhibition Room Directory with subtle horizontal edge fade masks (no mid-word hard clipping), and unobstructed full-width bottom `PhotoFocusBar`.

## Responsive Layout & Breakpoints

- Desktop (`>= 768px`): 3 albums per row, `340px` slide-over Curator Drawer, full hover tilt.
- Mobile (`< 768px`): `touch-action: none` viewport, pinch-to-zoom, `bottomInsetPx`-aware framing, touch targets `>= 44px`.
