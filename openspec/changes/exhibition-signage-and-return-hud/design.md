---
name: Chiaroscuro Gallery — Exhibition Signage & Persistent Return HUD
colors:
  primary: "#111111"
  secondary: "#f4f4f2"
  background: "inherit"
  surface: "rgba(24, 28, 26, 0.58)"
  text:
    primary: "#f4f6f4"
    muted: "rgba(17, 17, 17, 0.62)"
  border: "rgba(242, 255, 248, 0.72)"
  status:
    success: "n/a"
    warning: "n/a"
    error: "n/a"
typography:
  fontFamily:
    sans: '"Helvetica Neue", Helvetica, "TeX Gyre Heros", Arial, sans-serif'
    mono: "n/a"
  scale:
    h1: "32px / 700 / 1.05 (Exhibition Title Banner)"
    h2: "13.5px / 500 / 1.2 (Wayfinding Home Link)"
    body: "13.5px / 600 / 1.3 (Photo Focus Title)"
    caption: "11px / 500 / 1.3 / 0.08em uppercase (HUD Buttons)"
spacing:
  xs: "6px"
  sm: "11px"
  md: "14px"
  lg: "22px"
  xl: "64px"
rounded:
  sm: "0px (HUD buttons)"
  md: "2px (Beveled Glass title banner)"
  lg: "4px"
  full: "9999px (Cylindrical standoffs)"
---

## 1. Visual Overview & Philosophy

- **Aesthetic Tone:** Quiet architectural gallery signage and zero-redundancy Swiss HUD chrome. The `greg's photo wall` exhibition banner is a grid-locked 2 × 1 **Beveled Acrylic Glass** plaque reusing the album placards' existing smoked-glass material and standoffs, paired with painted-on-wall `← home` wayfinding flush-left beneath it.
- **Target Surfaces:** Public `/photos` wall and HUD across desktop and mobile, in all three circadian moods (`chiaroscuro`, `concrete`, `alabaster`).

## 2. Color System & Contrast Rationale

| Surface | Chiaroscuro (Night) | Concrete (Twilight) | Alabaster (Day — PR #17) |
| :--- | :--- | :--- | :--- |
| **Title Banner (`:is(.museum-placard, .exhibition-title-placard).mat-acrylic`)** | Dark smoked translucent glass + `var(--glass-ink)` + bevels/standoffs | Same | PR #17 dark plate (`rgba(30,36,33,0.78)`/`0.74`/`0.78`) + `#f4f6f4` ink |
| **Wayfinding `← home` Link** | `#d6d4cd` (hover `#ffffff`) | `#e5e3dc` (hover `#ffffff`) | `#111111` (hover `#000000`) |
| **Persistent `RETURN` Button** | Solid `#111111` fill, `#ffffff` ink (hover `#2a2a28`) | Same | Same |

## 3. Typography Hierarchy

- **Exhibition Title (`greg's` / `photo wall`):** `32px` (roughly `1.8×–2×` the `16px` album placard title), weight `700`, line-height `1.05`, tracking `-0.015em`, flush-left across two intentional lines.
- **Wayfinding Link (`← home`):** `13.5px`, weight `500`, tracking `0.01em`, no underline (resting or hovered), flush-left beneath the banner.
- **HUD Controls (`PREV`, `NEXT`, `RETURN`):** `11px`, weight `500`, uppercase, tracking `0.08em`, sharp `border-radius: 0`.

## 4. Component Anatomy & States

- **`.exhibition-title-placard.mat-acrylic`:** `452px` wide (`2 × 214px` album placard + `24px` grid gutter) × `200px` tall (exact album placard height), `padding: 20px 24px 30px`, flush-left contents. Reuses the album placards' existing Beveled Glass material verbatim via the widened `:is(...).mat-acrylic` rules: dark smoked translucent plate, bevel borders, `var(--glass-ink)` ink, cylindrical bottom-left/bottom-right `.placard-standoff`s, soft cast shadow, PR #17 Alabaster plate, and the coarse-pointer static frosted fallback. Top and bottom edges are pixel-flush with the adjacent top-left album placard. The gap to it is the shared visible `columnGutter`: album-placard right edge → first framed-photo left edge (structural `PLACARD_GAP` + the frame's mat inset), so banner → placard and placard → photo read as one gutter. `← home` is anchored to `titlePlacard.x`. The banner's outer left edge is the master left datum; the Overview fit spans `titlePlacard.x` → rightmost framed-photo right with equal outer wall margins, so the rightmost photo is never cropped.
- **`.exhibition-home-link`:** `14px` beneath the banner and flush-left with its left edge, `gap: 6px`, `<span class="home-arrow">←</span><span>home</span>`. Under `@media (hover: hover) and (pointer: fine)`, hover translates `.home-arrow` by `translateX(-3px)` (`0.18s cubic-bezier(0.22, 1, 0.36, 1)`) and shifts text contrast — **no underline**.
- **`.photo-focus-bar`:** Full-width light-frosted footer with plain `PREV` / `NEXT` (left), centered title + metadata, and a right spacer matching `RETURN`. Transitions smoothly via `opacity 0.22s ease, transform 0.22s ease`; `.is-hidden` sets `opacity: 0; transform: translateY(10px); pointer-events: none;`.
- **`.hud-return-persistent`:** Fixed/absolute bottom-right at `right: max(22px, env(safe-area-inset-right, 0px))`, `bottom: calc(11px + env(safe-area-inset-bottom, 0px))` (`14px` / `10px` on `≤ 767px`), `z-index: 70`. Transitions via `opacity 0.2s ease, transform 0.2s ease, background-color 0.18s ease`; `.is-hidden` (in `overview`) sets `opacity: 0; transform: translateY(6px); pointer-events: none;`.

## 5. Responsive Layout & Breakpoints

- **`≤ 767px`:** `.photo-focus-bar` stacks caption above `44px`-tall `PREV`/`NEXT` and `RETURN`; `.hud-return-persistent` aligns to `right: max(14px, env(safe-area-inset-right, 0px))` and `bottom: calc(10px + env(safe-area-inset-bottom, 0px))` with `min-height: 44px`.
- **`@media (pointer: coarse)`:** `.hud-return-persistent` keeps `>= 44×44 px` hit target; the Beveled Glass banner keeps the existing static frosted fallback (`backdrop-filter: none`) shared with album placards.

## 6. Interaction, Motion & Sound

- **Bottom bar transition:** `opacity 0.22s ease, transform 0.22s ease` (`translateY(10px)`).
- **Persistent `RETURN` transition:** `opacity 0.2s ease, transform 0.2s ease` (`translateY(6px)`).
- **Home arrow hover:** `transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)` (`translateX(-3px)`), no underline.
- **Reduced Motion:** `@media (prefers-reduced-motion: reduce)` sets `transition: none` on `.photo-focus-bar`, `.hud-return-persistent`, and `.exhibition-home-link .home-arrow`.

## 7. Do's and Don'ts

- **DO** keep `RETURN` in one persistent DOM element so it never flickers or jumps on `Print Focus → Album View`.
- **DO** keep `← home` underline-free on hover and gated to `@media (hover: hover) and (pointer: fine)`.
- **DON'T** re-introduce a top-right `Overview` button or arrow glyphs inside `PREV` / `NEXT`.
- **DON'T** re-introduce live `backdrop-filter` on mobile coarse-pointer `.mat-acrylic` placards.
- **DON'T** center the title or `← home`; both stay flush-left on the banner's vertical grid line.
