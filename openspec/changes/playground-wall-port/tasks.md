## 1. Test Scaffolding (TDD)

- [ ] 1.1 Scaffold failing Vitest unit tests in `src/lib/lighting/__tests__/playgroundLighting.test.ts` (exact `LIGHT_CFG`/`rawIrradiance` top > bottom falloff, `14px`/`22px` standoff shadow vectors, 24-spot chunking across 50 albums), `src/lib/layout/__tests__/islandLayout.test.ts` (`PLACARD_GAP = 0.44`, `ISLAND_GAP = 2.2`, `MAX_PHOTOS_PER_ALBUM = 20`), `src/components/wall/__tests__/visibleIslands.test.ts`, `src/lib/camera/__tests__/cameraMath.test.ts` (`cameraToCssScale`, Y-axis flip, `computeFirstRowBounds`), and `src/app/api/__tests__/localUploads.test.ts` (`?width=256|800|2048` disk-cached derivatives).
- [ ] 1.2 Run `npx vitest run` on the newly scaffolded tests to confirm they fail before implementation.

## 2. Verbatim Playground CSS, WebGL2 PBR Shader & Pure Lighting Extraction

- [ ] 2.1 Extract `playgrounds/photo_wall_playground.html`'s exact wall, placard (`.mat-glass` default + `.mat-aluminum`, `.mat-acrylic`, `.mat-rag`), `.soundtrack-plaque`, `.photo-frame.is-lit`, `.is-lit::after`, cast shadow, hover tilt/glare, Swiss HUD, compact dock, and Focus Bar CSS verbatim into `src/app/playground-wall.css` (scoped cleanly under `.playground-wall-root`, stripping only the debug sidebar and top demo banner).
- [ ] 2.2 Implement `src/lib/lighting/playgroundLighting.ts` (verbatim `LIGHT_CFG` & `rawIrradiance` computed purely from layout geometry + 24-spot chunk helper) and `src/components/wall/PlaygroundPbrWall.tsx` (verbatim WebGL2 PBR plaster shader from `playgrounds/photo_wall_playground.html` with additive 24-spot chunk passes for >24 visible spots and exact `alabaster`/`concrete`/`chiaroscuro` palettes) until `playgroundLighting.test.ts` passes.
- [ ] 2.3 Update `src/lib/layout/islandLayout.ts` (`PLACARD_GAP = 0.44`, `ISLAND_GAP = 2.2`, `MAX_PHOTOS_PER_ALBUM = 20`), `src/lib/camera/cameraMath.ts` (`cameraToCssScale`, Y-axis flip, `computeFirstRowBounds`), `src/components/wall/visibleIslands.ts`, and `src/app/api/local-uploads/[...path]/route.ts` (disk-cached `sharp` `?width=256|800|2048` derivatives) until `islandLayout.test.ts`, `cameraMath.test.ts`, `visibleIslands.test.ts`, and `localUploads.test.ts` pass.

## 3. Playground Gallery Wiring, Native YouTube & Backend Integration

- [ ] 3.1 Implement `src/components/wall/PlaygroundGallery.tsx` mounting the playground's exact DOM structure wired to `GET /api/wall` (plus `?demo=4` matched mixed-aspect fixture, `?demo=1000` 50×20 fixture with unknown numeric `?demo=` fallback to `1000`, and `?mood=` query pin), Row-0 default framing + `overviewNonce` reset, drag-threshold `setPointerCapture` (>5px so real desktop clicks work), projected-size `256/800/2048` `<img>` URLs, macro zoom guard (`scale < 0.25`), and native YouTube `.soundtrack-plaque` (`/api/youtube/thumb/[id]`, transparent gesture capture layer, `Paused soundtrack on zoom out` toast).
- [ ] 3.2 Wire `PlaygroundGallery`, Swiss HUD / compact dock, `PhotoFocusBar`, `suncalc` `nyTimeMood`, and lazy `AdminDrawer` (with Settings placard-material selector: `mat-glass` / `mat-aluminum` / `mat-acrylic` / `mat-rag` and live refresh on publish/edit/delete) in `src/components/PhotoWallApp.tsx` and `src/app/page.tsx`.

## 4. Visual Parity Sign-Off & R3F Cleanup

- [ ] 4.1 Capture side-by-side Playwright PNG composites (**left**: `playgrounds/photo_wall_playground.html`, **right**: Next.js `PlaygroundGallery` at `?demo=4&mood=chiaroscuro|concrete|alabaster`) plus a real `page.mouse.click` + `Overview`/`0` reset test, and inspect visually to confirm 1:1 chiaroscuro contrast, glass placard translucency + standoff pins, top-to-bottom mat falloff, and Swiss HUD parity.
- [ ] 4.2 Delete superseded R3F files (`WallInstancedLayer.tsx`, `VisiblePrintPool.tsx`, `TexturePool.ts`, `textureRuntime.ts`, `wallRuntime.ts`, `SoundtrackOverlay.tsx`, `InfiniteWallShader.tsx`, `CameraRig.tsx`, `PhotoWallCanvas.tsx`, `hitTestWall` + its 7 tests) and remove `three`, `@types/three`, `@react-three/fiber`, and `troika-three-text` from `package.json`.

## 5. Verification & Empirical Audit

- [ ] 5.1 Run full regression suite (`npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`) and confirm zero errors.
- [ ] 5.2 Populate `openspec/changes/playground-wall-port/verification.md` with Requirement Adherence Audit Matrix, side-by-side visual parity composites, and verbatim execution logs.
