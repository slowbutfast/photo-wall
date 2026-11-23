## Purpose

Provides a continuous, borderless PBR plaster gallery wall and a scalable analytic/stylized overhead spotlight model that drives wall normal highlights, print/placard falloff, and wall-plane cast shadows in unison across 50+ exhibitions.

## ADDED Requirements

### Requirement: Continuous PBR plaster wall with instanced per-album spotlight quads
The gallery SHALL render an unbounded continuous PBR plaster wall (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`) at `z = 0.00` without alcove borders, trim molding, or visible track-lighting hardware, illuminated by **instanced per-album additive spotlight quads** carrying each album's local fixtures so macro view scales to 50+ albums in `O(1)` draw calls without a global light-count cap.

#### Scenario: Macro view with 50 albums illuminates every exhibition
- **WHEN** 50 exhibition clusters (100–150 total track heads) are visible at macro zoom
- **THEN** every exhibition cluster SHALL receive its local overhead spotlight cones and stucco normal highlights in a single instanced spotlight pass without dropping lights to a global cap

### Requirement: Analytic spotlight model shared between wall and objects at true world Z
The fixture generator SHALL place one track head per two grid columns aimed `28%` down each grid (`heightFrac: 0.98`, `throwFrac: 0.72`, `innerDeg: 16°`, `outerDeg: 32°`, `#FFF5E3`) and pre-compute per-object edge irradiance (`litTop`, `litBot`, `litL`, `litR`) and wall-plane cast shadow offsets (`sx`, `sy`) on `z = 0.002` (`depthWrite: false`) from those exact coordinates using each object's true world-space `z` (`0.14` for placards, `0.22` for prints).

#### Scenario: Wall, frames, and placards agree on light direction
- **WHEN** an exhibition cluster is rendered
- **THEN** top-row prints SHALL receive higher irradiance than bottom-row prints, the left-mounted placard SHALL sit near the softer outer edge of the beam, and wall-plane cast shadows SHALL project away from each object's strongest fixture using each object's actual `z` without lifting off the wall

#### Scenario: Focused print clears surface dimming
- **WHEN** a visitor focuses on an individual print
- **THEN** any distance-falloff darkening on that print SHALL clear smoothly so the photograph displays at true exposure without tinting

### Requirement: WebGL beveled glass standoff placards and DOM-overlay YouTube soundtrack plaques
Each exhibition cluster SHALL display a transparent, green-tinted **Beveled Glass Standoff Placard** (`2.14u × 2.00u` / `214px × 200px`, faked Fresnel edge bevel with `depthWrite: false` and a denser frosted text backing ensuring `>= 4.5:1` contrast across all moods) at `z = 0.14` to the left of its photo grid—letting the PBR plaster wall show behind it—with bundled **`TeX Gyre Heros`** typography rendered via `troika-three-text` (LOD-culled below `< 8px` projected text height). When an album has an attached YouTube soundtrack, a matching matte-black **Soundtrack Plaque** of identical `2.14u × 2.00u` dimensions SHALL mount `0.12u` directly beneath the placard with a CORS-proxied, `TexturePool`-budgeted resting thumbnail, while the placard displays `Artist - Song (0:01/3:25)`. Clicking the plaque in `album` `viewMode` SHALL mount a single active `youtube-nocookie.com` `YT.Player` in a **CSS `matrix3d` DOM overlay** synced to the camera each frame (unmounting immediately on pan/drag/wheel start so the iframe cannot swallow gestures, and auto-stopping when `viewMode` leaves `'album'`).

#### Scenario: Glass standoff placard and YouTube plaque share exact dimensions and readable contrast
- **WHEN** an exhibition cluster with a YouTube soundtrack mounts on the 3D wall in `alabaster`, `concrete`, or `chiaroscuro`
- **THEN** the beveled glass placard SHALL reveal the plaster wall behind it via faked Fresnel bevel, maintain `>= 4.5:1` text contrast over its frosted backing, match the `2.14u × 2.00u` width and height of the YouTube plaque below it, and render `Artist - Song (0:00/3:25)` inside the placard

#### Scenario: Leaving album view or starting a pan unmounts the YouTube DOM overlay
- **WHEN** a visitor plays an album's YouTube soundtrack and then initiates a pan/drag/wheel gesture or exits `album` `viewMode`
- **THEN** the active `matrix3d` YouTube iframe overlay SHALL unmount immediately (and stop playback on `viewMode` exit) so navigation is never swallowed and resting thumbnails remain 60fps-safe

### Requirement: Offline suncalc NYC solar circadian gallery lighting with per-mood tokens
The gallery SHALL automatically compute NYC (`40.7128, -74.0060`) solar moods using offline **`suncalc`** in SSR and a 60-second local timer (`alabaster` from `sunrise + 90m` to `goldenHour`, `concrete` from `dawn` to `sunrise + 90m` and `goldenHour` to `dusk`, `chiaroscuro` from `dusk` to `dawn`) with a **60-second smooth crossfade** when crossing a boundary and explicit per-mood render tokens (`ambientLevel`, `spotIntensity`, `poolAlpha`, `shadowOpacity`, `placardInk`). Public visitors SHALL have no manual mood override; dev/admin mode SHALL provide a client-local-only Lighting Preview selector inside the Curator Drawer.

#### Scenario: Public visitor sees NYC solar mood without network requests or manual override
- **WHEN** a public visitor opens the gallery while NYC is in daytime (`sunrise + 90m` to `goldenHour`)
- **THEN** the SSR and client SHALL compute `alabaster` identically via `suncalc` with zero external solar API calls, high-contrast `#1D1E1C` placard ink, and SHALL NOT expose a manual `Mood` button in the HUD

#### Scenario: March and November DST transitions select the correct solar mood
- **WHEN** `determineAutoMood(date)` is evaluated across March spring-forward and November fall-back DST dates in `America/New_York`
- **THEN** solar boundaries SHALL remain aligned to UTC `suncalc` timestamps without off-by-one-hour drift
