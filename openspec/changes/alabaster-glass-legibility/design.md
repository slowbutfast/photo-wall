---
name: Alabaster Beveled Glass Legibility
colors:
  primary: "#F4F6F4"      # Alabaster glass ink (title)
  secondary: "#F0F4F1"    # Alabaster glass cap (caption, meta, track, timecode), alpha 1.0
  background: "#CBC6BC"   # Alabaster wallBase (unchanged)
  surface: "#454743"      # Alabaster plate, composited middle stop rgba(22,27,24,0.74) over #CBC6BC
  text:
    primary: "#F4F6F4"
    muted: "#F0F4F1"      # rendered at opacity 0.72 (meta, timecode) / 0.92 (track name)
  border: "rgba(255, 255, 255, 0.18)"  # soundtrack divider (unchanged)
  status:
    success: "#F4F6F4"
    warning: "#F4F6F4"
    error: "#F4F6F4"
typography:
  fontFamily:
    sans: "var(--font-helvetica) (unchanged)"
    mono: "n/a"
  scale:
    h1: "placard-title 17px, weight 700 (unchanged)"
    h2: "n/a"
    body: "placard-caption 13px, weight 400 (unchanged)"
    caption: "placard-meta 12.5px / track-name 11.5px 600 / timecode 11px tabular (unchanged)"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
rounded:
  sm: "2px"
  md: "2px"
  lg: "2px"
  full: "9999px"
---

## 1. Visual Overview & Philosophy

- **Aesthetic tone:** dark smoked glass with crisp light lettering in every mood. In Alabaster that's a dark glass plaque on a pale plaster wall, which is the same object the visitor sees at dusk and night, under brighter light.
- **Target surfaces:** the Beveled Glass `.museum-placard.mat-acrylic` in the `alabaster` mood, on desktop `(pointer: fine)` and phone `(pointer: coarse)`.
- **Visual references:**
  - the Concrete Beveled Glass placard, which this matches in ink treatment;
  - the maintainer's fallback option: "if you keep a dark plaque surface, switch the text to crisp #FFFFFF with no shadow". `#F4F6F4` is the glass ink already used in the other two moods, so all three read as one material.

## 2. Color System & Contrast Rationale

Contrast is measured against each plate gradient stop composited over `wallBase #CBC6BC`, worst stop reported. The values come from research.md's script. The test recomputes them from source.

| Token Name | Hex Value | Semantic Role | Background Pair | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `glassInk` | `#F4F6F4` | `.placard-title` | Alabaster plate (worst stop) | `8.21:1` | **PASS (AAA)** |
| `glassCap` | `rgba(240,244,241,1)` | `.placard-caption` | Alabaster plate | `8.03:1` | **PASS (AAA)** |
| `glassCap` × 0.92 | n/a | `.placard-track-name` | Alabaster plate | `7.10:1` | **PASS (AAA)** |
| `glassCap` × 0.72 | n/a | `.placard-meta`, `.placard-timecode` | Alabaster plate | `5.09:1` | **PASS (AA)** |
| `glassShadow` | `none` | All glass text | n/a | n/a | Removes the halo |
| Before: `#1D1E1C` | n/a | `.placard-title` (coarse / desktop) | Old plates | `1.81:1` / `3.08:1` | FAIL |

**Alabaster plate (both pointer profiles):**

```css
linear-gradient(138deg,
  rgba(30, 36, 33, 0.78) 0%,
  rgba(22, 27, 24, 0.74) 55%,   /* was 0.70 on coarse, 0.46 on desktop (shared) */
  rgba(34, 40, 36, 0.78) 100%)
```

Chiaroscuro and Concrete are unchanged and already pass: Concrete title is at least 9.27 and meta at least 5.03; Chiaroscuro title is at least 13.1 and meta at least 6.3.

## 3. Typography Hierarchy

No change. Sizes, weights, tracking and the tabular timecode stay as they are in `wall.css:561-657`.

| Level | Font Family | Size | Weight | Line Height | Intended Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Title | Helvetica stack | `17px` | `700` | `1.15` | Album title |
| Caption / meta | Helvetica stack | `13px` / `12.5px` | `400` | `1.35` | Caption, date · time · place |
| Track name | Helvetica stack | `11.5px` | `600` | `1.25` | `Song — Artist` (marquee when overflowing) |
| Timecode | Helvetica stack, tabular-nums | `11px` | `400` | `1.25` | `0:00 / 1:47` |

## 4. Component Anatomy & States

### Component: Beveled Glass placard (`.museum-placard.mat-acrylic`), Alabaster mood

- **Placement:** unchanged. It's 214 × 200 px, left of the photo grid, with the soundtrack plaque 12 px below.
- **States:**
  - **Default / idle:** the dark plate above, light ink, no text-shadow. The bevel borders, the inset top highlight and the two standoff pins are unchanged.
  - **Hover (fine pointer):** unchanged. It reuses the existing `.mat-acrylic` hover lift if one is present; no new hover styling.
  - **Active / pressed:** unchanged.
  - **Focus:** unchanged. Whatever focus outline the placard button has today stays.
  - **Lit falloff (`.is-lit::after`):** unchanged. It only darkens the plate edges, which raises light-ink contrast.
- **Soundtrack footer:** the divider (`rgba(255,255,255,0.18)`), track name and timecode stay. A light divider now matches the light ink.

## 5. Responsive Layout & Breakpoints

| Viewport | Breakpoint | Layout Pattern | Navigation / Sizing Rules |
| :--- | :--- | :--- | :--- |
| **Phone** | `(pointer: coarse)` | Same plate tint as desktop. `backdrop-filter: none`. | No layout change. Touch targets are unchanged. |
| **Desktop** | `(pointer: fine)` | Same plate tint as phone. `backdrop-filter: blur(2.5px)`. | No layout change. |

## 6. Interaction, Motion & Sound

- **Transitions:** none added. A mood crossfade swaps `--glass-*` and `data-mood` the same way it already does between Chiaroscuro and Concrete.
- **Marquee:** unchanged. The mask fade still works because it masks alpha, not colour.
- **Audio:** n/a.

## 7. Do's and Don'ts

- **DO** change Alabaster glass ink only through `PLAYGROUND_THEMES.alabaster`.
- **DO** keep the Alabaster plate in exactly one unconditional rule.
- **DON'T** add `text-shadow`, `-webkit-text-stroke` or a light halo to Alabaster glass text.
- **DON'T** touch Chiaroscuro or Concrete glass values, `.mat-aluminum`, `.mat-foamcore`, placard geometry or the soundtrack footer.
- **DON'T** remove the divider, the track name or the timecode.
- **DON'T** hard-code Alabaster text colours in `wall.css`.
