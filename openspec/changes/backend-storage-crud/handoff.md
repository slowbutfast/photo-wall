# OpenCode Orchestration Handoff: Sequential Execution of `backend-storage-crud` → `frontend-gallery-wall`

You are the orchestration agent running in OpenCode.
Your directive is to execute **both** OpenSpec changes sequentially—first **`backend-storage-crud`**, then **`frontend-gallery-wall`**—using the **`openspec-apply-sub`** skill (which delegates task implementation to `spec-coder-sub`), with **at most 1 repair pass per change**, and **without halting between the two changes**.

> **CRITICAL CONTINUATION RULE:**
> After completing `backend-storage-crud` (including its `openspec-verify-change` check and, if needed, **1 bounded repair pass** + re-verification), **commit the current state and immediately proceed to `frontend-gallery-wall` regardless of whether `backend-storage-crud` passed cleanly or still has remaining failures**. Do NOT halt between Change 1 and Change 2.

---

## 1. Orchestration Directive
- **Change 1 (First)**: `backend-storage-crud` (`openspec/changes/backend-storage-crud/`)
- **Change 2 (Second)**: `frontend-gallery-wall` (`openspec/changes/frontend-gallery-wall/`)
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub <change-name>`)
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). Maintain strict isolation between feature compartments and avoid horizontal abstractions.
- **Branching**: Create and work on a dedicated feature branch `feat/photo-wall-mvp` (if currently on `main`/`master`).

---

## 2. Target Context Map

### Change 1: `backend-storage-crud` (All `[NEW]` Greenfield Files)
| File Path (relative to repo root) | Target | Modification Summary |
|---|---|---|
| `package.json`, `next.config.ts`, `tsconfig.json`, `.env.example`, `drizzle.config.ts` | `[NEW]` | Next.js 16 (`cacheComponents: true` in `next.config.ts`), TypeScript, Drizzle ORM, `@libsql/client`, `jose`, `vitest`. |
| `src/db/schema.ts`, `src/db/index.ts` | `[NEW]` | `albums` (`status: 'draft' \| 'published' \| 'deleting'`, `expectedCount`, optional `cameraName`/`dateLabel`/`locationLabel`, optional YouTube soundtrack fields, `$defaultFn` timestamps, NO `posX`/`posY`), `photos` (`status: 'active' \| 'deleting'`, raw-bytes `contentHash`, `thumbHash`, cascade FK), `PRAGMA foreign_keys = ON`. |
| `src/lib/layout/types.ts`, `src/lib/layout/islandLayout.ts`, `src/lib/cdn/lodUrl.ts`, `src/lib/validation/youtube.ts` | `[NEW]` | `WORLD_SCALE = 0.01` (`100px = 1 world unit`), `ALBUMS_PER_ROW = 3`, `PLACARD_WIDTH = 2.14`, `PLACARD_HEIGHT = 2.00`, `SOUNDTRACK_HEIGHT = 2.00`, `computeWallGridPositions(publishedAlbums)`, longest-edge Optimizer URLs, SSRF-safe `extractYoutubeVideoId` & `parseYoutubeTitle`. |
| `src/lib/storage/{types,bunny,local,deletions,index}.ts` | `[NEW]` | `StorageAdapter`, `BunnyStorageAdapter` (`PUT`, recursive `DELETE` `/albums/{albumId}/`, wildcard purge `/albums/{albumId}/*` & `/albums/{albumId}/{photoId}.*`), `LocalStorageAdapter`, `sweepPendingDeletions()`. |
| `src/lib/upload/sanitizeImage.ts`, `src/lib/auth.ts`, `src/lib/manifest.ts` | `[NEW]` | `25 MB` cap (`413`), magic-byte sniff (`415`), Orientation-only EXIF allowlist rebuild + GPS/camera/XMP strip + ICC preserve + orientation 5–8 dimension swap, SHA-256 `timingSafeEqual` + rate limit (`429`) + `Origin` CSRF (`403`), `'use cache'` + `cacheTag('wall')` `getWallSummary()`. |
| `src/app/api/wall/route.ts`, `src/app/api/local-uploads/[...path]/route.ts`, `src/app/api/admin/{auth,youtube/inspect,deletions/retry}/route.ts`, `src/app/api/admin/albums/{route,[id]/route,[id]/photos/route}.ts`, `src/app/api/admin/photos/[id]/route.ts` | `[NEW]` | Public manifest + local uploads; admin auth (`GET/POST/DELETE`), `videoId`-only SSRF-safe YouTube `inspect` returning `{ videoId, artistGuess, titleGuess }`, `409` on upload to `'deleting'` album, DB idempotency check *before* storage `PUT`, `revalidateTag('wall', { expire: 0 })`, and `'deleting'` tombstone + Pending Deletions retry. |

### Change 2: `frontend-gallery-wall` (All `[NEW]` Greenfield Files)
| File Path (relative to repo root) | Target | Modification Summary |
|---|---|---|
| `public/fonts/*`, `src/app/layout.tsx`, `src/app/globals.css` | `[NEW]` | Bundled `TeX Gyre Heros` `.woff2`/`.ttf` (`@font-face`) + `DESIGN.md` CSS custom properties (`100px = 1 world unit`). |
| `src/lib/camera/cameraMath.ts`, `src/lib/lighting/{fixtures,nyTimeMood}.ts`, `src/lib/dev/fakeManifest.ts` | `[NEW]` | Clamped `zoomToCursor`, `bottomInsetPx`-aware `fitBoundsToViewport`, `hitTestWall`, `buildWorldFixtures` at true object `z` (`0.14` placard / `0.22` prints), offline `suncalc` (`40.7128, -74.0060`) + 60s crossfade + per-mood tokens (`alabaster`/`concrete`/`chiaroscuro`), `?demo=2000` generator. |
| `src/components/wall/{InfiniteWallShader,WallInstancedLayer,TexturePool,VisiblePrintPool,CameraRig,PhotoWallCanvas}.tsx(ts)` | `[NEW]` | `O(1)` draw-call hybrid renderer: base PBR plaster (`public/textures/wall/wall_*.webp`), instanced per-album spotlight quads, wall shadows (`z = 0.002`), instanced mats + `32x32` ThumbHash atlas, `VisiblePrintPool` (`<= 40` prints, `aVisible = 0` unified lift), `troika-three-text` `TeX Gyre Heros` glass placards (`2.14u × 2.00u`, faked Fresnel bevel, frosted text backing, LOD-culled `< 8px`), `ImageBitmap` VRAM byte pool (`256 MB` desktop / `96 MB` mobile, `imageOrientation: 'from-image'` + shader V-flip). |
| `src/app/api/youtube/thumb/[id]/route.ts`, `src/store/useWallStore.ts`, `src/components/wall/SoundtrackPlaque.tsx` | `[NEW]` | CORS proxy for `i.ytimg.com`, Zustand store (`GET /api/wall`, `GET /api/admin/auth`), `2.14u × 2.00u` plaque (`TexturePool`-budgeted thumbnail) + CSS `matrix3d` DOM `YT.Player` overlay (only in `album` `viewMode`, unmounts immediately on pan/drag/wheel start, stops on `viewMode` exit). |
| `src/components/hud/{GalleryHud,PhotoFocusBar}.tsx`, `src/components/admin/{folderReader.ts,FolderDropzone.tsx,AdminDrawer.tsx}`, `src/components/PhotoWallApp.tsx`, `src/app/page.tsx` | `[NEW]` | Lock-gated `Curate` HUD, unobstructed bottom Photo Focus bar (album caption + optional manual `Camera • Date • Location`), `next/dynamic` Curator Drawer (`readEntries()` loop, hidden `YT.Player.getDuration()` capture, client-local Lighting Preview, Pending Deletions retry, draft Resume/Discard), SSR `getWallSummary()` + `suncalc` mood. |

---

## 3. Technical & Architectural Boundaries
- **Backend (`backend-storage-crud`)**:
  - Self-hosted Node.js MVP (`file:./data/photo-wall.db`, `25 MB` buffered uploads). No Vercel serverless / Turso HTTP.
  - `cacheComponents: true` in `next.config.ts`; use `revalidateTag('wall', { expire: 0 })` in Route Handlers (never `updateTag`, which is Server-Action-only).
  - Do NOT create `GET /api/albums/[id]/photos` (removed; `/api/wall` serves all needed data).
  - Do NOT store `posX`/`posY` on `albums` or reserve wall space for `draft` albums.
- **Frontend (`frontend-gallery-wall`)**:
  - Standardize exclusively on bundled `TeX Gyre Heros` (both WebGL `troika-three-text` and DOM `@font-face`).
  - Use offline `suncalc` (zero external solar API calls, zero `localStorage` solar cache).
  - Do NOT mount `YT.Player` inside WebGL; use the CSS `matrix3d` DOM overlay in `album` `viewMode` only.
- **Hard Exclusions / No-Go**:
  - Do NOT modify `.env`, `.env.*`, or credential files.
  - Do NOT introduce unapproved external dependencies.
  - Do NOT perform code modifications outside the Target Context Map without prior task coverage.

---

## 4. Visual & UI Design Specifications & Vision Verification
- **Change 1 (`backend-storage-crud`)**: **Non-visual / Backend change.** No user-facing components, layout, or styling affected.
- **Change 2 (`frontend-gallery-wall`)**:
  - **Theme**: Chiaroscuro Gallery (`DESIGN.md`, `100px = 1 world unit`).
  - **Key Tokens**:
    - Wall Base: `#2D2C29` (`chiaroscuro`) / `#6B6861` (`concrete`) / `#ECE9E2` (`alabaster`) | Ambient: `#141412`
    - Primary: `#ECEAE4` | Secondary: `#9E9C95` | Mat Cotton: `#F6F4EF` | HUD Surface: `rgba(24, 24, 22, 0.86)`
    - Placard Glass & Backing: `rgba(226, 242, 234, 0.22)` + `rgba(244, 246, 244, 0.72)` (`#1D1E1C` ink in `alabaster`) / `rgba(20, 22, 20, 0.74)` (`#F4F6F4` ink in `concrete`/`chiaroscuro`), `>= 4.5:1` contrast.
    - Admin Surface: `#FFFFFF` | Admin Ink: `#1A1B19` | Admin Accent: `#2D3B36`
  - **Component Anatomy & States**: Print idle `z = 0.22`, hover `z = 0.36` (tilt `<= 5°`, unified mat+print), focus `z = 0.54` (dimming cleared); Placard & Soundtrack Plaque `2.14u × 2.00u` at `z = 0.14`; cast shadows at `z = 0.002` (`depthWrite: false`).
  - **Responsive Layout**: 3 albums per row; desktop `>= 768px` (`256 MB` VRAM, `340px` drawer); mobile `< 768px` (`96 MB` VRAM, `touch-action: none`, `bottomInsetPx`-aware framing, touch targets `>= 44px`).
  - **Multi-Modal Vision Verification**: Capture screenshots using Playwright CLI (e.g. `npx playwright screenshot`) at Macro Overview, Album Focus, and Print Focus, and inspect directly. Leave hardware-specific 60fps integrated-GPU calibration marked for manual maintainer review if headless GPU is unavailable.

---

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: `npx vitest run --poolOptions.threads.singleThread` (or `safe-test npx vitest run`)
- **TDD Requirement**: For each change, Task Group `## 1. Test Scaffolding (TDD)` MUST scaffold failing tests and verify they fail before writing implementation code.
- **Resource & Concurrency Rules**:
  - During implementation, run ONLY the narrowest test file corresponding to the modified code.
  - Wrap verification test runs with `safe-test` (or `--workers=1`) to prevent memory thrashing.

---

## 6. Sequential Execution Workflow (Both Changes, Max 1 Repair Pass Each, Non-Blocking Transition)

### Stage A — Execute `backend-storage-crud`
1. Run `openspec-apply-sub` for `backend-storage-crud` (`tasks.md` sections `1`–`4`, strictly TDD).
   - Checklist summary: `1.1–1.5` (bootstrap & failing tests) → `2.1–2.3` (schema, `islandLayout.ts`, `youtube.ts`, `lodUrl.ts`) → `3.1–3.3` (storage adapters, `sanitizeImage.ts`, `manifest.ts`) → `4.1–4.4` (`auth.ts`, public & admin routes).
2. Populate `openspec/changes/backend-storage-crud/verification.md` and run `openspec-verify-change` for `backend-storage-crud`.
3. **Single-Pass Repair (`Max Retries = 1`)**:
   - If critical issues or test failures are detected on the initial `openspec-verify-change` pass:
     - Delegate **1 bounded repair pass** to `spec-coder-sub` with the exact failure logs.
     - Re-run `openspec-verify-change` for `backend-storage-crud` and update `verification.md`.
4. **Non-Blocking Transition to Stage B (IMPORTANT)**:
   - **Regardless of whether `backend-storage-crud` passed verification or still has remaining issues after its 1 repair pass**, stage and commit all work so far (`git add -A && git commit -m "feat(backend): complete backend-storage-crud pass"`) and **immediately proceed to Stage B (`frontend-gallery-wall`)**. Do NOT halt here.

### Stage B — Execute `frontend-gallery-wall`
1. Run `openspec-apply-sub` for `frontend-gallery-wall` (`tasks.md` sections `1`–`4`, strictly TDD, honoring the Section `3.6` `?demo=2000` check before Section `4`).
   - Checklist summary: `1.1–1.5` (deps, `TeX Gyre Heros` fonts, failing tests) → `2.1–2.3` (`cameraMath.ts`, `fixtures.ts`, `nyTimeMood.ts`, tokens) → `3.1–3.6` (`fakeManifest.ts`, `InfiniteWallShader.tsx`, `WallInstancedLayer.tsx`, `TexturePool.ts`, `VisiblePrintPool.tsx`, `?demo=2000` spike) → `4.1–4.5` (`useWallStore.ts`, `SoundtrackPlaque.tsx` DOM overlay, `GalleryHud.tsx`, `PhotoFocusBar.tsx`, `AdminDrawer.tsx`, `app/page.tsx`).
2. Populate `openspec/changes/frontend-gallery-wall/verification.md` and run `openspec-verify-change` for `frontend-gallery-wall`.
3. **Single-Pass Repair (`Max Retries = 1`)**:
   - If critical issues or test failures are detected on the initial `openspec-verify-change` pass:
     - Delegate **1 bounded repair pass** to `spec-coder-sub` with the exact failure logs.
     - Re-run `openspec-verify-change` for `frontend-gallery-wall` and update `verification.md`.
   - If verification still fails after the single repair pass, **HALT** and present the combined Verification Report (covering both `backend-storage-crud` and `frontend-gallery-wall`) and remaining blockers.

### Stage C — Finalize & Open Pull Request (If Both Passed)
- If both `backend-storage-crud` and `frontend-gallery-wall` pass verification:
  1. Run `openspec specs apply --change "backend-storage-crud"` and `openspec specs apply --change "frontend-gallery-wall"`.
  2. Stage, commit, push `feat/photo-wall-mvp` (`git push -u origin HEAD`), and open a Pull Request via `gh pr create --fill` summarizing both changes and their `verification.md` results.
