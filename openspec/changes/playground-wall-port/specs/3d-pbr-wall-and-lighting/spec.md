## RENAMED Requirements

- FROM: `### Requirement: Continuous PBR plaster wall with instanced per-album spotlight quads`
  TO: `### Requirement: Verbatim playground WebGL2 PBR plaster wall with chunked multi-pass spotlights`
- FROM: `### Requirement: WebGL beveled glass standoff placards and DOM-overlay YouTube soundtrack plaques`
  TO: `### Requirement: Verbatim playground beveled glass standoff placards and native YouTube soundtrack plaques`

## MODIFIED Requirements

### Requirement: Verbatim playground WebGL2 PBR plaster wall with chunked multi-pass spotlights
The gallery SHALL render the continuous PBR plaster wall (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`) using the exact WebGL2 fragment shader and mood palettes (`alabaster`, `concrete`, `chiaroscuro`) extracted verbatim from `playgrounds/photo_wall_playground.html` (`N·L * cone / r² + roughness specular`), extending it only with additive 24-spot chunk passes when more than 24 visible fixtures are on screen so 1–8 visible albums match the playground bit-for-bit while 50+ albums illuminate with zero 24-spot cutoff.

#### Scenario: Album view matches playground chiaroscuro contrast and stucco relief
- **WHEN** an album cluster is viewed in `chiaroscuro`, `concrete`, or `alabaster`
- **THEN** `PlaygroundPbrWall` SHALL render bright warm overhead spotlight cones with crisp normal-mapped stucco micro-relief and velvety dark inter-cluster plaster matching `playgrounds/photo_wall_playground.html`

#### Scenario: Macro view with 50 albums illuminates every cluster via chunked passes
- **WHEN** 50 albums (`> 24` total fixtures) are visible at macro zoom
- **THEN** `PlaygroundPbrWall` SHALL draw additive 24-spot chunks so every visible album receives its overhead spotlight cones with no 24-light truncation

### Requirement: Analytic spotlight model shared between wall and objects at true world Z
The lighting module (`src/lib/lighting/playgroundLighting.ts`) SHALL port `playgrounds/photo_wall_playground.html`'s exact `LIGHT_CFG` (`fixturePerCols: 2`, `hotspotFrac: 0.28`, `heightFrac: 0.98`, `throwFrac: 0.72`, `innerDeg: 16`, `outerDeg: 32`) and `rawIrradiance` math to compute per-object CSS custom properties (`--lit`, `--lit-top`, `--lit-bot`, `--lit-l`, `--lit-r`, `--sx`, `--sy`) at `objDepth = 14px` (placards) and `22px` (prints) purely from layout geometry (zero DOM `offsetParent` reads), driving the playground's exact `.is-lit::after` directional mat falloff and directional cast shadows.

#### Scenario: Top-row prints glow brighter than bottom-row prints and focused print clears dimming
- **WHEN** an exhibition cluster is rendered in Album Focus and a visitor clicks into Print Focus
- **THEN** top-row mats SHALL render visibly brighter than bottom-row mats via `.is-lit::after`, directional cast shadows SHALL project away from each object's strongest fixture, and the focused print SHALL clear its shading overlay smoothly (`opacity: 0`)

### Requirement: Verbatim playground beveled glass standoff placards and native YouTube soundtrack plaques
Each exhibition cluster SHALL mount the playground's exact `.museum-placard.mat-glass` (`214px × 200px`, single translucent green-tinted beveled glass pane with CSS `backdrop-filter: blur()`, crisp top/left bevel highlight, two metallic bottom standoff pins, and top-left aligned `TeX Gyre Heros` typography) `44px` (`PLACARD_GAP = 0.44u`) left of its photo grid as the default material, while supporting `.mat-aluminum`, `.mat-acrylic`, and `.mat-rag` verbatim from `playgrounds/photo_wall_playground.html` via Curator Settings. Directly `12px` beneath the placard, an album with a YouTube soundtrack SHALL render a `214px × 200px` matte-black `.soundtrack-plaque` with a `/api/youtube/thumb/[id]` resting thumbnail + play glyph and at most one native `youtube-nocookie.com` `<iframe>` on click (with a transparent gesture capture layer that forwards initial wheel/drag and lifts on explicit click, continuing playback across `print` focus in the same album and pausing on `overview` with a `Paused soundtrack on zoom out` toast).

#### Scenario: Glass placard matches playground translucency, standoffs, and tight 44px gap
- **WHEN** an exhibition cluster is viewed at Album Focus
- **THEN** the placard SHALL sit `44px` left of the photo grid as one translucent frosted glass pane with two metallic bottom standoff pins and top-left Swiss typography (never an opaque nested gray box)

#### Scenario: Dragging or entering print focus keeps soundtrack alive without swallowing gestures
- **WHEN** a visitor plays a soundtrack and then drags, scrolls, or clicks into Print Focus within the same album
- **THEN** the transparent capture layer SHALL forward gestures cleanly without swallowing input, audio SHALL keep playing in Print Focus, and returning to Overview SHALL pause playback and show `Paused soundtrack on zoom out`
