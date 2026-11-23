---
name: Chiaroscuro Gallery (DOM Wall Engine)
tokensRef: ../../../DESIGN.md
worldScale: "100px = 1 world unit (WORLD_SCALE = 0.01)"
colors:
  wall-base: "#2D2C29"
  wall-ambient: "#141412"
  primary: "#ECEAE4"
  secondary: "#9E9C95"
  mat-cotton: "#F4F4F2"
  placard-glass: "rgba(226, 242, 234, 0.22)"
  placard-backing-light: "rgba(244, 246, 244, 0.72)"
  placard-backing-dark: "rgba(20, 22, 20, 0.74)"
  placard-ink-alabaster: "#1D1E1C"
  placard-ink-dark: "#F4F6F4"
  placard-aluminum-start: "#E2E4E6"
  placard-aluminum-end: "#B8BCC0"
  placard-core: "#141414"
  hud-surface: "rgba(18, 18, 18, 0.85)"
  admin-surface: "#FFFFFF"
  admin-ink: "#1A1B19"
  admin-accent: "#2D3B36"
typography:
  placard-title: "TeX Gyre Heros 700 16px / 1.25 (-0.015em)"
  placard-caption: "TeX Gyre Heros 400 13px / 1.4"
  hud-label: "TeX Gyre Heros 500 11px uppercase (0.1em)"
  hud-meta: "TeX Gyre Heros 500 10.5px uppercase (0.1em, tabular-nums)"
rounded:
  sharp: 1px
  hud: 2px
  drawer: 3px
spacing:
  mat: 11px (0.11u)
  placard-pad: 22px (0.22u)
  gutter: 24px (0.24u)
  island-gap: 220px (2.2u)
---

## Visual Overview & Component-Level Acceptance Criteria

Restores the visual look and feel of [photo_wall_playground.html](../../../playgrounds/photo_wall_playground.html) and [DESIGN.md](../../../DESIGN.md) using a full-viewport WebGL2 PBR plaster `<canvas>` (`PbrWallCanvas`) behind a 2D-transformed CSS DOM world (`CssGalleryWorld`), reusing the already self-hosted `@font-face` **`TeX Gyre Heros`** typography.

Because the production engine uses `islandLayout.ts` geometry and a GPU-baked lightmap rather than the playground's static demo scene, visual parity is verified at the **component level** against this checklist across `alabaster`, `concrete`, and `chiaroscuro`:
1. **Stucco Relief & Light Pools**: `wall_albedo.webp` is desaturated to neutral plaster so daytime `alabaster` reads bright warm `#ECE9E2`, night `chiaroscuro` reads neutral charcoal `#2B2B2A`, warm `3500K` (`#FFF5E6`) per-cluster pools fall to `~35–45%` ambient between clusters (`ISLAND_GAP = 2.2u`), normal-map strength is attenuated at macro zoom, and light falls off smoothly outside baked bounds with zero banding or edge smearing.
2. **Translucent Beveled Glass Placard (Default) + Settings Alternatives**: At `album` and `print` zoom, the WebGL2 plaster wall blurs visibly through CSS `backdrop-filter: blur()` on `.museum-placard` with `>= 4.5:1` text contrast (never turning opaque during print focus). Settings also supports switching to **Brushed Aluminum** (`linear-gradient(135deg, #E2E4E6 0%, #B8BCC0 100%)` + horizontal grain, `3–4px` `#141414` core edge, 2 bottom screws, `0 12px 24px rgba(0,0,0,0.65)` downward shadow), **Matte Black Acrylic**, or **Archival Rag Paper**.
3. **Aspect-Fitted Frame & Recessed Mat (`<= 20` photos/album)**: Portrait and landscape prints render at their true `aspectRatio` centered inside each `CELL_SIZE × CELL_SIZE` grid cell, framed by a thinner `#F4F4F2` cotton mat with a `3px` top recessed inner shadow and a downward-offset drop shadow.
4. **Unclipped Directional Cast Shadows & Print-Focus Periphery**: Umbra/penumbra shadows project away from each object's strongest fixture (`--sx`, `--sy`) and remain unclipped at the outer edges of `.album-island` (`contain: layout`, never `contain: paint`); in `print` focus, non-focused sibling `.photo-frame` elements dim to `opacity: 0.45` with subtle desaturation.
5. **Swiss-Label HUD & Compact Dock**: Top-right `24px`-inset sharp segmented control (`11px`, `500`, `uppercase`, `0.1em` tracking, `#FFFFFF` active fill + `#111111` ink; renders 1 segment on `/` or 2 segments `OVERVIEW | CURATE` on `/admin`), compact centered dock (`max-width: min(760px, calc(100vw - 48px))`, `rgba(18,18,18,0.85)`, `blur(8px)`, horizontal edge fade masks, no `EXHIBITION ROOMS` label), tracked uppercase Focus Bar (`← PREV` / `NEXT →` / `RETURN [ESC]`), and crisp settled typography.

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
