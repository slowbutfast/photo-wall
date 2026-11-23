# Architecture: `dom-wall-engine`

## Context

See `proposal.md` for motivation, `research.md` for PR #1 visual audit and engineering findings, and `specs/` for modified/removed behavioral contracts.

## Goals / Non-Goals

**Goals:**
- Restore the visual fidelity of `playgrounds/photo_wall_playground.html` (WebGL2 normal-mapped stucco wall, overhead multi-head lighting, translucent `backdrop-filter` beveled glass placards, aspect-fitted recessed cotton mats, directional CSS cast shadows, native YouTube embeds) inside a clean, maintainable React + TypeScript architecture.
- Validate macro-view smoothness (**50 albums / 2,000 real-JPEG photos**) in a blocking Task Group 1 spike (`p95 <= 16.7ms` zoom gesture on iGPU Chrome, settle hitch `<= 100ms` on `will-change` removal, zero tab reloads on iPhone/Safari) before porting the full UI.
- Eliminate the 24-spot uniform cap via a **GPU-baked wall-space lightmap** (`O(1)` per pixel) with explicit bounds/edge behavior.
- Maintain **one single coordinate & geometry source** (`100px = 1 world unit`, `islandLayout.ts`, `cameraMath.ts`, `cameraToCssScale`, and `cssTop = -worldY * 100`) across `PbrWallCanvas`, `.world` CSS transform, `visibleIslands`, and `useGalleryLighting`.

**Non-Goals:**
- Pasting `photo_wall_playground.html`'s imperative `MutationObserver` / `offsetParent` DOM-reading script into React.
- Changing any public manifest JSON schema (`GET /api/wall`) or database schema.

## Decisions

1. **Five-Module Rendering Architecture & Coordinate Contract (`cameraMath.ts`)**:
   - **Camera ↔ CSS Scale**: Defined once in `cameraMath.ts`:
     ```ts
     export function cameraToCssScale(z: number, viewportHeightCss: number, fovDeg = 38): number {
       return viewportHeightCss / (2 * z * Math.tan(((fovDeg * Math.PI) / 180) / 2) * 100);
     }
     ```
     Both `.world` CSS transforms and `PbrWallCanvas` uniforms derive from `cameraToCssScale` + shared `viewportWidth`, `viewportHeight`, and `devicePixelRatio` so desktop and mobile viewports never drift.
   - **Y-Axis Flip & Default Row-0 Entry Framing**: `islandLayout.ts` is y-up (row 0 at positive/higher `y`, subsequent rows toward negative `y`), while CSS is y-down. All DOM placement uses `cssLeft = worldX * 100` and `cssTop = -worldY * 100` (tested explicitly so row 0 renders above row 1). On initial load (and `Overview` / `0`), `computeFirstRowBounds(placements)` frames **row 0** (the first up to 3 albums) horizontally across the viewport width rather than zooming out to fit all albums at once; visitors can pan downward or zoom out freely to macro view (`zClamp = [2.4, 140.0]`).
   - `GalleryViewport.tsx`: Owns camera gestures (pointer/wheel/pinch/keyboard), drag-threshold detection (`moved`), and synchronized `requestAnimationFrame` updates.
   - `PbrWallCanvas.tsx`: Full-viewport WebGL2 `<canvas>` loading `public/textures/wall/wall_{albedo,normal,ao,roughness}.webp` (managed GPU texture disposal) and sampling the GPU-baked wall-space lightmap + `nyTimeMood` uniforms.
   - `CssGalleryWorld.tsx`: Renders viewport-culled islands inside a **2D-transformed** `.world` container (NO `preserve-3d` on `.world`; NO `opacity < 1`, `filter`, `mask`, `clip-path`, `mix-blend-mode`, or non-`transform` `will-change` on `.world` or `.album-island` so Chrome `backdrop-filter` never loses its backdrop root). Local 3D hover tilt (`max 5°`) + diagonal glass glare apply only to the hovered/focused `.photo-frame`.
   - `useGalleryLighting.ts`: Pure memoized hook `(layout, fixtures) -> Map<id, { lit, litTop, litBot, litL, litR, sx, sy }>` applied via inline CSS custom properties (`--lit*`, `--sx`, `--sy`). Zero DOM reads or `MutationObserver`.
   - `useWallManifest.ts`: Adapts `GET /api/wall` + `lodUrl.ts` into the renderer view model, excluding drafts and refreshing cleanly on admin publish/edit/delete.

2. **GPU-Baked Wall-Space Lightmap (`src/lib/lighting/lightmap.ts`)**:
   - **GPU Bake (Avoids Main-Thread CPU Stall)**: Whenever the manifest changes, render each fixture's elliptical/cone footprint (`3500K` `#FFF5E6`) as an additive quad into an offscreen WebGL2 framebuffer (microseconds vs ~1s CPU loop over 60M evaluations), tuned so inter-cluster wall space falls to `~35–45%` of pool peak brightness.
   - **Wall Albedo Desaturation & Macro Normal Attenuation**: `PbrWallCanvas` desaturates `wall_albedo.webp` to near-zero saturation (preserving the playground's bright warm `alabaster` exposure curve and neutral charcoal `#2B2B2A` chiaroscuro base so mood tint and `3500K` lights provide all warmth) and scales down `wall_normal.webp` strength at macro zoom so overview does not look blotchy.
   - **Resolution & Budget**: `8 texels / world unit`, capped at `2048 × 2048` max (`<= 16 MB` GPU memory at `RGBA8`).
   - **Format & 3D Direction Encoding**: `RGBA8` (universally linearly filterable without float-linear extensions): `R` = normalized irradiance, `GB` = encoded dominant 3D light direction `(dirX, dirY)` with `dirZ = sqrt(max(0.0, 1.0 - dirX*dirX - dirY*dirY))` reconstructed in the wall fragment shader so `wall_normal.webp` preserves out-of-wall grazing relief.
   - **World Coverage & Edge Behavior**: Covers published wall AABB + `6u` zero-irradiance margin with `CLAMP_TO_EDGE`, and the wall fragment shader enforces `if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) irradiance = 0.0;` so panning anywhere on the infinite wall falls off cleanly to ambient plaster with zero wrapping or smearing.

3. **Absolute Geometry (`MAX_PHOTOS_PER_ALBUM = 20`, `ISLAND_GAP = 2.2u`), Aspect-Fitted Mats & Viewport Culling**:
   - **Cluster Breathing Room & Cap**: Enforce `MAX_PHOTOS_PER_ALBUM = 20` (`4–5` grid columns) and raise `ISLAND_GAP` from `0.44u` to `2.2u` (`220px`, roughly one placard width) in `islandLayout.ts` so dark plaster clearly separates adjacent light pools.
   - **Viewport Culling**: Pure `visibleIslands(camera, viewport, placements, margin)` computes visibility from `islandLayout` AABBs (zero DOM reads). Off-screen islands are omitted (or rendered as empty sized boxes) so `<img>` elements stay unmounted when out of view.
   - **Aspect-Fitted Frame & Mat Inside Neutral Cell**: Each cell keeps its `computeAlbumGrid` `CELL_SIZE × CELL_SIZE` slot; inside that slot, the `.photo-frame` and its thinner `#F4F4F2` recessed cotton mat (top inner shadow + downward drop shadow) are sized proportionally to `photo.aspectRatio`, constrained to `CELL_SIZE × CELL_SIZE`, and centered in the slot, displaying a `thumbHash` data-URL or `dominantColor` background while the `<img>` loads. During `print` focus, non-focused sibling `.photo-frame` elements dim per-element (`opacity: 0.45` + subtle desaturation).
   - **Deterministic Mood Query Pin**: Support `?mood=alabaster|concrete|chiaroscuro` (and `?demo=4` matched 4-album mixed-aspect fixture alongside `?demo=1000` 50×20 stress fixture) for repeatable visual parity testing.
   - **Containment Without Clipping Shadows**: Apply `contain: layout` (NOT `contain: paint`, which clips directional cast shadows and hover tilt at island edges) on `.album-island`.
   - **Accessibility**: Render each `.photo-frame` as a focusable `<button>` in `sortOrder` Tab sequence with `alt` derived from title or album caption.

4. **Projected-Size Image LOD, Local-Mode Derivatives & Zoom-Tier Styling**:
   - **Projected-Size Image Width (No Memory Cliff)**: Compute `lodWidth = Math.ceil(cellPx * scale * dpr)` and snap to the backend's existing buckets **`256 / 800 / 2048`** (`128` removed). Combined with `visibleIslands`, crossing `scale = 0.25` never forces 1,000 prints to jump simultaneously to `800px`.
   - **Local-Mode Derivatives (`STORAGE_DRIVER=local`)**: Extend `src/app/api/local-uploads/[...path]/route.ts` to accept `?width=256|800|2048` (or `?height=`) and serve disk-cached resized derivatives (generated on demand via `sharp` into `.cache/` while keeping the sanitized original canonical) so self-hosted local mode never decodes 2,000 × 25 MB originals at macro zoom.
   - **Zoom-Tier Styling Switches**:
     - `macro` (`scale < 0.25`): flat single shadow, **no `backdrop-filter`**, placard text hidden, zero mounted iframes.
     - `album` (`scale >= 0.25`): full directional umbra/penumbra `box-shadow`, frosted glass `backdrop-filter`, static YouTube thumbnail facade (`/api/youtube/thumb/[id]`).
     - `print` (focused): surface darkening clears (`opacity: 0`), per-element dimming (`0.26`) on non-focused `.photo-frame` siblings only.
   - Toggle `will-change: transform` on `.world` **only** during active gestures and remove on settle so typography re-rasterizes sharp.

5. **Gesture-Safe Native YouTube Embed (`SoundtrackPlaque.tsx`)**:
   - Resting thumbnail uses `/api/youtube/thumb/[id]` proxy (preserving visitor IP privacy).
   - Clicking mounts at most one native `youtube-nocookie.com` `<iframe>` inside the plaque (inheriting `.world` transform).
   - A **transparent capture layer** sits over the active iframe to forward initial wheel and drag events to `GalleryViewport` (preventing even the first wheel tick from being swallowed) and lifts only on an explicit click into the player.
   - Playback continues across `print` focus within the same album and stops on `overview` or selecting another album.

## Risks / Trade-offs

- **Macro Zoom on iGPU Chrome & iOS Safari** → Gated by the blocking Task Group 1 spike (real JPEGs, `p95 <= 16.7ms`, settle hitch `<= 100ms`, zero iOS tab reloads). Fallback: render each island as a single pre-baked mosaic image at `macro` tier and swap in real `<img>` elements at `album` zoom.
- **On-Demand Local Resizing Dependency** → Adding `sharp` strictly for read-time `?width=` cached derivatives in `local-uploads` keeps original uploaded pixel bitstreams untouched while protecting local self-hosted deployments from multi-GB decode cliffs.
