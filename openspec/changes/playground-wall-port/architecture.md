# Architecture: `playground-wall-port`

## Context

See `proposal.md` and `research.md`. The core rule of this change is **verbatim visual extraction**: do not re-invent shaders, color constants, CSS gradients, mat shadows, or lighting falloff curves from prose—port the exact working code from `playgrounds/photo_wall_playground.html` into modular TypeScript/React files and connect them to the existing Next.js backend.

## Goals / Non-Goals

**Goals:**
- Achieve **1:1 visual parity** with `playgrounds/photo_wall_playground.html` across `alabaster`, `concrete`, and `chiaroscuro` by reusing its exact WebGL2 PBR fragment shader, exact `LIGHT_CFG` / `rawIrradiance` math, and exact CSS rules verbatim.
- Keep **100% of the existing backend** (`GET /api/wall`, `/api/admin/*`, SQLite/Drizzle, Bunny/local storage, `sanitizeImage.ts`, `nyTimeMood.ts`, `AdminDrawer`, `FolderDropzone`).
- Default to **Row 0 (first 3 albums horizontally)** with `MAX_PHOTOS_PER_ALBUM = 20`, `PLACARD_GAP = 44px` (`0.44u`), and generous inter-album spacing (`ISLAND_GAP = 220px` / `2.2u`).
- Fix the interaction bugs encountered in PR #2 (eager `setPointerCapture` breaking real desktop clicks, `Overview`/`0` no-op after manual pan/zoom, `?demo=2000` rendering empty).

**Non-Goals:**
- Keeping the playground's left-side debug control sidebar, top demo banner, or hardcoded `PALETTES`/`albums` array in production (demo fixtures live in `fakeManifest.ts` behind `?demo=4` / `?demo=1000`).
- Changing any database schema or `/api/admin/*` route contract (beyond `?width=` derivative caching in `/api/local-uploads` and `MAX_PHOTOS_PER_ALBUM = 20`).

## Decisions

1. **Verbatim CSS Extraction (`src/app/playground-wall.css`)**:
   - Extract the playground's exact CSS rules for `#viewport`, `.world`, `.album-island`, `.museum-placard` (`.mat-glass` default + `.mat-aluminum`, `.mat-acrylic`, `.mat-rag`), `.soundtrack-plaque`, `.photo-frame`, `.photo-frame.is-lit`, `.is-lit::after` directional shading overlay, recessed cotton mat inner shadow, hover tilt + diagonal glass glare, Swiss HUD segmented control, compact centered dock (with horizontal edge fade masks), and unobstructed Focus Bar.
   - Preserve exact CSS variable names (`--lit`, `--lit-top`, `--lit-bot`, `--lit-l`, `--lit-r`, `--sx`, `--sy`) and theme classes (`theme-alabaster`, `theme-concrete`, `theme-chiaroscuro`) so every gradient, shadow, and highlight matches the playground 1:1.

2. **Verbatim WebGL2 PBR Plaster Shader with Additive 24-Spot Chunking (`src/components/wall/PlaygroundPbrWall.tsx`)**:
   - Port `playgrounds/photo_wall_playground.html`'s exact WebGL2 vertex & fragment shader (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`, `uSpotPos[24]`, `uSpotAxis[24]`, `uCosInner`, `uCosOuter`, `uSpotIntensity`, `uAmbient`, `uWallTint`, `warmLamp`, `N·L * cone / r² + roughness specular`) verbatim.
   - Pass 1 draws ambient plaster + the first `<= 24` visible spotlights (identical to the playground). If `> 24` spotlights are visible in the viewport (e.g. macro overview of 50 albums), draw subsequent chunks of 24 spots with `gl.BLEND` (`ONE, ONE` additive, `uAmbient = 0.0`) so every visible album is illuminated with zero 24-spot cutoff and zero low-res lightmap washout.

3. **Pure Playground Lighting Math (`src/lib/lighting/playgroundLighting.ts`)**:
   - Port `LIGHT_CFG` (`fixturePerCols: 2`, `hotspotFrac: 0.28`, `heightFrac: 0.98`, `throwFrac: 0.72`, `innerDeg: 16`, `outerDeg: 32`) and `rawIrradiance` verbatim, computing per-object `--lit`, `--lit-top`, `--lit-bot`, `--lit-l`, `--lit-r`, `--sx`, `--sy` (with `objDepth = 14` for placards, `22` for prints) purely from layout geometry (zero `offsetParent` DOM walking or `MutationObserver`).

4. **Unified Camera, Row-0 Entry Framing & Clean Click/Reset Handling (`src/components/wall/PlaygroundGallery.tsx`)**:
   - Synchronize `.world` CSS transform (`translate3d(...) scale(s)`) and `PlaygroundPbrWall` camera uniforms in the same `requestAnimationFrame` tick using shared `100px = 1 world unit` geometry (`PLACARD_GAP = 0.44`, `ISLAND_GAP = 2.2`, `MAX_PHOTOS_PER_ALBUM = 20`).
   - Default initial framing (and `Overview` / `0`) frames **Row 0 (first up to 3 albums horizontally)** in the upper-center viewport, using an `overviewNonce` counter so clicking `Overview` or pressing `0` always flies back even when already in `'overview'` after panning/zooming.
   - Only call `setPointerCapture` *after* the drag threshold (`> 5px`) is crossed so real desktop `click` events on `.museum-placard`, `.photo-frame`, and `.soundtrack-plaque` always fire reliably.
   - Viewport-cull off-screen `.album-island`s (`visibleIslands`) and apply a macro zoom guard (`scale < 0.25`: disable `backdrop-filter`, hide placard text, soundtrack thumbnails, and iframes).

5. **Backend Wiring, Local Derivatives & Native YouTube**:
   - Load published albums from `GET /api/wall` (and support `?demo=4` matched 4-album mixed-aspect fixture, `?demo=1000` 50×20 fixture, mapping unknown numeric `?demo=` values like `?demo=2000` to `1000`, plus `?mood=alabaster|concrete|chiaroscuro`).
   - Size `<img>` requests via `lodUrl.ts` (`ceil(cellPx * scale * dpr)` snapped to `256 / 800 / 2048`), backed by disk-cached `?width=` resizing via `sharp` in `/api/local-uploads/[...path]`.
   - Proxy resting YouTube thumbnails via `/api/youtube/thumb/[id]`, mount at most one native `youtube-nocookie.com` `<iframe>` on click with a transparent gesture capture layer (lifting on explicit click into player), keep audio playing across `print` focus in the same album, and pause on `overview` with the `Paused soundtrack on zoom out` toast.

## Risks / Trade-offs

- **Multi-Pass Additive Spotlights at 50-Album Macro Zoom** → At macro zoom with 50 albums (~100–125 fixtures), 5 additive passes on one full-screen quad is trivial on GPUs and fast on software WebGL, while keeping 1–8 visible albums (Row-0 and Album Focus) a single pass identical to the playground.
- **Verbatim CSS Scope** → Prefix/scope all extracted playground rules cleanly inside `.playground-wall-root` so they never collide with `AdminDrawer` styles.
