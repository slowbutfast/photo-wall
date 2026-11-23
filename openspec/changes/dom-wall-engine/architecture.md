# Architecture: `dom-wall-engine`

## Context

See `proposal.md` for motivation, `research.md` for PR #1 visual audit and engineering findings, and `specs/` for modified/removed behavioral contracts.

## Goals / Non-Goals

**Goals:**
- Restore the visual fidelity of `playgrounds/photo_wall_playground.html` (WebGL2 normal-mapped stucco wall, overhead multi-head lighting, translucent `backdrop-filter` beveled glass placards, true aspect-ratio recessed cotton mats, directional CSS cast shadows, native YouTube embeds) inside a clean, maintainable React + TypeScript architecture.
- Validate macro-view smoothness (**50 albums / 2,000 photos**) in a Task Group 1 spike on Chrome (iGPU) and iOS Safari before porting the full UI.
- Eliminate the 24-spot uniform cap via a **baked wall-space lightmap** (`O(1)` per pixel) computed from `buildWorldFixtures`.
- Maintain **one single coordinate & geometry source** (`100px = 1 world unit`, `islandLayout.ts`, `cameraMath.ts`) across `PbrWallCanvas`, `.world` CSS transform, and `useGalleryLighting`.

**Non-Goals:**
- Pasting `photo_wall_playground.html`'s imperative `MutationObserver` / `offsetParent` DOM-reading script into React.
- Changing any backend API contract (`GET /api/wall`, `/api/admin/*`) or database schema.

## Decisions

1. **Five-Module Rendering Architecture**:
   - `GalleryViewport.tsx`: Owns the single world-unit camera state (`cameraMath.ts`: `zoomToCursor`, `interpolateZoom`, `fitBoundsToViewport`), pointer/wheel/pinch/keyboard gestures, and drag-threshold detection (`moved`). Drives both `.world` CSS transform (`translate3d(...) scale(s)`) and `PbrWallCanvas` uniforms in the same `requestAnimationFrame` tick (DPR-aligned).
   - `PbrWallCanvas.tsx`: Full-viewport WebGL2 `<canvas>` loading `public/textures/wall/wall_{albedo,normal,ao,roughness}.webp` (with managed texture lifecycle + cleanup) and sampling the **baked wall-space lightmap** + `nyTimeMood` uniforms (`ambientLevel`, `spotIntensity`, `poolAlpha`, `wallTint`).
   - `CssGalleryWorld.tsx`: Renders `.world` using **2D `translate/scale`** (NO `preserve-3d` on `.world` so Chrome does not multiply compositing layers or break `backdrop-filter`). Local 3D tilt (`rotateX/Y`, `max 5°`) + diagonal glass glare apply *only* to the hovered or focused `.photo-frame`.
   - `useGalleryLighting.ts`: Pure memoized hook `(layout, fixtures) -> Map<id, { lit, litTop, litBot, litL, litR, sx, sy }>` applied via inline CSS custom properties (`--lit*`, `--sx`, `--sy`). Zero DOM layout reads or `MutationObserver`.
   - `useWallManifest.ts`: Adapts `GET /api/wall` + `lodUrl.ts` into the renderer view model, ensuring drafts never appear on the public wall and refreshing cleanly on admin publish/edit/delete.

2. **Baked Wall-Space Lightmap (`src/lib/lighting/lightmap.ts`)**:
   - Whenever the published manifest changes, compute `buildWorldFixtures(albums)` once and bake diffuse irradiance + dominant light direction `(dirX, dirY)` into a low-resolution wall-space `RGBA` float/byte texture covering the wall bounding box (+ margin).
   - `PbrWallCanvas` samples the lightmap in `O(1)` per pixel (combining baked irradiance & dominant light direction with `wall_normal.webp`, `wall_ao.webp`, and `wall_roughness.webp` for diffuse + stucco micro-specular), scaling effortlessly to 50+ albums / 250+ fixtures with zero uniform-array cap.

3. **Absolute Geometry from `islandLayout.ts` & True Aspect Ratios**:
   - Islands are positioned at `computeWallGridPositions(albums) * 100` (`100px = 1 world unit`); cells, placards (`214px × 200px`), and soundtrack plaques (`214px × 200px`) use `computeAlbumGrid` coordinates directly.
   - Each print renders an `<img>` (`object-fit: contain`, `decoding="async"`) inside a recessed cotton mat sized to its `aspectRatio`, fixing the R3F square-crop regression.

4. **Zoom-Tiered LOD & Compositor Hygiene**:
   - `macro` (`scale < 0.25`): `?width=128` via `lodUrl.ts`, flat single shadow, **no `backdrop-filter`**, placard text hidden, no YouTube iframes.
   - `album` (`scale >= 0.25`): `?width=800`, full directional umbra/penumbra `box-shadow`, frosted glass `backdrop-filter`, static YouTube thumbnail facade (`i.ytimg.com` `<img>` — no WebGL CORS proxy needed).
   - `print` (focused): `?width=2048` on the focused print only; surface darkening clears smoothly (`opacity: 0`).
   - Apply `contain: layout paint` to each `.album-island`, and toggle `will-change: transform` on `.world` **only** while panning/zooming (removing on settle so browser text re-rasterizes sharp).
   - **Spike Fallback**: If the Task Group 1 macro spike cannot hold ~60fps on iGPU Chrome or iOS Safari with 2,000 `<img>` elements, render each island as a single pre-baked mosaic `<canvas>`/`<img>` at `macro` tier and swap in real `<img>` elements at `album` zoom.

5. **Gesture-Safe Native YouTube Embed (`SoundtrackPlaque.tsx`)**:
   - Mount at most one live `youtube-nocookie.com` `<iframe>` on click inside the plaque (inherits `.world` transform with zero `matrix3d` lag).
   - While a pan/drag (past the `moved` threshold) or wheel zoom is active, apply `pointer-events: none` to the iframe wrapper so the cross-origin iframe cannot swallow input — without unmounting or killing audio.
   - Keep playback alive when entering `print` focus within the same album; stop and unmount when returning to `overview` or selecting a different album.

## Risks / Trade-offs

- **iOS Safari Compositor Memory at Macro Zoom** → Mitigated by the Task Group 1 spike gate, `macro` LOD (`?width=128`, no `backdrop-filter`, flat shadows, no `preserve-3d` on `.world`), and the pre-baked per-island mosaic fallback if needed.
- **Sub-Pixel Alignment Between WebGL2 Canvas and CSS `.world`** → Mitigated by sharing one `cameraMath` transform (`100px = 1u`, shared DPR & viewport size) and verifying alignment at `1920×1080`, `390×844`, and high zoom.
