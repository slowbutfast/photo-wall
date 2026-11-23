## Why

The initial R3F / Three.js renderer in `frontend-gallery-wall` visually diverged from the approved [photo_wall_playground.html](../../../playgrounds/photo_wall_playground.html): it produced flat oval spotlights on a near-black wall, opaque placard boxes lacking frosted glass translucency, forced `1:1` square prints, and WebGL-only complexity (`matrix3d` iframe sync, `troika-three-text`, `TexturePool`, shadow z-fighting). Replacing the R3F rendering layer with a clean React + WebGL2 PBR wall + 2D-transformed CSS DOM world restores the playground's visual realism while reusing 100% of the validated backend, camera math, lighting fixture math, solar moods, HUD, and Curator Drawer.

**Prerequisite:** Apply backend-only `PATCH-01` (`backend-storage-crud`) and merge PR #1 to `main` before applying this change.

## What Changes

- Replace the R3F/Three.js scene with a focused, typed rendering layer (`GalleryViewport`, `PbrWallCanvas`, `CssGalleryWorld`, `useGalleryLighting`, `useWallManifest`) driven by the existing world-unit camera store (`cameraMath.ts`, `100px = 1 world unit`).
- Render the continuous PBR plaster wall (`wall_albedo/normal/ao/roughness.webp`) in a full-viewport WebGL2 `<canvas>` illuminated by a **baked wall-space lightmap** (diffuse irradiance + dominant light direction computed from `buildWorldFixtures` on manifest change, giving `O(1)` per-pixel cost with zero 24-spot cap).
- Absolutely position album islands, true aspect-ratio `<img>` prints inside recessed cotton mats, `backdrop-filter` beveled glass standoff placards, and matte-black YouTube soundtrack plaques directly from `islandLayout.ts` (`computeWallGridPositions` / `computeAlbumGrid` × `100px = 1u`) inside a **2D-transformed** `.world` container (no `preserve-3d` on `.world`; local 3D tilt only on hovered/focused prints).
- Add **Zoom-Tiered LOD** (`macro` `s < 0.25`: `?width=128`, flat shadow, no `backdrop-filter`, hidden placard text, no iframes; `album`: `?width=800`, full shadows, glass blur, soundtrack facade; `print`: `?width=2048` on focused print) plus `contain: layout paint` and gesture-only `will-change: transform`.
- Gate the port with an **early macro-view spike** (50 albums / 2,000 macro-tier `<img>`s + baked lightmap) measured on iGPU Chrome and iOS Safari before full integration.
- Keep `pointer-events: none` on active YouTube `<iframe>`s during pan/drag/wheel gestures (after drag threshold), keeping playback alive across `print` focus in the same album and stopping on `overview` or album change.
- **Remove** `WallInstancedLayer`, `VisiblePrintPool`, `TexturePool`, `textureRuntime`, `wallRuntime`, `SoundtrackOverlay`, `hitTestWall`, and `three` / `@react-three/fiber` / `troika-three-text` once visual parity is verified.

## Capabilities

### New Capabilities
<!-- None — modifies existing gallery capabilities and removes the R3F instanced renderer -->

### Modified Capabilities
- `3d-pbr-wall-and-lighting`: Switch from R3F instanced spotlight quads & `troika-three-text` to WebGL2 `PbrWallCanvas` with baked wall-space lightmap + pure CSS-variable `useGalleryLighting` + `backdrop-filter` beveled glass placards + native DOM YouTube iframe with gesture `pointer-events: none`.
- `instanced-photo-renderer`: Remove R3F instanced mesh / `VisiblePrintPool` / `TexturePool` / `hitTestWall` requirements; replace with Zoom-Tiered DOM LOD (`macro` / `album` / `print`) + `contain: layout paint` + true aspect-ratio `<img>` rendering.
- `spatial-camera-navigation`: Drive both `.world` 2D CSS transform (`100px = 1u`) and `PbrWallCanvas` WebGL2 uniforms from the same `cameraMath.ts` state; rely on native DOM hit-testing instead of `hitTestWall`.
- `gallery-hud-and-curator-ui`: Wire `GalleryHud`, `PhotoFocusBar`, `AdminDrawer`, and `FolderDropzone` to the new `dom-wall-engine` store and verify side-by-side parity against playground reference screenshots.

## Impact

- **Dependencies Removed (after parity verification)**: `three`, `@types/three`, `@react-three/fiber`, `troika-three-text`, `thumbhash` (if no longer needed on wall; keep in uploader if manifest still stores `thumbHash`).
- **Reused Unchanged**: Entire backend (`backend-storage-crud`), `islandLayout.ts`, `lodUrl.ts`, `cameraMath.ts`, `fixtures.ts`, `nyTimeMood.ts`, `GalleryHud.tsx`, `PhotoFocusBar.tsx`, `AdminDrawer.tsx`, `FolderDropzone.tsx`, `folderReader.ts`.
