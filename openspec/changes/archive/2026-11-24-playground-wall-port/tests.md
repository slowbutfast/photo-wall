# Tests: `playground-wall-port`

## Automated Tests

1. **Spot Culling, Data-Texture Packing, Exact `LIGHT_CFG` & 1px Layout Golden Tests (`vitest`)**:
   - Command: `npx vitest run src/lib/lighting/__tests__/playgroundLighting.test.ts src/lib/layout/__tests__/islandLayout.test.ts src/components/wall/__tests__/visibleIslands.test.ts src/components/wall/__tests__/zoomTier.test.ts`
   - Verifies:
     - `selectVisibleSpots(fixtures, camera, viewport, 128)` culls off-screen spots and caps at 128.
     - `packFixtureDataTexture(spots)` writes Row 0 (`0..N*4`) = `pos` and Row 1 (`N*4..2*N*4`) = `axis` (catching interleaved layout bugs in unit tests).
     - `computePlaygroundLighting` preserves `ambientObj: 0.42`, `throwFrac: 0.72`, `14px`/`22px` depths, and top-row > bottom-row irradiance.
     - Golden test: for the playground's 4 demo albums (12/15/12/16 counts), `islandLayout` cell centers match the playground's DOM-measured cell centers within `1px`.
     - `visibleIslands` omits off-screen islands, and `resolveProjectedLodWidth(800, 1, 2)` returns `2048`.
2. **Camera, Macro Mosaic, Atomic Local Derivatives & Dropzone Tests (`vitest`)**:
   - Command: `npx vitest run src/lib/camera/__tests__/cameraMath.test.ts src/components/wall/__tests__/macroMosaic.test.ts src/app/api/__tests__/localUploads.test.ts src/components/admin/__tests__/folderReader.test.ts`
   - Verifies aspect-aware Row-0 framing (`3 / 2 / 1` albums + `bottomInsetPx`), `overviewNonce` reset, `?demo=2000` → `1000` fallback, `macroMosaic` plan, atomic temp-file rename in `local-uploads` derivative cache, and `FolderDropzone` recovering cleanly when >20 files are dropped.
3. **Playwright Real-Click, Macro Guard & `pixelmatch` Visual Parity Gate**:
   - Real `page.mouse.click` on `.museum-placard` opens Album Focus; real `page.mouse.click` on `.photo-frame` opens Print Focus; manual wheel-out + `OVERVIEW` / `0` returns to Row 0; Tab focus never scrolls the `overflow: hidden` viewport.
   - At `scale < 0.25` (`?demo=1000`), verify zero `backdrop-filter`, zero iframes, and mosaic canvases only (preserving `<= 100ms` settle hitch; physical iGPU/iPhone hardware run remains a maintainer check).
   - With `?demo=4` reproducing the playground's exact 4 albums (same titles, 12/15/12/16 counts, same `PALETTES` art) at pinned cameras and `?mood=chiaroscuro|concrete|alabaster`, run `pixelmatch` on the wall-canvas region against `playgrounds/photo_wall_playground.html` (asserting mismatch below threshold) AND save side-by-side PNG composites for human review.
4. **Full Regression, Typecheck, Lint & Build**:
   - Command: `npx vitest run && npm run typecheck && npm run lint && npm run build`
