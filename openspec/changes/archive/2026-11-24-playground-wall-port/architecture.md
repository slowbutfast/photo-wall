# Architecture: `playground-wall-port`

## Context

See `proposal.md` and `research.md`. Base branch is **`feat/dom-wall-engine` (`f43f0dc`)** (which already removed R3F/Three.js). Only the renderer (`PbrWallCanvas.tsx`, `CssGalleryWorld.tsx`, `lightmap.ts`) is replaced with the verbatim port of `playgrounds/photo_wall_playground.html` (`dcc7a0484e0b1cb11a5a7c13120a9bf7c8e15edc`).

## Reused from `feat/dom-wall-engine` (`f43f0dc`)

- `src/components/wall/macroMosaic.ts` (`planMacroMosaic` — keeps 1,000-print macro settle hitch `<= 100ms`)
- `src/components/wall/visibleIslands.ts` (pure AABB culling)
- `src/components/wall/zoomTier.ts` (`resolveProjectedLodWidth` `256/800/2048` + styling tiers)
- `src/lib/camera/cameraMath.ts` (`cameraToCssScale`, Y-flip, aspect-aware `computeFirstRowBounds`, `bottomInsetPx`)
- `src/components/wall/soundtrackState.ts` (transparent gesture capture layer + zoom-out toast)
- `src/lib/layout/islandLayout.ts` (`PLACARD_GAP = 0.44`, `ISLAND_GAP = 2.2`, `MAX_PHOTOS_PER_ALBUM = 20`)
- `src/app/api/local-uploads/[...path]/route.ts` (`sharp` `?width=256|800|2048` derivative cache — upgraded to atomic temp-file rename)
- `GalleryViewport` deferred `setPointerCapture` (>5px) + `useWallStore.overviewNonce`

## Decisions

1. **Single-Pass Verbatim WebGL2 PBR Wall Shader (`PlaygroundPbrWall.tsx`)**:
   - Port `playgrounds/photo_wall_playground.html`'s exact fragment shader (`N·L * cone / r² + roughness specular` + single filmic curve `color = color / (color + vec3(0.88)) * 1.34;` at `L1592`) in **one pass** (NO additive multi-pass chunking).
   - Cull fixtures to the padded viewport via pure `selectVisibleSpots(fixtures, camera, viewport, 128)` and pack them into a row-major `RGBA32F` data texture via pure, unit-tested `packFixtureDataTexture(spots)` (Row 0 = `pos`, Row 1 = `axis`, loop bound `128`).
   - **Idle-stop rAF**: Only execute the WebGL2 draw call when camera, viewport, mood, or manifest changes (zero idle GPU burn).

2. **Verbatim CSS Extraction & Explicit `preserve-3d` / Layout Decisions (`src/app/playground-wall.css`)**:
   - Extract the playground's exact CSS rules for wall, `.album-island`, `.museum-placard` (real classes: **`.mat-acrylic`** default, **`.mat-aluminum`**, **`.mat-foamcore`**), `.soundtrack-plaque`, `.photo-frame.is-lit`, `.is-lit::after`, recessed cotton mat inner shadow, cast shadows, hover tilt + glare, Swiss HUD, compact centered dock, and Focus Bar.
   - Convert playground ID selectors (`#wallViewport`, `#wallWorld`) to classes scoped under `.playground-wall-root`.
   - **Layout Source of Truth**: Keep `islandLayout.ts` absolute positioning (adapting only flex layout rules away from `display: flex`) so culling, camera, and lighting share one geometry; verify via a 1px golden test against the playground's 4 demo albums.
   - **`preserve-3d` & Sway**: Explicitly **drop world `preserve-3d` and world `rotateX/rotateY` sway** (keep 2D `translate3d(...) scale(s)` on `.world` so Chrome `backdrop-filter` never loses its backdrop root, and apply local `perspective` + `preserve-3d` only on `.photo-frame` for hover tilt).

3. **Exact `LIGHT_CFG` & Pure Lighting Math (`src/lib/lighting/playgroundLighting.ts`)**:
   - Port the playground's exact constants: `fixturePerCols: 2`, `hotspotFrac: 0.28`, `heightFrac: 0.98`, `innerDeg: 16`, `outerDeg: 32`, `ambientObj: 0.42`, `objDepth: 9` (overridden to `14` for placards and `22` for prints), plus `throwFrac: 0.72`.
   - Compute `--lit`, `--lit-top`, `--lit-bot`, `--lit-l`, `--lit-r`, `--sx`, `--sy` purely from `islandLayout` geometry (zero `offsetParent` DOM reads).
   - Apply mood palettes via `applyTheme()` CSS variables + WebGL2 uniforms (no invented `.theme-*` classes).

4. **Macro Mosaic Tier & Open PR #2 Quality Fixes (`PlaygroundGallery.tsx`)**:
   - At `scale < 0.25` (`macro` tier), render `macroMosaic.ts` pre-baked canvases per island (no `backdrop-filter`, no placard text, no soundtrack thumbnails, no iframes) so 1,000-print settle hitch stays `<= 100ms`.
   - Use a zoom-relative snapshot threshold (not absolute `0.5u`), prevent entry framing from re-firing on resize or manifest refresh, prevent Tab focus from scrolling the `overflow: hidden` viewport, fix `FolderDropzone` stuck state when >20 files are dropped, and use atomic temp-file rename for `local-uploads` derivative cache writes.
   - Placard material selection in Settings remains client-local (`localStorage`, defaulting to `mat-acrylic`); DB persistence to public visitors is explicitly deferred.

5. **Admin Boundary Compatibility (`admin-route-isolation`)**:
   - This change only restyles the HUD and leaves auth behavior untouched so `admin-route-isolation` applies cleanly on top of `playground-wall-port` via `useWallManifest` (`initialManifest`, `manifestUrl`).
