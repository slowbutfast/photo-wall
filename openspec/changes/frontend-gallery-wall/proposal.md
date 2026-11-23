## Why

Traditional photo galleries trap collections inside flat paginated grids and modal lightboxes. Visitors should experience photo rolls as physical exhibitions mounted on a continuous, unbounded plaster wall—able to pan freely, zoom out to survey every wing, and fly smoothly into individual prints with realistic overhead lighting and tactile depth.

**Dependency:** This change depends on `backend-storage-crud` for project bootstrap, shared world-unit layout (`src/lib/layout/islandLayout.ts`, `100px = 1 world unit`), shared longest-edge LOD URLs (`src/lib/cdn/lodUrl.ts`), and the `/api/wall`, `/api/albums/[id]/photos`, and `/api/admin/*` contracts.

## What Changes

- Render a **continuous PBR plaster wall** (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`) lit by **per-album additive spotlight quads** (no global 24-light cap) and **CPU-precomputed analytic print/placard shading & directional cast shadows** (`buildWorldFixtures`).
- Implement a **hybrid instanced print renderer** (`O(1)` draw calls regardless of photo count: wall cast-shadow pass + instanced mat/ThumbHash-atlas pass + per-album spotlight quads + `VisiblePrintPool` textured quads with unified mat/print lift + `troika-three-text` Helvetica beveled glass standoff placards + matched `2.14u × 2.00u` YouTube soundtrack plaques).
- Enforce a **priority-ordered VRAM byte budget** (`256 MB` desktop / `96 MB` mobile heuristic) accounting from **actual decoded `ImageBitmap` dimensions**, off-thread decoding (`imageOrientation: 'from-image'` + shader V-flip), and `<= 2` `initTexture` uploads/frame.
- Build **pure spatial camera math** (`cameraMath.ts`) with clamped cursor-anchored zoom, `bottomInsetPx`-aware `fitBoundsToViewport`, van Wijk & Nuij `interpolateZoom`, `O(albums)` broad-phase + `O(1)` cell hit-testing, and editable-element keyboard guards.
- Add a **quiet gallery ephemera HUD** (Exhibition Room Directory, lock-icon `Curate` trigger checked via `GET /api/admin/auth`, unobstructed bottom Photo Focus bar showing the **album caption** + optional owner-entered `Camera • Date • Location`) and a **`next/dynamic` lazy-loaded Curator Drawer** (looping `readEntries()`, `32px` ThumbHash, XHR `upload.onprogress`, YouTube soundtrack URL paste + Artist/Song editor, dev/admin Lighting Preview, draft resume/discard, and partial-failure retry UI).
- Synchronize gallery lighting automatically to **real-time NYC solar moods** (`SunriseSunset.io` `formatted=0` + `localStorage` daily cache + 60s polling + `Intl` fallback; `alabaster` day / `concrete` twilight / `chiaroscuro` night) with **Helvetica** typography across the entire site.

## Capabilities

### New Capabilities
- `3d-pbr-wall-and-lighting`: Continuous borderless PBR plaster wall, per-album additive spotlight quads (scaling to 50+ albums), CPU-precomputed analytic print/placard falloff & wall-plane cast shadows, and Helvetica beveled glass standoff placards via `troika-three-text` + matched YouTube soundtrack plaques.
- `instanced-photo-renderer`: `O(1)` draw-call hybrid renderer with unified mat+print lift, `32x32` ThumbHash atlas, priority-ordered byte-budgeted `ImageBitmapLoader` pool (`bitmap.width * bitmap.height`), and broad-phase `O(albums)` + `O(1)` cell hit-testing.
- `spatial-camera-navigation`: Pure camera math (`100px = 1 world unit`, `zClamp = [2.4, 140.0]`), clamped cursor-anchored zoom, `bottomInsetPx`-aware framing, van Wijk–Nuij fly-to arcs, and desktop/mobile input handling.
- `gallery-hud-and-curator-ui`: Unobtrusive gallery ephemera HUD, lock-gated `Curate` trigger via `GET /api/admin/auth`, bottom-anchored Photo Focus bar, and lazy-loaded Curator Drawer with `readEntries()` loop, partial-failure retry, and draft resume/discard.

### Modified Capabilities
<!-- None (greenfield repository) -->

## Impact

- **Depends On**: `backend-storage-crud` (must be applied first or alongside for bootstrap, shared `islandLayout.ts` / `lodUrl.ts`, and API routes).
- **Dependencies Added**: `three`, `@types/three`, `@react-three/fiber@^9`, `troika-three-text`, `zustand`, `thumbhash`, `uuid`, `lucide-react`, `fast-check`, `tailwindcss`.
- **Design System**: Consumes `DESIGN.md` (`100px = 1 world unit`) and PBR textures from `public/textures/wall/`.

### Revision: 2026-11-23 15:45 UTC
- **Feedback Source**: Peer Review Audits (Two Agents)
- **Key Changes**:
  - Added explicit dependency on `backend-storage-crud` (owning bootstrap, `islandLayout.ts`, `lodUrl.ts`, and API contracts).
  - Replaced 24-light global cap with per-album additive PBR spotlight quads + CPU-precomputed instance shading/shadows; added `troika-three-text` + OFL `Inter Tight` for WebGL placards.
  - Standardized `100px = 1 world unit` (`zClamp = [2.4, 140.0]`), unified mat+print pooling (`aVisible = 0`), `32x32` ThumbHash atlas, priority-ordered actual-`ImageBitmap` VRAM accounting, `ImageBitmap` V-flip, hardware-pinned 60fps target, `bottomInsetPx` framing, and partial-upload retry + `GET /api/admin/auth` flows.
