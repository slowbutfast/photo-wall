## 1. Test Scaffolding (TDD)

- [x] 1.1 Branch from `main` (which now includes merged `dom-wall-engine` at `9d8e277`) into `feat/playground-wall-port` and install `pixelmatch` (`@types/pixelmatch`) as a devDependency.
- [x] 1.2 Scaffold failing Vitest unit tests in `src/lib/lighting/__tests__/playgroundLighting.test.ts` (`selectVisibleSpots`, row-major `packFixtureDataTexture`, exact `LIGHT_CFG` with `ambientObj: 0.42`, `throwFrac: 0.72`, `14`/`22` depths), `src/lib/layout/__tests__/islandLayout.test.ts` (1px golden cell-center match against the playground's 4 demo albums), and `src/app/api/__tests__/localUploads.test.ts` (atomic temp-file rename for derivative cache writes).
- [x] 1.3 Run `npx vitest run` on the newly scaffolded tests to confirm they fail before implementation.

## 2. Verbatim Playground CSS, Single-Pass WebGL2 Shader & Lighting Extraction

- [x] 2.1 Extract `playgrounds/photo_wall_playground.html` (`dcc7a048`) exact wall, placard (real classes `.mat-acrylic` default, `.mat-aluminum`, `.mat-foamcore`), `.soundtrack-plaque`, `.photo-frame.is-lit`, `.is-lit::after`, cast shadow, hover tilt/glare, Swiss HUD, compact dock, and Focus Bar CSS verbatim into `src/app/playground-wall.css` (converting `#wallViewport`/`#wallWorld` IDs to classes under `.playground-wall-root`, dropping world `preserve-3d`/sway while keeping local `perspective` + `preserve-3d` on `.photo-frame`, stripping only debug sidebar & top demo banner).
- [x] 2.2 Implement `src/lib/lighting/playgroundLighting.ts` (exact `LIGHT_CFG` + `rawIrradiance` + `selectVisibleSpots` + row-major `packFixtureDataTexture`) and `src/components/wall/PlaygroundPbrWall.tsx` (single-pass verbatim playground WebGL2 PBR shader with `RGBA32F` spot data texture `<= 128` culled spots, single filmic curve, `applyTheme()` mood uniforms, and idle-stop rAF) until `playgroundLighting.test.ts` passes.

## 3. Playground Gallery Wiring & Open PR #2 Quality Fixes

- [x] 3.1 Implement `src/components/wall/PlaygroundGallery.tsx` reusing `macroMosaic.ts` (at `scale < 0.25`), `visibleIslands.ts`, `zoomTier.ts`, `cameraMath.ts` (aspect-aware Row-0 `3 / 2 / 1` framing + `bottomInsetPx`), `soundtrackState.ts`, deferred `setPointerCapture` (>5px), and `overviewNonce`, wired to `GET /api/wall` and `useWallManifest` (`initialManifest`, `manifestUrl` seam for `admin-route-isolation`).
- [x] 3.2 Close open PR #2 review items: zoom-relative snapshot threshold, prevent entry framing re-firing on resize or manifest refresh, prevent Tab focus scrolling the `overflow: hidden` viewport, fix `FolderDropzone` stuck state when >20 files are dropped, and make `local-uploads` derivative cache writes atomic (temp file + rename).
- [x] 3.3 Update `?demo=4` in `src/lib/dev/fakeManifest.ts` to reproduce the playground's exact 4 albums (12/15/12/16 counts, same titles, same `PALETTES` sample art) and keep `?demo=2000` → `1000` fallback + `?mood=` query pin; wire Settings placard selector (`Beveled Glass` → `mat-acrylic`, `Brushed Aluminum` → `mat-aluminum`, `Archival Foamcore` → `mat-foamcore`) in `AdminDrawer` (without changing HUD auth behavior).
- [x] 3.4 Delete superseded PR #2 renderer files (`PbrWallCanvas.tsx`, `CssGalleryWorld.tsx`, `lightmap.ts` and their obsolete tests).

## 4. Automated `pixelmatch` Parity, Macro Gate & Verification

- [x] 4.1 Run Playwright parity check with `?demo=4&mood=chiaroscuro|concrete|alabaster` against `playgrounds/photo_wall_playground.html` (`dcc7a048`): verify `pixelmatch` threshold on the wall-canvas region, save side-by-side PNG composites for human review, verify real `page.mouse.click` + `Overview`/`0` reset + Tab-scroll guard, and re-confirm `?demo=1000` macro mosaic settle hitch `<= 100ms` (keeping physical iGPU/iPhone hardware run explicitly noted for maintainer).
- [x] 4.2 Run full regression suite (`npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`) and populate `openspec/changes/playground-wall-port/verification.md` with Requirement Adherence Audit Matrix, `pixelmatch` numbers, side-by-side composites, and verbatim execution logs.

> Note: the pinned `?demo=1000` settle-hitch gate (`<= 100ms`) remains a physical iGPU/iPhone maintainer check, as the handoff permits; headless software WebGL is not a valid hardware performance signal. The automated macro-DOM gate (18 mosaics, 0 frames/iframes/backdrop filters) passed.
