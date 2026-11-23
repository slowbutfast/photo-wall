## RENAMED Requirements

- FROM: `### Requirement: Continuous PBR plaster wall with instanced per-album spotlight quads`
  TO: `### Requirement: Continuous PBR plaster wall with baked wall-space lightmap`
- FROM: `### Requirement: WebGL beveled glass standoff placards and DOM-overlay YouTube soundtrack plaques`
  TO: `### Requirement: CSS beveled glass standoff placards and native YouTube soundtrack plaques`

## MODIFIED Requirements

### Requirement: Continuous PBR plaster wall with baked wall-space lightmap
The gallery SHALL render an unbounded continuous PBR plaster wall (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`) in a full-viewport WebGL2 `<canvas>` (`PbrWallCanvas`) without alcove borders, trim molding, or visible track-lighting hardware, preserving the playground's `wall_albedo` brightness/exposure curve (so daytime `alabaster` renders bright warm `#ECE9E2` rather than muddy taupe) and illuminated by a **GPU-baked wall-space lightmap** (`RGBA8`, `8 texels/world unit`, capped at `2048 × 2048`, storing normalized irradiance in `R` and 3D light direction `(dirX, dirY)` in `GB` with `dirZ` reconstructed in-shader, `CLAMP_TO_EDGE` with a `6u` zero-irradiance margin and explicit out-of-bounds ambient fallback) so macro view scales to 50+ albums in `O(1)` per-pixel cost without a 24-spot uniform cap or edge wrapping/smearing.

#### Scenario: Macro view with 50 albums illuminates every exhibition via baked lightmap
- **WHEN** 50 exhibition clusters (150–250 total track heads) are visible at macro zoom
- **THEN** `PbrWallCanvas` SHALL sample the GPU-baked `RGBA8` wall-space lightmap alongside `wall_normal.webp`, `wall_ao.webp`, and `wall_roughness.webp` so every exhibition receives overhead stucco relief and warm light pools with zero 24-spot cutoff

#### Scenario: Panning outside the baked wall bounds falls off cleanly to ambient
- **WHEN** a visitor pans far beyond the outer album islands on the infinite wall
- **THEN** coordinates outside `[0, 1]` lightmap UV SHALL evaluate zero fixture irradiance (pure ambient plaster) without wrapping, smearing, or showing stale edge texels

### Requirement: Analytic spotlight model shared between wall and objects at true world Z
The fixture generator (`buildWorldFixtures`) SHALL place one track head per two grid columns aimed `28%` down each grid (`heightFrac: 0.98`, `throwFrac: 0.72`, `innerDeg: 16°`, `outerDeg: 32°`, `#FFF5E3`) and drive both the GPU-baked wall-space lightmap and a pure memoized hook (`useGalleryLighting`) emitting per-object CSS custom properties (`--lit`, `--lit-top`, `--lit-bot`, `--lit-l`, `--lit-r`, `--sx`, `--sy`) using each object's true world-space depth (`0.14u` for placards, `0.22u` for prints) with zero DOM layout reads.

#### Scenario: Wall lightmap, frames, and placards agree on light direction
- **WHEN** an exhibition cluster is rendered
- **THEN** top-row prints SHALL receive higher irradiance than bottom-row prints, the left-mounted placard SHALL sit near the softer outer edge of the beam, and directional CSS cast shadows (`--sx`, `--sy`) SHALL project away from each object's strongest fixture without clipping at island edges

#### Scenario: Focused print clears surface dimming
- **WHEN** a visitor focuses on an individual print
- **THEN** any distance-falloff darkening on that print SHALL clear smoothly (`opacity: 0`) so the photograph displays at true exposure without tinting

### Requirement: CSS beveled glass standoff placards and native YouTube soundtrack plaques
Each exhibition cluster SHALL display a translucent, green-tinted **Beveled Glass Standoff Placard** (`214px × 200px` / `2.14u × 2.00u`) mounted via `islandLayout.ts` to the left of its photo grid using CSS `backdrop-filter: blur()` (`album` and `print` zoom tiers; blur and text hidden at `macro` tier) and frosted text backing (`>= 4.5:1` contrast) with the existing self-hosted **`TeX Gyre Heros`** `@font-face` typography. Neither `.world` nor `.album-island` SHALL apply `opacity < 1`, `filter`, `mask`, `clip-path`, `mix-blend-mode`, or non-`transform` `will-change` (print-focus dimming SHALL apply per-element on `.photo-frame` only) so Chrome `backdrop-filter` never loses its backdrop root. When an album has an attached YouTube soundtrack, a matching matte-black **Soundtrack Plaque** (`214px × 200px`) SHALL mount `12px` (`0.12u`) beneath the placard showing a resting thumbnail proxied via `/api/youtube/thumb/[id]` (never hitting `i.ytimg.com` directly) and mounting at most one native `youtube-nocookie.com` `<iframe>` on click. A transparent capture layer SHALL sit over the active iframe to forward wheel/drag gestures and lift only on an explicit click into the player; playback SHALL continue across `print` focus in the same album and stop on `overview` or switching albums.

#### Scenario: Glass standoff placard reveals plaster wall through frosted glass even during print focus
- **WHEN** an exhibition cluster is viewed at `album` or `print` zoom in `alabaster`, `concrete`, or `chiaroscuro`
- **THEN** the beveled glass placard SHALL blur the WebGL2 PBR plaster wall through CSS `backdrop-filter: blur()` (with no backdrop-root-breaking properties on `.world` or `.album-island`), maintain `>= 4.5:1` text contrast, and match the `214px × 200px` dimensions of the soundtrack plaque beneath it

#### Scenario: Wheel or drag starting over an active YouTube plaque navigates smoothly without killing audio
- **WHEN** a visitor plays an album's YouTube soundtrack and then initiates a wheel zoom or drag starting over the plaque, or enters `print` focus within the same album
- **THEN** the transparent capture layer SHALL forward the gesture cleanly without the iframe swallowing input, audio SHALL keep playing in `print` focus, and playback SHALL stop only on `overview` or selecting another album
