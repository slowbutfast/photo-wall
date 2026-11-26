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
    h1: "15.5px / 700 / 1.2 (Exhibition Title Placard)"
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
  md: "2px (Acrylic title placard)"
  lg: "4px"
  full: "9999px (Cylindrical standoffs)"
---

## 1. Visual Overview & Philosophy

- **Aesthetic Tone:** Quiet architectural gallery signage and zero-redundancy Swiss HUD chrome. The `greg's photo wall` title placard shares the exact **Beveled Acrylic Glass (`.mat-acrylic`)** materiality of the album placards, paired with painted-on-wall `← home` wayfinding directly beneath it.
- **Target Surfaces:** Public `/photos` wall and HUD across desktop and mobile, in all three circadian moods (`chiaroscuro`, `concrete`, `alabaster`).

## 2. Color System & Contrast Rationale

| Surface | Chiaroscuro (Night) | Concrete (Twilight) | Alabaster (Day — PR #17) |
| :--- | :--- | :--- | :--- |
| **Title Placard (`.mat-acrylic`)** | Dark translucent glass + `#f4f6f4` ink + soft shadow | Dark translucent glass + `#f4f6f4` ink + soft shadow | Dark translucent plate (`rgba(30,36,33,0.78)`/`0.74`/`0.78`) + `#f4f6f4` ink (5.60:1, matching album placards verbatim) |
| **Wayfinding `← home` Link** | `#d6d4cd` (hover `#ffffff`) | `#e5e3dc` (hover `#ffffff`) | `#111111` (hover `#000000`) |
| **Persistent `RETURN` Button** | Solid `#111111` fill, `#ffffff` ink (hover `#2a2a28`) | Same | Same |

## 3. Typography Hierarchy

- **Exhibition Title (`greg's photo` / `wall`):** `15.5px`, weight `700`, line-height `1.2`, tracking `-0.01em`, centered two lines.
- **Wayfinding Link (`← home`):** `13.5px`, weight `500`, tracking `0.01em`, no underline (resting or hovered).
- **HUD Controls (`PREV`, `NEXT`, `RETURN`):** `11px`, weight `500`, uppercase, tracking `0.08em`, sharp `border-radius: 0`.

## 4. Component Anatomy & States

- **`.exhibition-title-placard.mat-acrylic`:** `152px` wide, `padding: 16px 14px 24px`, verbatim `.mat-acrylic` bevel borders + shadow + two cylindrical brushed-metal bottom standoffs (`.placard-standoff.left` / `.right`). On `@media (pointer: coarse)`, uses static frosted gradient with `backdrop-filter: none`.
- **`.exhibition-home-link`:** Centered `14px` below the placard, `gap: 6px`, `<span class="home-arrow">←</span><span>home</span>`. Under `@media (hover: hover) and (pointer: fine)`, hover translates `.home-arrow` by `translateX(-3px)` (`0.18s cubic-bezier(0.22, 1, 0.36, 1)`) and shifts text contrast — **no underline**.
- **`.photo-focus-bar`:** Full-width light-frosted footer with plain `PREV` / `NEXT` (left), centered title + metadata, and a right spacer matching `RETURN`. Transitions smoothly via `opacity 0.22s ease, transform 0.22s ease`; `.is-hidden` sets `opacity: 0; transform: translateY(10px); pointer-events: none;`.
- **`.hud-return-persistent`:** Fixed/absolute bottom-right at `right: max(22px, env(safe-area-inset-right, 0px))`, `bottom: calc(11px + env(safe-area-inset-bottom, 0px))` (`14px` / `10px` on `≤ 767px`), `z-index: 70`. Transitions via `opacity 0.2s ease, transform 0.2s ease, background-color 0.18s ease`; `.is-hidden` (in `overview`) sets `opacity: 0; transform: translateY(6px); pointer-events: none;`.

## 5. Responsive Layout & Breakpoints

- **`≤ 767px`:** `.photo-focus-bar` stacks caption above `44px`-tall `PREV`/`NEXT` and `RETURN`; `.hud-return-persistent` aligns to `right: max(14px, env(safe-area-inset-right, 0px))` and `bottom: calc(10px + env(safe-area-inset-bottom, 0px))` with `min-height: 44px`.
- **`@media (pointer: coarse)`:** `.hud-return-persistent` keeps `>= 44×44 px` hit target; `.exhibition-title-placard.mat-acrylic` disables live `backdrop-filter`.

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
