# Tasks: Gallery Style and Canvas Refactor

## Target Context Map

*(Re-derive exact line ranges from merged `main` in Task 0 after PR #6 + PATCH-01 lands.)*

| File (repo-relative) | Target Lines | Purpose |
| :--- | :--- | :--- |
| `src/lib/__tests__/cssBoundaryAudit.test.ts` | `[NEW]` | Static CI audit enforcing CSS domain prefix rules, `studio.css` admin-only import isolation, **zero cross-file duplicate top-level selectors** across all 5 stylesheets, and `DESIGN.md` freshness. |
| `src/lib/__tests__/rawUrlAudit.test.ts` | `L66-L70` | Update relative `@font-face` assertion from `src/app/globals.css` (`url(./fonts/`) to `src/styles/tokens.css` (`url('../app/fonts/`), preserving the no-absolute-`/fonts/` guard. |
| `src/styles/tokens.css` | `[NEW]` | `@font-face` (`TeX Gyre Heros` via `url('../app/fonts/texgyreheros-*.woff2')`), `:root` / `[data-mood]` tokens, `.tabular-nums`. |
| `src/styles/wall.css` | `[NEW]` | `.playground-wall-root`, `.gallery-root-inner`, `.studio-canvas-root.playground-wall-root`, wall canvas, `.album-island`, `.museum-placard*`, `.soundtrack-plaque*`, `.photo-frame*`, `.photo-sheen`, `.island-mosaic*`. |
| `src/styles/hud.css` | `[NEW]` | Single source of truth for `.gallery-surface`, `.hud-top-right`, `.hud-button*`, `.hud-directory*`, `.photo-focus-*`, `.hud-label`, `.hud-meta`. |
| `src/styles/studio.css` | `[MOVE]` (`git mv src/app/admin/studio.css src/styles/studio.css`) | Consolidate existing Studio styles + all **live** `.admin-*` rules migrated from `globals.css` (imported exclusively by `src/app/admin/layout.tsx`). |
| `src/app/globals.css` | Full file (`~1,413` → `~35` lines) | Reduce to `@import '../styles/tokens.css';`, box-sizing/`html`/`body` reset, `.gallery-root`, `.sr-only`, shared `:focus-visible`; delete only dead `.admin-drawer*`, dead R3F rules, duplicate `.hud-*` overrides, and grep-verified unreferenced selectors. |
| `src/app/playground-wall.css` | `[DELETE]` | Replaced cleanly by `src/styles/wall.css` + `src/styles/hud.css`. |
| `src/app/layout.tsx`, `src/app/(gallery)/`, `src/app/admin/layout.tsx` | Imports | Wire `globals.css` at root, `wall.css` + `hud.css` in `(gallery)`, and `wall.css` + `studio.css` in `admin/layout.tsx`. |
| `src/components/wall/AlbumPlacard.tsx` | `[NEW]` | Pure presentational fixed `214×200px` placard component (Caption, `[Date · Time · Location]`, bottom-pinned Soundtrack + live timecode, draft badge, standoffs). |
| `src/components/wall/FramedPrint.tsx` | `[NEW]` | Print frame component (recessed mat, `.photo-window`, `.photo-sheen`, local pointer hover tilt reading `wasDragged()` from `GalleryCanvas`). |
| `src/components/wall/MacroIsland.tsx` | `[NEW]` | Thin component wrapper around existing `src/components/wall/macroMosaic.ts` (`scale < 0.25`). |
| `src/components/wall/GalleryCanvas.tsx` | Full file (`~1,094` lines on PR #6) | Retain camera loop, `containerRef`/`worldRef`/`wallRef`, gesture/keymap handlers (`0`, `Escape`, `ArrowLeft`, `ArrowRight`, `+`, `=`, `-`, `_`), and island culling; delegate rendering to `AlbumPlacard`, `FramedPrint`, `MacroIsland`, and `SoundtrackPlaque`. |
| `src/lib/lighting/playgroundLighting.ts` | Exports | Export `WALL_SHADER_CFG = { tileUnits: 5.2, normalStrength: 1.4, aoStrength: 0.75 } as const`. |
| `src/components/wall/PlaygroundPbrWall.tsx` | `L31`, `L367-L369` (re-verify in Task 0) | Import and consume `WALL_SHADER_CFG` instead of inline numeric literals. |
| `DESIGN.md` | Full file | Remove stale R3F (`troika-three-text`, `matrix3d`, `AdminDrawer`) sections; document live DOM + WebGL2 + Curator Studio architecture and 5-stylesheet map. |

---

## 0. Merge Gate & Line-Range Sync

- [x] 0.1 Confirm PR #6 (`admin-route-isolation` + `album-photo-management`, including PATCH-01) is merged into `main`, create the implementation worktree off merged `main`, and re-verify exact line numbers for `globals.css`, `playground-wall.css`, `GalleryCanvas.tsx`, `PlaygroundPbrWall.tsx`, and `rawUrlAudit.test.ts`.

## 1. Test Scaffolding & Pre-Refactor Visual Baseline (TDD)

- [x] 1.1 Before modifying any CSS, run Playwright (`--workers=1`, `1440×900`, `DPR = 1`, animations disabled) against pre-refactor `next start` to capture baseline `getComputedStyle` JSON snapshots (fixed public + Studio selector list from `tests.md`) and full-page PNG screenshots for `/photos?demo=4&mood=chiaroscuro`, `/photos?demo=4&mood=concrete`, Public Photo Focus, and `/photos/admin` (Exhibitions / Upload / Details).
- [x] 1.2 Create failing `src/lib/__tests__/cssBoundaryAudit.test.ts` asserting: `src/styles/{tokens,wall,hud,studio}.css` exist; `src/app/playground-wall.css` does not exist; `globals.css` contains zero `.hud-`/`.photo-focus-`/`.admin-`/`.soundtrack-overlay`/`.gallery-canvas` selectors; `wall.css` contains zero `.hud-`/`.admin-` selectors; `hud.css` contains zero `.admin-` selectors; `studio.css` is imported only inside `src/app/admin/`; **zero normalized top-level selectors are duplicated across any of the 5 stylesheets**; and `DESIGN.md` contains zero stale `troika-three-text`/`matrix3d`/`AdminDrawer` references.
- [x] 1.3 Extend `src/lib/lighting/__tests__/playgroundLighting.test.ts` with a failing test asserting `expect(WALL_SHADER_CFG).toEqual({ tileUnits: 5.2, normalStrength: 1.4, aoStrength: 0.75 })`.
- [x] 1.4 Run `npx vitest run src/lib/__tests__/cssBoundaryAudit.test.ts src/lib/lighting/__tests__/playgroundLighting.test.ts` and confirm the new tests fail before implementation.

## 2. Modular CSS Split, Live `.admin-*` Migration & Route-Scoped Loading

- [x] 2.1 Audit and classify every `.admin-*` selector in `src/app/globals.css` by grepping `src/` for `className` references: list all live Studio rules (`.admin-field*`, `.admin-note`, `.admin-button*`, `.admin-segment*`, `.admin-hidden-player`, `.admin-draft*`, `.admin-progress`, etc.) vs. dead rules (`.admin-drawer*` and zero-reference selectors) so zero live Studio rules are lost.
- [x] 2.2 Run `git mv src/app/admin/studio.css src/styles/studio.css`, migrate all live `.admin-*` rules from `globals.css` into `src/styles/studio.css`, and extract `src/styles/tokens.css` (using `url('../app/fonts/texgyreheros-*.woff2')`), `src/styles/wall.css`, and `src/styles/hud.css` per the Complete Stylesheet Domain Map in `design.md`.
- [x] 2.3 Reduce `src/app/globals.css` to base resets + `.gallery-root` + `.sr-only` + `@import '../styles/tokens.css';`, delete `src/app/playground-wall.css`, update layout imports (`src/app/layout.tsx`, `src/app/(gallery)/`, `src/app/admin/layout.tsx`), and update `src/lib/__tests__/rawUrlAudit.test.ts` (`L66–L70`) to assert the relative `../app/fonts/` path in `src/styles/tokens.css`.

## 3. Wall Component Decomposition & Centralized Shader Config

- [x] 3.1 Export `WALL_SHADER_CFG = { tileUnits: 5.2, normalStrength: 1.4, aoStrength: 0.75 } as const` from `src/lib/lighting/playgroundLighting.ts` and wire `src/components/wall/PlaygroundPbrWall.tsx` to read `WALL_SHADER_CFG.tileUnits`, `WALL_SHADER_CFG.normalStrength`, and `WALL_SHADER_CFG.aoStrength`.
- [x] 3.2 Extract `src/components/wall/AlbumPlacard.tsx` (pure presentational), `src/components/wall/FramedPrint.tsx` (local hover tilt/sheen reading `wasDragged()`), and `src/components/wall/MacroIsland.tsx` (wrapping existing `macroMosaic.ts`) from `src/components/wall/GalleryCanvas.tsx`, keeping `containerRef`/`worldRef`/`wallRef`, camera loop, gestures, and full keymap (`0`, `Escape`, `ArrowLeft`, `ArrowRight`, `+`, `=`, `-`, `_`) owned by `GalleryCanvas.tsx`.

## 4. Refresh `DESIGN.md`

- [x] 4.1 Update `DESIGN.md` to remove stale PR #1 R3F (`troika-three-text`, `matrix3d` overlay) and `AdminDrawer` references and document the live DOM + WebGL2 PBR wall, Curator Studio route isolation, and 5-stylesheet domain map until `cssBoundaryAudit.test.ts` passes 100%.

## 5. Verification, Baseline Diff & Follow-Up Sync

- [x] 5.1 Run `npm run typecheck && npm run lint && npx vitest run && npm run build` and verify 100% pass (including `cssBoundaryAudit.test.ts`, `publicBoundaryAudit.test.ts`, and `rawUrlAudit.test.ts`).
- [x] 5.2 Run Playwright (`--workers=1`, `1440×900`, `DPR = 1`, animations disabled) against post-refactor `next start` across all 4 matrix states in `tests.md`: assert `0` `getComputedStyle` diffs against the Task `1.1` baseline, `document.fonts.check('16px "TeX Gyre Heros"') === true`, screenshot `pixelmatch <= 0.5%`, `0` console errors, and `0` `studio.css` rules on `/photos`. Populate `openspec/changes/gallery-style-and-canvas-refactor/verification.md` with the Requirement Adherence Audit Matrix, baseline diff summary, and verbatim execution logs.
- [x] 5.3 (post-merge) After this refactor merges, run `openspec-revise-change gallery-visual-fidelity` to re-target its 7 `playground-wall.css` / `PlaygroundGallery` references to `src/styles/{tokens,wall,hud}.css`, `FramedPrint.tsx`, `AlbumPlacard.tsx`, and `WALL_SHADER_CFG`.
