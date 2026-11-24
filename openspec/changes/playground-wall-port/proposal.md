## Why

Two clean-room renderer rewrites (R3F in PR #1 and the baked-lightmap rewrite in PR #2) failed to match the visual richness, dramatic chiaroscuro lighting contrast, translucent glass placards, and top-to-bottom mat falloff of [playgrounds/photo_wall_playground.html](../../../playgrounds/photo_wall_playground.html). Instead of rewriting the renderer from prose specs again, this change lifts the playground's **exact CSS, exact WebGL2 PBR plaster shader, exact lighting math, and exact DOM structure** verbatim into Next.js and wires it directly to our existing SQLite + Bunny/local-uploads backend and Curator Drawer.

**Supersedes:** `dom-wall-engine` (PR #2 may be closed in favor of this direct port). `admin-route-isolation` continues to apply cleanly after this change.

## What Changes

- Extract `playgrounds/photo_wall_playground.html`'s **exact wall/placard/frame/shadow/HUD CSS** verbatim into `src/app/playground-wall.css` (stripping only the playground's left-side debug control panel and top demo banner).
- Extract `playgrounds/photo_wall_playground.html`'s **exact WebGL2 PBR plaster shader** (`wall_{albedo,normal,ao,roughness}.webp`, `N·L * cone / r² + roughness specular`, exact `alabaster`/`concrete`/`chiaroscuro` palettes) verbatim into `src/components/wall/PlaygroundPbrWall.tsx`, extending it only with additive 24-spot chunk passes when >24 fixtures are visible on screen (keeping 1–24 visible spots bit-for-bit identical to the playground).
- Extract `playgrounds/photo_wall_playground.html`'s **exact lighting math** (`LIGHT_CFG`, `rawIrradiance`, `--lit`, `--lit-top`, `--lit-bot`, `--lit-l`, `--lit-r`, `--sx`, `--sy` at `14px` placard / `22px` print depth) into `src/lib/lighting/playgroundLighting.ts`, computed purely from layout geometry (zero `offsetParent` DOM walking or `MutationObserver`).
- Mount the playground's exact DOM structure (`.world`, `.album-island`, `.museum-placard.mat-glass` + `.mat-aluminum`/`.mat-acrylic`/`.mat-rag` Settings variants, `.soundtrack-plaque` with `/api/youtube/thumb/[id]` proxy + native `<iframe>` + transparent gesture capture layer, `.photo-frame.is-lit` with recessed cotton mat & hover tilt/glare, Swiss HUD, compact bottom dock, and unobstructed Focus Bar) in `src/components/wall/PlaygroundGallery.tsx`, wired directly to:
  - `GET /api/wall` (published albums, `MAX_PHOTOS_PER_ALBUM = 20`, 3 albums per row, `PLACARD_GAP = 44px`, generous inter-album spacing, Row-0 3-album horizontal default camera framing, and `lodUrl.ts` `?width=256|800|2048` + disk-cached `?width=` resizing in `/api/local-uploads/[...path]`),
  - `suncalc` NYC circadian mood (`nyTimeMood.ts` + `?mood=` query pin + client-local Admin Lighting Preview),
  - Existing lazy-loaded `AdminDrawer` / `FolderDropzone` (with Settings placard-material selector, refreshing the wall live on publish/edit/delete).
- Add lightweight **viewport culling** (`visibleIslands`) and a **macro zoom guard** (`scale < 0.25`: hide `backdrop-filter`, placard text, soundtrack thumbnails, and iframes) so 50 albums (`50 × 20 = 1,000` photos) pan smoothly without altering Album or Row-0 visual appearance.
- Remove superseded R3F/Three.js files and `three`, `@types/three`, `@react-three/fiber`, `troika-three-text` dependencies once visual parity against `playgrounds/photo_wall_playground.html` is confirmed.

## Capabilities

### New Capabilities
<!-- None — modifies existing gallery capabilities by porting the playground engine verbatim -->

### Modified Capabilities
- `3d-pbr-wall-and-lighting`: Rename & update wall/placard requirements to use the verbatim `photo_wall_playground.html` WebGL2 PBR shader (with additive 24-spot chunking past 24 visible lights), exact `rawIrradiance` CSS variables, and exact `.mat-glass` (default) + `.mat-aluminum`/`.mat-acrylic`/`.mat-rag` placard CSS.
- `instanced-photo-renderer`: Remove R3F instanced renderer / `TexturePool` / `hitTestWall`; replace with viewport-culled verbatim playground DOM islands, projected-size `256/800/2048` `<img>` LOD + disk-cached `local-uploads` derivatives, `MAX_PHOTOS_PER_ALBUM = 20`, and macro zoom guard (`scale < 0.25`).
- `spatial-camera-navigation`: Preserve cursor-anchored zoom; drive both `.world` CSS transform and `PlaygroundPbrWall` WebGL2 uniforms from one synchronized camera loop, defaulting to Row 0 (first 3 albums horizontally) with working `Overview`/`0` reset and drag-threshold pointer capture.
- `gallery-hud-and-curator-ui`: Restore the playground's exact Swiss HUD segmented control, compact centered dock with edge fade masks, tracked uppercase Focus Bar, and Curator Settings placard-material selector wired to `GET /api/wall` & `AdminDrawer`.

## Impact

- **Dependencies Added**: `sharp` (for read-time disk-cached `?width=256|800|2048` derivatives in `/api/local-uploads`).
- **Dependencies Removed (after visual parity check)**: `three`, `@types/three`, `@react-three/fiber`, `troika-three-text`.
- **Reused Unchanged**: Entire backend (`backend-storage-crud`), `lodUrl.ts`, `nyTimeMood.ts`, `AdminDrawer`, `FolderDropzone`, `folderReader.ts`, self-hosted `TeX Gyre Heros` fonts, and `public/textures/wall/wall_*.webp`.
