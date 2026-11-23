---
name: Chiaroscuro Gallery
tokensRef: ../../../DESIGN.md
worldScale: "100px = 1 world unit (WORLD_SCALE = 0.01)"
colors:
  wall-base: "#2D2C29"
  wall-ambient: "#141412"
  primary: "#ECEAE4"
  secondary: "#9E9C95"
  mat-cotton: "#F6F4EF"
  placard-glass: "rgba(226, 242, 234, 0.28)"
  placard-ink: "#F4F6F4"
  placard-core: "#161616"
  hud-surface: "rgba(24, 24, 22, 0.86)"
  admin-surface: "#FFFFFF"
  admin-ink: "#1A1B19"
  admin-accent: "#2D3B36"
typography:
  placard-title: "Helvetica (TeX Gyre Heros in WebGL) 700 0.16u / 1.25 (-0.015em)"
  placard-caption: "Helvetica (TeX Gyre Heros in WebGL) 400 0.13u / 1.4"
  hud-label: "Helvetica Neue 600 13.5px"
  hud-meta: "Helvetica Neue 500 10.5px (0.06em, tabular-nums)"
rounded:
  sharp: 1px
  hud: 2px
  drawer: 3px
spacing:
  mat: 0.11u (11px)
  placard-pad: 0.22u (22px)
  gutter: 0.24u (24px)
  island-gap: 0.44u (44px)
---

## Visual Overview & Philosophy

Borderless **Chiaroscuro Gallery** mounting prints and Swiss-modernist placards directly onto a continuous PBR stucco plaster wall (`DESIGN.md`), illuminated by overhead track-light pools without visible hardware, alcove borders, or web-modal overlays. All 3D scene dimensions derive from `100px = 1 world unit` (`WORLD_SCALE = 0.01`) owned by `src/lib/layout/islandLayout.ts`.

## Color System & Contrast

| Token | Value | Semantic Role | Contrast Note |
| :--- | :--- | :--- | :--- |
| `wall-base` | `#2D2C29` | Continuous PBR plaster base | Low-key backdrop; unlit edges fall to `#141412` |
| `primary` | `#ECEAE4` | HUD text & active directory indicator | `> 12:1` on `hud-surface` (`rgba(24,24,22,0.86)`) — passes WCAG AAA |
| `secondary` | `#9E9C95` | Muted HUD controls & EXIF line | `> 5.8:1` on `hud-surface` — passes WCAG AA |
| `mat-cotton` | `#F6F4EF` | 4-ply recessed archival print mat | Warm museum rag, avoids `#FFFFFF` glare |
| `placard-aluminum` | `#D2D5D9` | Brushed anodized aluminum plaque | `#111111` ink yields `13.2:1` contrast — passes WCAG AAA |
| `admin-accent` | `#2D3B36` | Curator primary CTA button | `#FFFFFF` text yields `12.1:1` contrast — passes WCAG AAA |

## Typography Hierarchy

- **Physical Placards (WebGL)**: Bundled metric-identical **TeX Gyre Heros** (or canvas-baked `"Helvetica Neue", Helvetica, Arial`) at `700` Bold title (`0.16u`) + `400` Regular caption (`0.13u`) + live `tabular-nums` track timecode, rendered via `troika-three-text`.
- **Gallery HUD & Curator UI (DOM)**: `"Helvetica Neue", Helvetica, Arial, sans-serif` everywhere (`600` SemiBold `13.5px` for exhibition names and Photo Focus caption; `500` Medium `10.5px` uppercase `0.06em` tracking + `tabular-nums` for quiet controls and optional `Camera • Date • Location`).

## Component Anatomy & States (World Units)

- **Print Frame (`print-frame-mat`)**:
  - *Idle*: `z = 0.22`, `0.11` cotton mat, `0.03` top recessed inner shadow, wall-plane cast shadow at `z = 0.002` (`depthWrite: false`), achromatic distance falloff.
  - *Hover*: Elevates to `z = 0.36`, tilts toward cursor (`max 5°`), diagonal glass glare sweeps across print surface (unified mat + print via `VisiblePrintPool`).
  - *Focused*: Lifts to `z = 0.54`, surface darkening clears (`opacity: 0`), surrounding prints dim subtly (`0.26`) with zero modal blur.
- **Beveled Glass Standoff Placard (`placard-glass-standoff`)**: `z = 0.14`, exact `2.14u × 2.00u` (`214px × 200px`), green-tinted transparent beveled glass floating on corner standoffs so the PBR plaster wall shows behind it; includes live `Artist - Song (0:01/3:25)` when a soundtrack is attached.
- **Soundtrack Plaque (`soundtrack-plaque`)**: `z = 0.14`, exact `2.14u × 2.00u` (`214px × 200px`) matte-black `#161616` housing directly beneath the glass placard; static thumbnail at rest, interactive `youtube-nocookie.com` iframe on click, auto-stops on zoom-out.
- **HUD & Focus Bar**: Sharp `2px` top-right controls (`Overview`, subtle lock icon until authenticated), bottom Exhibition Room Directory, and `0px` full-width bottom Photo Focus bar (`Prev`, `Next`, **album caption**, optional `Camera • Date • Location`, `Return (Esc)`).

## Responsive Layout & Breakpoints

- **Wall Arrangement**: Albums are laid out **3 per row** (like an Instagram 3-column grid), centered horizontally with generous dark-plaster margins between exhibition wings.
- Desktop (`>= 768px`): 4–5 column exhibition grids (`0.24` world-unit gutter), `256 MB` VRAM budget, `340px` slide-over Curator Drawer.
- Mobile (`< 768px` heuristic): `touch-action: none` full-viewport canvas, `96 MB` VRAM budget, `bottomInsetPx`-aware horizontal/vertical FOV framing, touch targets `>= 44px` on HUD buttons and bottom focus controls.

## Interaction & Motion

- Smooth spring pan/zoom damping (`zClamp = [2.4, 140.0]`) and `1000ms` van Wijk & Nuij arced fly-to transitions.
- Hover tilt and glass reflection respond immediately to pointer movement without audio noise.

## Do's and Don'ts

- **Do** keep all shading overlays achromatic so photographic colors remain accurate.
- **Don't** add top-left coordinate telemetry, bordered alcove boxes, visible track-light hardware, or frosted modal blurs in Photo Focus.
