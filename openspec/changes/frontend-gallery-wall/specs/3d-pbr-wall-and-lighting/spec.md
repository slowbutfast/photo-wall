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

### Requirement: WebGL Swiss-modernist brushed-aluminum placards
Each exhibition cluster SHALL display a physical brushed-aluminum placard at `z = 0.14` to the left of its photo grid, featuring a 3mm matte black backing core and bundled OFL `Inter Tight` typography rendered in WebGL via `troika-three-text`.

#### Scenario: Placard renders crisp WebGL typography without system fonts
- **WHEN** an exhibition cluster mounts on the 3D wall
- **THEN** its placard SHALL render bold set title and regular minimal caption using bundled OFL `Inter Tight` font assets with directional top-edge sheen and wall-plane cast shadow
