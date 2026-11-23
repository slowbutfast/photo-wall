# Research: `dom-wall-engine`

## Source Material

- **2026-11-23 — User Request (Restore Visual Playground Fidelity)**:
  > "can you figure out why the mvp ui/ux diverged so much from the visual playground, and suggest how we can restore it? and if its just like wiring in the backend/frontend to the visual prototype, then that'd be ideal."
  > "fast forward that change on main"
- **2026-11-23 — Visual Audit of PR #1 (`feat/photo-wall-mvp`) vs `playgrounds/photo_wall_playground.html`**:
  - `vis-album-chiaroscuro.png`: `InfiniteWallShader.tsx` rendered a flat beige oval (`smoothstep(0.54, 0.05, d)`) on a near-black wall; stucco normal-map relief vanished.
  - `vis-album.png` & `vis-album-chiaroscuro.png`: WebGL beveled glass placards rendered as opaque solid black/beige rectangles with harsh gray borders (lacking CSS `backdrop-filter: blur()`).
  - `vis-print.png` & `vis-album.png`: `WallInstancedLayer.tsx` forced every print to a `1:1` square (`PlaneGeometry(1, 1)`), losing portrait/landscape aspect ratios.
  - `vis-macro.png`: Wall read as flat tan, placards vanished, and soundtrack thumbnails stood out as floating squares.
- **2026-11-23 — Consolidated Multi-Agent Engineering Review Findings**:
  1. **Cross-origin YouTube `<iframe>` still swallows wheel/drag inside CSS DOM**: Moving the iframe into the DOM world removes per-frame CSS `matrix3d` projection sync (it inherits `.world` transform), but `pointer-events: none` is still required during pan/drag/wheel gestures (toggled once the drag threshold is crossed). Keep audio playing across `print` focus inside the same album; stop on `overview` or album change.
  2. **Viewport culling alone does not solve macro view (`?demo=2000`)**: At overview, all 50 albums (~2,000 `<img>`s) are on screen simultaneously. Rendering 2,000 multi-layer `box-shadow`s and 50 `backdrop-filter` placards under a live `scale()` risks Chrome re-rasterization hitches and iOS Safari compositor memory limits. Solve with **Zoom-Tiered LOD** (`macro` `s < 0.25` vs `album` vs `print`), `contain: layout paint` per island, dropping `preserve-3d` on `.world` (2D `translate/scale` only; local 3D tilt only on hovered/focused print), and toggling `will-change: transform` only during active gestures.
  3. **Baked Wall-Space Lightmap instead of `MAX_SPOTS = 24`**: 50 albums can have 150–250 fixtures. Because fixtures are static per manifest, bake diffuse irradiance (plus dominant light direction) from `buildWorldFixtures` into a low-res wall-space lightmap texture whenever the manifest changes, paired with nearest-K specular if needed — yielding `O(1)` per-pixel cost with zero fixture cap.
  4. **Single Geometry Source (`islandLayout` × `100px = 1 world unit`)**: Absolutely position islands and photo cells from `computeWallGridPositions` and `computeAlbumGrid` (eliminating CSS flow drift and Chrome's `preserve-3d` `offsetParent` bug). Both `.world` CSS transform and `PbrWallCanvas` WebGL2 uniforms read the exact same world-unit camera state (`cameraMath.ts`).
  5. **Spike-First Performance Gate**: Build a 50-album / 2,000-photo macro-tier DOM + baked-lightmap `PbrWallCanvas` spike first and measure zoom-gesture frame time in Chrome (iGPU) and iOS Safari before porting the full UI. Fallback: pre-baked single mosaic image per island at macro tier, swapping in real `<img>` elements at album zoom.

## Glossary

| Term | Meaning in this Change | Does NOT mean |
| :--- | :--- | :--- |
| **Hybrid WebGL2 PBR Wall + CSS DOM World (`dom-wall-engine`)** | Full-viewport WebGL2 `<canvas>` rendering the normal-mapped stucco plaster wall + baked lightmap, behind a 2D-transformed `.world` DOM layer rendering absolutely positioned islands, true aspect-ratio `<img>` prints, `backdrop-filter` beveled glass placards, and native YouTube embeds. | Pasting the 2,700-line imperative `photo_wall_playground.html` verbatim with `MutationObserver` / DOM reads, or keeping Three.js / R3F. |
| **Baked Wall-Space Lightmap** | A low-resolution GPU texture baked on manifest change from `buildWorldFixtures` storing diffuse irradiance and dominant light direction across the wall plane (`O(1)` per pixel, zero light cap). | A `MAX_SPOTS = 24` uniform loop or multi-pass Three.js shadow maps. |
| **Zoom-Tiered LOD (`macro` / `album` / `print`)** | Switching DOM visual complexity and Bunny Optimizer `?width=` sizes by camera scale (`macro` `s < 0.25`: `?width=128`, flat shadow, no `backdrop-filter`, hidden placard text, no iframes; `album`: `?width=800`, full shadows, glass blur, soundtrack facade; `print`: `?width=2048` on focused print). | Mounting 2,000 full-res `<img>`s with 50 live `backdrop-filter` blur passes at macro zoom. |
| **World Scale (`100px = 1 world unit`)** | Single coordinate contract shared by `islandLayout.ts`, `cameraMath.ts`, `PbrWallCanvas` uniforms, and `.world` CSS transforms (`posPx = worldUnit * 100`). | Separate pixel-space and world-unit cameras. |

## External Research

- **Playgrounds Visual Reference**: `playgrounds/photo_wall_playground.html` (verified visual baseline for WebGL2 PBR plaster relief, beveled glass standoff placards, recessed 4-ply cotton mats, directional CSS cast shadows, and circadian moods).
- **Existing Backend & Pure Modules**: `backend-storage-crud` (`GET /api/wall`, `islandLayout.ts`, `lodUrl.ts`, `AdminDrawer`, `FolderDropzone`, `folderReader.ts`, `cameraMath.ts`, `fixtures.ts`, `nyTimeMood.ts`).

## Candidate Tech

| Candidate | Status | Rationale & Date |
| :--- | :--- | :--- |
| **WebGL2 `PbrWallCanvas` + Baked Lightmap + 2D-Transformed CSS DOM World** | Adopted | Restores exact playground stucco relief, `backdrop-filter` glass placards, true aspect-ratio `<img>` prints, and native YouTube embeds while removing R3F/Three.js shader drift (2026-11-23). |
| **React Three Fiber + `InstancedMesh` + `troika-three-text`** | Superseded / Removed | Produced flat oval lights, opaque placards, 1:1 square prints, z-fighting, and `matrix3d` overlay lag (2026-11-23). |
| **24-spot uniform chunk batching** | Rejected | Clumsy at 150–250 fixtures across 50 albums; static manifest lights belong in a baked wall-space lightmap (2026-11-23). |

## Patterns Adopted

- **Single Camera Store (`cameraMath.ts`) → Dual Consumers** (`div.world` 2D transform + `PbrWallCanvas` WebGL2 uniforms) → `src/components/wall/GalleryViewport.tsx` & `PbrWallCanvas.tsx`.
- **Pure Layout → Pure Lighting CSS Vars** (`islandLayout.ts` + `fixtures.ts` → `--lit-*`, `--sx`, `--sy` memoized per manifest) → `src/components/wall/useGalleryLighting.ts`.
- **Zoom-Tiered LOD + `contain: layout paint`** → `src/components/wall/CssGalleryWorld.tsx`.
- **Gesture-Safe Iframe (`pointer-events: none` during drag/wheel)** → `src/components/wall/SoundtrackPlaque.tsx`.

## Verified Facts

| Claim | Verification Method | Result |
| :--- | :--- | :--- |
| PR #1 R3F screenshots diverge visually from `photo_wall_playground.html` | Inspected `vis-macro.png`, `vis-album.png`, `vis-album-chiaroscuro.png`, `vis-print.png` (2026-11-23) | Verified: flat oval spot, opaque placards, 1:1 square prints, missing stucco relief. |
| `cameraMath.ts`, `fixtures.ts`, `islandLayout.ts`, `lodUrl.ts`, `nyTimeMood.ts` are pure and framework-agnostic | Audited PR #1 branch `feat/photo-wall-mvp` (2026-11-23) | Verified: reusable directly by `dom-wall-engine` with existing tests intact. |

## Unverified Assumptions

- **2,000 macro-tier `<img>` elements under scaled `.world` hold ~60fps on iGPU Chrome & iOS Safari**: Must be verified in Task Group 1 spike before porting full UI; if not, switch macro tier to a single pre-baked mosaic image per island. Cost: ~20 min.

## Links Out

- [playgrounds/photo_wall_playground.html](../../../playgrounds/photo_wall_playground.html)
- [DESIGN.md](../../../DESIGN.md)
- [frontend-gallery-wall/proposal.md](../frontend-gallery-wall/proposal.md)
