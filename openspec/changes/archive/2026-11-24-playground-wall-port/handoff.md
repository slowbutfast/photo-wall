# OpenCode Orchestration Handoff: OpenSpec Change 'playground-wall-port'

You are the orchestration agent for OpenSpec change 'playground-wall-port' running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive
- **Change Name**: `playground-wall-port`
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub playground-wall-port`)
- **Base Branch**: Branch from `main` (which includes merged `dom-wall-engine` at `9d8e277`) into `feat/playground-wall-port`.
- **Pinned Playground Source**: `playgrounds/photo_wall_playground.html` at commit `dcc7a0484e0b1cb11a5a7c13120a9bf7c8e15edc`.
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). Reuse all non-renderer infrastructure already on `main`; replace ONLY the wall/DOM renderer with the verbatim playground port.

## 2. Target Context Map
| File Path (relative to repo root) | Target | Modification Summary |
|---|---|---|
| `src/app/playground-wall.css` | `[NEW]` | Extract `playgrounds/photo_wall_playground.html` (`dcc7a048`) exact wall, placard (real classes `.mat-acrylic` default, `.mat-aluminum`, `.mat-foamcore`), `.soundtrack-plaque`, `.photo-frame.is-lit`, `.is-lit::after`, cast shadow, hover tilt/glare, Swiss HUD, compact dock, and Focus Bar CSS verbatim (convert `#wallViewport`/`#wallWorld` IDs to classes under `.playground-wall-root`, drop world `preserve-3d`/sway while keeping local `perspective` + `preserve-3d` on `.photo-frame`, strip debug sidebar & top demo banner). |
| `src/lib/lighting/playgroundLighting.ts` | `[NEW]` | Port exact `LIGHT_CFG` (`fixturePerCols: 2`, `hotspotFrac: 0.28`, `heightFrac: 0.98`, `innerDeg: 16`, `outerDeg: 32`, `ambientObj: 0.42`, `objDepth: 9` overridden to `14` placard / `22` print, `throwFrac: 0.72`) + `rawIrradiance` + `selectVisibleSpots(fixtures, camera, viewport, 128)` + row-major `packFixtureDataTexture(spots)` (Row 0 = `pos`, Row 1 = `axis`). |
| `src/components/wall/PlaygroundPbrWall.tsx` | `[NEW]` | Single-pass verbatim playground WebGL2 PBR shader (`N·L * cone / r² + roughness specular` + single filmic curve `color / (color + 0.88) * 1.34`) reading up to 128 culled spots from the `RGBA32F` data texture, `applyTheme()` mood uniforms, and idle-stop rAF loop. |
| `src/components/wall/PlaygroundGallery.tsx` | `[NEW]` | Reuses `macroMosaic.ts` (`scale < 0.25`), `visibleIslands.ts`, `zoomTier.ts`, `cameraMath.ts` (aspect-aware Row-0 `3 / 2 / 1` + `bottomInsetPx`), `soundtrackState.ts`, deferred `setPointerCapture` (>5px), and `overviewNonce`, wired to `GET /api/wall` and `useWallManifest` (`initialManifest`, `manifestUrl` seam for `admin-route-isolation`). |
| `src/components/wall/GalleryViewport.tsx`, `src/components/admin/FolderDropzone.tsx`, `src/app/api/local-uploads/[...path]/route.ts` | PR #2 fixes | Zoom-relative snapshot threshold, prevent entry framing re-fire on resize/manifest refresh, prevent Tab focus scrolling `overflow: hidden` viewport, fix `FolderDropzone` stuck state on >20 files, atomic temp-file rename for `local-uploads` derivative cache writes. |
| `src/lib/dev/fakeManifest.ts`, `src/components/admin/AdminDrawer.tsx`, `src/components/PhotoWallApp.tsx` | Fixtures & wiring | Update `?demo=4` to reproduce the playground's exact 4 albums (12/15/12/16 counts, same titles, same `PALETTES` sample art), keep `?demo=2000` → `1000` + `?mood=` pin, wire Settings placard selector (`Beveled Glass` → `mat-acrylic`, `Brushed Aluminum` → `mat-aluminum`, `Archival Foamcore` → `mat-foamcore`) without altering HUD auth behavior. |
| `src/components/wall/PbrWallCanvas.tsx`, `src/components/wall/CssGalleryWorld.tsx`, `src/lib/lighting/lightmap.ts` | `[DELETE]` | Delete superseded PR #2 renderer files and their obsolete unit tests. |

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions**:
  - Single-pass WebGL2 shader reading culled spots from `RGBA32F` data texture (`<= 128`) — NEVER additive multi-pass chunking (which breaks the nonlinear filmic curve).
  - Real playground classes ONLY: `.mat-acrylic` (default), `.mat-aluminum`, `.mat-foamcore`; moods via `applyTheme()` (never invent `.mat-glass`, `.mat-rag`, or `.theme-*`).
  - `islandLayout.ts` absolute positioning is the single geometry source (verified within `1px` of playground's 4 demo albums); world `preserve-3d` & sway are dropped (local `perspective` + `preserve-3d` on `.photo-frame` only).
  - Leave HUD auth behavior untouched (`admin-route-isolation` owns removing the lock icon and `/api/admin/auth` from `/` in the next change).
- **Hard Exclusions / No-Go**:
  - Do NOT modify `.env`, `.env.*`, or credential files.
  - Do NOT introduce unapproved external dependencies (only `pixelmatch` / `@types/pixelmatch` devDependency is approved).
  - Do NOT re-invent shader lighting math or placard CSS from prose; extract directly from `playgrounds/photo_wall_playground.html` (`dcc7a048`).

## 4. Visual & UI Design Specifications & Vision Verification
- **Source of Truth**: `playgrounds/photo_wall_playground.html` (`dcc7a048`).
- **Placard Mapping**: `Beveled Glass` → `.mat-acrylic` (default), `Brushed Aluminum` → `.mat-aluminum`, `Archival Foamcore` → `.mat-foamcore`.
- **Multi-Modal Vision Verification**:
  - Capture Playwright screenshots with `?demo=4&mood=chiaroscuro|concrete|alabaster` against `playgrounds/photo_wall_playground.html` at pinned cameras.
  - Run `pixelmatch` on the wall-canvas region for each mood AND generate side-by-side PNG composites (playground left, Next.js right) and inspect the images directly.
  - Confirm real `page.mouse.click` opens albums/prints, `Overview`/`0` resets after manual pan/zoom, and Tab focus does not scroll the viewport.

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: `npx vitest run` (wrap full runs with `safe-test npx vitest run` or `--workers=1`)
- **Typecheck / Lint / Build**: `npm run typecheck && npm run lint && npm run build`
- **TDD Requirement**: Task Group `## 1` MUST scaffold failing unit tests (`playgroundLighting.test.ts`, 1px `islandLayout` golden test, atomic `localUploads` test) and verify they fail before writing implementation code.

## 6. Implementation Task Checklist
- [ ] 1.1 Branch from `main` (which now includes merged `dom-wall-engine` at `9d8e277`) into `feat/playground-wall-port` and install `pixelmatch` (`@types/pixelmatch`) as a devDependency.
- [ ] 1.2 Scaffold failing Vitest unit tests in `src/lib/lighting/__tests__/playgroundLighting.test.ts` (`selectVisibleSpots`, row-major `packFixtureDataTexture`, exact `LIGHT_CFG` with `ambientObj: 0.42`, `throwFrac: 0.72`, `14`/`22` depths), `src/lib/layout/__tests__/islandLayout.test.ts` (1px golden cell-center match against the playground's 4 demo albums), and `src/app/api/__tests__/localUploads.test.ts` (atomic temp-file rename for derivative cache writes).
- [ ] 1.3 Run `npx vitest run` on the newly scaffolded tests to confirm they fail before implementation.
- [ ] 2.1 Extract `playgrounds/photo_wall_playground.html` (`dcc7a048`) exact wall, placard (real classes `.mat-acrylic` default, `.mat-aluminum`, `.mat-foamcore`), `.soundtrack-plaque`, `.photo-frame.is-lit`, `.is-lit::after`, cast shadow, hover tilt/glare, Swiss HUD, compact dock, and Focus Bar CSS verbatim into `src/app/playground-wall.css` (converting `#wallViewport`/`#wallWorld` IDs to classes under `.playground-wall-root`, dropping world `preserve-3d`/sway while keeping local `perspective` + `preserve-3d` on `.photo-frame`, stripping only debug sidebar & top demo banner).
- [ ] 2.2 Implement `src/lib/lighting/playgroundLighting.ts` (exact `LIGHT_CFG` + `rawIrradiance` + `selectVisibleSpots` + row-major `packFixtureDataTexture`) and `src/components/wall/PlaygroundPbrWall.tsx` (single-pass verbatim playground WebGL2 PBR shader with `RGBA32F` spot data texture `<= 128` culled spots, single filmic curve, `applyTheme()` mood uniforms, and idle-stop rAF) until `playgroundLighting.test.ts` passes.
- [ ] 3.1 Implement `src/components/wall/PlaygroundGallery.tsx` reusing `macroMosaic.ts` (at `scale < 0.25`), `visibleIslands.ts`, `zoomTier.ts`, `cameraMath.ts` (aspect-aware Row-0 `3 / 2 / 1` framing + `bottomInsetPx`), `soundtrackState.ts`, deferred `setPointerCapture` (>5px), and `overviewNonce`, wired to `GET /api/wall` and `useWallManifest` (`initialManifest`, `manifestUrl` seam for `admin-route-isolation`).
- [ ] 3.2 Close open PR #2 review items: zoom-relative snapshot threshold, prevent entry framing re-firing on resize or manifest refresh, prevent Tab focus scrolling the `overflow: hidden` viewport, fix `FolderDropzone` stuck state when >20 files are dropped, and make `local-uploads` derivative cache writes atomic (temp file + rename).
- [ ] 3.3 Update `?demo=4` in `src/lib/dev/fakeManifest.ts` to reproduce the playground's exact 4 albums (12/15/12/16 counts, same titles, same `PALETTES` sample art) and keep `?demo=2000` → `1000` fallback + `?mood=` query pin; wire Settings placard selector (`Beveled Glass` → `mat-acrylic`, `Brushed Aluminum` → `mat-aluminum`, `Archival Foamcore` → `mat-foamcore`) in `AdminDrawer` (without changing HUD auth behavior).
- [ ] 3.4 Delete superseded PR #2 renderer files (`PbrWallCanvas.tsx`, `CssGalleryWorld.tsx`, `lightmap.ts` and their obsolete tests).
- [ ] 4.1 Run Playwright parity check with `?demo=4&mood=chiaroscuro|concrete|alabaster` against `playgrounds/photo_wall_playground.html` (`dcc7a048`): verify `pixelmatch` threshold on the wall-canvas region, save side-by-side PNG composites for human review, verify real `page.mouse.click` + `Overview`/`0` reset + Tab-scroll guard, and re-confirm `?demo=1000` macro mosaic settle hitch `<= 100ms` (keeping physical iGPU/iPhone hardware run explicitly noted for maintainer).
- [ ] 4.2 Run full regression suite (`npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`) and populate `openspec/changes/playground-wall-port/verification.md` with Requirement Adherence Audit Matrix, `pixelmatch` numbers, side-by-side composites, and verbatim execution logs.

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify all checkboxes in `tasks.md` are marked `- [x]`. Only tick boxes that genuinely ran and passed.
2. Ensure `openspec/changes/playground-wall-port/verification.md` is populated with Executive Summary, Requirement Adherence Audit Matrix, `pixelmatch` scores, side-by-side composite paths, Nomenclature Audit, and Verbatim Execution Logs.
3. Automatically run verification via `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues**:
  1. Sync specs: `openspec specs apply --change "playground-wall-port"`.
  2. Ensure work is on `feat/playground-wall-port`, commit all implementation code and change artifacts, push (`git push -u origin HEAD`), and open a Pull Request via `gh pr create --fill` reporting the PR URL.
- **If CRITICAL issues or failed test verification errors are detected on initial pass**:
  1. Delegate **1 bounded repair pass** to `spec-coder-sub` with the exact failure logs, then re-run `openspec-verify-change`.
  2. If verification passes after repair: sync specs, commit, push, and open PR via `gh pr create --fill`.
  3. If verification STILL fails after the single repair pass: **HALT** and present the Verification Report and remaining blockers.
