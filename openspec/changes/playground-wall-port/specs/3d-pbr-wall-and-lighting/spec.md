## RENAMED Requirements

- FROM: `### Requirement: Continuous PBR plaster wall with baked wall-space lightmap`
  TO: `### Requirement: Verbatim playground single-pass WebGL2 PBR plaster wall`
- FROM: `### Requirement: CSS beveled glass standoff placards and native YouTube soundtrack plaques`
  TO: `### Requirement: Verbatim playground acrylic glass standoff placards and native YouTube soundtrack plaques`

## MODIFIED Requirements

### Requirement: Verbatim playground single-pass WebGL2 PBR plaster wall
The gallery SHALL render the continuous PBR plaster wall (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`) in **one pass** using the exact WebGL2 fragment shader (`N·L * cone / r² + roughness specular` and single nonlinear filmic curve `color = color / (color + vec3(0.88)) * 1.34`) and `applyTheme()` mood palettes (`alabaster`, `concrete`, `chiaroscuro`) extracted from `playgrounds/photo_wall_playground.html` (`dcc7a048`). Culled visible fixtures (`<= 128` via `selectVisibleSpots`) SHALL be packed into a row-major `RGBA32F` data texture (`packFixtureDataTexture`: Row 0 = `pos`, Row 1 = `axis`), and the WebGL2 render loop SHALL idle-stop when camera, viewport, mood, and manifest are unchanged.

#### Scenario: Wall canvas matches playground lighting within pixelmatch threshold across all three moods
- **WHEN** `?demo=4` (reproducing the playground's exact 4 albums) is rendered at pinned cameras with `?mood=chiaroscuro`, `?mood=concrete`, and `?mood=alabaster`
- **THEN** `PlaygroundPbrWall` SHALL match `playgrounds/photo_wall_playground.html` (`dcc7a048`) on the wall-canvas region within the configured `pixelmatch` threshold

#### Scenario: Macro view with 50 albums illuminates visible clusters in a single pass
- **WHEN** 50 albums (`> 24` total fixtures) are visible at macro zoom
- **THEN** `selectVisibleSpots` and `packFixtureDataTexture` SHALL feed up to 128 culled spots into the single-pass shader without additive multi-pass tone-map distortion

### Requirement: Analytic spotlight model shared between wall and objects at true world Z
The lighting module (`src/lib/lighting/playgroundLighting.ts`) SHALL port `playgrounds/photo_wall_playground.html` (`dcc7a048`)'s exact `LIGHT_CFG` (`fixturePerCols: 2`, `hotspotFrac: 0.28`, `heightFrac: 0.98`, `innerDeg: 16`, `outerDeg: 32`, `ambientObj: 0.42`, `objDepth: 9` overridden to `14` for placards and `22` for prints, plus `throwFrac: 0.72`) and `rawIrradiance` math to compute per-object CSS custom properties (`--lit`, `--lit-top`, `--lit-bot`, `--lit-l`, `--lit-r`, `--sx`, `--sy`) purely from `islandLayout.ts` geometry (zero DOM `offsetParent` reads), driving `.is-lit::after` directional mat falloff and directional cast shadows.

#### Scenario: Top-row prints receive higher irradiance than bottom-row prints and focused print clears dimming
- **WHEN** an exhibition cluster is rendered in Album Focus and a visitor clicks into Print Focus
- **THEN** `computePlaygroundLighting` SHALL preserve the `ambientObj: 0.42` floor with top-row irradiance > bottom-row irradiance, directional cast shadows SHALL project away from each object's strongest fixture, and the focused print SHALL clear its shading overlay smoothly (`opacity: 0`)

### Requirement: Verbatim playground acrylic glass standoff placards and native YouTube soundtrack plaques
Each exhibition cluster SHALL mount the playground's exact `.museum-placard.mat-acrylic` (`data-placard="acrylic"`, labeled **Beveled Glass** in Settings, `214px × 200px`, single translucent beveled glass pane with CSS `backdrop-filter: blur()`, crisp top/left bevel highlight, two metallic bottom standoff pins, and top-left `TeX Gyre Heros` typography) `44px` (`PLACARD_GAP = 0.44u`) left of its photo grid as the default material, while supporting `.mat-aluminum` (**Brushed Aluminum**) and `.mat-foamcore` (**Archival Foamcore**) verbatim from `playgrounds/photo_wall_playground.html` (`dcc7a048`) via Curator Settings. Directly `12px` beneath the placard, an album with a YouTube soundtrack SHALL render a `214px × 200px` matte-black `.soundtrack-plaque` with a `/api/youtube/thumb/[id]` resting thumbnail + play glyph and at most one native `youtube-nocookie.com` `<iframe>` on click (with a transparent gesture capture layer that forwards initial wheel/drag and lifts on explicit click, continuing playback across `print` focus in the same album and pausing on `overview` with a `Paused soundtrack on zoom out` toast).

#### Scenario: Default placard uses real playground mat-acrylic class at 44px gap
- **WHEN** an exhibition cluster is viewed at Album Focus
- **THEN** the placard SHALL render with `.mat-acrylic` (`data-placard="acrylic"`), two bottom metallic standoff pins, top-left Swiss typography, and a `44px` gap to its photo grid

#### Scenario: Dragging or entering print focus keeps soundtrack alive without swallowing gestures
- **WHEN** a visitor plays a soundtrack and then drags, scrolls, or clicks into Print Focus within the same album
- **THEN** the transparent capture layer SHALL forward gestures cleanly without swallowing input, audio SHALL keep playing in Print Focus, and returning to Overview SHALL pause playback and show `Paused soundtrack on zoom out`
