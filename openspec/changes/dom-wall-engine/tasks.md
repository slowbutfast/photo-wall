## 1. Test Scaffolding & Blocking Macro Performance Spike (TDD Gate First)

- [ ] 1.1 Capture Playwright component-level reference crops of `playgrounds/photo_wall_playground.html` (one album island at album zoom, one beveled glass placard, one print frame, and edge shadows) across `alabaster`, `concrete`, and `chiaroscuro` as the visual acceptance baseline.
- [ ] 1.2 Scaffold failing Vitest unit tests in `src/lib/lighting/__tests__/lightmap.test.ts` (`RGBA8` `8 texels/u` capped at `2048x2048`, 50 albums / 250+ fixtures, 3D direction `(dirX, dirY)` encoding, out-of-bounds `[0, 1]` UV zero-irradiance fallback) and `src/components/wall/__tests__/useGalleryLighting.test.ts` (pure `--lit*`, `--sx`, `--sy` CSS variables at `0.14u` / `0.22u`).
- [ ] 1.3 Scaffold failing Vitest unit tests in `src/components/wall/__tests__/visibleIslands.test.ts` (pure AABB culling), `src/components/wall/__tests__/zoomTier.test.ts` (projected-size `ceil(cellPx * scale * dpr)` snapped to `256/800/2048`, styling tier switches), `src/components/wall/__tests__/soundtrackState.test.ts` (transparent capture layer lifting on explicit click, wheel/drag forwarding, keep playing in `print`, stop on `overview`/album switch), `src/lib/camera/__tests__/cameraMath.test.ts` (`cameraToCssScale` desktop/mobile + Y-axis flip `cssTop_row0 < cssTop_row1`), and `src/app/api/__tests__/localUploads.test.ts` (`?width=256|800|2048` disk-cached derivatives).
- [ ] 1.4 Run `npx vitest run` on the newly scaffolded tests to confirm they fail before implementation.
- [ ] 1.5 **Blocking Spike (Decoupled from Section 2)**: Build a standalone `?demo=2000` DOM/compositor spike using **real JPEGs** (not offline SVGs) over the playground's static plaster wall background, and have the maintainer benchmark: (a) `p95 frame time <= 16.7ms` during zoom gesture on a named iGPU machine in Chrome, (b) `<= 100ms` settle hitch when `will-change: transform` is removed, and (c) zero tab reloads on a named iPhone/Safari version. Record numbers; if any gate fails, switch macro tier to pre-baked per-island mosaic images before proceeding.

## 2. Local Derivatives, Camera Scale & GPU-Baked `PbrWallCanvas`

- [ ] 2.1 Implement disk-cached `?width=256|800|2048` (and `?height=`) on-demand resizing in `src/app/api/local-uploads/[...path]/route.ts` (preserving the sanitized original file as canonical) until `localUploads.test.ts` passes.
- [ ] 2.2 Add `cameraToCssScale(z, viewportHeightCss, fovDeg)` and Y-axis world-to-CSS helpers (`cssTop = -worldY * 100`) to `src/lib/camera/cameraMath.ts` until `cameraMath.test.ts` passes.
- [ ] 2.3 Implement `src/lib/lighting/lightmap.ts` (GPU offscreen WebGL2 framebuffer bake of additive fixture quads into `RGBA8` at `8 texels/u`, max `2048x2048`, `R` = irradiance, `GB` = 3D `(dirX, dirY)` with `dirZ` reconstructed, `6u` margin + `CLAMP_TO_EDGE`) until `lightmap.test.ts` passes.
- [ ] 2.4 Implement `src/components/wall/PbrWallCanvas.tsx` (full-viewport WebGL2 `<canvas>` loading `wall_{albedo,normal,ao,roughness}.webp` with managed GPU disposal, sampling the GPU-baked lightmap with out-of-bounds ambient clamp + `nyTimeMood` uniforms, synchronized to `cameraToCssScale` & DPR).

## 3. Culling, Pure Lighting, Aspect-Fitted `CssGalleryWorld` & `GalleryViewport`

- [ ] 3.1 Implement `src/components/wall/visibleIslands.ts`, `src/components/wall/useGalleryLighting.ts`, `src/components/wall/zoomTier.ts`, and `src/components/wall/soundtrackState.ts` until `visibleIslands.test.ts`, `useGalleryLighting.test.ts`, `zoomTier.test.ts`, and `soundtrackState.test.ts` pass.
- [ ] 3.2 Implement `src/components/wall/CssGalleryWorld.tsx` (viewport-culled islands positioned via `cssLeft = worldX * 100`, `cssTop = -worldY * 100`, 2D `translate/scale` with no `preserve-3d` on `.world`, `contain: layout` — NOT `contain: paint`, no backdrop-root-breaking properties on `.world`/`.album-island`, gesture-only `will-change: transform`, aspect-fitted frame+mat centered inside each `CELL_SIZE × CELL_SIZE` slot with `thumbHash`/`dominantColor` placeholder, projected-size `256/800/2048` `<img>` URLs, accessible focusable `<button>` prints in `sortOrder` with `alt`, `backdrop-filter` beveled glass placards reusing self-hosted `TeX Gyre Heros`, and `SoundtrackPlaque` using `/api/youtube/thumb/[id]` + native `<iframe>` + transparent gesture capture layer).
- [ ] 3.3 Implement `src/components/wall/GalleryViewport.tsx` (single `cameraMath.ts` controller driving `.world` and `PbrWallCanvas` in lockstep, drag-threshold `moved` detection, keyboard/touch guards) and `src/components/wall/useWallManifest.ts` (adapting `GET /api/wall` + `lodUrl.ts`, refreshing wall + GPU lightmap on Curator mutations).

## 4. Integration, Component-Level Parity Check & R3F Removal

- [ ] 4.1 Wire `GalleryViewport`, `PbrWallCanvas`, `CssGalleryWorld`, `GalleryHud`, `PhotoFocusBar`, and lazy `AdminDrawer` in `src/components/PhotoWallApp.tsx` and `src/app/page.tsx`.
- [ ] 4.2 Capture Playwright screenshots of `dom-wall-engine` at `1920x1080` and `390x844` across all three moods (island, glass placard in album & print focus, portrait+landscape frames, unclipped island-edge shadows, out-of-bounds infinite wall pan) and verify all 5 criteria in `design.md`.
- [ ] 4.3 Delete superseded R3F files (`WallInstancedLayer.tsx`, `VisiblePrintPool.tsx`, `TexturePool.ts`, `textureRuntime.ts`, `wallRuntime.ts`, `SoundtrackOverlay.tsx`, `InfiniteWallShader.tsx`, `CameraRig.tsx`, `PhotoWallCanvas.tsx`, `hitTestWall` and its 7 tests in `cameraMath.test.ts`) and remove `three`, `@types/three`, `@react-three/fiber`, and `troika-three-text` from `package.json` (retaining `thumbhash`).

## 5. Verification & Empirical Audit

- [ ] 5.1 Run full regression suite (`npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`) and confirm zero errors and clean bundle.
- [ ] 5.2 Populate `openspec/changes/dom-wall-engine/verification.md` with Requirement Adherence Audit Matrix, Task 1.5 maintainer spike metrics, component-level parity audit, and verbatim execution logs.
