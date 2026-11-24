# 3d-pbr-wall-and-lighting Specification

## Purpose
Provides a continuous, borderless PBR plaster gallery wall and a scalable GPU-baked overhead spotlight model that drives wall normal highlights, print/placard falloff, and directional cast shadows in unison across 50+ exhibitions.
## Requirements

### Requirement: Verbatim playground single-pass WebGL2 PBR plaster wall
The gallery SHALL render the continuous PBR plaster wall (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`) in **one pass** using the WebGL2 fragment shader (`N·L * cone / r² + roughness specular` with horizontal elliptical wash shaping and single nonlinear filmic curve `color = color / (color + vec3(0.88)) * 1.34`) and mood palettes (`alabaster`, `concrete`, `chiaroscuro`). The wall shader SHALL sample plaster textures at architectural fine-grain scale via `WALL_SHADER_CFG` (`tileUnits = 2.2`, `normalStrength = 0.4`, `aoStrength = 0.55`) so close-up print inspection renders smooth gallery plaster rather than coarse outdoor stucco, and the `chiaroscuro` ambient floor SHALL keep interstitial plaster reading as warm charcoal-taupe (`ambientLevel: 0.24`, `wallBase: '#3d3a35'`, softened vignette `<= 0.42`, distinct from `concrete`) rather than near-black. Culled visible fixtures (`<= 256` via `selectVisibleSpots`) SHALL be packed into a row-major `RGBA32F` data texture (`packFixtureDataTexture`: Row 0 = `pos + invPeak`, Row 1 = `axis + ellipseX`), and the WebGL2 render loop SHALL idle-stop when camera, viewport, mood, and manifest are unchanged.

#### Scenario: Wall canvas renders fine-grain plaster and warm charcoal-taupe ambient in chiaroscuro
- **WHEN** `?demo=4&mood=chiaroscuro` is rendered in Overview and Single-Photo Inspection
- **THEN** `PlaygroundPbrWall` SHALL upload `uTileSize = 2.2` and `uNormalStrength = 0.4`, the interstitial wall outside album pools SHALL read as warm charcoal-taupe (distinct from `concrete` and not near-black), and each album SHALL be illuminated by one wide, soft elliptical wash without scalloped triple-hotspot cones

#### Scenario: Macro view with 50 albums illuminates visible clusters in a single pass
- **WHEN** 50 albums are visible at macro zoom
- **THEN** `selectVisibleSpots` and `packFixtureDataTexture` SHALL feed up to 256 culled single-wash cluster spots into the single-pass shader without additive multi-pass tone-map distortion

### Requirement: Analytic spotlight model shared between wall and objects at true world Z
The lighting module (`src/lib/lighting/playgroundLighting.ts`) SHALL compute **one wide, soft elliptical cluster wash fixture per album island** centered horizontally across the combined placard + photo grid span (`islandCenterX`) and slightly above the cluster midpoint (`hotspotFrac: 0.32`, `heightFrac: 0.96`, `throwFrac: 0.85`, soft cone `innerDeg: 18`, `outerDeg: 38`, horizontal ellipse stretch factor derived from `islandWidth / islandHeight`, `ambientObj: 0.50`), using `rawIrradiance` purely from `islandLayout.ts` geometry (zero DOM `offsetParent` reads) to compute per-object CSS custom properties (`--lit`, `--lit-top`, `--lit-bot`, `--lit-l`, `--lit-r`, `--sx`, `--sy`) for both prints and placards.

#### Scenario: Placard and all print rows sit inside one continuous cluster wash
- **WHEN** `computePlaygroundLighting(albums)` evaluates a multi-column exhibition cluster
- **THEN** it SHALL emit exactly `1` fixture per album, the album's placard `PlaygroundShadedObject.lit` (the normalized `0..1` irradiance value `ambientObj + (1 - ambientObj) * min(1, rawIrradiance / peak)` emitted to `--lit` before CSS `.is-lit::after` compositing) SHALL be `>= 0.72`, top-row print `lit` SHALL remain greater than or equal to bottom-row print `lit`, and directional cast shadows SHALL project away from the cluster fixture

### Requirement: Verbatim playground acrylic glass standoff placards and native YouTube soundtrack plaques
Each exhibition cluster SHALL mount a compact, fixed-height (`214px × 200px`, top-aligned, never stretched to grid height) `.museum-placard` `94px` (`PLACARD_GAP = 0.94u`) left of its photo grid, supporting `.mat-acrylic` (**Beveled Glass**), `.mat-aluminum` (**Brushed Aluminum** with bright silver gradient `#E4E6E8 -> #C2C6CA -> #AEB2B6` and `3px` solid `#141414` bottom/right core edge), and `.mat-foamcore` (**Archival Foamcore**). Directly `12px` beneath the placard, an album with a YouTube soundtrack SHALL render a `214px × 200px` matte-black `.soundtrack-plaque` with a `/api/youtube/thumb/[id]` resting thumbnail + play glyph, an immediate styled architectural fallback poster (gradient surface + track title/artist + centered play button, never a solid empty black box) whenever the thumbnail is loading or fails, and at most one native `youtube-nocookie.com` `<iframe>` on click (with a transparent gesture capture layer that forwards initial wheel/drag and lifts on explicit click, continuing playback across `print` focus in the same album and pausing quietly on `overview` with no toast popup).

#### Scenario: Failed YouTube thumbnail renders styled fallback poster instead of black box
- **WHEN** a soundtrack plaque's `/api/youtube/thumb/[id]` request fails or has not loaded yet in Overview or Album Focus
- **THEN** `.soundtrack-plaque` SHALL render a styled architectural poster surface with track title/artist and a crisp play button rather than an empty black rectangle

#### Scenario: Returning to Overview pauses soundtrack quietly without toast popup
- **WHEN** a visitor plays a soundtrack and then returns to Overview
- **THEN** playback SHALL pause quietly and the DOM SHALL NOT render a `.soundtrack-toast` popup

### Requirement: Offline suncalc NYC solar circadian gallery lighting with per-mood tokens
The gallery SHALL automatically compute NYC (`40.7128, -74.0060`) solar moods using offline **`suncalc`** in SSR and a 60-second local timer (`alabaster` from `sunrise + 90m` to `goldenHour`, `concrete` from `dawn` to `sunrise + 90m` and `goldenHour` to `dusk`, `chiaroscuro` from `dusk` to `dawn`) with a **60-second smooth crossfade** when crossing a boundary and explicit per-mood render tokens (`ambientLevel`, `spotIntensity`, `poolAlpha`, `shadowOpacity`, `placardInk`). Public visitors SHALL have no manual mood override; dev/admin mode SHALL provide a client-local-only Lighting Preview selector inside the Curator Drawer.

#### Scenario: Public visitor sees NYC solar mood without network requests or manual override
- **WHEN** a public visitor opens the gallery while NYC is in daytime (`sunrise + 90m` to `goldenHour`)
- **THEN** the SSR and client SHALL compute `alabaster` identically via `suncalc` with zero external solar API calls, high-contrast `#1D1E1C` placard ink, and SHALL NOT expose a manual `Mood` button in the HUD

#### Scenario: March and November DST transitions select the correct solar mood
- **WHEN** `determineAutoMood(date)` is evaluated across March spring-forward and November fall-back DST dates in `America/New_York`
- **THEN** solar boundaries SHALL remain aligned to UTC `suncalc` timestamps without off-by-one-hour drift
