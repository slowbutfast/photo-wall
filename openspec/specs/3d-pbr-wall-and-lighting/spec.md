# 3d-pbr-wall-and-lighting Specification

## Purpose
Provides a continuous, borderless PBR plaster gallery wall and a scalable GPU-baked overhead spotlight model that drives wall normal highlights, print/placard falloff, and directional cast shadows in unison across 50+ exhibitions.
## Requirements
### Requirement: Continuous PBR plaster wall with baked wall-space lightmap
The gallery SHALL render an unbounded continuous PBR plaster wall (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`) in a full-viewport WebGL2 `<canvas>` (`PbrWallCanvas`) without alcove borders, trim molding, or visible track-lighting hardware. `PbrWallCanvas` SHALL desaturate `wall_albedo.webp` to near-zero saturation (preserving the playground's exposure curve so mood tint + warm `3500K` `#FFF5E6` light supply all warmth without khaki/tan muddiness), attenuate normal-map relief at macro zoom so overview does not look blotchy, and illuminate each exhibition cluster via a **GPU-baked wall-space lightmap** (`RGBA8`, `8 texels/world unit`, capped at `2048 × 2048`, storing normalized irradiance in `R` and 3D light direction `(dirX, dirY)` in `GB` with `dirZ` reconstructed in-shader, `CLAMP_TO_EDGE` with a `6u` zero-irradiance margin and explicit out-of-bounds ambient fallback) so inter-cluster wall space falls to `~35–45%` of pool peak brightness and macro view scales to 50+ albums in `O(1)` per-pixel cost without a 24-spot uniform cap or edge wrapping/smearing.

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
Each exhibition cluster SHALL display a **Beveled Glass Standoff Placard** (`214px × 200px` / `2.14u × 2.00u`) as the default placard material—translucent green-tinted glass using CSS `backdrop-filter: blur()` (`album` and `print` zoom tiers; blur and text hidden at `macro` tier) and frosted text backing (`>= 4.5:1` contrast) with the existing self-hosted **`TeX Gyre Heros`** `@font-face` typography—while exposing the playground's alternative placard materials (**Brushed Aluminum** with `135°` `#E2E4E6 → #B8BCC0` gradient, horizontal brushed grain, `3–4px` `#141414` core edge, two bottom screws, and crisp downward shadow; **Matte Black Acrylic**; and **Archival Rag Paper**) as selectable options in Curator/Admin Settings. Neither `.world` nor `.album-island` SHALL apply `opacity < 1`, `filter`, `mask`, `clip-path`, `mix-blend-mode`, or non-`transform` `will-change` (print-focus dimming SHALL apply per-element on `.photo-frame` only) so Chrome `backdrop-filter` never loses its backdrop root. When an album has an attached YouTube soundtrack, a matching matte-black **Soundtrack Plaque** (`214px × 200px`) SHALL mount `12px` (`0.12u`) beneath the placard showing a resting thumbnail proxied via `/api/youtube/thumb/[id]` (never hitting `i.ytimg.com` directly) and mounting at most one native `youtube-nocookie.com` `<iframe>` on click. A transparent capture layer SHALL sit over the active iframe to forward wheel/drag gestures and lift only on an explicit click into the player; playback SHALL continue across `print` focus in the same album and pause/stop on `overview` (showing a subtle bottom-right `Paused soundtrack on zoom out` toast) or switching albums.

#### Scenario: Glass standoff placard reveals plaster wall through frosted glass even during print focus
- **WHEN** an exhibition cluster is viewed at `album` or `print` zoom in `alabaster`, `concrete`, or `chiaroscuro`
- **THEN** the beveled glass placard SHALL blur the WebGL2 PBR plaster wall through CSS `backdrop-filter: blur()` (with no backdrop-root-breaking properties on `.world` or `.album-island`), maintain `>= 4.5:1` text contrast, and match the `214px × 200px` dimensions of the soundtrack plaque beneath it

#### Scenario: Wheel or drag starting over an active YouTube plaque navigates smoothly without killing audio
- **WHEN** a visitor plays an album's YouTube soundtrack and then initiates a wheel zoom or drag starting over the plaque, or enters `print` focus within the same album
- **THEN** the transparent capture layer SHALL forward the gesture cleanly without the iframe swallowing input, audio SHALL keep playing in `print` focus, and playback SHALL stop only on `overview` or selecting another album

### Requirement: Offline suncalc NYC solar circadian gallery lighting with per-mood tokens
The gallery SHALL automatically compute NYC (`40.7128, -74.0060`) solar moods using offline **`suncalc`** in SSR and a 60-second local timer (`alabaster` from `sunrise + 90m` to `goldenHour`, `concrete` from `dawn` to `sunrise + 90m` and `goldenHour` to `dusk`, `chiaroscuro` from `dusk` to `dawn`) with a **60-second smooth crossfade** when crossing a boundary and explicit per-mood render tokens (`ambientLevel`, `spotIntensity`, `poolAlpha`, `shadowOpacity`, `placardInk`). Public visitors SHALL have no manual mood override; dev/admin mode SHALL provide a client-local-only Lighting Preview selector inside the Curator Drawer.

#### Scenario: Public visitor sees NYC solar mood without network requests or manual override
- **WHEN** a public visitor opens the gallery while NYC is in daytime (`sunrise + 90m` to `goldenHour`)
- **THEN** the SSR and client SHALL compute `alabaster` identically via `suncalc` with zero external solar API calls, high-contrast `#1D1E1C` placard ink, and SHALL NOT expose a manual `Mood` button in the HUD

#### Scenario: March and November DST transitions select the correct solar mood
- **WHEN** `determineAutoMood(date)` is evaluated across March spring-forward and November fall-back DST dates in `America/New_York`
- **THEN** solar boundaries SHALL remain aligned to UTC `suncalc` timestamps without off-by-one-hour drift
