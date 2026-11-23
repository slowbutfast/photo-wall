# OpenCode Orchestration Handoff: Sequential Two-Change Pipeline (`backend-storage-crud` → `frontend-gallery-wall`)

You are the orchestration agent running in OpenCode for a **two-change sequential OpenSpec implementation**:
1. **Change 1**: `backend-storage-crud`
2. **Change 2**: `frontend-gallery-wall`

Your primary directive is to execute each change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

> **CRITICAL PIPELINE RULE (1 Repair Pass + Unconditional Transition)**:
> - For **Change 1 (`backend-storage-crud`)**: run `openspec-apply-sub`, then `openspec-verify-change`. If critical issues or failed tests are found, execute **at most 1 bounded repair pass** via `spec-coder-sub` and re-run `openspec-verify-change`. **Regardless of whether Change 1 passes or still has failures after that single repair pass, DO NOT HALT.** Record the results in `openspec/changes/backend-storage-crud/verification.md` and **immediately start Change 2 (`frontend-gallery-wall`)**.
> - For **Change 2 (`frontend-gallery-wall`)**: run `openspec-apply-sub`, then `openspec-verify-change`. If critical issues or failed tests are found, execute **at most 1 bounded repair pass** via `spec-coder-sub` and re-run `openspec-verify-change`.

---

## PART A — Change 1: `backend-storage-crud`

### 1A. Orchestration Directive
- **Change Name**: `backend-storage-crud`
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub backend-storage-crud`)
- **Model Routing**: Default to **`opencode-go/deepseek-v4.1-flash`**, with paid direct DeepSeek API **`deepseek/deepseek-flash`** as fallback on quota/timeout/rate-limit errors.
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). Maintain strict isolation between feature compartments and avoid horizontal abstractions.

### 2A. Target Context Map (`backend-storage-crud`)
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `package.json`, `next.config.ts`, `tsconfig.json`, `drizzle.config.ts`, `.env.example` | `[NEW]` | Next.js 16 (`cacheComponents: true`), React 19, Drizzle ORM + `@libsql/client`, `jose`, `vitest`. |
| `src/db/schema.ts`, `src/db/index.ts` | `[NEW]` | `albums` (`draft \| published \| deleting`, `expectedCount`, no `posX`/`posY`), `photos` (`active \| deleting`, raw-bytes `contentHash`, `thumbHash`, cascade FK), `PRAGMA foreign_keys = ON`. |
| `src/lib/layout/types.ts`, `src/lib/layout/islandLayout.ts`, `src/lib/cdn/lodUrl.ts`, `src/lib/validation/youtube.ts` | `[NEW]` | `WORLD_SCALE = 0.01`, `ALBUMS_PER_ROW = 3`, `computeWallGridPositions(publishedAlbums)`, longest-edge Optimizer URLs, SSRF-safe `extractYoutubeVideoId` & `parseYoutubeTitle`. |
| `src/lib/storage/{types,bunny,local,deletions,index}.ts` | `[NEW]` | `StorageAdapter`, Bunny `PUT`/recursive `DELETE`/wildcard purge, `LocalStorageAdapter`, `sweepPendingDeletions()`. |
| `src/lib/upload/sanitizeImage.ts`, `src/lib/auth.ts`, `src/lib/manifest.ts` | `[NEW]` | `25 MB` cap, magic-byte sniff, Orientation-only EXIF rebuild + ICC preserve + orientation 5–8 dimension swap, `timingSafeEqual` + rate limit + CSRF, `'use cache'` `getWallSummary()`. |
| `src/app/api/wall/route.ts`, `src/app/api/local-uploads/[...path]/route.ts`, `src/app/api/admin/{auth,youtube/inspect,deletions/retry}/route.ts`, `src/app/api/admin/albums/{route,[id]/route,[id]/photos/route}.ts`, `src/app/api/admin/photos/[id]/route.ts` | `[NEW]` | Public manifest/local-stream + hardened admin CRUD, DB-first idempotent retry, `409` on `'deleting'` album upload, `revalidateTag('wall', { expire: 0 })`. |

### 3A. Technical & Architectural Boundaries (`backend-storage-crud`)
- **In-Scope Decisions**: Self-hosted Node.js MVP (`file:./data/photo-wall.db`), `25 MB` buffered uploads, binary Orientation-only EXIF allowlist + GPS/XMP strip without `sharp` re-encoding, `'use cache'` + `cacheTag('wall')` + `revalidateTag('wall', { expire: 0 })`, and `'deleting'` tombstones with startup sweep + retry endpoint.
- **Hard Exclusions / No-Go**:
  - Do NOT modify `.env`, `.env.*`, or credential files.
  - Do NOT introduce `sharp` for EXIF stripping or Vercel serverless adapters.
  - Do NOT implement `GET /api/albums/[id]/photos` (consolidated into `GET /api/wall`).

### 4A. Visual & UI Design Specifications
- **Status: Non-visual / Backend change.** No user-facing components, layout, or styling affected. Do NOT generate UI components or CSS rules in Change 1.

### 5A. Test Scaffolding & Verification Commands (`backend-storage-crud`)
- **Primary Test Runner**: `npx vitest run --poolOptions.threads.singleThread` (or `safe-test npx vitest run`)
- **TDD Requirement**: Task group `## 1` MUST scaffold failing unit/integration tests before touching implementation code and verify they fail initially.
- **Resource & Concurrency Rules**:
  - During task implementation, run ONLY the narrowest test file corresponding to the modified code.
  - Wrap full verification commands with `safe-test` (or `--workers=1`).

### 6A. Implementation Task Checklist (`backend-storage-crud`)
- [ ] 1.1 Bootstrap Next.js 16 (`cacheComponents: true` in `next.config.ts`) + TypeScript + Drizzle ORM + `jose` + `vitest` workspace (`package.json`, `next.config.ts`, `tsconfig.json`, `.env.example`, `drizzle.config.ts`).
- [ ] 1.2 Scaffold failing Vitest unit tests in `src/lib/layout/__tests__/islandLayout.test.ts` (`100px = 1 world unit` bounds, placard offset, 3-albums-per-row derived non-overlapping placement for published albums) and `src/lib/cdn/__tests__/lodUrl.test.ts` / `src/lib/storage/__tests__/bunny.test.ts` (`albumId` paths, longest-edge Optimizer URLs, wildcard purge paths).
- [ ] 1.3 Scaffold failing Vitest unit tests in `src/lib/upload/__tests__/sanitizeImage.test.ts` (`413` oversize, `415` magic-byte sniff, Orientation-6 JPEG test preserving `Orientation = 6` + swapping dimensions + stripping GPS/camera EXIF & XMP while keeping ICC, PNG/WebP/AVIF chunk strip) and `src/lib/__tests__/auth.test.ts` (`429` rate limit, SHA-256 `timingSafeEqual`, `403` `Origin` CSRF).
- [ ] 1.4 Scaffold failing Vitest route-handler tests in `src/app/api/__tests__/routes.test.ts` (temp `file:` LibSQL + `LocalStorageAdapter` + mocked Bunny client covering multipart contract, DB-first idempotent retry without storage touch, `409` on `'deleting'` album upload, SSRF rejection in `youtube/inspect`, draft/deleting exclusion from `/api/wall`, DB-fail rollback, `'deleting'` tombstone retry, and `401`/`403`).
- [ ] 1.5 Run `npx vitest run` to confirm all newly scaffolded tests fail before implementation.
- [ ] 2.1 Implement `src/db/schema.ts` and `src/db/index.ts` enforcing `PRAGMA foreign_keys = ON`.
- [ ] 2.2 Implement `src/lib/layout/types.ts`, `src/lib/layout/islandLayout.ts`, and `src/lib/validation/youtube.ts` until `islandLayout.test.ts` and `youtube.test.ts` pass.
- [ ] 2.3 Implement `src/lib/cdn/lodUrl.ts` until `lodUrl.test.ts` passes.
- [ ] 3.1 Implement `src/lib/storage/{types,bunny,local,deletions,index}.ts` until `bunny.test.ts` passes.
- [ ] 3.2 Implement `src/lib/upload/sanitizeImage.ts` until `sanitizeImage.test.ts` passes.
- [ ] 3.3 Implement `src/lib/manifest.ts`.
- [ ] 4.1 Implement `src/lib/auth.ts` until `auth.test.ts` passes.
- [ ] 4.2 Implement `src/app/api/wall/route.ts` and `src/app/api/local-uploads/[...path]/route.ts`.
- [ ] 4.3 Implement `src/app/api/admin/auth/route.ts`, `src/app/api/admin/youtube/inspect/route.ts`, `src/app/api/admin/deletions/retry/route.ts`, `src/app/api/admin/albums/route.ts`, and `src/app/api/admin/albums/[id]/route.ts`.
- [ ] 4.4 Implement `src/app/api/admin/albums/[id]/photos/route.ts` and `src/app/api/admin/photos/[id]/route.ts` until `routes.test.ts` passes.
- [ ] 5.1 Run full backend regression suite (`npx vitest run`, `npm run lint`, `npx tsc --noEmit`).

### 7A. Change 1 Verification & Single-Pass Repair → Unconditional Transition to Change 2
1. Ensure `openspec/changes/backend-storage-crud/verification.md` is populated (Audit Matrix, Resolved Assumptions, Symbol Audit, Verbatim Logs) and run `openspec-verify-change` on `backend-storage-crud`.
2. If critical issues or test failures occur, run **1 bounded repair pass** via `spec-coder-sub` and re-run `openspec-verify-change`.
3. **Transition Rule**: Whether `backend-storage-crud` passed cleanly OR still has remaining failures after its single repair pass, record its final status in `openspec/changes/backend-storage-crud/verification.md` and **immediately proceed to PART B (`frontend-gallery-wall`) without halting**.

---

## PART B — Change 2: `frontend-gallery-wall`

### 1B. Orchestration Directive
- **Change Name**: `frontend-gallery-wall`
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub frontend-gallery-wall`)
- **Model Routing**: Default to **`opencode-go/deepseek-v4.1-flash`**, with paid direct DeepSeek API **`deepseek/deepseek-flash`** as fallback on quota/timeout/rate-limit errors.
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). Reuse `islandLayout.ts` (`100px = 1 world unit`) and `lodUrl.ts` created in Change 1.

### 2B. Target Context Map (`frontend-gallery-wall`)
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `public/fonts/*`, `src/app/layout.tsx`, `src/app/globals.css` | `[NEW]` | Bundled `@font-face` `TeX Gyre Heros` + `DESIGN.md` CSS tokens (`100px = 1 world unit`). |
| `src/lib/camera/cameraMath.ts`, `src/lib/lighting/{fixtures,nyTimeMood}.ts`, `src/lib/dev/fakeManifest.ts` | `[NEW]` | Clamped `zoomToCursor`, `bottomInsetPx`-aware `fitBoundsToViewport`, `buildWorldFixtures` (true `z = 0.14`/`0.22`), offline `suncalc` + 60s crossfade + per-mood tokens, `?demo=2000` generator. |
| `src/components/wall/{InfiniteWallShader,WallInstancedLayer,TexturePool,VisiblePrintPool,CameraRig,PhotoWallCanvas}.tsx(ts)` | `[NEW]` | `O(1)` draw-call hybrid renderer, instanced spotlight quads, `VisiblePrintPool` unified mat+print lift, `troika-three-text` LOD `< 8px` glass placards (Fresnel bevel + frosted backing), `ImageBitmap` VRAM byte pool. |
| `src/app/api/youtube/thumb/[id]/route.ts`, `src/store/useWallStore.ts`, `src/components/wall/SoundtrackPlaque.tsx` | `[NEW]` | `i.ytimg.com` CORS proxy, Zustand store, `2.14u × 2.00u` resting plaque + `matrix3d` DOM `YT.Player` overlay (unmounts on pan/drag/wheel & `viewMode !== 'album'`). |
| `src/components/hud/{GalleryHud,PhotoFocusBar}.tsx`, `src/components/admin/{folderReader.ts,FolderDropzone.tsx,AdminDrawer.tsx}`, `src/components/PhotoWallApp.tsx`, `src/app/page.tsx` | `[NEW]` | Lock-gated `Curate` HUD, unobstructed bottom Focus bar, `next/dynamic` Curator Drawer (`readEntries()` loop, hidden `YT.Player.getDuration()`, client-local Lighting Preview, Pending Deletions retry). |

### 3B. Technical & Architectural Boundaries (`frontend-gallery-wall`)
- **In-Scope Decisions**: Continuous PBR plaster wall (`public/textures/wall/wall_*.webp`), instanced per-album spotlights (no 24-light cap), offline `suncalc` NYC circadian moods, `TeX Gyre Heros` everywhere, and `matrix3d` DOM YouTube overlay.
- **Hard Exclusions / No-Go**:
  - Do NOT proceed to Section 4 (`SoundtrackPlaque`, HUD, Curator UI) until Section 3 (`?demo=2000` 60fps spike) is complete.
  - Do NOT add manual mood selectors to the public HUD, top-left telemetry, or modal blurs in Photo Focus.
  - Do NOT install `exifr` or call external solar APIs (`SunriseSunset.io`).

### 4B. Visual & UI Design Specifications & Vision Verification
- **Theme**: `Chiaroscuro Gallery` (`DESIGN.md`)
- **Key Tokens**:
  - Wall Base: `#2D2C29` (`chiaroscuro`) / `#6B6861` (`concrete`) / `#ECE9E2` (`alabaster`)
  - Primary: `#ECEAE4` | Secondary: `#9E9C95` | HUD Surface: `rgba(24, 24, 22, 0.86)`
  - Placard Backing: `rgba(20, 22, 20, 0.74)` (`#F4F6F4` ink) / `rgba(244, 246, 244, 0.72)` (`#1D1E1C` ink)
  - Admin Drawer: `#FFFFFF` surface | `#1A1B19` ink | `#2D3B36` accent
- **Component Anatomy & States**: Prints at `z = 0.22` (hover `z = 0.36`, focus `z = 0.54`), shadows at `z = 0.002`, glass placards & soundtrack plaques (`2.14u × 2.00u`) at `z = 0.14`.
- **Responsive Layout**: 3 albums per row; mobile `< 768px` uses `96 MB` VRAM cap, `touch-action: none`, `bottomInsetPx`-aware framing, and `>= 44px` touch targets.
- **Multi-Modal Vision Verification**:
  - Capture screenshots using Playwright CLI (`npx playwright screenshot`) at Macro Overview, Album Focus, and Print Focus, and inspect directly. Leave physical laptop iGPU calibration marked for manual review if needed while completing all automated code, test, and build tasks.

### 5B. Test Scaffolding & Verification Commands (`frontend-gallery-wall`)
- **Primary Test Runner**: `safe-test npx vitest run` (with `--workers=1`)
- **TDD Requirement**: Task group `## 1` MUST scaffold failing unit/property tests before touching implementation code.

### 6B. Implementation Task Checklist (`frontend-gallery-wall`)
- [ ] 1.1 Install frontend dependencies (`three`, `@types/three`, `@react-three/fiber@^9`, `troika-three-text`, `suncalc`, `@types/suncalc`, `zustand`, `thumbhash`, `uuid`, `lucide-react`, `fast-check`, `tailwindcss`) and bundle `TeX Gyre Heros` under `public/fonts/`.
- [ ] 1.2 Scaffold failing property tests in `src/lib/camera/__tests__/cameraMath.test.ts`.
- [ ] 1.3 Scaffold failing unit tests in `src/lib/lighting/__tests__/fixtures.test.ts` and `src/lib/lighting/__tests__/nyTimeMood.test.ts` (including March/November DST transitions & per-mood tokens).
- [ ] 1.4 Scaffold failing unit tests in `src/components/wall/__tests__/TexturePool.test.ts`, `src/components/wall/__tests__/SoundtrackOverlay.test.ts`, and `src/components/admin/__tests__/folderReader.test.ts`.
- [ ] 1.5 Run `npx vitest run` to confirm all newly scaffolded frontend tests fail before implementation.
- [ ] 2.1 Implement `src/lib/camera/cameraMath.ts` until `cameraMath.test.ts` passes.
- [ ] 2.2 Implement `src/lib/lighting/fixtures.ts` and `src/lib/lighting/nyTimeMood.ts` until `fixtures.test.ts` and `nyTimeMood.test.ts` pass.
- [ ] 2.3 Wire `DESIGN.md` tokens and `@font-face` `TeX Gyre Heros` into `src/app/layout.tsx` and `src/app/globals.css`.
- [ ] 3.1 Create `src/lib/dev/fakeManifest.ts` (`?demo=2000`).
- [ ] 3.2 Implement `src/components/wall/InfiniteWallShader.tsx`.
- [ ] 3.3 Implement `src/components/wall/WallInstancedLayer.tsx` and `troika-three-text` beveled glass standoff placards.
- [ ] 3.4 Implement `src/components/wall/TexturePool.ts` until `TexturePool.test.ts` passes.
- [ ] 3.5 Implement `src/components/wall/VisiblePrintPool.tsx`, `CameraRig.tsx`, and `PhotoWallCanvas.tsx`.
- [ ] 3.6 Benchmark `?demo=2000` at `1920x1080` before proceeding to Section 4.
- [ ] 4.1 Create `src/store/useWallStore.ts` and `src/app/api/youtube/thumb/[id]/route.ts`.
- [ ] 4.2 Implement `src/components/wall/SoundtrackPlaque.tsx` + CSS `matrix3d` DOM `YT.Player` overlay until `SoundtrackOverlay.test.ts` passes.
- [ ] 4.3 Implement `src/components/hud/GalleryHud.tsx` and `src/components/hud/PhotoFocusBar.tsx`.
- [ ] 4.4 Implement `src/components/admin/folderReader.ts`, `FolderDropzone.tsx`, and `AdminDrawer.tsx` loaded via `next/dynamic`.
- [ ] 4.5 Assemble `src/components/PhotoWallApp.tsx` and `src/app/page.tsx`.
- [ ] 5.1 Run full regression suite (`npx vitest run`, `npm run lint`, `npx tsc --noEmit`, `npm run build`) and confirm `AdminDrawer` is code-split from the public bundle.

### 7B. Final Verification, Single-Pass Repair & PR Creation
1. Populate `openspec/changes/frontend-gallery-wall/verification.md` and run `openspec-verify-change` on `frontend-gallery-wall`.
2. **If verification fails on initial pass**: run **1 bounded repair pass** via `spec-coder-sub` and re-run `openspec-verify-change`.
3. **Final Outcome**:
   - Create/switch to feature branch `feat/photo-wall-full`.
   - For each change that passed verification, run `openspec specs apply --change "<name>"`.
   - Stage and commit all implementation files, `openspec/changes/`, and `openspec/specs/`, push (`git push -u origin HEAD`), and open a Pull Request (`gh pr create --fill`) noting the verification status of both changes (including any remaining blockers from Change 1 or Change 2 if a single repair pass did not clear everything).
   - If Change 2 still has critical blockers after its single repair pass, **HALT** after recording both Verification Reports and present the remaining blockers to the user.
