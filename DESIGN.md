---
version: "alpha"
name: "Chiaroscuro Gallery"
description: "Physical DOM + WebGL2 plaster photo gallery with single-source overhead track lighting, beveled glass standoff placards, matched YouTube soundtrack plaques, and recessed archival mats."
colors:
  wall-base: "#2D2C29"
  wall-ambient: "#141412"
  primary: "#ECEAE4"
  secondary: "#9E9C95"
  mat-cotton: "#F4F4F2"
  placard-glass: "rgba(226, 242, 234, 0.22)"
  placard-backing-dark: "rgba(20, 22, 20, 0.74)"
  placard-backing-light: "rgba(244, 246, 244, 0.72)"
  placard-ink: "#F4F6F4"
  placard-ink-alabaster: "#1D1E1C"
  placard-core: "#141414"
  hud-surface: "rgba(18, 18, 18, 0.85)"
  hud-border: "rgba(255, 255, 255, 0.12)"
  admin-surface: "#FFFFFF"
  admin-ink: "#1A1B19"
  admin-accent: "#2D3B36"
typography:
  placard-title:
    fontFamily: "TeX Gyre Heros"
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.015em
  placard-caption:
    fontFamily: "TeX Gyre Heros"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
  hud-label:
    fontFamily: "TeX Gyre Heros"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.1em
  hud-meta:
    fontFamily: "TeX Gyre Heros"
    fontSize: 10.5px
    fontWeight: 500
    letterSpacing: 0.1em
rounded:
  none: 0px
  sharp: 1px
  hud: 2px
spacing:
  mat: 11px
  placard-pad: 22px
  gutter: 24px
  island-gap: 220px
components:
  wall-surface:
    backgroundColor: "{colors.wall-base}"
    textColor: "{colors.primary}"
  placard-glass-standoff:
    backgroundColor: "{colors.placard-backing-dark}"
    textColor: "{colors.placard-ink}"
    typography: "{typography.placard-title}"
    rounded: "{rounded.hud}"
    padding: "{spacing.placard-pad}"
    width: "2.14u"
    height: "2.00u"
  soundtrack-plaque:
    backgroundColor: "{colors.placard-core}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sharp}"
    width: "2.14u"
    height: "2.00u"
  print-frame-mat:
    backgroundColor: "{colors.mat-cotton}"
    rounded: "{rounded.sharp}"
    padding: "{spacing.mat}"
  hud-surface:
    backgroundColor: "{colors.hud-surface}"
    textColor: "{colors.primary}"
    typography: "{typography.hud-meta}"
    rounded: "{rounded.hud}"
  focus-bar:
    backgroundColor: "{colors.hud-surface}"
    textColor: "{colors.primary}"
    typography: "{typography.hud-label}"
    rounded: "{rounded.none}"
  studio-sidebar:
    backgroundColor: "{colors.admin-surface}"
    textColor: "{colors.admin-ink}"
    rounded: "{rounded.none}"
  admin-button-primary:
    backgroundColor: "{colors.admin-accent}"
    textColor: "{colors.admin-surface}"
    rounded: "{rounded.hud}"
---

## Overview

Chiaroscuro Gallery treats the browser viewport as a quiet, continuous architectural room rather than a digital whiteboard. Photographs and Swiss-modernist placards are mounted directly onto an unbounded, light-reactive stucco plaster wall without alcove boxes, trim molding, or visible lighting hardware. Visitors pan freely across the wall, zoom toward any focal point, and fly smoothly into individual exhibitions or prints.

## Architecture

The live gallery is a DOM camera world over a single-pass WebGL2 PBR plaster canvas. `GalleryCanvas` owns the camera loop, viewport/world refs, gesture and keyboard controllers, and island culling; presentation is delegated to `AlbumPlacard`, `FramedPrint`, `MacroIsland` and `SoundtrackPlaque`. The wall shader reads its surface constants from the exported `WALL_SHADER_CFG` (`tileUnits: 5.2`, `normalStrength: 1.4`, `aoStrength: 0.75`).

The public gallery (`/photos`) and the server-gated Curator Studio (`/photos/admin`) are isolated route trees. `/photos` ships zero Studio code or CSS; the Studio is enabled only when `ADMIN_ENABLED=true` and shares the same wall renderer through `mode="preview"`.

### Stylesheet map

Every selector has exactly one owner, enforced by `src/lib/__tests__/cssBoundaryAudit.test.ts`:

| File | Loaded by | Owns |
| :--- | :--- | :--- |
| `src/app/globals.css` | root layout | `@import '../styles/tokens.css'`, box-sizing/`html`/`body` reset, `.gallery-root`, `.sr-only` |
| `src/styles/tokens.css` | `@import` in globals | `@font-face` (`url('../app/fonts/…')`), `:root` / `[data-mood]` tokens, `.tabular-nums` |
| `src/styles/wall.css` | `(gallery)` + admin layout | stage, viewport, WebGL canvas, islands, placards, framed prints, soundtrack plaques, macro mosaics |
| `src/styles/hud.css` | `(gallery)` only | `.gallery-surface`, `.hud-*`, `.photo-focus-*`, `.dock-pill` |
| `src/styles/studio.css` | `src/app/admin/layout.tsx` only | `.admin-root`, `.studio-*`, `.album-editor-*`, `.admin-*`, `.folder-dropzone*` |

## Colors

The palette uses a low-key, neutral architectural baseline so illuminated prints and beveled glass plaques emerge naturally out of shadow without competing with photographic color:

- **Wall Base (`#2D2C29` / `#6B6861` / `#ECE9E2`) & Ambient (`#141412`):** Circadian PBR stucco foundation driven deterministically by offline `suncalc` for New York (`40.7128, -74.0060`) in SSR + 60s local timer (with 60s smooth crossfade): **Alabaster** (`sunrise + 90m` → `goldenHour`), **Concrete** (`dawn` → `sunrise + 90m` & `goldenHour` → `dusk`), and **Chiaroscuro** (`dusk` → `dawn`).
- **Primary (`#ECEAE4`) & Secondary (`#9E9C95`):** Warm gallery-ink typography and muted metadata for the minimal HUD.
- **Mat Cotton (`#F6F4EF`):** Warm 4-ply archival rag mat board framing prints without sterile `#FFFFFF` glare.
- **Placard Glass (`rgba(226, 242, 234, 0.22)`) + Frosted Backing (`rgba(20, 22, 20, 0.74)` / `rgba(244, 246, 244, 0.72)`) & Core (`#161616`):** Green-tinted beveled glass standoff plaque (faked Fresnel edge bevel) with a denser frosted text backing so `#F4F6F4` (`chiaroscuro`/`concrete`) and `#1D1E1C` (`alabaster`) maintain `>= 4.5:1` contrast; matte-black `#161616` housing for the matched YouTube soundtrack plaque below.
- **Achromatic Shading Rule:** Distance falloff on mats and placards uses neutral dark attenuation (`rgba(8, 7, 5, ...)`), never warm color tints, so photographic color accuracy stays untouched.

## Typography

The entire gallery uses a single bundled **`TeX Gyre Heros`** (metric-identical open-source Helvetica) typographic system in the DOM via `@font-face`:

- **Physical Placards:** `0.16u` Bold (`700`, `-0.015em` tracking) for the set title, `0.13u` Regular (`400`, `1.4` line-height) for the minimal caption, and `0.115u` Regular (`tabular-nums`) for the live `Artist - Song (0:01/3:25)` soundtrack line.
- **Gallery Ephemera HUD & Curator UI:** `TeX Gyre Heros` (`13.5px` SemiBold/Bold) for exhibition names and the album caption in Photo Focus; `TeX Gyre Heros` (`10.5px` Regular/Medium uppercase, `0.06em` tracking, `tabular-nums`) for quiet controls and optional `Camera • Date • Location` metadata.

## Layout

- **Exhibition Wings (`100px = 1 world unit`):** Each uploaded folder mounts as a borderless cluster of 10–20 prints arranged in a uniform neutral grid (`0.24u` gutter) that preserves each photograph's true aspect ratio.
- **Placard & Soundtrack Placement:** A single **Beveled Glass Standoff Placard** (`2.14u × 2.00u`) mounts directly on the plaster `0.44u` to the left of the grid's top row. When an album has a YouTube soundtrack, a matching **Soundtrack Plaque** of identical `2.14u × 2.00u` dimensions mounts `0.12u` directly underneath it so neither dominates the other.
- **Spatial Separation:** Published exhibitions are arranged **3 albums per row** (derived deterministically from `sortOrder`), centered horizontally with generous dark-plaster breathing room between wings and wrapping cleanly onto new rows.

## Elevation & Depth

All lighting, surface falloff, and cast shadows derive from **one shared physical overhead spotlight model** (`1` track head per `2` grid cols, aimed `28%` down each grid at `heightFrac: 0.98`, `throwFrac: 0.72`, evaluated at each object's actual world-space `z`):

- **Physical Z-Layers (`100px = 1 world unit`):** Continuous PBR plaster wall at `z = 0.00`, wall-plane cast shadows at `z = 0.002` (`depthWrite: false`), placards & soundtrack plaques at `z = 0.14`, mounted prints at `z = 0.22`, hovered prints at `z = 0.36`, and focused prints lifted forward to `z = 0.54`.
- **Directional Cast Shadows:** Every object throws a tight umbra and softer penumbra away from its strongest fixture (`sx`, `sy`), paired with a light-proportional top rim highlight (`0.01u`) and zero dark halo above the top edge.
- **Recessed 4-Ply Matting:** The `0.11u` cotton mat casts a crisp `0.03u` inner shadow from its top edge down onto the recessed photograph, while a subtle mouse-reactive diagonal glass reflection glides across the print on hover and inspection.

## Shapes

Sharp architectural geometry throughout: `1px` corners on mats and plaques, `2px` on HUD and Studio surfaces, and `0px` on the full-width bottom focus label bar. Avoid rounded pill cards or bubbly shadows.

## Components

- **Beveled Glass Standoff Placard (`placard-glass-standoff`):** Transparent green-tinted beveled glass (`2.14u × 2.00u`, faked Fresnel edge bevel + frosted text backing) floating on metallic corner standoffs so the PBR plaster wall shows behind it, displaying title, caption, and minimalistic live `Artist - Song (0:01/3:25)` timecode.
- **Soundtrack Plaque (`soundtrack-plaque`):** Exact `2.14u × 2.00u` matte-black housing directly beneath the placard; shows a CORS-proxied resting thumbnail at rest and mounts the interactive `youtube-nocookie.com` DOM iframe on click in `album` `viewMode` (unmounting on pan/drag/wheel start and auto-stopping when leaving `'album'`).
- **Recessed Archival Print (`print-frame-mat`):** Cotton paper micro-grain, recessed inner mat shadow, baryta print grain, and mouse-reactive specular glass glare.
- **Unobtrusive Photo Focus Bar (`focus-bar`):** Bottom-anchored full-width label bar displaying `< Prev | Next >`, the **album caption** as the primary line, optional owner-entered `Camera • Date • Location` (off/empty by default), and `Return (Esc)`—never blurring the surrounding gallery into a web modal.
- **Curator Studio (`/photos/admin`):** Server-gated, noindex Studio route with a live wall preview and an `admin-surface` sidebar for Exhibitions, Upload and Settings; drag-and-drop folder uploads, album/photo editing, draft preview, and wall ordering stay out of the public bundle.

## Do's and Don'ts

- **Do** drive wall PBR normals, print/placard falloff, and directional shadow offsets from the exact same 3D fixture coordinates.
- **Do** clear shading overlays smoothly when a print enters Photo Focus so inspection shows true photographic exposure.
- **Don't** enclose albums in bordered alcove boxes, trim molding, or visible track-lighting bars/canisters.
- **Don't** render top-left coordinate telemetry or camera-locked vignettes that drag light across the wall when panning.
- **Don't** blur the gallery background into a frosted web modal during Photo Focus.
- **Don't** duplicate a selector across the five stylesheets; keep each surface in its owned file and route-scope Studio CSS to `/photos/admin`.
