# Architecture: `frontend-gallery-wall`

## Context

See `proposal.md` (including `backend-storage-crud` dependency), `specs/` for behavioral contracts, `research.md` for verified facts/glossary, and `lighting_realism_plan.md` for the unified spotlight design. Visual tokens, colors, typography, and component states live in `design.md` and `DESIGN.md`.

## Goals / Non-Goals

**Goals:**
- Validate **p95 frame time `<= 16.7ms` and GPU texture memory `< 256 MB`** on an integrated laptop GPU at `1920x1080` in the `?demo=2000` spike *before* building HUD and Curator UI.
- Render **O(1) draw calls regardless of photo count** with unified mat+print movement and zero global light-count cap.
- Account VRAM strictly from **actual decoded `ImageBitmap` dimensions** with explicit priority eviction and `bitmap.close()` + `tex.dispose()`.
- Keep all camera math (`cameraMath.ts`), fixture math (`fixtures.ts`), and shared layout/LOD imports pure and tested.

**Non-Goals:**
- Database, storage, or auth route implementation (owned by `backend-storage-crud`).
- Multi-pass Three.js `SpotLight` shadow maps.

## Decisions

1. **Coordinate System & World Scale (`100px = 1 world unit`)**:
   - Wall lies at `z = 0.00`. Cast shadows sit at `z = 0.002` (`depthWrite: false`), placards at `z = 0.14`, prints at `z = 0.22`, and focused lifted prints at `z = 0.54`.
   - Perspective camera (`fov = 38°`, `near = 0.20`, `far = 500`, `zClamp = [2.4, 140.0]`) has `~0.006` depth-buffer precision at `z = 140`, preventing Z-fighting.
   - `fitBoundsToViewport(bounds, fovDeg, aspect, padding, planeZ, bottomInsetPx)` accounts for both horizontal/vertical FOV and the bottom Photo Focus bar height + mobile safe-area insets.
2. **Scalable Analytic Lighting (Zero 24-Light Cap)**:
   - `InfiniteWallShader` renders the base ambient PBR plaster quad (`wall_albedo`, `wall_normal`, `wall_ao`, `wall_roughness`) plus **instanced additive spotlight quads** (1 instance per album carrying that album's 1–3 local lights: `hotspotFrac: 0.28`, `heightFrac: 0.98`, `throwFrac: 0.72`, `innerDeg: 16°`, `outerDeg: 32°`, `#FFF5E3`).
   - `buildWorldFixtures` pre-computes `litTop/Bot/L/R` and `(sx, sy)` shadow offsets on the CPU once at manifest load using each object's true `z` (`0.14` for placards, `0.22` for prints) and writes them into instance attributes.
   - `suncalc` computes NYC (`40.7128, -74.0060`) solar mood (`alabaster` / `concrete` / `chiaroscuro`) deterministically in SSR + 60s local timer with a 60s smooth crossfade across boundaries.
3. **O(1) Draw-Call Hybrid Renderer & Unified Print+Mat Lift**:
   - Pass 1: Base PBR plaster quad (`z = 0.00`).
   - Pass 2: Instanced per-album additive spotlight quads.
   - Pass 3: Instanced wall-plane cast shadows (`z = 0.002`, `depthWrite: false`).
   - Pass 4: `WallInstancedLayer` drawing print mats, inner shadows, and decoded `32x32` ThumbHash atlas placeholders (falling back to `aColor`).
   - Pass 5: `VisiblePrintPool` rendering full textured prints **with their own mat** for the ~20–40 visible prints (`>= 56px` projected) and setting `aVisible = 0` on their `WallInstancedLayer` instance so print and mat always lift/tilt together.
   - Pass 6: Batched `troika-three-text` with bundled **`TeX Gyre Heros`** for beveled glass standoff placards (faked Fresnel bevel + frosted text backing, LOD-culled when projected text height `< 8px`).
4. **Priority-Ordered Byte-Budgeted `TexturePool`**:
   - Budget: `256 MB` desktop / `96 MB` mobile (`viewport < 768px` heuristic).
   - Bytes counted from actual `bitmap.width * bitmap.height * 4 * 1.33` (accurate even when `STORAGE_DRIVER=local` serves full originals).
   - Eviction order: `off-screen` → `visible thumbs` → `visible medium` → `focus` (hard-capped at 3 textures).
   - Decode with `createImageBitmap(blob, { imageOrientation: 'from-image' })` and flip `vUv.y = 1.0 - vUv.y` in shader.
5. **Manifest Consumption & Upload Resilience**:
   - Consumes `GET /api/wall` (compact photos, album caption, optional `cameraName`/`dateLabel`/`locationLabel`, optional YouTube soundtrack metadata, and `cdnBase`).
   - Checks `GET /api/admin/auth` on mount to show a subtle lock icon until authenticated; `FolderDropzone` creates a `draft`, loops `readEntries()`, uploads via XHR (`photoId`, `thumbHash`, `dominantColor`, `sortOrder`), and only sends `PATCH` publish once all files succeed (retaining `draft` + per-file retry UI on partial failure).
   - `SoundtrackPlaque` renders a CORS-proxied resting thumbnail (`TexturePool`-budgeted) at `z = 0.14` (`2.14u × 2.00u`) and, when clicked in `album` `viewMode`, mounts a single active `youtube-nocookie.com` `YT.Player` inside a **DOM overlay** synced via CSS `matrix3d` every frame (sits above canvas, unmounts immediately on pan/drag/wheel start so iframe cannot swallow gestures, polls timecode into the glass placard, and auto-stops when `viewMode` leaves `'album'`). Note: iOS Safari may require a second tap inside the iframe for audio.

## Risks / Trade-offs

- **CPU-Side `ImageBitmap` Memory Overhead** → Track bitmap bytes alongside GPU texture estimates and call `bitmap.close()` immediately after `renderer.initTexture(tex)` or on cancellation/eviction.
- **Broad-Phase Hit-Test Scaling** → `hitTestWall` scans `O(albums)` AABBs (fast for ~50–200 albums) then performs `O(1)` cell arithmetic inside the matched album.
