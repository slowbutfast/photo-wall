## Purpose

Provides a continuous, borderless PBR plaster gallery wall and a scalable analytic/stylized overhead spotlight model that drives wall normal highlights, print/placard falloff, and wall-plane cast shadows in unison across 50+ exhibitions.

## ADDED Requirements

### Requirement: Continuous PBR plaster wall with per-album spotlight quads
The gallery SHALL render an unbounded continuous PBR plaster wall (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`) at `z = 0.00` without alcove borders, trim molding, or visible track-lighting hardware, illuminated by per-album additive spotlight quads carrying each album's local fixtures so macro view scales to 50+ albums without a global light-count cap.

#### Scenario: Macro view with 50 albums illuminates every exhibition
- **WHEN** 50 exhibition clusters (100–150 total track heads) are visible at macro zoom
- **THEN** every exhibition cluster SHALL receive its local overhead spotlight cones and stucco normal highlights without dropping lights to a global cap

### Requirement: Analytic spotlight model shared between wall and objects
The fixture generator SHALL place one track head per two grid columns aimed `28%` down each grid (`heightFrac: 0.98`, `throwFrac: 0.72`, `innerDeg: 16°`, `outerDeg: 32°`, `#FFF5E3`) and pre-compute per-object edge irradiance (`litTop`, `litBot`, `litL`, `litR`) and wall-plane cast shadow offsets (`sx`, `sy`) on `z = 0.002` (`depthWrite: false`) from those exact coordinates.

#### Scenario: Wall, frames, and placards agree on light direction
- **WHEN** an exhibition cluster is rendered
- **THEN** top-row prints SHALL receive higher irradiance than bottom-row prints, the left-mounted placard SHALL sit near the softer outer edge of the beam, and wall-plane cast shadows SHALL project away from each object's strongest fixture without lifting off the wall

#### Scenario: Focused print clears surface dimming
- **WHEN** a visitor focuses on an individual print
- **THEN** any distance-falloff darkening on that print SHALL clear smoothly so the photograph displays at true exposure without tinting

### Requirement: WebGL beveled glass standoff placards and matched YouTube soundtrack plaques
Each exhibition cluster SHALL display a transparent, green-tinted **Beveled Glass Standoff Placard** (`2.14u × 2.00u` / `214px × 200px`) at `z = 0.14` to the left of its photo grid—letting the PBR plaster wall show behind it—with bundled OFL `Inter Tight` typography rendered via `troika-three-text`. When an album has an attached YouTube soundtrack, a matching matte-black **Soundtrack Plaque** of identical `2.14u × 2.00u` (`214px × 200px`) dimensions SHALL mount `0.12u` directly beneath the placard, while the placard displays a minimalistic `Artist - Song (0:01/3:25)` line whose timecode updates live during playback and stops automatically when zooming out to macro view.

#### Scenario: Glass standoff placard and YouTube plaque share exact dimensions
- **WHEN** an exhibition cluster with a YouTube soundtrack mounts on the 3D wall
- **THEN** the beveled glass placard SHALL reveal the plaster wall behind it, match the `2.14u × 2.00u` width and height of the YouTube plaque below it, and render `Artist - Song (0:00/3:25)` inside the placard

#### Scenario: Zooming out stops active YouTube playback
- **WHEN** a visitor plays an album's YouTube soundtrack and then zooms out to macro view
- **THEN** the active YouTube player SHALL stop and unmount automatically so resting thumbnails remain 60fps-safe
