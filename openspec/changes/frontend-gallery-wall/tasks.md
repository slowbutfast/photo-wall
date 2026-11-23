## 1. Test Scaffolding (TDD)

- [ ] 1.1 Install frontend dependencies (`three`, `@types/three`, `@react-three/fiber@^9`, `troika-three-text`, `zustand`, `exifr`, `thumbhash`, `uuid`, `lucide-react`, `fast-check`, `tailwindcss`) on top of `backend-storage-crud`'s bootstrapped workspace, and bundle OFL `Inter Tight` font files under `public/fonts/`.
- [ ] 1.2 Scaffold failing property tests in `src/lib/camera/__tests__/cameraMath.test.ts` (clamped `zoomToCursor` effective-factor invariance, `bottomInsetPx`-aware `fitBoundsToViewport`, `worldPerPixel`, `O(albums)` + `O(1)` `hitTestWall`).
- [ ] 1.3 Scaffold failing unit tests in `src/lib/lighting/__tests__/fixtures.test.ts` (`buildWorldFixtures` fixture count, top-row > bottom-row irradiance, shadow offset direction).
- [ ] 1.4 Scaffold failing unit tests in `src/components/wall/__tests__/TexturePool.test.ts` (decoded `ImageBitmap` byte accounting, priority eviction order, `bitmap.close()` + `dispose()`) and `src/components/admin/__tests__/folderReader.test.ts` (fake 100-entry paged `FileSystemDirectoryReader` loop).
- [ ] 1.5 Run `npx vitest run` to confirm all newly scaffolded frontend tests fail before implementation.

## 2. Pure Camera, Lighting Math & Design Tokens

- [ ] 2.1 Implement `src/lib/camera/cameraMath.ts` until `cameraMath.test.ts` passes.
- [ ] 2.2 Implement `src/lib/lighting/fixtures.ts` until `fixtures.test.ts` passes.
- [ ] 2.3 Wire `DESIGN.md` tokens (`Chiaroscuro Gallery` colors, `Instrument Sans`, `JetBrains Mono`, `100px = 1 world unit`) into `src/app/layout.tsx` and `src/app/globals.css`.

## 3. 60fps Instanced Renderer & PBR Plaster Wall Spike (Verify Early)

- [ ] 3.1 Create `src/lib/dev/fakeManifest.ts` generating 50 albums / 2,000 photos (`?demo=2000`) using `backend-storage-crud`'s `islandLayout.ts`.
- [ ] 3.2 Implement `src/components/wall/InfiniteWallShader.tsx` rendering the base PBR plaster wall (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`) + **per-album additive spotlight quads** (zero global 24-light cap).
- [ ] 3.3 Implement `src/components/wall/WallInstancedLayer.tsx` (`z = 0.002` wall-plane cast shadows, instanced mats + `32x32` ThumbHash atlas, `aVisible` toggle, CPU-precomputed `litTop/Bot/L/R`) and `troika-three-text` OFL `Inter Tight` brushed-aluminum placards (`z = 0.14`).
- [ ] 3.4 Implement `src/components/wall/TexturePool.ts` (`256 MB` desktop / `96 MB` mobile heuristic, priority eviction, decoded `ImageBitmap` byte accounting, `imageOrientation: 'from-image'`, `<= 2` `initTexture`/frame) until `TexturePool.test.ts` passes.
- [ ] 3.5 Implement `src/components/wall/VisiblePrintPool.tsx` (renders own mat + print + glass glare with shader V-flip, sets `aVisible = 0` on instanced slot so mat+print lift/tilt together) and `CameraRig.tsx` / `PhotoWallCanvas.tsx`.
- [ ] 3.6 Benchmark `?demo=2000` at `1920x1080` and confirm `p95 frame time <= 16.7ms`, `< 256 MB` GPU memory, and all 50 albums lit before proceeding to Section 4.

## 4. State, Quiet Gallery HUD & Lazy Curator UI

- [ ] 4.1 Create `src/store/useWallStore.ts` consuming `GET /api/wall` (compact photos + `cdnBase`), lazy `GET /api/albums/[id]/photos` (detail EXIF/captions on focus), and `GET /api/admin/auth` session status.
- [ ] 4.2 Implement `src/components/hud/GalleryHud.tsx` (lock-gated `Curate` icon until authenticated, `Overview`, bottom Exhibition Room Directory) and `src/components/hud/PhotoFocusBar.tsx` (bottom-anchored `Prev` / `Next`, title, allowlisted EXIF, `Return`).
- [ ] 4.3 Implement `src/components/admin/folderReader.ts` (until `folderReader.test.ts` passes), `src/components/admin/FolderDropzone.tsx` (`exifr`, `32px` ThumbHash, UUIDv7, XHR `upload.onprogress`, explicit `PATCH` publish on all-success, per-file retry + draft Resume/Discard on partial failure), and `src/components/admin/AdminDrawer.tsx` loaded via `next/dynamic`.
- [ ] 4.4 Assemble `src/components/PhotoWallApp.tsx` and `src/app/page.tsx` hydrating initial `getWallSummary()`.

## 5. Verification & Empirical Audit

- [ ] 5.1 Run full regression suite (`npx vitest run`, `npm run lint`, `npx tsc --noEmit`, `npm run build`) and confirm `AdminDrawer` is code-split from the public bundle.
- [ ] 5.2 Execute visual acceptance checks at fixed Macro Overview, Album Focus, and Print Focus cameras + `?demo=2000` benchmark + `>110`-photo folder drop, and populate `verification.md` with Requirement Adherence Audit Matrix, resolved assumptions, and verbatim execution logs.
