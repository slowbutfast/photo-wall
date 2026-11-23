## Why

The initial R3F / Three.js renderer in `frontend-gallery-wall` visually diverged from the approved [photo_wall_playground.html](../../../playgrounds/photo_wall_playground.html): it produced flat oval spotlights on a near-black wall, opaque placard boxes lacking frosted glass translucency, forced `1:1` square prints, and WebGL-only complexity (`matrix3d` iframe sync, `troika-three-text`, `TexturePool`, shadow z-fighting). Replacing the R3F rendering layer with a clean React + WebGL2 PBR wall + 2D-transformed CSS DOM world restores the playground's visual realism while reusing 100% of the validated backend, camera math, lighting fixture math, solar moods, self-hosted `TeX Gyre Heros` fonts, HUD, and Curator Drawer.

**Prerequisite:** Apply backend-only `PATCH-01` (`backend-storage-crud`) and merge PR #1 to `main` (then re-validate deltas against the merged `openspec/specs/`) before branching and implementing this change.

## What Changes

- Replace the R3F/Three.js scene with a focused, typed rendering layer (`GalleryViewport`, `PbrWallCanvas`, `CssGalleryWorld`, `useGalleryLighting`, `useWallManifest`) driven by the existing world-unit camera store (`cameraMath.ts`, `100px = 1 world unit`, `cameraToCssScale`, `cssTop = -worldY * 100`), defaulting on initial load (and `Overview` / `0`) to **row 0 (the first 3 albums fitting horizontally across the screen)** rather than zooming out to all albums at once.
- Render the continuous PBR plaster wall (`wall_albedo/normal/ao/roughness.webp`) in a full-viewport WebGL2 `<canvas>` illuminated by a **GPU-baked wall-space lightmap** (`RGBA8`, `8 texels/u`, capped at `2048 × 2048`, storing normalized irradiance + 3D light direction `(dirX, dirY)` with `dirZ` reconstructed, `6u` margin + `CLAMP_TO_EDGE` + out-of-bounds ambient clamp).
- Render **viewport-culled** album islands (`visibleIslands`) positioned from `islandLayout.ts` inside a 2D-transformed `.world` container (`contain: layout`, no `contain: paint`, no `preserve-3d` on `.world`, no backdrop-root-breaking properties on `.world`/`.album-island`), with aspect-fitted frames and recessed cotton mats centered inside each `CELL_SIZE × CELL_SIZE` grid cell, `thumbHash`/`dominantColor` loading placeholders, accessible focusable `<button>` prints in `sortOrder`, `backdrop-filter` beveled glass standoff placards, and `/api/youtube/thumb/[id]`-proxied YouTube soundtrack plaques with a transparent gesture capture layer.
- Compute image LOD widths from **projected size** (`ceil(cellPx * scale * DPR)` snapped to backend buckets **`256 / 800 / 2048`**) paired with disk-cached `?width=` derivative resizing in `/api/local-uploads/[...path]` for `STORAGE_DRIVER=local`, while zoom tiers (`macro` `scale < 0.25`, `album`, `print`) control styling switches.
- Gate the port with a **blocking, decoupled Task Group 1 macro spike** using **real JPEGs** (`p95 <= 16.7ms`, settle hitch `<= 100ms`, zero iPhone/Safari tab reloads).
- **Remove** `WallInstancedLayer`, `VisiblePrintPool`, `TexturePool`, `textureRuntime`, `wallRuntime`, `SoundtrackOverlay`, `hitTestWall`, and `three` / `@react-three/fiber` / `troika-three-text` once component-level visual acceptance passes (retaining `thumbhash`).

## Capabilities

### New Capabilities
<!-- None — modifies existing gallery capabilities and removes the R3F instanced renderer -->

### Modified Capabilities
- `3d-pbr-wall-and-lighting`: Rename & modify wall/placard requirements to WebGL2 `PbrWallCanvas` with GPU-baked `RGBA8` wall-space lightmap + pure CSS-var `useGalleryLighting` + `backdrop-filter` beveled glass placards (with strict backdrop-root rules) + `/api/youtube/thumb/[id]` & transparent gesture capture layer.
- `instanced-photo-renderer`: Remove R3F instanced mesh / `VisiblePrintPool` / `TexturePool` / `hitTestWall`; add viewport-culled, projected-size LOD (`256/800/2048`) DOM world with local-mode derivatives, aspect-fitted centered frames/mats, `contain: layout`, blocking macro performance targets, and keyboard/a11y order.
- `spatial-camera-navigation`: Preserve cursor-anchored zoom scenario verbatim; define `cameraToCssScale` + Y-axis flip (`cssTop = -worldY * 100`) driving `.world` and `PbrWallCanvas` in lockstep.
- `gallery-hud-and-curator-ui`: Preserve lock-gated Curator scenario verbatim; wire live wall & GPU lightmap refresh on Curator Drawer publish/edit/delete.

## Impact

- **Dependencies Added**: `sharp` (strictly for read-time disk-cached `?width=256|800|2048` derivatives in `local-uploads`, never modifying canonical sanitized originals).
- **Dependencies Retained**: `thumbhash` (macro/loading placeholders), self-hosted `@font-face` `TeX Gyre Heros`.
- **Dependencies Removed (after acceptance verification)**: `three`, `@types/three`, `@react-three/fiber`, `troika-three-text`.
- **Reused Unchanged**: Entire backend (`backend-storage-crud`), `islandLayout.ts`, `lodUrl.ts`, `cameraMath.ts` (minus `hitTestWall`), `fixtures.ts`, `nyTimeMood.ts`, `GalleryHud.tsx`, `PhotoFocusBar.tsx`, `AdminDrawer.tsx`, `FolderDropzone.tsx`, `folderReader.ts`.

### Revision: 2026-11-23 21:05 UTC
- **Feedback Source**: Two-Agent PR #1 vs. Playground Visual Audit & User Decisions
- **Key Changes**:
  - `3d-pbr-wall-and-lighting`: Added `wall_albedo` desaturation + macro normal-map attenuation, `3500K` `#FFF5E6` pools with `~35–45%` inter-cluster ambient contrast, zoom-out pause toast, and **Beveled Glass Standoff** default with **Brushed Aluminum / Matte Black / Rag Paper** alternatives in Curator Settings.
  - `instanced-photo-renderer`: Locked `MAX_PHOTOS_PER_ALBUM = 20` (`4–5` cols), raised `ISLAND_GAP` to `2.2u` (`220px`), added `#F4F4F2` frame + downward drop shadow + `0.45` print-focus periphery dimming.
  - `gallery-hud-and-curator-ui` / `design.md`: Restored Swiss-label HUD (`11px`, `500`, `uppercase`, `0.1em` tracking, `24px`-inset 1-or-2 segment control), compact centered dock (`max-width: min(760px, calc(100vw - 48px))`, `blur(8px)`, edge fade masks), tracked uppercase Focus Bar, and `?demo=4&mood=` pinned 4-album mixed-aspect parity fixture (`50 × 20 = 1,000` stress fixture).

### Revision: 2026-11-23 20:22 UTC
- **Feedback Source**: Two-Agent Peer Review Audit
- **Key Changes**:
  - `specs/`: Added `RENAMED Requirements` for `3d-pbr-wall-and-lighting`; restored verbatim surviving scenarios in `spatial-camera-navigation` and `gallery-hud-and-curator-ui`; restored numeric macro frame-time/settle/iOS gates; added `visibleIslands` culling, projected-size `256/800/2048` LOD, local-mode `?width=` derivatives, centered aspect-fitted frame+mat inside `CELL_SIZE` slot, `contain: layout` (not `contain: paint`), backdrop-root rules, `/api/youtube/thumb/[id]` proxy, transparent iframe capture layer, and a11y Tab/`alt` scenario.
  - `architecture.md`: Defined `cameraToCssScale`, Y-axis flip (`cssTop = -worldY * 100`), GPU-baked `RGBA8` `8 texels/u` (max `2048x2048`) 3D-direction lightmap with `6u` margin + out-of-bounds ambient clamp.
  - `design.md` / `tests.md` / `tasks.md`: Replaced "pixel-faithful parity" with 5 component-level acceptance criteria; reconciled `cameraMath.test.ts` count (7 `hitTestWall` tests removed, 11 remaining + new scale/Y-flip tests); decoupled Task `1.5` blocking spike from Section 2 and required real JPEGs + named iGPU/iPhone numbers.
