# Research: `frontend-gallery-wall`

## Source Material

- **2026-11-22 — User Request (Initial Vision)**:
  > "make an app that is a basically like a photo wall where you can where I can like upload a bunch of photos and then basically have them displayed in like kind of like a neutral grid but then the idea is for different like photo albums or photo rolls they're gonna be displayed on like a 3d wall and then you can like go up down left to right or like zoom out to view all the photos and then like essentially like click in and then like sort of fliers zoom in onto those set of photos or then you could like zoom out again and then basically so it feels like a 3d like interactive gallery wall almost but it's like like vertically and horizontally like infinite which is impossible and like a real wall"
- **2026-11-22 — User Choices (Clarifying Answers)**:
  - Audience: Personal gallery (public read-only wall, private admin mode to upload/manage).
  - Spatial layout: Clustered album islands on one continuous infinite 2D/3D plane.
  - Tech stack: Next.js (App Router) + React Three Fiber (Three.js) + TypeScript.
  - CDN: Bunny.net Storage + Bunny Optimizer.
- **2026-11-22 — User Feedback (Physical Realism & Config)**:
  - "the texture behind the photos are a, like a plaster wall... titles for each set of photos are a, like a physical like title card... a bit of like a light reflection on them. Like if there was like an overhead light... average amount of photos for each of the galleries will be 10 to 20."
  - Preferences: `showMinimap: false`, `showExifInFocus: true`, `cameraFlyDurationMs: 1000`, `gridGutterPx: 24`, `hoverTiltDeg: 5`, `adminUi: "slide-over-drawer"`.
- **2026-11-22 — User-Approved Lighting & Placard Direction (`lighting_realism_plan.md`)**:
  - Borderless continuous PBR plaster wall (`public/textures/wall/wall_*.webp`), zero alcove boxes or visible track-lighting bars.
  - Single physical spotlight model driving wall PBR normals, frame/placard falloff, and directional cast shadows.
  - Swiss-modernist brushed-aluminum placards (Helvetica/grotesque bold title + regular caption, 3mm matte black backing core).
- **2026-11-23 — Peer Review Audits**:
  - **24-light uniform cap breaks macro view**: 50 albums × 2–3 fixtures = 100–150 lights. Replace global uniform loop on wall with **1 additive quad per album** carrying that album's 1–3 local lights, and pre-compute print/placard `litTop/Bot/L/R` + `(sx, sy)` on CPU at manifest load.
  - **World-unit conversion**: Standardize `100px = 1 world unit` (`WORLD_SCALE = 0.01`), owned by `src/lib/layout/islandLayout.ts` in `backend-storage-crud`.
  - **WebGL Placard Text**: `Helvetica Neue` is a non-web system font; use OFL **`Inter Tight`** (or **`Instrument Sans`**) rendered via **`troika-three-text`**.
  - **Unified Print + Mat Lift**: Pooled textured prints render their own mat + hide their instanced slot (`aVisible = 0`) so print and mat never separate on hover/focus tilt.
  - **ImageBitmap `flipY` & Actual Byte Accounting**: `ImageBitmap` ignores `texture.flipY`, so decode with `imageOrientation: 'from-image'` and flip `vUv.y = 1.0 - vUv.y` in the shader; count VRAM from decoded `bitmap.width * bitmap.height * 4 * 1.33`.
- **Raised but not acted on**:
  - *Video support*: Explicitly excluded ("right now I just want to have photos and no videos").
  - *Minimap radar*: Disabled by default (`showMinimap: false`).
  - *HEIC client conversion & per-album macro contact-sheet atlas*: Deferred to Phase 2.

## Glossary

| Term | Meaning in this Change | Does NOT mean |
| :--- | :--- | :--- |
| **Exhibition Wing / Album Island** | A borderless spatial cluster of 10–20 framed prints + 1 left-mounted brushed-aluminum placard on the infinite wall. | A bordered CSS alcove box or separate HTML page. |
| **Analytic / Stylized Spotlight Model (`buildWorldFixtures`)** | One track-head coordinate list (`1` head per `2` grid cols, aimed `28%` down the grid, `heightFrac: 0.98`, `throwFrac: 0.72`, `innerDeg: 16°`, `outerDeg: 32°`, warm `#FFF5E3`) driving per-album wall quads and CPU-precomputed print/placard attributes. | Multi-pass Three.js `SpotLight` shadow maps or a global 24-light cap. |
| **Hybrid Instanced Renderer** | `O(1)` draw calls regardless of photo count: wall shadow pass + instanced mat/ThumbHash atlas pass + per-album spotlight wall quads + `VisiblePrintPool` textured quads + `troika-three-text` placards. | One React `<mesh>` component per photo across the wall. |
| **VRAM Byte Budget** | Tracking decoded RGBA + mipmap bytes (`bitmap.width * bitmap.height * 4 * 1.33`) capped at `256 MB` desktop / `96 MB` mobile (`viewport < 768px` heuristic) with strict eviction priority. | A fixed texture count (`MAX_TEXTURES = 160`) or counting requested LOD size instead of actual decoded dimensions. |
| **World Scale (`100px = 1 world unit`)** | `WORLD_SCALE = 0.01` shared with `backend-storage-crud`'s `islandLayout.ts` (`zClamp = [2.4, 140.0]`, `near = 0.20`). | Mixing CSS pixels and Three.js world units. |

## External Research

- **Google `DESIGN.md` Specification** (`github.com/google-labs-code/design.md`, cached via `opensrc` at `~/.opensrc/repos/github.com/google-labs-code/design.md/main/`, Apache-2.0, accessed 2026-11-22): YAML frontmatter token schema + 8 ordered Markdown sections; validated via `npx @google/design.md lint DESIGN.md`.
- **van Wijk & Nuij Smooth Zooming & Panning** (*Smooth and efficient zooming and panning*, InfoVis 2003): `interpolateZoom` curved trajectory.
- **`troika-three-text`** (MIT): SDF-based crisp WebGL typography using bundled OFL `Inter Tight` / `Instrument Sans` `.woff2`/`.ttf` font files.

## Candidate Tech

| Candidate | Status | Rationale & Date |
| :--- | :--- | :--- |
| **Next.js 16 + React 19 + R3F v9** | Adopted | Matches React 19 compatibility and App Router SSR (2026-11-22). |
| **`three` + `troika-three-text` + custom GLSL** | Adopted | Required for `O(1)` draw-call instancing, PBR plaster quads, and crisp WebGL placard text (2026-11-23). |
| **`ImageBitmapLoader` + `AbortController`** | Adopted | Off-thread image decoding (`imageOrientation: 'from-image'`) prevents fly-in hitches (2026-11-23). |
| **Global 24-light uniform array** | Rejected | Fails at macro view with 50 albums (100–150 fixtures) (2026-11-23). |
| **Per-photo R3F `<mesh>` + `SpotLight` shadows** | Rejected | 3,600+ draw calls and N shadow-map passes collapse macro 60fps on iGPUs (2026-11-22). |

## Patterns Adopted

- **Per-Album Additive PBR Light Quads + CPU-Precomputed Object Shading** → `src/lib/lighting/fixtures.ts` & `InfiniteWallShader.tsx`.
- **Broad-Phase `O(albums)` AABB + `O(1)` Grid Cell Hit-Test** → `src/lib/camera/cameraMath.ts` (`hitTestWall`).
- **ThumbHash `32x32` Atlas Texture** → `WallInstancedLayer.tsx` (2,000 × 32² × 4B ≈ 8 MB, 1 atlas bind).

## Verified Facts

| Claim | Verification Method | Result |
| :--- | :--- | :--- |
| Four PBR plaster textures exist at `public/textures/wall/` | `ls -lh public/textures/wall` (2026-11-22) | Verified: `wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`. |
| `DESIGN.md` passes `@google/design.md lint` with 0 errors | `npx --yes @google/design.md lint DESIGN.md` (2026-11-22) | Verified: `summary.errors = 0`. |

## Unverified Assumptions

- **2,000-photo 60fps budget (`p95 <= 16.7ms`, `< 256 MB` GPU) on integrated laptop GPU at `1920x1080`**: Must be benchmarked during the Phase 3 performance spike before building HUD/upload UI.
- **`ImageBitmap` `imageOrientation: 'from-image'` + shader V-flip with Bunny Optimizer EXIF-rotated JPEGs**: Unverified until live Bunny smoke test; test with orientation-6 phone JPEG.

## Superseded Claims

- *Old claim (2026-11-22)*: Global 24-light uniform array, `Helvetica Neue` in WebGL, `1 draw call`, pixel-unit `Z=22px`/`54px` in `design.md`, and `O(1)` wall-wide hit-test. *Why wrong*: 24 lights darken 50-album macro view; system fonts don't render in WebGL; shadows need a separate pass at `z=0`; CSS px != world units; irregular album lookup is `O(albums)` broad-phase. *Replaced by*: Per-album additive wall quads + CPU-precomputed instance shading, `troika-three-text` + OFL `Inter Tight`, `O(1)` draw calls, `100px = 1 world unit` (`z=0.22`/`0.54`), and `O(albums)` + `O(1)` hit-test.

## Links Out

- [DESIGN.md](../../../DESIGN.md)
- [lighting_realism_plan.md](./lighting_realism_plan.md)
- [backend-storage-crud/research.md](../backend-storage-crud/research.md)
