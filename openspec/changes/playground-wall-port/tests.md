# Tests: `playground-wall-port`

## Automated Tests

1. **Playground Lighting, Layout & Culling Unit Tests (`vitest`)**:
   - Command: `npx vitest run src/lib/lighting/__tests__/playgroundLighting.test.ts src/lib/layout/__tests__/islandLayout.test.ts src/components/wall/__tests__/visibleIslands.test.ts`
   - Verifies:
     - `computePlaygroundLighting` produces exact `rawIrradiance` top > bottom falloff and `--sx`/`--sy` offsets at `14px` (placard) and `22px` (prints), plus 24-spot chunking across 50 albums (>100 fixtures).
     - `PLACARD_GAP = 0.44` (`44px`) between placard and grid vs `ISLAND_GAP = 2.2` (`220px`) between islands, and `MAX_PHOTOS_PER_ALBUM = 20`.
     - `visibleIslands` culls off-screen islands cleanly.
2. **Camera, Overview Reset, Local Derivatives & Demo Fallback Tests (`vitest`)**:
   - Command: `npx vitest run src/lib/camera/__tests__/cameraMath.test.ts src/app/api/__tests__/localUploads.test.ts`
   - Verifies `cameraToCssScale`, Y-axis flip (`cssTop_row0 < cssTop_row1`), `computeFirstRowBounds`, `overviewNonce` reset, `?demo=2000` fallback to `1000`, and `/api/local-uploads/[...path]?width=256|800|2048` disk-cached derivatives.
3. **Playwright Real-Click & Side-by-Side Visual Parity Check**:
   - Real `page.mouse.click` on `.museum-placard` opens Album Focus; real `page.mouse.click` on `.photo-frame` opens Print Focus; manual wheel-out followed by clicking `OVERVIEW` (or pressing `0`) returns to Row 0.
   - Capture side-by-side PNG composites (**left**: `playgrounds/photo_wall_playground.html`, **right**: Next.js `PlaygroundGallery` at `?demo=4&mood=chiaroscuro|concrete|alabaster`) at `1600×1000` and `1920×1080` and inspect visually to confirm 1:1 lighting contrast, glass placard translucency + standoff pins, top-to-bottom mat falloff, and Swiss HUD parity.
4. **Full Regression, Typecheck, Lint & Build**:
   - Command: `npx vitest run && npm run typecheck && npm run lint && npm run build`
