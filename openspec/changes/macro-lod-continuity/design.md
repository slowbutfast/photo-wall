---
name: Macro Placard Continuity
colors:
  primary: "#F4F6F4"      # glassInk (chiaroscuro): source of greeked title bar ink
  secondary: "#161616"    # --color-placard-core: soundtrack slot base (and foamcore plate)
  background: "#3d3a35"   # chiaroscuro wallBase (unchanged; the plate is composited over it)
  surface: "rgba(18, 22, 20, 0.46)"   # mid stop of the default fine-pointer acrylic plate
  text:
    primary: "rgba(244, 246, 244, 0.34)"   # greeked title bar
    muted: "rgba(240, 244, 241, 0.24)"     # greeked caption bars
  border: "rgba(255, 255, 255, 0.08)"      # soundtrack slot stroke
  status:
    success: "n/a"
    warning: "n/a"
    error: "n/a"
typography:
  fontFamily:
    sans: "n/a: greeked bars only, no text is drawn"
    mono: "n/a"
  scale:
    h1: "n/a"
    h2: "n/a"
    body: "n/a"
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
  full: "0px"
macroTier:
  promoteScale: 0.25
  demoteScale: 0.22
---

## 1. Visual Overview & Philosophy

- **Aesthetic tone:** at Overview, an album should already read as a dark glass placard with a dark plaque under it, the same silhouette it has up close. Zooming in should only sharpen the detail, never change the shape or swap a pale square for a dark one.
- **Target surfaces:**
  - the macro tier (`MacroIsland` canvas) on desktop and iPhone, all three moods;
  - the three placard materials.
- **Visual references:**
  - the live `.museum-placard.mat-acrylic` at Album tier (`wall.css:614-646`, coarse `1265-1283`);
  - the `.soundtrack-plaque` (`wall.css:240-248`).

## 2. Color System & Contrast Rationale

All plate colours are **mirrors** of existing `wall.css` backgrounds. Nothing new is invented. Contrast doesn't apply: nothing here is legible text, and at macro scale (`< 0.25`) a 17 px title is under 4.3 CSS px tall.

### Placard plate (acrylic, three-stop `linear-gradient(138deg, …)` at 0% / 55% / 100%)

| Mood | Pointer | Stops | Source |
| :--- | :--- | :--- | :--- |
| chiaroscuro | fine | `rgba(24, 28, 26, 0.58)`, `rgba(18, 22, 20, 0.46)`, `rgba(26, 30, 28, 0.54)` | `wall.css:614-620` |
| concrete | fine | same as chiaroscuro | `wall.css:614-620` |
| alabaster | fine and coarse | `rgba(30, 36, 33, 0.78)`, `rgba(22, 27, 24, 0.74)`, `rgba(34, 40, 36, 0.78)` | `wall.css:638-646` |
| chiaroscuro | coarse | `rgba(26, 31, 28, 0.62)`, `rgba(18, 22, 20, 0.52)`, `rgba(28, 33, 30, 0.6)` | `wall.css:1265-1272` |
| concrete | coarse | `rgba(32, 37, 33, 0.68)`, `rgba(24, 28, 25, 0.58)`, `rgba(34, 39, 35, 0.66)` | `wall.css:1275-1283` |

On canvas, the 138° gradient runs from the plate's top-left towards its bottom-right. Use `createLinearGradient` along the 138° CSS direction across the plate rect, or diagonally from top-left to bottom-right, which is visually indistinguishable at macro scale. When `createLinearGradient` is unavailable, use a solid fill of the 55% stop.

### Plate edges (acrylic)

- **Top:** a 1.5 placard-px line, `rgba(242, 255, 248, 0.72)`.
- **Bottom:** a 3 placard-px line, `rgba(140, 185, 165, 0.52)`.
- Left and right edges are omitted; they're under a buffer pixel at macro scale.
- Placard-px means CSS px inside the `214 × 200` placard, converted to buffer px.

### Other materials (fixed, mood-independent)

| Material | Plate fill | Title ink | Caption ink |
| :--- | :--- | :--- | :--- |
| aluminum | solid `#d2d5d9` (the 42% stop of `wall.css:574`) | `rgba(17, 17, 17, 0.38)` | `rgba(17, 17, 17, 0.26)` |
| foamcore | solid `#161616` (`wall.css:786`) | `rgba(244, 246, 244, 0.30)` | `rgba(240, 244, 241, 0.20)` |

### Greeked ink (acrylic)

- **Title bar:** the theme's `glassInk` at alpha `0.34`.
- **Caption bars:** `glassCap`'s RGB at alpha `0.24`.
- Every mood's `glassInk` is a near-white, so the alpha alone sets the weight.

### Soundtrack slot

- Fill `#161616` (`--color-placard-core`).
- Stroke 1 buffer px, `rgba(255, 255, 255, 0.08)`.

### Shadows

Plate and slot reuse the mosaic's existing flat print shadow: `rgba(0, 0, 0, 0.45)`, offset `+2` buffer px in y, the same size as the rect. That's the macro tier's "one cheap flat shadow" rule.

## 3. Typography Hierarchy

No text is drawn. The greeked bars stand in for the live placard text block, positioned in placard-local CSS px (a `214 × 200` box, padding `20 / 24 / 30 / 24`):

| Bar | x | y | w | h | Shown when | Stands in for |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Title | 24 | 24 | 104 | 10 | always | `.placard-title` 17px/1.15, weight 700 |
| Caption 1 | 24 | 50 | 150 | 6 | `album.description` non-empty | `.placard-caption` line 1, 13px/1.35, 6px top margin |
| Caption 2 | 24 | 67 | 112 | 6 | `album.description` non-empty | caption line 2 |

The widths are fixed, not measured from the text. Measuring would need `measureText` per album, and the bars are under 4 CSS px tall at macro.

## 4. Component Anatomy & States

### Component: `MacroIsland` mosaic placeholder (canvas)

- **Placement:** unchanged. One canvas covers the island box (`.island-mosaic`, 100% × 100%).
- **Paint layers, in order:**
  1. print cells (unchanged);
  2. placard shadow, plate, top and bottom edges, greeked bars;
  3. soundtrack slot shadow, fill and stroke, only if the album has a soundtrack.
- **States:**
  - **Default:** as above.
  - **Thumbnails still loading:** the cells show the existing `#f6f4ef` mat placeholder; the plate and slot are already final.
  - **Hover / active:** unchanged. The `.island-mosaic-button` has no hover paint.
  - **Focus:** unchanged, `outline: 1px solid var(--color-primary)` at offset 2px on the button.
  - **Disabled:** n/a.
- **Removed:** the pale `rgba(226, 242, 234, 0.18)` fill and its `rgba(240, 245, 242, 0.22)` stroke.

### Tier boundary (no component; behaviour)

| Approach | Promote / demote point | Inside `[0.22, 0.25)` |
| :--- | :--- | :--- |
| Zooming in from macro | promote at `0.25` | stays `macro` |
| Zooming out from a detail tier | demote below `0.22` | stays `album` / `print` |

## 5. Responsive Layout & Breakpoints

| Viewport | Breakpoint | Layout Pattern | Rules |
| :--- | :--- | :--- | :--- |
| **Phone / tablet** | `(pointer: coarse)` | Same mosaic geometry; acrylic plate uses the `coarse` stops (alabaster keeps its own) | Touch targets unchanged; the island button is the whole island |
| **Desktop** | `(pointer: fine)` | Same geometry; `fine` stops | Unchanged |

The tier thresholds are the same on both pointer types.

## 6. Interaction, Motion & Sound

- **Transitions:** none added. The tier swap is still a single-frame swap, but it now happens only once per crossing and between matching silhouettes.
- **Feedback:** none.
- **Audio:** none.

## 7. Do's and Don'ts

- **DO** take every plate colour from `PlaygroundTheme.macroPlate` or the fixed material table above, and keep `macroPaletteAudit.test.ts` green.
- **DO** paint the plate and slot once, in `paintPlaceholder`, before any thumbnail arrives.
- **DON'T** call `fillText`, `measureText` or any font API in the mosaic.
- **DON'T** load soundtrack thumbnails or any extra image for the mosaic.
- **DON'T** add DOM elements inside `MacroIsland` or CSS transitions on `.island-mosaic`.
- **DON'T** use `--color-placard-core` for the plate; it's only for the soundtrack slot (and foamcore).
- **DON'T** change Album or Print tier CSS. Desktop resting parity must be 0 px outside macro islands.
