# Verification Plan: Gallery Visual Fidelity

## Automated Tests

- `npx vitest run src/lib/lighting/__tests__/playgroundLighting.test.ts`:
  - Verifies `computePlaygroundLighting(albums)` emits exactly **1** elliptical wash fixture per album (no multi-head scalloped track fixtures).
  - Verifies each fixture carries `ellipseX >= 1` packed into `packFixtureDataTexture()` Row 1 `.w` (`data[count * 4 + i * 4 + 3]`).
  - Verifies each album's placard `PlaygroundShadedObject.lit` (normalized `0..1` irradiance output emitted to `--lit` before CSS `.is-lit::after` compositing) is `>= 0.72` and top-row print `lit` remains `>=` bottom-row print `lit`.
- `npx vitest run src/lib/layout/__tests__/islandLayout.test.ts`:
  - Verifies `PLACARD_GAP === 0.94` (`94px`).
  - Verifies `computeWallGridPositions` arranges exactly `4` published albums into a balanced `2×2` grid (2 distinct Y rows, 2 albums per row) while keeping `3` albums in `1×3` and `5+` albums in `3`-column rows.
  - Verifies wide-desktop (`aspect = 1.6`) entry framing for 4 albums derives `firstRowCount = 2` via `albumsPerRowForCount(4)` so `computeFirstRowBounds` covers only Row 0 (`y` matches Row 0's vertical span, never Row 1).
- `npx vitest run`:
  - Full unit test suite passes with zero regressions across `cameraMath`, `visibleIslands`, `macroMosaic`, `soundtrackState`, and `islandPlacement`.
- `npm run build` & `npx tsc --noEmit`:
  - Production Next.js build and TypeScript typecheck pass cleanly with zero warnings or errors.

## Manual Verification

Capture matrix & reproducible acceptance criteria (side-by-side against baseline screenshots in `research.md` (`assets/existing-*.png`), with reviewer sign-off recorded in `verification.md`):

- **Capture Matrix**:
  - Desktop `1440×900` (`DPR = 1`):
    1. `/photos?demo=4&mood=chiaroscuro` — Overview (settled after initial flight).
    2. `/photos?demo=4&mood=concrete` — Overview (settled).
    3. `/photos?demo=4&mood=chiaroscuro` — Album Focus (`Tokyo Nocturnes`).
    4. `/photos?demo=4&mood=chiaroscuro` — Single-Photo Inspection (column 0, row 0 print in `Tokyo Nocturnes`, pointer hovered at `(0.78w, 0.24h)` of focused frame).
  - Mobile `390×844` (`DPR = 2`):
    5. `/photos?demo=4&mood=chiaroscuro` — Single-Photo Inspection verifying `>= 44px` touch target height on `PREV`/`NEXT`/`RETURN`.
- **Measurable Acceptance Checks**:
  - **Wall Tone & Single Cluster Wash**: Sample interstitial wall pixels outside album light pools in `chiaroscuro` Overview — mean RGB channel value `>= 48` (warm charcoal-taupe, not near-black `#0E0E0D`); visually verify against `assets/existing-overview-chiaroscuro.png` that scalloped 2–3-hotspot cones are replaced by 1 continuous elliptical wash illuminating both placard and print grid.
  - **2×2 Layout & Row-0 Entry Framing**: On `1440×900` `?demo=4`, verify 2 islands on Row 0 and 2 islands on Row 1, with Row 0 centered horizontally and no orphaned 4th island.
  - **Placard Separation & Neighbor Fidelity**: In `1440×900` Single-Photo Inspection of column 0, verify `getBoundingClientRect()` of `.museum-placard` does not intersect the focused print's horizontal band (or viewport left edge overlap reduced vs. `assets/existing-photo-focus.png`), and assert `getComputedStyle(sibling).opacity === '1'` and `!sibling.classList.contains('dimmed')` on every non-focused `.photo-frame`.
  - **2D Glare, 3D Bevel & Tilt Shadow**: Moving pointer horizontally and vertically across the focused frame updates `.photo-sheen` transform along both X and Y opposite the tilt angle and updates `--tilt-sx` / `--tilt-sy`; visual side-by-side vs. `assets/existing-photo-focus.png` confirms fine plaster grain and visible right/bottom frame depth bevel.
  - **HUD Chrome & Quiet Zoom-Out**: Assert `getComputedStyle(dockItem).textTransform === 'none'`, `getComputedStyle(topRightBtn).borderRadius === '0px'`, `.photo-focus-bar` computed background matches light frosted `rgba(244, 244, 242, 0.92)` with `#111111` Title Case caption, failed YouTube thumbnail renders the styled fallback poster (non-uniform pixels + play circle), and returning to Overview mounts `0` `.soundtrack-toast` nodes.
