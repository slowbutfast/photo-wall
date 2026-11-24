# Tasks: Gallery Visual Fidelity

## Target Context Map

| File (repo-relative) | Target Line Range | Purpose |
| :--- | :--- | :--- |
| `src/lib/layout/islandLayout.ts` | `L8-L36`, `L168-L229` | Increase `PLACARD_GAP` from `0.44` to `0.94`; add `albumsPerRowForCount(count)` (`2` when `count === 4`, `ALBUMS_PER_ROW` otherwise). |
| `src/lib/lighting/playgroundLighting.ts` | `L36-L75`, `L117-L147`, `L217-L315`, `L382-L418` | Emit 1 elliptical cluster wash fixture per album covering placard + grid; add `ellipseX` to `PlaygroundFixture`, `rawIrradiance()`, and `packFixtureDataTexture()` Row 1 `.w`. |
| `src/lib/lighting/playgroundTheme.ts` | `L28-L65` | Raise `chiaroscuro` ambient floor (`ambientLevel: 0.30`, `wallBase: '#3d3a35'`, softened vignette `rgba(14, 13, 12, 0.38)`). |
| `src/components/wall/PlaygroundPbrWall.tsx` | `L31`, `L90-L136`, `L363-L377` | Set `WALL_TILE_UNITS = 2.2`, `uNormalStrength = 0.4`, `uAoStrength = 0.55`; apply `spotAxis.w` (`ellipseX`) horizontal wash shaping in `FRAGMENT_SHADER`. |
| `src/components/wall/PlaygroundGallery.tsx` | `L463-L475`, `L800-L805`, `L914-L984` | Remove `.soundtrack-toast`; remove `dimmed` class assignment; update `onPointerMove`/`onPointerLeave` to drive 2D opposite-direction glare (`-nx * 38%`, `-ny * 38%`) and tilt-reactive cast shadow vars (`--tilt-sx`, `--tilt-sy`). |
| `src/components/wall/SoundtrackPlaque.tsx` | `L84-L114` | Render styled architectural fallback poster (gradient + track title/artist + circular play badge) whenever thumbnail fails or is pending, eliminating empty black rectangles. |
| `src/app/playground-wall.css` | `L204-L240`, `L373-L450`, `L473-L665`, `L682-L887` | Add 3D frame side-edge extrusion bevels + `--tilt-sx`/`--tilt-sy` shadow math; remove `.photo-frame.dimmed`; replace 1D diagonal `.photo-sheen` with soft 2D elliptical `radial-gradient`; crisp brushed-aluminum placard gradient; flush sharp-edged `.hud-top-right`; Title Case `.hud-directory-item`; light frosted `.photo-focus-bar` (`rgba(244, 244, 242, 0.92)`, `#111111`). |
| `src/app/globals.css` | `L1295-L1405` | Remove conflicting `.hud-top-right`, `.hud-directory-item`, `.photo-focus-title`, and `.soundtrack-toast` uppercase/dark-bar overrides that clobber `playground-wall.css`. |
| `src/lib/lighting/__tests__/playgroundLighting.test.ts` | Full file | Update/add TDD tests for single elliptical cluster wash, `ellipseX` packing, and placard illumination `>= 0.72`. |
| `src/lib/layout/__tests__/islandLayout.test.ts` | Full file | Update/add TDD tests for `PLACARD_GAP === 0.94` and 4-album `2×2` balanced grid layout. |

---

## 1. Test Scaffolding (TDD)

- [ ] 1.1 Update and add failing unit tests in `src/lib/lighting/__tests__/playgroundLighting.test.ts` asserting 1 fixture per album, `ellipseX >= 1` packed in `packFixtureDataTexture` Row 1 `.w`, normalized `placard.lit >= 0.72` (before CSS `.is-lit::after` compositing), and top-row print `lit >=` bottom-row print `lit`.
- [ ] 1.2 Update and add failing unit tests in `src/lib/layout/__tests__/islandLayout.test.ts` asserting `PLACARD_GAP === 0.94`, balanced `2×2` row placement when `albums.length === 4` (while keeping 3 columns for 3 or ≥5 albums), and wide-desktop (`aspect = 1.6`) 4-album entry framing via `entryFirstRowCount(4, 1.6) === 2` so `computeFirstRowBounds` frames only Row 0.

## 2. Layout, Elliptical Cluster Wash & Architectural Plaster Shader

- [ ] 2.1 Update `src/lib/layout/islandLayout.ts` (`PLACARD_GAP = 0.94`, `albumsPerRowForCount(count)`, `entryFirstRowCount(count, aspect)`) and wire `PlaygroundGallery.tsx` (`L468-L471`) Overview entry framing to `entryFirstRowCount(albums.length, aspect)` so wide viewports never include Row 1 in Row-0 framing.
- [ ] 2.2 Refactor `src/lib/lighting/playgroundLighting.ts` to emit 1 wide elliptical cluster wash fixture per album centered over placard + grid, incorporate `ellipseX` into `rawIrradiance()`, and pack `ellipseX` into Row 1 `.w` in `packFixtureDataTexture()`.
- [ ] 2.3 Update `src/lib/lighting/playgroundTheme.ts` (`chiaroscuro.ambientLevel = 0.30`, `wallBase: '#3d3a35'`, softened vignette) and `src/components/wall/PlaygroundPbrWall.tsx` (`WALL_TILE_UNITS = 2.2`, `uNormalStrength = 0.4`, `uAoStrength = 0.55`, GLSL elliptical cone evaluation via `spotAxis.w`).

## 3. Physical Print Inspection, Placard Polish & Soundtrack Poster

- [ ] 3.1 Update `src/components/wall/PlaygroundGallery.tsx`: remove `.dimmed` class on non-focused prints, remove `.soundtrack-toast`, and update `onPointerMove`/`onPointerLeave` to drive opposite-direction 2D `.photo-sheen` translation (`-nx * 38%`, `-ny * 38%`) and tilt-reactive cast shadow custom properties (`--tilt-sx`, `--tilt-sy`).
- [ ] 3.2 Update `src/components/wall/SoundtrackPlaque.tsx` to render an architectural fallback poster (gradient surface + track title/artist + centered circular play button) when thumbnail fails or is loading.
- [ ] 3.3 Update `src/app/playground-wall.css` for 3D frame right/bottom side-bevel extrusion, `--tilt-sx`/`--tilt-sy` shadow layers, pure 2D elliptical `radial-gradient` `.photo-sheen`, removal of `.photo-frame.dimmed`, brushed-aluminum placard gradient/core edge, and `.soundtrack-plaque` fallback poster styling.

## 4. HUD Chrome & Global CSS Cleanup

- [ ] 4.1 Remove conflicting uppercase/rounded/dark-surface HUD overrides from `src/app/globals.css` (`L1295–L1405`).
- [ ] 4.2 Restyle `.hud-top-right` (flush `gap: 0`, `border-radius: 0`, solid `#FFFFFF`/`#111111` active/inactive), `.hud-directory-item` (Title Case Helvetica, `text-transform: none`), and `.photo-focus-bar` (light frosted `rgba(244, 244, 242, 0.92)`, `#111111` ink, Title Case `.photo-focus-title`) in `src/app/playground-wall.css`.

## 5. Verification & Empirical Audit

- [ ] 5.1 Run `npx vitest run`, `npx tsc --noEmit`, and `npm run build` and verify zero failures or regressions.
- [ ] 5.2 Capture post-implementation Playwright screenshots of Overview (`chiaroscuro` & `concrete`), Album Focus, and Single-Photo Inspection (`1440×900`), compare against `research.md` baseline screenshots, and populate `verification.md` with the Requirement Adherence Audit Matrix, resolved assumptions, and verbatim execution logs.
