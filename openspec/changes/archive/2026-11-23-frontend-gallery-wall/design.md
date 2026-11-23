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
  placard-title: "TeX Gyre Heros 700 0.16u / 1.25 (-0.015em)"
  placard-caption: "TeX Gyre Heros 400 0.13u / 1.4"
  hud-label: "TeX Gyre Heros 600 13.5px"
  hud-meta: "TeX Gyre Heros 500 10.5px (0.06em, tabular-nums)"
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
| `secondary` | `#9E9C95` | Muted HUD controls & manual metadata | `> 5.8:1` on `hud-surface` — passes WCAG AA |
| `mat-cotton` | `#F6F4EF` | 4-ply recessed archival print mat | Warm museum rag, avoids `#FFFFFF` glare |
| `placard-glass` + `placard-backing` | `rgba(226,242,234,0.22)` + frosted backing | Beveled glass standoff + readable text plate | `#1D1E1C` on `placard-backing-light` (`alabaster`) & `#F4F6F4` on `placard-backing-dark` (`concrete`/`chiaroscuro`) both `>= 4.5:1` |
| `admin-accent` | `#2D3B36` | Curator primary CTA button | `#FFFFFF` text yields `12.1:1` contrast — passes WCAG AAA |

### Per-Mood Render Tokens (60s Crossfade via `suncalc`)

| Mood | Wall Tint / Base | `ambientLevel` | `spotIntensity` | `poolAlpha` | `shadowOpacity` | `placardInk` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `alabaster` (Day) | `#ECE9E2` | `0.78` | `0.65` | `0.38` | `0.26` | `#1D1E1C` |
| `concrete` (Twilight) | `#6B6861` | `0.42` | `0.85` | `0.62` | `0.42` | `#F4F6F4` |
| `chiaroscuro` (Night) | `#2D2C29` | `0.18` | `1.10` | `0.88` | `0.58` | `#F4F6F4` |

## Typography Hierarchy

- **Physical Placards (WebGL)**: Bundled **`TeX Gyre Heros`** at `700` Bold title (`0.16u`) + `400` Regular caption (`0.13u`) + live `tabular-nums` track timecode, rendered via `troika-three-text` (LOD-culled below `< 8px` projected text height).
- **Gallery HUD & Curator UI (DOM)**: Self-hosted **`TeX Gyre Heros`** via `@font-face` everywhere (`600`/`700` `13.5px` for exhibition names and Photo Focus caption; `400`/`500` `10.5px` uppercase `0.06em` tracking + `tabular-nums` for quiet controls and optional `Camera • Date • Location`).

## Component Anatomy & States (World Units)

- **Print Frame (`print-frame-mat`)**:
  - *Idle*: `z = 0.22`, `0.11` cotton mat, `0.03` top recessed inner shadow, wall-plane cast shadow at `z = 0.002` (`depthWrite: false`), achromatic distance falloff.
  - *Hover*: Elevates to `z = 0.36`, tilts toward cursor (`max 5°`), diagonal glass glare sweeps across print surface (unified mat + print via `VisiblePrintPool`).
  - *Focused*: Lifts to `z = 0.54`, surface darkening clears (`opacity: 0`), surrounding prints dim subtly (`0.26`) with zero modal blur.
- **Beveled Glass Standoff Placard (`placard-glass-standoff`)**: `z = 0.14`, exact `2.14u × 2.00u` (`214px × 200px`), green-tinted transparent glass with faked Fresnel edge bevel (`depthWrite: false`) and denser frosted backing behind text so contrast stays `>= 4.5:1` across all moods; includes live `Artist - Song (0:01/3:25)` when a soundtrack is attached.
- **Soundtrack Plaque (`soundtrack-plaque`)**: `z = 0.14`, exact `2.14u × 2.00u` (`214px × 200px`) matte-black `#161616` housing directly beneath the glass placard; CORS-proxied resting thumbnail (`TexturePool`-budgeted) at rest, interactive `youtube-nocookie.com` `matrix3d` DOM overlay on click in `album` `viewMode` (unmounting immediately on pan/drag/wheel start, auto-stopping when leaving `'album'`).
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
