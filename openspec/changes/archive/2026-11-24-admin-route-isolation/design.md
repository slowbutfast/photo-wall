---
name: Chiaroscuro Curator Studio
colors:
  primary: "#2D3B36"
  secondary: "#845241"
  background: "#1D1C1A"
  surface: "#FBFAF7"
  text:
    primary: "#1A1B19"
    muted: "#5C615E"
  border: "#D4D1CA"
  status:
    success: "#0F241D"
    warning: "#92400E"
    error: "#9B2C2C"
typography:
  fontFamily:
    sans: "'Helvetica Neue', Helvetica, 'TeX Gyre Heros', Arial, sans-serif"
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace"
  scale:
    h1: "16px, weight 700"
    h2: "15px, weight 700"
    body: "12.5px, weight 400"
    caption: "10.5px, weight 600, uppercase, 0.08em"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
rounded:
  sm: "2px"
  md: "3px"
  lg: "4px"
  full: "9999px"
---

## 1. Visual Overview & Philosophy

- **Aesthetic Tone:** Quiet Swiss-modernist studio chrome (`#FBFAF7` / `#FFFFFF` architectural panels, `#2D3B36` deep slate-green accent, sharp `2px–3px` radii) docked beside the dark Chiaroscuro PBR plaster wall (`#1D1C1A`).
- **Visual Reference:** Approved interactive prototype at `playgrounds/album_curator_playground.html`.

## 2. Public `/photos` Surface (Read-Only)

- Identical to the current wall and Swiss HUD, minus the top-right lock/`Curate` button. Top-right HUD shows only `OVERVIEW`.

## 3. Curator Studio `/photos/admin` Layout

- **Desktop (`>= 1024px`):** Full-viewport two-column split (`1fr 440px`). `<GalleryCanvas mode="preview" />` fills the left stage; persistent Studio Sidebar occupies the right `440px` column with a 3-tab top navigation bar (**EXHIBITIONS** | **UPLOAD** | **SETTINGS**).
- **Mobile (`< 1024px`):** Single-column viewport with a sticky **Wall Preview / Manage Studio** segmented switcher at top; switching tabs hides/shows panes via CSS/state without unmounting draft uploads or unsaved edits.
- **Draft Visual Marker on Preview Canvas:** Draft islands display a subtle dashed mat outline and a high-contrast `"DRAFT"` badge (`#FEF3C7` background, `#78350F` ink) on the placard.
- **Login Screen (`/photos/admin/login`):** Centered architectural card on the dark gallery wall backdrop with password input, error message slot, and single primary Sign In button.

## 4. Do's and Don'ts

- **DO** reuse `--font-family-base` (Helvetica stack) across every Studio control, tab, and form field.
- **DO** keep required-field indicators as a subtle `*` (no `(optional)` parentheticals on optional labels).
- **DON'T** float a modal drawer over `/photos` or add any admin link on the public gallery.
