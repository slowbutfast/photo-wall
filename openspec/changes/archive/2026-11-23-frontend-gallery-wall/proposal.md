## Why

Traditional photo galleries trap collections inside flat paginated grids and modal lightboxes. Visitors should experience photo rolls as physical exhibitions mounted on a continuous, unbounded plaster wall—able to pan freely, zoom out to survey every wing, and fly smoothly into individual prints with realistic overhead lighting and tactile depth.

**Dependency:** This change depends on `backend-storage-crud` for project bootstrap, shared world-unit layout (`src/lib/layout/islandLayout.ts`, `100px = 1 world unit`), shared longest-edge LOD URLs (`src/lib/cdn/lodUrl.ts`), and the `/api/wall` and `/api/admin/*` contracts.

## What Changes

- Render a **continuous PBR plaster wall** (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`) lit by **instanced per-album additive spotlight quads** (no global 24-light cap) and **CPU-precomputed analytic print/placard shading & directional cast shadows** (`buildWorldFixtures` using actual per-object `z`: `0.14` placard, `0.22` prints).
- Implement a **hybrid instanced print renderer** (`O(1)` draw calls regardless of photo count: base plaster quad + instanced spotlight quads + wall cast-shadow pass + instanced mat/ThumbHash-atlas pass + `VisiblePrintPool` textured quads with unified mat/print lift + LOD-culled `troika-three-text` `TeX Gyre Heros` beveled glass standoff placards with faked Fresnel bevel & frosted text backing + matched `2.14u × 2.00u` YouTube soundtrack plaques with CORS-proxied resting thumbnails and a `matrix3d` DOM iframe overlay in `album` `viewMode`).
- Enforce a **priority-ordered VRAM byte budget** (`256 MB` desktop / `96 MB` mobile heuristic, counting print & YouTube thumbnail textures) accounting from **actual decoded `ImageBitmap` dimensions**, off-thread decoding (`imageOrientation: 'from-image'` + shader V-flip), and `<= 2` `initTexture` uploads/frame.
- Build **pure spatial camera math** (`cameraMath.ts`) with clamped cursor-anchored zoom, `bottomInsetPx`-aware `fitBoundsToViewport`, van Wijk & Nuij `interpolateZoom`, `O(albums)` broad-phase + `O(1)` cell hit-testing, and editable-element keyboard guards.
- Add a **quiet gallery ephemera HUD** (Exhibition Room Directory, lock-icon `Curate` trigger checked via `GET /api/admin/auth`, unobstructed bottom Photo Focus bar showing the **album caption** + optional owner-entered `Camera • Date • Location`) and a **`next/dynamic` lazy-loaded Curator Drawer** (looping `readEntries()`, `32px` ThumbHash, XHR `upload.onprogress`, YouTube URL inspect + hidden `YT.Player.getDuration()` capture + Artist/Song editor, client-local dev/admin Lighting Preview, draft resume/discard, Pending Deletions retry, and partial-failure retry UI).
- Synchronize gallery lighting automatically to **offline `suncalc` NYC solar moods** (`40.7128, -74.0060`, SSR + 60s local timer + 60s smooth crossfade; `alabaster` day / `concrete` twilight / `chiaroscuro` night with explicit per-mood render tokens) and **bundled `TeX Gyre Heros`** typography across the entire site.

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
- **Dependencies Added**: `three`, `@types/three`, `@react-three/fiber@^9`, `troika-three-text`, `suncalc`, `@types/suncalc`, `zustand`, `thumbhash`, `uuid`, `lucide-react`, `fast-check`, `tailwindcss`.
- **Design System**: Consumes `DESIGN.md` (`100px = 1 world unit`, `TeX Gyre Heros`) and PBR textures from `public/textures/wall/`.

### Revision: 2026-11-23 16:45 UTC
- **Feedback Source**: Re-Review Audit
- **Key Changes**:
  - `YouTube Plaque`: Switched active `YT.Player` from inside WebGL to a CSS `matrix3d` DOM overlay (mounted only in `album` `viewMode`, unmounted on pan/drag/wheel start, `viewMode`-based auto-stop, CORS-proxied `TexturePool`-budgeted resting thumbnail, hidden `YT.Player.getDuration()` in Curator Drawer, moved to Section `4` after the Section `3` 60fps gate).
  - `NYC Solar Moods`: Replaced `SunriseSunset.io` + `localStorage` + `Intl` fallback with offline `suncalc` (`40.7128, -74.0060`) in SSR + 60s local timer + 60s crossfade + DST tests + explicit per-mood render tokens (`alabaster` / `concrete` / `chiaroscuro`) and client-local-only admin preview.
  - `Typography & Glass Placard`: Consolidated exclusively on bundled `TeX Gyre Heros` (both `troika-three-text` and DOM `@font-face`), added faked Fresnel edge bevel + frosted text backing (`>= 4.5:1` contrast), and used actual per-object `z` (`0.14` / `0.22`) in `fixtures.ts`.
  - `Draw-Call & Cleanup`: Switched per-album spotlight quads to instanced rendering + `troika` `< 8px` LOD culling; scrubbed stale `exifr`/`exifJson`/`showExifInFocus`/`GET /api/albums/[id]/photos` references.

### Revision: 2026-11-23 15:45 UTC
- **Feedback Source**: Peer Review Audits (Two Agents)
- **Key Changes**:
  - Added explicit dependency on `backend-storage-crud` (owning bootstrap, `islandLayout.ts`, `lodUrl.ts`, and API contracts).
  - Replaced 24-light global cap with per-album additive PBR spotlight quads + CPU-precomputed instance shading/shadows; added `troika-three-text` + OFL `Inter Tight` for WebGL placards.
  - Standardized `100px = 1 world unit` (`zClamp = [2.4, 140.0]`), unified mat+print pooling (`aVisible = 0`), `32x32` ThumbHash atlas, priority-ordered actual-`ImageBitmap` VRAM accounting, `ImageBitmap` V-flip, hardware-pinned 60fps target, `bottomInsetPx` framing, and partial-upload retry + `GET /api/admin/auth` flows.
