# OpenCode Orchestration Handoff: OpenSpec Change 'gallery-visual-fidelity'

You are the orchestration agent for OpenSpec change `gallery-visual-fidelity` running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

---

## 1. Orchestration Directive
- **Change Name**: `gallery-visual-fidelity`
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub gallery-visual-fidelity`)
- **Feature Branch**: Create and work on `feat/gallery-visual-fidelity` cut from `main` (which already includes PR #6 and PR #7's modular `src/styles/*.css` and decomposed `GalleryCanvas` / `FramedPrint` / `AlbumPlacard` components).
- **Architecture Paradigm**: Vertical Slice / Domain-Owned CSS. Respect `src/lib/__tests__/cssBoundaryAudit.test.ts` (zero cross-domain selectors, zero cross-file duplicate top-level selectors) and `src/lib/__tests__/publicBoundaryAudit.test.ts` (`0 KB` admin code on `/photos`).

---

## 2. Target Context Map

| File Path (relative to repo root) | Target Lines | Modification Summary |
| :--- | :--- | :--- |
| `src/lib/layout/islandLayout.ts` | `L8-L36`, `L168-L243` | Increase `PLACARD_GAP` from `0.44` to `0.94`; export `albumsPerRowForCount(count)` (`2` when `count === 4`, `ALBUMS_PER_ROW` otherwise) and `entryFirstRowCount(count, aspect)`. |
| `src/lib/lighting/playgroundLighting.ts` | `L36-L90`, `L117-L157`, `L217-L325`, `L382-L428` | Update `WALL_SHADER_CFG` to `{ tileUnits: 2.2, normalStrength: 0.4, aoStrength: 0.55 }`; emit **1** wide elliptical cluster wash fixture per album centered horizontally over placard + grid; add `ellipseX` to `PlaygroundFixture`, `rawIrradiance()`, and `packFixtureDataTexture()` Row 1 `.w`. |
| `src/lib/lighting/playgroundTheme.ts` | `L28-L65` | Raise `chiaroscuro` ambient floor (`ambientLevel: 0.30`, `wallBase: '#3d3a35'`, softened vignette `rgba(14, 13, 12, 0.38)`). |
| `src/components/wall/PlaygroundPbrWall.tsx` | `L90-L136`, `L363-L377` | Apply `spotAxis.w` (`ellipseX`) horizontal wash shaping in `FRAGMENT_SHADER` (already reads `WALL_SHADER_CFG` for `uTileSize`, `uNormalStrength`, `uAoStrength`). |
| `src/components/wall/GalleryCanvas.tsx` | `L420-L430`, `L755-L762`, `L810-L855` | Wire Overview entry framing to `entryFirstRowCount(albums.length, aspect)`; remove `.soundtrack-toast`; stop passing `dimmed` to `FramedPrint`. |
| `src/components/wall/FramedPrint.tsx` | `L27-L96` | Remove `dimmed` class; update `onPointerMove`/`onPointerLeave` to drive opposite-direction 2D `.photo-sheen` translation (`-nx * 38%`, `-ny * 38%`) and tilt-reactive cast shadow custom properties (`--tilt-sx`, `--tilt-sy`). |
| `src/components/wall/SoundtrackPlaque.tsx` | `L84-L114` | Render styled architectural fallback poster (gradient surface + track title/artist + circular play badge) whenever thumbnail fails or is loading, eliminating solid black boxes. |
| `src/styles/wall.css` | `L396-L416`, `L657-L705`, `L808-L875`, `L960-L1173` | Add 3D frame right/bottom side-bevel extrusion + `--tilt-sx`/`--tilt-sy` shadow layers; remove `.photo-frame.dimmed` and `.soundtrack-toast`; replace 1D diagonal `.photo-sheen` with pure 2D elliptical `radial-gradient`; crisp brushed-aluminum placard gradient (`#E4E6E8 -> #C2C6CA -> #AEB2B6`, `3px` `#141414` core); `.soundtrack-plaque` fallback poster styling. |
| `src/styles/hud.css` | Full file (`L1-L503` → ~180 lines) | Deduplicate the 3 legacy HUD selector blocks into one clean set of rules: flush sharp-edged `.hud-top-right` (`gap: 0`, `border-radius: 0`, solid `#FFFFFF`/`#111111`), Title Case Helvetica `.hud-directory-item` (`text-transform: none`), and light frosted `.photo-focus-bar` (`rgba(244, 244, 242, 0.92)`, `#111111` ink, Title Case `.photo-focus-title`). |
| `src/lib/lighting/__tests__/playgroundLighting.test.ts` | Full file | Update/add TDD tests for `WALL_SHADER_CFG` (`{ tileUnits: 2.2, normalStrength: 0.4, aoStrength: 0.55 }`), single elliptical cluster wash, `ellipseX` packing, and normalized `placard.lit >= 0.72`. |
| `src/lib/layout/__tests__/islandLayout.test.ts` | Full file | Update/add TDD tests for `PLACARD_GAP === 0.94`, 4-album `2×2` balanced grid layout, and `entryFirstRowCount(4, 1.6) === 2`. |

---

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions**:
  - Pack each cluster's horizontal ellipse stretch `ellipseX` (`>= 1.0`, derived from `islandWidth / islandHeight`) into `uSpotTexture` Row 1 `.w` (`spotAxis.w`) so `rawIrradiance()` (CPU) and `FRAGMENT_SHADER` (GPU) stay 1:1 synchronized with zero extra texture lookups.
  - Derive Overview entry framing row count from `entryFirstRowCount(albums.length, aspect) = Math.min(aspect >= 1.4 ? 3 : aspect >= 0.9 ? 2 : 1, albumsPerRowForCount(albums.length))` so wide desktops frame only Row 0 (`2` albums) on 4-album `2×2` walls.
  - Preserve **Camera**, **Date**, and **Location** in the `PhotoFocusBar` optional manual metadata contract (do not remove `Camera` from the spec).
  - Keep pointer tilt, 2D specular glare, and `--tilt-sx`/`--tilt-sy` updates 100% imperative on `FramedPrint`'s DOM element (zero React re-renders during `pointermove`).
- **Hard Exclusions / No-Go**:
  - Do **NOT** modify `.env`, `.env.*`, or credential files.
  - Do **NOT** introduce new npm dependencies.
  - Do **NOT** re-introduce a `Curate` / lock button on public `/photos` (kept isolated by `admin-route-isolation`).
  - Do **NOT** violate `src/lib/__tests__/cssBoundaryAudit.test.ts` (no HUD rules in `globals.css` or `wall.css`, no duplicate top-level selectors across `globals.css`/`tokens.css`/`wall.css`/`hud.css`/`studio.css`).

---

## 4. Visual & UI Design Specifications & Mandatory Vision Verification

### Key Design Tokens (`openspec/changes/gallery-visual-fidelity/design.md`)
- **Wall & Lighting**:
  - `WALL_SHADER_CFG`: `{ tileUnits: 2.2, normalStrength: 0.4, aoStrength: 0.55 }` (fine architectural plaster, zero coarse stucco craters).
  - `chiaroscuro`: `ambientLevel: 0.30`, `wallBase: '#3d3a35'`, softened vignette `rgba(14, 13, 12, 0.38)` (warm charcoal-taupe `#5A5650`–`#6E6A63` after filmic curve, never pitch black `#0E0E0D`).
  - **Cluster Wash**: `1` wide elliptical overhead wash per album (`innerDeg: 26`, `outerDeg: 54`, `throwFrac: 1.15`, `heightFrac: 1.05`, `hotspotFrac: 0.34`, `ambientObj: 0.56`), centered horizontally across placard + grid (`placard.lit >= 0.72`).
- **Framed Prints (`FramedPrint.tsx` + `src/styles/wall.css`)**:
  - **3D Side-Edge Extrusion**: `border-right: 4px solid #D5D1C8; border-bottom: 5px solid #C6C1B7; border-top: 1px solid rgba(255,255,255,0.9); border-left: 1px solid rgba(255,255,255,0.55);`.
  - **2D Specular Glare (`.photo-sheen`)**: Pure soft elliptical `radial-gradient(ellipse 46% 42% at 50% 50%, rgba(255,255,255,0.38) 0%, rgba(255,253,246,0.14) 44%, rgba(255,253,246,0) 74%)` (NO `135deg` diagonal stripe), translating `translate3d(${(-nx * 38).toFixed(1)}%, ${(-ny * 38).toFixed(1)}%, 0)` opposite cursor tilt in both X and Y.
  - **Tilt-Reactive Cast Shadow**: Layered `box-shadow` adds `var(--tilt-sx, 0px)` and `var(--tilt-sy, 0px)` (computed from `-rotateY * 2.4px` and `rotateX * 2.4px`).
  - **Full-Fidelity Neighbors**: Zero `.dimmed` class; adjacent prints remain at `opacity: 1`, `filter: none`.
- **Placard & Soundtrack Plaque**:
  - `PLACARD_GAP = 0.94u` (`94px`) so placard never photobombs column 0 in single-photo inspection.
  - Brushed aluminum: `linear-gradient(135deg, #E4E6E8 0%, #C2C6CA 55%, #AEB2B6 100%)` with `3px` solid `#141414` bottom/right core edge.
  - Fallback poster in `SoundtrackPlaque`: architectural dark slate gradient (`linear-gradient(145deg, #2A2927 0%, #171615 100%)`) + centered circular play button + muted track title/artist footer (never a flat empty black box).
- **HUD Chrome (`src/styles/hud.css`)**:
  - Top-right `.hud-top-right`: flush sharp-edged (`gap: 0`, `border-radius: 0`, `padding: 0`, `border: 1px solid #111111`), solid `#FFFFFF` + `#111111` active, solid `#111111` + `#FFFFFF` inactive.
  - Collection dock `.hud-directory-item`: Title Case Helvetica (`text-transform: none; letter-spacing: 0;`).
  - Light frosted `.photo-focus-bar`: `background: rgba(244, 244, 242, 0.92); color: #111111; border-top: 1px solid rgba(17, 17, 17, 0.12); backdrop-filter: blur(12px);`, centered Title Case `.photo-focus-title` (`#111111`, `13.5px`, `600`, `text-transform: none`), muted metadata (`rgba(17, 17, 17, 0.62)`).
  - Quiet zoom-out: zero `.soundtrack-toast` element.

### Mandatory Multi-Modal Visual Verification Protocol (Task `5.2`)
You **MUST** run Playwright (`--workers=1`) against `next start`, save post-implementation screenshots to `openspec/changes/gallery-visual-fidelity/assets/after-*.png`, **open and visually inspect every PNG directly**, and compare them side-by-side against the baseline captures in `openspec/changes/gallery-visual-fidelity/assets/existing-*.png` and `playground-*.png`:

1. **Desktop `1440×900` (`DPR = 1`) — 4 States**:
   - `after-overview-chiaroscuro.png` (`/photos?demo=4&mood=chiaroscuro`): verify 2×2 balanced grid, 1 soft elliptical wash per album (zero scalloped double/triple cones), warm charcoal-taupe wall (**mean interstitial RGB `>= 48`**), illuminated placards, styled fallback poster on Tokyo Nocturnes soundtrack plaque, Title Case dock (`textTransform === 'none'`), flush sharp-edged top-right button (`borderRadius === '0px'`).
   - `after-overview-concrete.png` (`/photos?demo=4&mood=concrete`): verify smooth single elliptical wash and balanced 2×2 layout.
   - `after-album-focus.png` (`Tokyo Nocturnes` Album Focus): verify placard clearly lit, `94px` gap to photo grid, fallback poster rendered cleanly.
   - `after-photo-focus.png` (Column 0, Row 0 print in `Tokyo Nocturnes`, pointer hovered at `(0.78w, 0.24h)`): verify fine architectural plaster (no coarse concrete craters), placard does NOT photobomb left edge, sibling `.photo-frame` has `opacity === '1'` and no `.dimmed`, 2D radial glare shifts in both X and Y opposite cursor tilt, `--tilt-sx`/`--tilt-sy` flip sign across corners, visible 3D right/bottom frame bevel, and bright frosted `.photo-focus-bar` (`rgba(244, 244, 242, 0.92)`) with `#111111` Title Case caption.
2. **Mobile `390×844` (`DPR = 2`) — 1 State**:
   - `after-mobile-photo-focus.png`: verify `>= 44px` touch target height on `PREV` / `NEXT` / `RETURN` controls and clean framing.
3. **Programmatic Assertions**:
   - `document.fonts.check('16px "TeX Gyre Heros"') === true`
   - Returning to Overview (`0` or `Overview`) mounts `0` `.soundtrack-toast` nodes.
   - `0` console errors across all 5 states.

---

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: `npx vitest run` (run directly — do **NOT** wrap Vitest with `safe-test`, which OOMs on this suite).
- **TDD Requirement**: Task group `## 1` MUST scaffold failing unit tests (`playgroundLighting.test.ts` and `islandLayout.test.ts`) before modifying implementation code.
- **Targeted Loop Command**:
  ```bash
  npx vitest run src/lib/lighting/__tests__/playgroundLighting.test.ts src/lib/layout/__tests__/islandLayout.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts
  ```
- **Final Regression Gate**:
  ```bash
  npm run typecheck && npm run lint && npx vitest run && npm run build
  ```

---

## 6. Implementation Task Checklist

- [ ] 1.1 Update and add failing unit tests in `src/lib/lighting/__tests__/playgroundLighting.test.ts` asserting `WALL_SHADER_CFG` equals `{ tileUnits: 2.2, normalStrength: 0.4, aoStrength: 0.55 }`, 1 fixture per album, `ellipseX >= 1` packed in `packFixtureDataTexture` Row 1 `.w`, normalized `placard.lit >= 0.72` (before CSS `.is-lit::after` compositing), and top-row print `lit >=` bottom-row print `lit`.
- [ ] 1.2 Update and add failing unit tests in `src/lib/layout/__tests__/islandLayout.test.ts` asserting `PLACARD_GAP === 0.94`, balanced `2×2` row placement when `albums.length === 4` (while keeping 3 columns for 3 or ≥5 albums), and wide-desktop (`aspect = 1.6`) 4-album entry framing via `entryFirstRowCount(4, 1.6) === 2` so `computeFirstRowBounds` frames only Row 0.
- [ ] 2.1 Update `src/lib/layout/islandLayout.ts` (`PLACARD_GAP = 0.94`, `albumsPerRowForCount(count)`, `entryFirstRowCount(count, aspect)`) and wire `src/components/wall/GalleryCanvas.tsx` (`L422-L423`) Overview entry framing to `entryFirstRowCount(albums.length, aspect)` so wide viewports never include Row 1 in Row-0 framing.
- [ ] 2.2 Update `src/lib/lighting/playgroundLighting.ts` (`WALL_SHADER_CFG = { tileUnits: 2.2, normalStrength: 0.4, aoStrength: 0.55 }`, emit 1 wide elliptical cluster wash fixture per album centered over placard + grid, incorporate `ellipseX` into `rawIrradiance()`, and pack `ellipseX` into Row 1 `.w` in `packFixtureDataTexture()`).
- [ ] 2.3 Update `src/lib/lighting/playgroundTheme.ts` (`chiaroscuro.ambientLevel = 0.30`, `wallBase: '#3d3a35'`, softened vignette) and `src/components/wall/PlaygroundPbrWall.tsx` (GLSL elliptical cone evaluation via `spotAxis.w`).
- [ ] 3.1 Update `src/components/wall/GalleryCanvas.tsx` (remove `.soundtrack-toast`, stop passing `dimmed`) and `src/components/wall/FramedPrint.tsx` (remove `dimmed` class, drive opposite-direction 2D `.photo-sheen` translation `-nx * 38%` / `-ny * 38%` and tilt-reactive cast shadow custom properties `--tilt-sx` / `--tilt-sy`).
- [ ] 3.2 Update `src/components/wall/SoundtrackPlaque.tsx` to render an architectural fallback poster (gradient surface + track title/artist + centered circular play button) when thumbnail fails or is loading.
- [ ] 3.3 Update `src/styles/wall.css` for 3D frame right/bottom side-bevel extrusion, `--tilt-sx`/`--tilt-sy` shadow layers, pure 2D elliptical `radial-gradient` `.photo-sheen`, removal of `.photo-frame.dimmed` and `.soundtrack-toast`, brushed-aluminum placard gradient/core edge, and `.soundtrack-plaque` fallback poster styling.
- [ ] 4.1 Consolidate the 3 legacy duplicate HUD selector blocks inside `src/styles/hud.css` into one clean, non-overlapping set of rules: flush sharp-edged `.hud-top-right` (`gap: 0`, `border-radius: 0`, solid `#FFFFFF`/`#111111` active/inactive), Title Case Helvetica `.hud-directory-item` (`text-transform: none`), and light frosted `.photo-focus-bar` (`rgba(244, 244, 242, 0.92)`, `#111111` ink, Title Case `.photo-focus-title`).
- [ ] 5.1 Run `npm run typecheck && npm run lint && npx vitest run && npm run build` and verify 100% pass (including `cssBoundaryAudit.test.ts`, `publicBoundaryAudit.test.ts`, and `rawUrlAudit.test.ts`).
- [ ] 5.2 Capture post-implementation Playwright screenshots (`--workers=1`) of Overview (`chiaroscuro` & `concrete`), Album Focus, and Single-Photo Inspection (`1440×900` + `390×844` mobile), visually inspect every PNG side-by-side against `research.md` baseline screenshots, verify all measurable checks in `tests.md`, and populate `verification.md` with the Requirement Adherence Audit Matrix, visual comparison table, resolved assumptions, and verbatim execution logs.

---

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify all checkboxes in `openspec/changes/gallery-visual-fidelity/tasks.md` are marked `- [x]`. Only tick boxes that genuinely ran and passed.
2. Ensure `openspec/changes/gallery-visual-fidelity/verification.md` is populated with:
   - Executive Summary & Environment
   - Requirement Adherence Audit Matrix (mapping every spec scenario to its verifying test)
   - Side-by-side Visual Verification Table linking `assets/existing-*.png` vs `assets/after-*.png` with measured interstitial RGB luminance, computed-style assertions, 2D glare/shadow delta, and mobile touch-target heights
   - Verbatim Execution Logs
3. Automatically run verification via `openspec-verify-change`.

---

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues**:
  1. Sync specs: `openspec specs apply --change "gallery-visual-fidelity"`.
  2. **Open a Pull Request**:
     - Ensure your work is on `feat/gallery-visual-fidelity`.
     - Stage and commit all implementation code, `openspec/specs`, and change artifacts including `assets/after-*.png` (`git add openspec/changes/gallery-visual-fidelity openspec/specs <implementation-files>`), then push (`git push -u origin HEAD`).
     - Open a Pull Request via `gh pr create --fill` and report the PR URL.
- **If CRITICAL issues, visual defects, or failed tests are detected on initial pass**:
  1. Announce: `"Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."`
  2. Delegate a single-pass repair task to `spec-coder-sub` with the verbatim failure log (or visual defect description) and instructions to make minimal targeted patches, re-run verification & screenshot captures, and update `tasks.md`.
  3. Re-run `openspec-verify-change`.
  4. **If verification passes after repair**: sync specs, commit, push, and open PR via `gh pr create --fill`.
  5. **If verification STILL fails after the single repair pass**: **HALT** and present the Verification Report and remaining blockers to the user.
