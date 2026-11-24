---
name: Chiaroscuro Gallery — Museum Visual Fidelity
colors:
  primary: "#111111"
  secondary: "#6E6A63"
  background: "#3D3A35"
  surface: "#F4F4F2"
  text:
    primary: "#111111"
    muted: "#5A5650"
  border: "#D8D6D0"
  status:
    success: "#2D6A4F"
    warning: "#B07D2B"
    error: "#B42318"
typography:
  fontFamily:
    sans: "'Helvetica Neue', Helvetica, 'TeX Gyre Heros', Arial, sans-serif"
    mono: "'Helvetica Neue', Helvetica, 'TeX Gyre Heros', Arial, sans-serif"
  scale:
    h1: "17px, weight 700, line-height 1.15 (Placard Title)"
    h2: "13.5px, weight 700, line-height 1.25 (Photo Focus Caption)"
    body: "13px, weight 400, line-height 1.35 (Placard Caption & Dock)"
    caption: "11px, weight 500, line-height 1.3 (HUD Controls & Metadata)"
spacing:
  xs: "4px"
  sm: "12px"
  md: "24px"
  lg: "44px"
  xl: "94px"
rounded:
  sm: "0px"
  md: "1px"
  lg: "2px"
  full: "9999px"
---

## 1. Visual Overview & Philosophy

- **Aesthetic Tone**: Quiet, Swiss-modernist physical museum gallery. Warm architectural plaster illuminated by soft elliptical overhead washes, tactile glazed print frames with real 3D side bevels and 2D specular reflections, anodized brushed-metal or beveled-glass wall placards, and crisp Helvetica typography without digital UI gimmicks.
- **Target Surfaces**: Full-bleed desktop and mobile browser gallery viewport (`/photos` and `/photos/admin` live canvas preview).
- **Visual References**: `playgrounds/photo_wall_playground.html` and baseline screenshots in `./research.md`.

---

## 2. Color System & Contrast Rationale

| Token Name | Hex / RGBA Value | Semantic Role | Background Pair | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `chiaroscuro.wallBase` | `#3D3A35` (`ambientLevel: 0.30`) | Warm charcoal-taupe interstitial plaster | `#ECEAE4` light HUD / prints | `9.6:1` | **PASS (AAA)** |
| `concrete.wallBase` | `#6B6861` (`ambientLevel: 0.44`) | Mid-tone architectural plaster | `#F4F2EC` | `4.8:1` | **PASS (AA)** |
| `hud.active` | `#111111` on `#FFFFFF` | Active top-right segmented button | `#FFFFFF` | `18.8:1` | **PASS (AAA)** |
| `hud.inactive` | `#FFFFFF` on `#111111` | Inactive top-right segmented button | `#111111` | `18.8:1` | **PASS (AAA)** |
| `focusBar.surface` | `rgba(244, 244, 242, 0.92)` | Light frosted single-photo inspection bar | `#111111` primary caption | `16.9:1` | **PASS (AAA)** |
| `focusBar.muted` | `rgba(17, 17, 17, 0.62)` | Optional `Camera • Date • Location` metadata | `rgba(244, 244, 242, 0.92)` | `6.1:1` | **PASS (AA)** |
| `placard.aluminum` | `#111111` on `#E4E6E8 -> #AEB2B6` | Brushed-aluminum placard title/caption | `#C2C6CA` midpoint | `11.1:1` | **PASS (AAA)** |

---

## 3. Typography Hierarchy

| Level | Font Family | Size | Weight | Line Height | Intended Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Placard Title** | Helvetica stack | `17px` | `700` | `1.15` | Album caption / title (`letter-spacing: -0.02em`, Title Case) |
| **Placard Caption** | Helvetica stack | `13px` | `400` | `1.35` | Supporting placard text (`#222222` on aluminum) |
| **Collection Dock** | Helvetica stack | `12.5px` | `500` / `700` active | `1.3` | Bottom room directory — **Title Case** (`text-transform: none`) |
| **Photo Focus Caption** | Helvetica stack | `13.5px` | `600` | `1.3` | Centered single-line caption in light frosted bar — **Title Case** (`text-transform: none`) |
| **HUD Action Labels** | Helvetica stack | `11px` | `500` | `1.3` | `OVERVIEW`, `← PREV`, `NEXT →`, `RETURN [ESC]` (`letter-spacing: 0.08em`) |

---

## 4. Component Anatomy & States

### Component: WebGL2 PBR Plaster Wall & Cluster Wash (`PlaygroundPbrWall` + `playgroundLighting`)
- **Plaster Scale**: `WALL_TILE_UNITS = 2.2` (~2.4× higher UV repeat than `5.2`), `uNormalStrength = 0.4` (down from `1.4`), `uAoStrength = 0.55`.
- **Cluster Wash**: Exactly `1` wide elliptical overhead wash per album centered horizontally over the full island (`placard + PLACARD_GAP + grid`), `innerDeg = 26`, `outerDeg = 54`, `throwFrac = 1.15`, `heightFrac = 1.05`, `hotspotFrac = 0.34`, `ambientObj = 0.56`.
- **Ambient Floor**: `chiaroscuro.ambientLevel = 0.30` (warm charcoal-taupe `#5A5650`–`#6E6A63` after filmic curve), vignette `rgba(14, 13, 12, 0.38)`.

### Component: Framed Print (`.photo-frame` + `.photo-sheen`)
- **3D Side-Edge Extrusion**: Solid cotton-rag mat (`#F6F4EF`) with explicit right/bottom physical frame depth bevel (`border-right: 4px solid #D5D1C8; border-bottom: 5px solid #C6C1B7; border-top: 1px solid rgba(255,255,255,0.9); border-left: 1px solid rgba(255,255,255,0.55);`).
- **Recessed Mat Window**: `.photo-window` keeps crisp inner shadow simulating recessed bevel-cut mat board over the print.
- **2D Specular Glare (`.photo-sheen`)**: Pure soft 2D elliptical `radial-gradient(ellipse 46% 42% at 50% 50%, rgba(255,255,255,0.38) 0%, rgba(255,253,246,0.14) 44%, rgba(255,253,246,0) 74%)` (no harsh `135deg` diagonal stripe). On `pointermove`, translates `translate3d(${(-nx * 38).toFixed(1)}%, ${(-ny * 38).toFixed(1)}%, 0)` opposite the tilt direction in both `X` and `Y`.
- **Tilt-Reactive Cast Shadow**: Layered `box-shadow` adds `var(--tilt-sx, 0px)` and `var(--tilt-sy, 0px)` (computed from `-rotateY * 2.4px` and `rotateX * 2.4px`) to the static wall shadow `(var(--sx), var(--sy))` so lifting an edge deepens and shifts the shadow beneath it.
- **Neighbor Fidelity**: Zero `.dimmed` class; adjacent frames remain at `opacity: 1`, `filter: none` during single-photo inspection.

### Component: Brushed-Metal / Glass Placard & Soundtrack Plaque
- **Placard**: Fixed `214px × 200px`, `PLACARD_GAP = 0.94u` (`94px`) from column 0. `.mat-aluminum` uses `linear-gradient(135deg, #E4E6E8 0%, #C2C6CA 55%, #AEB2B6 100%)` with `border-right: 3px solid #141414; border-bottom: 3px solid #141414`.
- **Soundtrack Plaque Fallback**: When thumbnail is missing or errors (`thumbFailed`), renders an architectural dark slate gradient (`linear-gradient(145deg, #2A2927 0%, #171615 100%)`) with subtle centered play circle (`.soundtrack-play-btn`) and muted track title/artist footer so it never appears as an empty black rectangle.

### Component: HUD Chrome (`.hud-top-right`, `.hud-directory`, `.photo-focus-bar`)
- **Top-Right Switcher (`.hud-top-right`)**: Flush sharp-edged container (`padding: 0; gap: 0; border-radius: 0; border: 1px solid #111111;`). Active button: `background: #FFFFFF; color: #111111; border-radius: 0;`. Inactive button: `background: #111111; color: #FFFFFF; border-radius: 0;`.
- **Collection Dock (`.hud-directory`)**: Clean Helvetica **Title Case** (`text-transform: none; letter-spacing: 0;`), active item bold with subtle bottom underline.
- **Light Frosted Inspection Bar (`.photo-focus-bar`)**: `background: rgba(244, 244, 242, 0.92); color: #111111; border-top: 1px solid rgba(17, 17, 17, 0.12); backdrop-filter: blur(12px);`. Centered Title Case `.photo-focus-title` (`#111111`, `13.5px`, `font-weight: 600`, `text-transform: none`), subtle `.photo-focus-meta` (`rgba(17, 17, 17, 0.62)`), and crisp `#111111` buttons (`← PREV`, `NEXT →`, `RETURN [ESC]`).
- **Quiet Transitions**: No `.soundtrack-toast` element on zoom-out.

---

## 5. Responsive Layout & Breakpoints

| Viewport | Breakpoint | Layout Pattern | Navigation / Sizing Rules |
| :--- | :--- | :--- | :--- |
| **Mobile** | `< 768px` | Full-bleed canvas, bottom dock inset `12px`, `photo-focus-bar` compact padding | Touch targets `>= 44px` height on `PREV`/`NEXT`/`RETURN` and top-right buttons |
| **Desktop** | `>= 768px` | Full-bleed canvas, `24px` inset top-right switcher, centered bottom dock (`max-width: 760px`) | 2D pointer tilt & specular tracking active on hover/focus |

---

## 6. Interaction, Motion & Sound

- **Transitions**: Frame tilt `transform` and `box-shadow` settle smoothly (`transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.24s ease`), disabled during active pointer tracking for crisp 1:1 cursor response.
- **Camera Physics**: `enterPrint` and `stepPhoto` fly continuously via the single rAF camera loop without DOM swaps or neighbor fade-outs.
- **Sound**: Pausing soundtrack on Overview transition is silent (no toast popup).

---

## 7. Do's and Don'ts

- **DO** keep `src/styles/wall.css` and `src/styles/hud.css` cleanly deduplicated and compliant with `src/lib/__tests__/cssBoundaryAudit.test.ts` (zero cross-file duplicate selectors, zero HUD rules in `globals.css` or `wall.css`).
- **DO** keep `rawIrradiance()` (CPU) and `FRAGMENT_SHADER` (GPU) using the exact same `ellipseX` horizontal cone math so DOM `--lit*` shading matches the WebGL2 wall light pools.
- **DON'T** re-introduce `.photo-frame.dimmed` or `text-transform: uppercase` on collection names or inspection captions.
- **DON'T** re-add a `Curate` / lock button to public `/photos` (kept isolated by `admin-route-isolation`).
