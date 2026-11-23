## 1. Test Scaffolding & Macro Performance Spike (TDD Gate First)

- [ ] 1.1 Capture Playwright reference screenshots of `playgrounds/photo_wall_playground.html` at `1920x1080` and `390x844` across Macro, Album, and Print views in `alabaster`, `concrete`, and `chiaroscuro` as the visual parity baseline.
- [ ] 1.2 Scaffold failing Vitest unit tests in `src/lib/lighting/__tests__/lightmap.test.ts` (50-album / 250-fixture bake with zero 24-spot cap, UV mapping, top-row > margin irradiance) and `src/components/wall/__tests__/useGalleryLighting.test.ts` (pure CSS variable output `--lit*`, `--sx`, `--sy` at `0.14u` / `0.22u`).
- [ ] 1.3 Scaffold failing Vitest unit tests in `src/components/wall/__tests__/zoomTier.test.ts` (`macro` `< 0.25` → `?width=128`, no blur, flat shadow; `album` → `?width=800`; `print` → `?width=2048`) and `src/components/wall/__tests__/soundtrackState.test.ts` (`pointer-events: none` on drag past threshold / wheel, keep playing in `print` within same album, stop on `overview` or album switch).
- [ ] 1.4 Run `npx vitest run` on the newly scaffolded tests to confirm they fail before implementation.
- [ ] 1.5 Build the minimal `?demo=2000` spike (50 albums / 2,000 macro-tier `<img>`s under a 2D-transformed `.world` + baked-lightmap `PbrWallCanvas`) and benchmark zoom-gesture smoothness in Chrome (iGPU) and iOS Safari. If macro DOM cannot hold ~60fps, activate the pre-baked per-island macro mosaic fallback before proceeding.

## 2. Baked Wall-Space Lightmap & WebGL2 `PbrWallCanvas`

- [ ] 2.1 Implement `src/lib/lighting/lightmap.ts` (`bakeWallLightmap` computing wall-space diffuse irradiance + dominant light direction from `buildWorldFixtures`) until `lightmap.test.ts` passes.
- [ ] 2.2 Implement `src/components/wall/PbrWallCanvas.tsx` (full-viewport WebGL2 `<canvas>` loading `wall_{albedo,normal,ao,roughness}.webp` with managed texture disposal, sampling the baked lightmap + `nyTimeMood` uniforms, synchronized to the shared `cameraMath.ts` state & DPR).

## 3. Pure Lighting Hook, Zoom-Tiered `CssGalleryWorld` & `GalleryViewport`

- [ ] 3.1 Implement `src/components/wall/useGalleryLighting.ts` (pure memoized `(layout, fixtures) ->` per-object `--lit*`, `--sx`, `--sy` CSS variables, zero DOM reads) until `useGalleryLighting.test.ts` passes.
- [ ] 3.2 Implement `src/components/wall/zoomTier.ts` and `src/components/wall/soundtrackState.ts` until `zoomTier.test.ts` and `soundtrackState.test.ts` pass.
- [ ] 3.3 Implement `src/components/wall/CssGalleryWorld.tsx` (absolute positioning from `islandLayout.ts` × `100`, 2D `translate/scale` with no `preserve-3d` on `.world`, `contain: layout paint`, gesture-only `will-change: transform`, true aspect-ratio `<img>` prints inside recessed cotton mats, `backdrop-filter` beveled glass standoff placards, and `SoundtrackPlaque` with native `<iframe>` + `pointer-events: none` during active gestures).
- [ ] 3.4 Implement `src/components/wall/GalleryViewport.tsx` (single world-unit `cameraMath.ts` controller driving `.world` and `PbrWallCanvas` in lockstep, drag-threshold `moved` detection, keyboard & touch guards) and `src/components/wall/useWallManifest.ts` (adapting `GET /api/wall` + `lodUrl.ts`, live updates on Curator mutations).

## 4. Integration, Side-by-Side Parity Check & R3F Removal

- [ ] 4.1 Wire `GalleryViewport`, `PbrWallCanvas`, `CssGalleryWorld`, `GalleryHud`, `PhotoFocusBar`, and lazy `AdminDrawer` in `src/components/PhotoWallApp.tsx` and `src/app/page.tsx`.
- [ ] 4.2 Capture Playwright screenshots of the new `dom-wall-engine` at `1920x1080` and `390x844` across Macro, Album, and Print in all three moods and compare side-by-side against the Task 1.1 playground references.
- [ ] 4.3 Delete superseded R3F files (`WallInstancedLayer.tsx`, `VisiblePrintPool.tsx`, `TexturePool.ts`, `textureRuntime.ts`, `wallRuntime.ts`, `SoundtrackOverlay.tsx`, `InfiniteWallShader.tsx`, `CameraRig.tsx`, `PhotoWallCanvas.tsx`, `hitTestWall` + R3F-only tests/types) and remove `three`, `@types/three`, `@react-three/fiber`, and `troika-three-text` from `package.json`.

## 5. Verification & Empirical Audit

- [ ] 5.1 Run full regression suite (`npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`) and confirm zero errors and clean bundle.
- [ ] 5.2 Populate `openspec/changes/dom-wall-engine/verification.md` with Requirement Adherence Audit Matrix, spike benchmark notes, side-by-side parity screenshots, and verbatim execution logs.
