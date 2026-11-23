---
version: "alpha"
name: "Chiaroscuro Gallery"
description: "Physical 3D plaster photo gallery with single-source overhead track lighting, brushed-aluminum Swiss placards, and recessed archival mats."
colors:
  wall-base: "#2D2C29"
  wall-ambient: "#141412"
  primary: "#ECEAE4"
  secondary: "#9E9C95"
  mat-cotton: "#F6F4EF"
  placard-aluminum: "#D2D5D9"
  placard-ink: "#111111"
  placard-core: "#161616"
  hud-surface: "rgba(24, 24, 22, 0.86)"
  hud-border: "rgba(255, 255, 255, 0.12)"
  admin-surface: "#FFFFFF"
  admin-ink: "#1A1B19"
  admin-accent: "#2D3B36"
typography:
  placard-title:
    fontFamily: "Helvetica Neue"
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.015em
  placard-caption:
    fontFamily: "Helvetica Neue"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
  hud-label:
    fontFamily: "Instrument Sans"
    fontSize: 13.5px
    fontWeight: 600
    lineHeight: 1.3
  hud-meta:
    fontFamily: "JetBrains Mono"
    fontSize: 10.5px
    fontWeight: 500
    letterSpacing: 0.06em
rounded:
  none: 0px
  sharp: 1px
  hud: 2px
  drawer: 3px
spacing:
  mat: 11px
  placard-pad: 22px
  gutter: 24px
  island-gap: 44px
components:
  wall-surface:
    backgroundColor: "{colors.wall-base}"
    textColor: "{colors.primary}"
  placard-aluminum:
    backgroundColor: "{colors.placard-aluminum}"
    textColor: "{colors.placard-ink}"
    typography: "{typography.placard-title}"
    rounded: "{rounded.sharp}"
    padding: "{spacing.placard-pad}"
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
  admin-drawer:
    backgroundColor: "{colors.admin-surface}"
    textColor: "{colors.admin-ink}"
    rounded: "{rounded.drawer}"
  admin-button-primary:
    backgroundColor: "{colors.admin-accent}"
    textColor: "{colors.admin-surface}"
    rounded: "{rounded.hud}"
---

## Overview

Chiaroscuro Gallery treats the browser viewport as a quiet, continuous architectural room rather than a digital whiteboard. Photographs and Swiss-modernist placards are mounted directly onto an unbounded, light-reactive stucco plaster wall without alcove boxes, trim molding, or visible lighting hardware. Visitors pan freely across the wall, zoom toward any focal point, and fly smoothly into individual exhibitions or prints.

## Colors

The palette uses a low-key, neutral architectural baseline so illuminated prints and brushed-metal plaques emerge naturally out of shadow without competing with photographic color:

- **Wall Base (`#2D2C29`) & Ambient (`#141412`):** Low-key chiaroscuro stucco foundation. Driven by PBR textures (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`), lit by warm overhead spotlights while unlit corridors fall into deep shadow.
- **Primary (`#ECEAE4`) & Secondary (`#9E9C95`):** Warm gallery-ink typography and muted metadata for the minimal HUD.
- **Mat Cotton (`#F6F4EF`):** Warm 4-ply archival rag mat board framing prints without sterile `#FFFFFF` glare.
- **Placard Aluminum (`#D2D5D9`) & Core (`#161616`):** Anodized brushed silver face laminated onto a 3mm matte black backing core, printed with `#111111` ink.
- **Achromatic Shading Rule:** Distance falloff on mats and placards uses neutral dark attenuation (`rgba(8, 7, 5, ...)`), never warm color tints, so photographic color accuracy stays untouched.

## Typography

Two distinct typographic voices separate physical gallery objects from quiet navigation ephemera:

- **Physical Placards (`Helvetica Neue`, Helvetica, Arial):** Unified Swiss-modernist two-tier hierarchy—`16px` Bold (`700`, `-0.015em` tracking) for the set title and `13px` Regular (`400`, `1.4` line-height) for the minimal caption, flush-left with generous negative space below and to the right.
- **Gallery Ephemera HUD (`Instrument Sans` + `JetBrains Mono`):** `Instrument Sans` (`13.5px` SemiBold) for exhibition titles in the directory dock and focus bar; `JetBrains Mono` (`10.5px` uppercase, `0.06em` tracking) for quiet controls and curated EXIF metadata.

## Layout

- **Exhibition Wings:** Each uploaded folder mounts as a borderless cluster of 10–20 prints arranged in a uniform neutral grid (`24px` gutter) that preserves each photograph's true aspect ratio.
- **Placard Placement:** A single brushed-aluminum placard mounts directly on the plaster `44px` to the left of the grid's top row, sitting naturally near the soft outer edge of the overhead spotlight cone.
- **Spatial Separation:** Clusters are packed non-overlapping on the infinite wall with generous dark-plaster breathing room between wings.

## Elevation & Depth

All lighting, surface falloff, and cast shadows derive from **one shared physical overhead spotlight model** (`1` track head per `2` grid columns, aimed `28%` down each grid at `heightFrac: 0.98`, `throwFrac: 0.72`):

- **Physical Z-Layers:** Continuous PBR plaster wall at `Z = 0`, placards at `Z = 14px`, mounted prints at `Z = 22px`, and focused prints lifted forward to `Z = 54px`.
- **Directional Cast Shadows:** Every object throws a tight umbra and softer penumbra away from its strongest fixture (`--sx`, `--sy`), paired with a light-proportional top rim highlight (`1px`) and zero dark halo above the top edge.
- **Recessed 4-Ply Matting:** The cotton mat casts a crisp `3px` inner shadow from its top edge down onto the recessed photograph, while a subtle mouse-reactive diagonal glass reflection glides across the print on hover and inspection.

## Shapes

Sharp architectural geometry throughout: `1px` corners on mats and metal placards, `2px` on HUD surfaces, `0px` on the full-width bottom focus label bar, and `3px` on the slide-over Curator Drawer. Avoid rounded pill cards or bubbly shadows.

## Components

- **Brushed-Aluminum Placard (`placard-aluminum`):** Horizontal linear brushed grain, anisotropic top highlight driven by overhead irradiance, `3mm` matte black backing core on bottom/right edges, and two-line Helvetica text anchored top-left.
- **Recessed Archival Print (`print-frame-mat`):** Cotton paper micro-grain, recessed inner mat shadow, baryta print grain, and mouse-reactive specular glass glare.
- **Unobtrusive Photo Focus Bar (`focus-bar`):** Bottom-anchored full-width label bar displaying `< Prev | Next >`, title, curated EXIF, and `Return (Esc)`—never overlapping the artwork and never blurring the surrounding gallery into a web modal.
- **Lazy-Loaded Curator Drawer:** Slide-over panel (`admin-surface`) loaded only when requested by the owner for drag-and-drop folder uploads and wall management.

## Do's and Don'ts

- **Do** drive wall PBR normals, print/placard falloff, and directional shadow offsets from the exact same 3D fixture coordinates.
- **Do** clear shading overlays smoothly when a print enters Photo Focus so inspection shows true photographic exposure.
- **Don't** enclose albums in bordered alcove boxes, trim molding, or visible track-lighting bars/canisters.
- **Don't** render top-left coordinate telemetry or camera-locked vignettes that drag light across the wall when panning.
- **Don't** blur the gallery background into a frosted web modal during Photo Focus.
