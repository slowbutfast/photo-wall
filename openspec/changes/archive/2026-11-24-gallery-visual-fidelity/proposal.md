# Proposal: Gallery Visual Fidelity

## Why

Side-by-side comparison of the live Next.js deployment against `playgrounds/photo_wall_playground.html` (documented with reference screenshots in `research.md`) reveals five visual, lighting, proportion, and interaction regressions: harsh scalloped 2–3-hotspot spotlights on a near-black wall that starve placards of light, over-scaled coarse plaster normal mapping at close range, tight placard-to-grid spacing that photobombs single-photo inspection, dimmed neighbor ghosting + 1D diagonal glare + flat un-extruded frames during inspection, and global CSS uppercase/dark-bar overrides that break the Swiss-modernist Helvetica HUD and light frosted inspection bar. Fixing these in a dedicated visual-fidelity change keeps `album-photo-management` cleanly scoped to Curator Studio CRUD/reordering while restoring physical museum-grade realism to the shared gallery renderer.

## What Changes

- **Cluster Wash Spotlight & Ambient Floor (`PlaygroundPbrWall`, `playgroundLighting.ts`, `playgroundTheme.ts`):**
  - Replace the per-column multi-head scalloped track fixtures (`heads = ceil(cols / 2)`, `16°/32°`) with **one wide, soft elliptical wash spotlight** per album island centered horizontally across the combined placard + photo grid span so both the placard and all print rows sit inside a single even light pool.
  - Raise the `chiaroscuro` ambient floor so interstitial plaster reads as warm charcoal-taupe (`#5A5650`–`#6E6A63`) rather than near-black (`#0E0E0D`), and soften the vignette.
- **Architectural Wall Plaster Scale (`playgroundLighting.ts` `WALL_SHADER_CFG` + `PlaygroundPbrWall.tsx`):**
  - Update `WALL_SHADER_CFG` in `src/lib/lighting/playgroundLighting.ts` (`tileUnits: 2.2`, `normalStrength: 0.4`, `aoStrength: 0.55`) so close-up print inspection shows fine architectural museum plaster rather than coarse outdoor stucco craters.
- **3D Frame Extrusion, 2D Specular Glare, Tilt-Reactive Shadows & Full-Fidelity Neighbors (`GalleryCanvas.tsx`, `FramedPrint.tsx`, `src/styles/wall.css`):**
  - Remove `.photo-frame.dimmed` ghosting (`opacity: 0.26; filter: brightness(0.65)`) so all neighboring prints stay at 100% material fidelity during single-photo inspection and `PREV`/`NEXT` camera flights.
  - Replace the 1D `linear-gradient(135deg, ...)` glare streak in `.photo-sheen` with a soft 2D elliptical `radial-gradient` specular bloom in `FramedPrint.tsx` + `src/styles/wall.css` that tracks `X` and `Y` independently opposite to cursor tilt (`translate3d(-nx * %, -ny * %, 0)`).
  - Add visible 3D frame side-edge extrusion (asymmetric right/bottom bevel depth) and bind wall cast shadow offsets (`--tilt-sx`, `--tilt-sy`) to `-rotateY` and `rotateX` during pointer tilt.
- **Placard Breathing Room, Default Material & Soundtrack Poster Fallback (`islandLayout.ts`, `SoundtrackPlaque.tsx`, `src/styles/wall.css`):**
  - Increase `PLACARD_GAP` from `0.44` (`44px`) to `0.94` (`94px`, `+50px`) so the placard never photobombs the first photo column during single-photo inspection.
  - Ensure balanced 2×2 row chunking when an exhibition wall has exactly 4 published albums (while preserving 3-column layout for 3 or ≥5 albums) so 4-album galleries do not leave an orphaned bottom-left cluster.
  - Guarantee compact top-aligned fixed-height placard proportions (`214px × 200px`) with crisp bright brushed-aluminum styling (`#E4E6E8 -> #C2C6CA -> #AEB2B6`, `3px` `#141414` core edge) and render an immediate curated fallback poster (soft dark architectural gradient + track metadata + play badge) in `SoundtrackPlaque` whenever a YouTube thumbnail is unavailable, eliminating solid black rectangles.
- **HUD Chrome Cleanup, Title Case Helvetica & Quiet Transitions (`src/styles/hud.css`, `src/styles/wall.css`, `GalleryCanvas.tsx`):**
  - Deduplicate the three legacy HUD selector blocks inside `src/styles/hud.css` into one clean set of rules, stripping `text-transform: uppercase` and wide letter-spacing from `.hud-directory-item` and `.photo-focus-title` so collection dock titles and inspection captions render in Title Case Helvetica (`"Helvetica Neue", Helvetica, "TeX Gyre Heros", Arial, sans-serif`).
  - Make `.hud-top-right` a flush, sharp-edged segmented control (`gap: 0`, `border-radius: 0`, solid `#FFFFFF`/`#111111` active/inactive contrast).
  - Style `.photo-focus-bar` as a bright, spacious frosted inspection footer (`rgba(244, 244, 242, 0.92)`, `#111111` ink, single-line centered Title Case caption, clean `← PREV` / `NEXT →` / `RETURN [ESC]` controls).
  - Remove the `Paused soundtrack on zoom out` toast banner (`soundtrack-toast`) from `GalleryCanvas.tsx` and `src/styles/wall.css` for quiet transitions.

## Capabilities

### New Capabilities

- (None — all changes refine existing gallery rendering, lighting, and HUD capabilities.)

### Modified Capabilities

- `3d-pbr-wall-and-lighting`: Replace scalloped multi-head hotspots with one wide elliptical cluster wash covering both placard and grid; raise chiaroscuro ambient floor; refine plaster UV repeat (`WALL_TILE_UNITS`) and `uNormalStrength`; add `SoundtrackPlaque` fallback poster and remove the zoom-out pause toast.
- `instanced-photo-renderer`: Increase `PLACARD_GAP` to `0.94u` (`+50px`), balance 4-album walls as 2×2, remove `.dimmed` neighbor ghosting during single-photo inspection, upgrade `.photo-sheen` to 2D elliptical cursor-opposite specular tracking, and add 3D frame side-bevel extrusion with tilt-reactive cast shadows.
- `gallery-hud-and-curator-ui`: Strip `uppercase` overrides from the collection dock and inspection caption, make top-right HUD controls sharp-edged (`border-radius: 0`, `gap: 0`, `#FFFFFF`/`#111111` solid states), and restore the bright frosted inspection bar (`rgba(244, 244, 242, 0.92)` with `#111111` ink).

## Impact

- **Rendering & Lighting:** `src/components/wall/PlaygroundPbrWall.tsx`, `src/lib/lighting/playgroundLighting.ts` (`WALL_SHADER_CFG`, `LIGHT_CFG`), `src/lib/lighting/playgroundTheme.ts`.
- **Layout & Gallery Interaction:** `src/lib/layout/islandLayout.ts`, `src/components/wall/GalleryCanvas.tsx`, `src/components/wall/FramedPrint.tsx`, `src/components/wall/SoundtrackPlaque.tsx`.
- **HUD & Modular Stylesheets:** `src/styles/wall.css`, `src/styles/hud.css` (deduplicated single-pass cleanup).
- **Tests:** Existing unit tests (`playgroundLighting.test.ts`, `islandLayout.test.ts`, `cssBoundaryAudit.test.ts`) updated/verified plus Playwright visual verification checks.
- **Dependencies:** Zero new npm packages. Zero database migrations. Zero API route changes.
