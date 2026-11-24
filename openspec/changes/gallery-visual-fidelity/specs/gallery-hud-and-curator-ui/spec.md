## MODIFIED Requirements

### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger
This change restyles the HUD chrome without altering its authentication boundary (which `admin-route-isolation` owns separately): the HUD SHALL enforce global Helvetica (`"Helvetica Neue", Helvetica, "TeX Gyre Heros", Arial, sans-serif`) across all controls; present a sharp-edged flush top-right segmented control (`gap: 0`, `border-radius: 0`, `24px` inset, solid `#FFFFFF` fill + `#111111` ink for active, solid `#111111` fill + `#FFFFFF` ink for inactive); render the centered bottom Exhibition Room Directory in clean **Title Case** (`text-transform: none`, normal tracking, no `uppercase` global override); and render Curator Settings with the placard-material selector (**Beveled Glass** → `.mat-acrylic`, **Brushed Aluminum** → `.mat-aluminum`, **Archival Foamcore** → `.mat-foamcore`) plus a `FolderDropzone` that recovers cleanly when a folder exceeds `MAX_PHOTOS_PER_ALBUM = 20` files.

#### Scenario: Bottom directory renders collection titles in Title Case Helvetica and top-right buttons are flush sharp-edged
- **WHEN** the gallery loads in Overview or Album Focus
- **THEN** `.hud-directory-item` SHALL have computed `text-transform: none` (rendering `Tokyo Nocturnes`, not `TOKYO NOCTURNES`), and `.hud-top-right .hud-button` SHALL have `border-radius: 0px` with `gap: 0px` and solid `#FFFFFF`/`#111111` active/inactive contrast

### Requirement: Unobtrusive Photo Focus bar with album caption and optional manual metadata
Inspecting a single print SHALL anchor `← PREV`, `NEXT →`, the **album's caption** as a single-line centered **Title Case** Helvetica primary line (`text-transform: none`), an optional subtle subtitle containing only owner-entered fields (**Camera**, **Date**, **Location** — all off/empty by default, with zero auto-extracted EXIF), and `RETURN [ESC]` to a bright, spacious light-frosted full-width bottom bar (`rgba(244, 244, 242, 0.92)` background, `#111111` primary ink, `rgba(17, 17, 17, 0.62)` secondary ink, subtle `1px solid rgba(17, 17, 17, 0.12)` top hairline, `backdrop-filter: blur(12px)`) without blurring the gallery background.

#### Scenario: Photo Focus bar renders bright frosted chrome with Title Case caption
- **WHEN** a visitor inspects a print in an album
- **THEN** `.photo-focus-bar` SHALL render with light frosted background `rgba(244, 244, 242, 0.92)` and `#111111` ink, `.photo-focus-title` SHALL render in Title Case (`text-transform: none`), and only populated manual metadata fields SHALL appear beneath it
