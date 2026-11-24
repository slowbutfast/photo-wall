# Tasks: Gallery Visual Fidelity

## Target Context Map

*(Re-targeted to post-PR #7 modular files on `main` `00dccdb`.)*

| File (repo-relative) | Target Lines | Purpose |
| :--- | :--- | :--- |
| `src/lib/layout/islandLayout.ts` | `L8-L36`, `L168-L243` | Increase `PLACARD_GAP` from `0.44` to `0.94`; export `albumsPerRowForCount(count)` (`2` when `count === 4`, `ALBUMS_PER_ROW` otherwise) and `entryFirstRowCount(count, aspect)`. |
| `src/lib/lighting/playgroundLighting.ts` | `L36-L90`, `L117-L157`, `L217-L325`, `L382-L428` | Update `WALL_SHADER_CFG` to `{ tileUnits: 2.2, normalStrength: 0.4, aoStrength: 0.55 }`; emit 1 elliptical cluster wash fixture per album covering placard + grid; add `ellipseX` to `PlaygroundFixture`, `rawIrradiance()`, and `packFixtureDataTexture()` Row 1 `.w`. |
| `src/lib/lighting/playgroundTheme.ts` | `L28-L65` | Raise `chiaroscuro` ambient floor (`ambientLevel: 0.30`, `wallBase: '#3d3a35'`, softened vignette `rgba(14, 13, 12, 0.38)`). |
| `src/components/wall/PlaygroundPbrWall.tsx` | `L90-L136`, `L363-L377` | Apply `spotAxis.w` (`ellipseX`) horizontal wash shaping in `FRAGMENT_SHADER` (already reads `WALL_SHADER_CFG` for `uTileSize`, `uNormalStrength`, `uAoStrength`). |
| `src/components/wall/GalleryCanvas.tsx` | `L420-L430`, `L755-L762`, `L810-L855` | Wire Overview entry framing to `entryFirstRowCount(albums.length, aspect)`; remove `.soundtrack-toast`; stop passing `dimmed` to `FramedPrint`. |
| `src/components/wall/FramedPrint.tsx` | `L27-L96` | Remove `dimmed` class; update `onPointerMove`/`onPointerLeave` to drive opposite-direction 2D `.photo-sheen` translation (`-nx * 38%`, `-ny * 38%`) and tilt-reactive cast shadow custom properties (`--tilt-sx`, `--tilt-sy`). |
| `src/components/wall/SoundtrackPlaque.tsx` | `L84-L114` | Render styled architectural fallback poster (gradient + track title/artist + circular play badge) whenever thumbnail fails or is pending, eliminating empty black rectangles. |
| `src/styles/wall.css` | `L396-L416`, `L657-L705`, `L808-L875`, `L960-L1173` | Add 3D frame right/bottom side-bevel extrusion + `--tilt-sx`/`--tilt-sy` shadow math; remove `.photo-frame.dimmed` and `.soundtrack-toast`; replace 1D diagonal `.photo-sheen` with pure 2D elliptical `radial-gradient`; crisp brushed-aluminum placard gradient; `.soundtrack-plaque` fallback poster styling. |
| `src/styles/hud.css` | Full file (`L1-L503` → ~180 lines) | Consolidate and deduplicate the 3 legacy HUD selector blocks into one clean set of rules: flush sharp-edged `.hud-top-right` (`gap: 0`, `border-radius: 0`, solid `#FFFFFF`/`#111111`), Title Case Helvetica `.hud-directory-item` (`text-transform: none`), and light frosted `.photo-focus-bar` (`rgba(244, 244, 242, 0.92)`, `#111111` ink, Title Case `.photo-focus-title`). |
| `src/lib/lighting/__tests__/playgroundLighting.test.ts` | Full file | Update/add TDD tests for `WALL_SHADER_CFG` (`{ tileUnits: 2.2, normalStrength: 0.4, aoStrength: 0.55 }`), single elliptical cluster wash, `ellipseX` packing, and normalized `placard.lit >= 0.72`. |
| `src/lib/layout/__tests__/islandLayout.test.ts` | Full file | Update/add TDD tests for `PLACARD_GAP === 0.94`, 4-album `2×2` balanced grid layout, and `entryFirstRowCount(4, 1.6) === 2`. |

---

## 1. Test Scaffolding (TDD)

- [ ] 1.1 Update and add failing unit tests in `src/lib/lighting/__tests__/playgroundLighting.test.ts` asserting `WALL_SHADER_CFG` equals `{ tileUnits: 2.2, normalStrength: 0.4, aoStrength: 0.55 }`, 1 fixture per album, `ellipseX >= 1` packed in `packFixtureDataTexture` Row 1 `.w`, normalized `placard.lit >= 0.72` (before CSS `.is-lit::after` compositing), and top-row print `lit >=` bottom-row print `lit`.
- [ ] 1.2 Update and add failing unit tests in `src/lib/layout/__tests__/islandLayout.test.ts` asserting `PLACARD_GAP === 0.94`, balanced `2×2` row placement when `albums.length === 4` (while keeping 3 columns for 3 or ≥5 albums), and wide-desktop (`aspect = 1.6`) 4-album entry framing via `entryFirstRowCount(4, 1.6) === 2` so `computeFirstRowBounds` frames only Row 0.

## 2. Layout, Elliptical Cluster Wash & Architectural Plaster Shader

- [ ] 2.1 Update `src/lib/layout/islandLayout.ts` (`PLACARD_GAP = 0.94`, `albumsPerRowForCount(count)`, `entryFirstRowCount(count, aspect)`) and wire `src/components/wall/GalleryCanvas.tsx` (`L422-L423`) Overview entry framing to `entryFirstRowCount(albums.length, aspect)` so wide viewports never include Row 1 in Row-0 framing.
- [ ] 2.2 Update `src/lib/lighting/playgroundLighting.ts` (`WALL_SHADER_CFG = { tileUnits: 2.2, normalStrength: 0.4, aoStrength: 0.55 }`, emit 1 wide elliptical cluster wash fixture per album centered over placard + grid, incorporate `ellipseX` into `rawIrradiance()`, and pack `ellipseX` into Row 1 `.w` in `packFixtureDataTexture()`).
- [ ] 2.3 Update `src/lib/lighting/playgroundTheme.ts` (`chiaroscuro.ambientLevel = 0.30`, `wallBase: '#3d3a35'`, softened vignette) and `src/components/wall/PlaygroundPbrWall.tsx` (GLSL elliptical cone evaluation via `spotAxis.w`).

## 3. Physical Print Inspection, Placard Polish & Soundtrack Poster

- [ ] 3.1 Update `src/components/wall/GalleryCanvas.tsx` (remove `.soundtrack-toast`, stop passing `dimmed`) and `src/components/wall/FramedPrint.tsx` (remove `dimmed` class, drive opposite-direction 2D `.photo-sheen` translation `-nx * 38%` / `-ny * 38%` and tilt-reactive cast shadow custom properties `--tilt-sx` / `--tilt-sy`).
- [ ] 3.2 Update `src/components/wall/SoundtrackPlaque.tsx` to render an architectural fallback poster (gradient surface + track title/artist + centered circular play button) when thumbnail fails or is loading.
- [ ] 3.3 Update `src/styles/wall.css` for 3D frame right/bottom side-bevel extrusion, `--tilt-sx`/`--tilt-sy` shadow layers, pure 2D elliptical `radial-gradient` `.photo-sheen`, removal of `.photo-frame.dimmed` and `.soundtrack-toast`, brushed-aluminum placard gradient/core edge, and `.soundtrack-plaque` fallback poster styling.

## 4. HUD Chrome Deduplication & Restyling (`src/styles/hud.css`)

- [ ] 4.1 Consolidate the 3 legacy duplicate HUD selector blocks inside `src/styles/hud.css` into one clean, non-overlapping set of rules: flush sharp-edged `.hud-top-right` (`gap: 0`, `border-radius: 0`, solid `#FFFFFF`/`#111111` active/inactive), Title Case Helvetica `.hud-directory-item` (`text-transform: none`), and light frosted `.photo-focus-bar` (`rgba(244, 244, 242, 0.92)`, `#111111` ink, Title Case `.photo-focus-title`).

## 5. Verification & Empirical Audit

- [ ] 5.1 Run `npm run typecheck && npm run lint && npx vitest run && npm run build` and verify 100% pass (including `cssBoundaryAudit.test.ts`, `publicBoundaryAudit.test.ts`, and `rawUrlAudit.test.ts`).
- [ ] 5.2 Capture post-implementation Playwright screenshots (`--workers=1`) of Overview (`chiaroscuro` & `concrete`), Album Focus, and Single-Photo Inspection (`1440×900` + `390×844` mobile), compare against `research.md` baseline screenshots, verify all measurable checks in `tests.md`, and populate `verification.md` with the Requirement Adherence Audit Matrix, resolved assumptions, and verbatim execution logs.
