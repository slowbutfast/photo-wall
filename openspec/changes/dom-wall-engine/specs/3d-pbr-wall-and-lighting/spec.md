## MODIFIED Requirements

### Requirement: Continuous PBR plaster wall with instanced per-album spotlight quads
The gallery SHALL render an unbounded continuous PBR plaster wall (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`) in a full-viewport WebGL2 `<canvas>` (`PbrWallCanvas`) without alcove borders, trim molding, or visible track-lighting hardware, illuminated by a **baked wall-space lightmap** (diffuse irradiance + dominant light direction computed from `buildWorldFixtures` on manifest change) so macro view scales to 50+ albums in `O(1)` per-pixel cost without a 24-spot uniform cap.

#### Scenario: Macro view with 50 albums illuminates every exhibition via baked lightmap
- **WHEN** 50 exhibition clusters (150–250 total track heads) are visible at macro zoom
- **THEN** `PbrWallCanvas` SHALL sample the baked wall-space lightmap alongside `wall_normal.webp`, `wall_ao.webp`, and `wall_roughness.webp` so every exhibition receives overhead stucco relief and warm light pools with zero 24-spot cutoff

### Requirement: Analytic spotlight model shared between wall and objects at true world Z
The fixture generator (`buildWorldFixtures`) SHALL place one track head per two grid columns aimed `28%` down each grid (`heightFrac: 0.98`, `throwFrac: 0.72`, `innerDeg: 16°`, `outerDeg: 32°`, `#FFF5E3`) and drive both the baked wall-space lightmap and a pure memoized hook (`useGalleryLighting`) emitting per-object CSS custom properties (`--lit`, `--lit-top`, `--lit-bot`, `--lit-l`, `--lit-r`, `--sx`, `--sy`) using each object's true world-space depth (`0.14u` for placards, `0.22u` for prints) with zero DOM layout reads.

#### Scenario: Wall lightmap, frames, and placards agree on light direction
- **WHEN** an exhibition cluster is rendered
- **THEN** top-row prints SHALL receive higher irradiance than bottom-row prints, the left-mounted placard SHALL sit near the softer outer edge of the beam, and directional CSS cast shadows (`--sx`, `--sy`) SHALL project away from each object's strongest fixture

#### Scenario: Focused print clears surface dimming
- **WHEN** a visitor focuses on an individual print
- **THEN** any distance-falloff darkening on that print SHALL clear smoothly (`opacity: 0`) so the photograph displays at true exposure without tinting

### Requirement: WebGL beveled glass standoff placards and DOM-overlay YouTube soundtrack plaques
Each exhibition cluster SHALL display a translucent, green-tinted **Beveled Glass Standoff Placard** (`214px × 200px` / `2.14u × 2.00u`) mounted via `islandLayout.ts` to the left of its photo grid using CSS `backdrop-filter: blur()` (`album` and `print` zoom tiers; blur and text hidden at `macro` tier) and frosted text backing (`>= 4.5:1` contrast) with self-hosted **`TeX Gyre Heros`** typography. When an album has an attached YouTube soundtrack, a matching matte-black **Soundtrack Plaque** (`214px × 200px`) SHALL mount `12px` (`0.12u`) beneath the placard showing a static thumbnail facade at rest and mounting at most one native `youtube-nocookie.com` `<iframe>` on click (inheriting `.world` transform with zero `matrix3d` sync). During active pan/drag (past drag threshold) or wheel gestures, the iframe wrapper SHALL apply `pointer-events: none` without killing audio; playback SHALL continue across `print` focus in the same album and stop when returning to `overview` or switching albums.

#### Scenario: Glass standoff placard reveals plaster wall through frosted glass
- **WHEN** an exhibition cluster is viewed at `album` zoom in `alabaster`, `concrete`, or `chiaroscuro`
- **THEN** the beveled glass placard SHALL show the WebGL2 PBR plaster wall through CSS `backdrop-filter: blur()`, maintain `>= 4.5:1` text contrast, and match the `214px × 200px` dimensions of the soundtrack plaque beneath it

#### Scenario: Dragging or entering print focus preserves playback without swallowing gestures
- **WHEN** a visitor plays an album's YouTube soundtrack and then pans/zooms or clicks into `print` focus within the same album
- **THEN** the iframe SHALL receive `pointer-events: none` during active gestures so navigation is never swallowed, audio SHALL keep playing in `print` focus, and playback SHALL stop only on `overview` or selecting another album
