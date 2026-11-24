# OpenCode Orchestration Handoff: OpenSpec Change 'gallery-style-and-canvas-refactor'

You are the orchestration agent for OpenSpec change `gallery-style-and-canvas-refactor` running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

> **Prerequisite Assumption:** This handoff assumes **PR #6** (`admin-route-isolation` + `album-photo-management` + PATCH-01) has merged into `main`. **Task `0.1` is a mandatory pre-flight gate**: verify `main` contains the merged PR #6 tree (`GalleryCanvas.tsx`, `src/app/admin/studio.css`, `src/app/(gallery)/`, `publicBoundaryAudit.test.ts`), cut `feat/gallery-style-and-canvas-refactor` from merged `main`, and re-verify exact line ranges before editing.

---

## 1. Orchestration Directive
- **Change Name**: `gallery-style-and-canvas-refactor`
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub gallery-style-and-canvas-refactor`)
- **Architecture Paradigm**: Behavior-preserving structural refactor (Vertical Slice / Domain-Owned CSS & single-responsibility wall presentation components). Zero intentional visual or behavioral changes.

---

## 2. Target Context Map

*(Re-verify exact line ranges on merged `main` in Task `0.1`.)*

| File Path (relative to repo root) | Target Lines | Modification Summary |
| :--- | :--- | :--- |
| `src/lib/__tests__/cssBoundaryAudit.test.ts` | `[NEW]` | Static CI audit enforcing CSS domain prefix rules, `studio.css` admin-only import isolation, **zero cross-file duplicate top-level selectors** across all 5 stylesheets, `playground-wall.css` deletion, and `DESIGN.md` freshness. |
| `src/lib/__tests__/rawUrlAudit.test.ts` | `L66-L70` | Update relative `@font-face` assertion from `src/app/globals.css` (`url(./fonts/`) to `src/styles/tokens.css` (`url('../app/fonts/`), preserving the no-absolute-`/fonts/` guard. |
| `src/styles/tokens.css` | `[NEW]` | `@font-face` (`TeX Gyre Heros` via `url('../app/fonts/texgyreheros-*.woff2')`), `:root` / `[data-mood]` design tokens, `.tabular-nums`. |
| `src/styles/wall.css` | `[NEW]` | `.playground-wall-root`, `.gallery-root-inner`, `.studio-canvas-root.playground-wall-root`, `.gallery-stage`, `.wall-viewport`, `.pbr-wall-canvas`, `.album-island`, `.museum-placard*`, `.soundtrack-plaque*`, `.photo-frame*`, `.photo-sheen`, `.island-mosaic*`. |
| `src/styles/hud.css` | `[NEW]` | Single source of truth for `.gallery-surface`, `.hud-top-right`, `.hud-button*`, `.hud-directory*`, `.dock-pill`, `.hud-photo-bar`, `.photo-focus-*`, `.hud-label`, `.hud-meta`. |
| `src/styles/studio.css` | `[MOVE]` (`git mv src/app/admin/studio.css src/styles/studio.css`) | Consolidate existing Studio styles (`.admin-root`, `.admin-login-*`, `.studio-*`, `.album-editor-*`) + all **live** `.admin-*` rules migrated from `globals.css` (`.admin-field*`, `.admin-note`, `.admin-button*`, `.admin-segment*`, `.admin-hidden-player`, `.admin-draft*`, `.admin-progress`, etc.); imported exclusively by `src/app/admin/layout.tsx`. |
| `src/app/globals.css` | Full file (`~1,413` → `~35` lines) | Reduce to `@import '../styles/tokens.css';`, `*` box-sizing/`html`/`body` reset, `.gallery-root`, `.sr-only`, shared `:focus-visible`; delete only dead `.admin-drawer*`, dead R3F rules (`.gallery-canvas`, `.soundtrack-overlay`), duplicate `.hud-*` overrides, and grep-verified unreferenced selectors. |
| `src/app/playground-wall.css` | `[DELETE]` | Replaced cleanly by `src/styles/wall.css` + `src/styles/hud.css`. |
| `src/app/layout.tsx`, `src/app/(gallery)/`, `src/app/admin/layout.tsx` | Imports | Wire `globals.css` at root, `wall.css` + `hud.css` in `(gallery)`, and `wall.css` + `studio.css` in `admin/layout.tsx`. |
| `src/components/wall/AlbumPlacard.tsx` | `[NEW]` | Pure presentational fixed `214×200px` placard component (Caption, `[Date · Time · Location]`, bottom-pinned Soundtrack + live timecode, draft badge, standoffs). |
| `src/components/wall/FramedPrint.tsx` | `[NEW]` | Print frame component (recessed mat, `.photo-window`, `.photo-sheen`, local pointer hover tilt/sheen reading `wasDragged()` callback from `GalleryCanvas`). |
| `src/components/wall/MacroIsland.tsx` | `[NEW]` | Thin component wrapper around existing `src/components/wall/macroMosaic.ts` (`scale < 0.25`). |
| `src/components/wall/GalleryCanvas.tsx` | Full file (`~1,094` lines) | Retain `containerRef`/`worldRef`/`wallRef`, camera loop, gestures, full keymap (`0`, `Escape`, `ArrowLeft`, `ArrowRight`, `+`, `=`, `-`, `_`), and island culling; delegate presentation to `AlbumPlacard`, `FramedPrint`, `MacroIsland`, and `SoundtrackPlaque`. |
| `src/lib/lighting/playgroundLighting.ts` | Exports | Export `WALL_SHADER_CFG = { tileUnits: 5.2, normalStrength: 1.4, aoStrength: 0.75 } as const`. |
| `src/components/wall/PlaygroundPbrWall.tsx` | `L31`, `L367-L369` | Import and consume `WALL_SHADER_CFG` instead of inline numeric literals. |
| `DESIGN.md` | Full file | Remove stale PR #1 R3F (`troika-three-text`, `matrix3d` overlay) and `AdminDrawer` sections; document live DOM + WebGL2 + Curator Studio architecture and 5-stylesheet domain map. |

---

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions**:
  - Partition all CSS into 5 complete, non-overlapping plain CSS files (`globals.css`, `tokens.css`, `wall.css`, `hud.css`, `studio.css`) — do **NOT** adopt CSS Modules (existing DOM class names like `.photo-frame`, `.museum-placard`, `.hud-*` must stay verbatim).
  - Use `git mv src/app/admin/studio.css src/styles/studio.css` to preserve git history.
  - Grep `src/` for every `.admin-*` class before deleting anything from `globals.css`; migrate all live rules into `src/styles/studio.css`.
  - Keep `containerRef`, `worldRef`, `wallRef`, camera loop, gesture state, and the full keymap (`0`, `Escape`, `ArrowLeft`, `ArrowRight`, `+`, `=`, `-`, `_`) owned by `GalleryCanvas.tsx`.
  - Preserve exact shader values in `WALL_SHADER_CFG = { tileUnits: 5.2, normalStrength: 1.4, aoStrength: 0.75 } as const`.
- **Hard Exclusions / No-Go**:
  - Do **NOT** modify `.env`, `.env.*`, or credential files.
  - Do **NOT** introduce any new npm dependencies.
  - Do **NOT** change any visual design, lighting math, colors, typography, placard gap, or HUD styling (those belong to `gallery-visual-fidelity`).
  - Do **NOT** modify files outside the Target Context Map (except running `openspec-revise-change gallery-visual-fidelity` in Task `5.3` if instructed, or flagging it cleanly for post-merge).

---

## 4. Visual & UI Design Specifications & Parity Verification
- **Status: Non-visual / Structural Refactor.** No user-facing visual styling, colors, typography, spacing, or interactive UX behavior is intentionally altered.
- **Objective Zero-Regression Parity Gate**:
  - **Before modifying any CSS (Task `1.1`)**: Capture deterministic Playwright (`--workers=1`, `1440×900`, `DPR = 1`, CSS transitions/animations disabled) `getComputedStyle` JSON snapshots + PNG screenshots across 4 states:
    1. `/photos?demo=4&mood=chiaroscuro` (Overview)
    2. `/photos?demo=4&mood=concrete` (Overview)
    3. `/photos?demo=4&mood=chiaroscuro` (Photo Focus: click first album → first print)
    4. `/photos/admin` (Authenticated Curator Studio: Exhibitions, Upload, Details tabs)
  - **After completing the refactor (Task `5.2`)**: Re-capture the exact same 4 states and assert:
    - `0` `getComputedStyle` diffs across all tracked public & Studio selectors (`tests.md`).
    - `document.fonts.check('16px "TeX Gyre Heros"') === true`.
    - Screenshot `pixelmatch <= 0.5%` (accounting for WebGL antialiasing jitter).
    - `0` `studio.css` rules loaded on `/photos`, `0` console errors.

---

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: `npx vitest run` (run directly — do **NOT** wrap Vitest with `safe-test`, which OOMs on this suite).
- **TDD Requirement**: Task group `## 1` MUST capture the pre-refactor baseline and scaffold failing unit tests (`cssBoundaryAudit.test.ts` + `WALL_SHADER_CFG` exact equality test) before touching implementation code. Verify they fail initially.
- **Resource & Concurrency Rules**:
  - During task implementation, run ONLY the narrowest test file (`npx vitest run src/lib/__tests__/cssBoundaryAudit.test.ts src/lib/lighting/__tests__/playgroundLighting.test.ts src/lib/__tests__/rawUrlAudit.test.ts`).
  - Run Playwright verification with `--workers=1` against `next start`.
  - Final full regression gate: `npm run typecheck && npm run lint && npx vitest run && npm run build`.

---

## 6. Implementation Task Checklist

- [ ] 0.1 Confirm PR #6 (`admin-route-isolation` + `album-photo-management`, including PATCH-01) is merged into `main`, create the implementation worktree off merged `main`, and re-verify exact line numbers for `globals.css`, `playground-wall.css`, `GalleryCanvas.tsx`, `PlaygroundPbrWall.tsx`, and `rawUrlAudit.test.ts`.
- [ ] 1.1 Before modifying any CSS, run Playwright (`--workers=1`, `1440×900`, `DPR = 1`, animations disabled) against pre-refactor `next start` to capture baseline `getComputedStyle` JSON snapshots (fixed public + Studio selector list from `tests.md`) and full-page PNG screenshots for `/photos?demo=4&mood=chiaroscuro`, `/photos?demo=4&mood=concrete`, Public Photo Focus, and `/photos/admin` (Exhibitions / Upload / Details).
- [ ] 1.2 Create failing `src/lib/__tests__/cssBoundaryAudit.test.ts` asserting: `src/styles/{tokens,wall,hud,studio}.css` exist; `src/app/playground-wall.css` does not exist; `globals.css` contains zero `.hud-`/`.photo-focus-`/`.admin-`/`.soundtrack-overlay`/`.gallery-canvas` selectors; `wall.css` contains zero `.hud-`/`.admin-` selectors; `hud.css` contains zero `.admin-` selectors; `studio.css` is imported only inside `src/app/admin/`; **zero normalized top-level selectors are duplicated across any of the 5 stylesheets**; and `DESIGN.md` contains zero stale `troika-three-text`/`matrix3d`/`AdminDrawer` references.
- [ ] 1.3 Extend `src/lib/lighting/__tests__/playgroundLighting.test.ts` with a failing test asserting `expect(WALL_SHADER_CFG).toEqual({ tileUnits: 5.2, normalStrength: 1.4, aoStrength: 0.75 })`.
- [ ] 1.4 Run `npx vitest run src/lib/__tests__/cssBoundaryAudit.test.ts src/lib/lighting/__tests__/playgroundLighting.test.ts` and confirm the new tests fail before implementation.
- [ ] 2.1 Audit and classify every `.admin-*` selector in `src/app/globals.css` by grepping `src/` for `className` references: list all live Studio rules (`.admin-field*`, `.admin-note`, `.admin-button*`, `.admin-segment*`, `.admin-hidden-player`, `.admin-draft*`, `.admin-progress`, etc.) vs. dead rules (`.admin-drawer*` and zero-reference selectors) so zero live Studio rules are lost.
- [ ] 2.2 Run `git mv src/app/admin/studio.css src/styles/studio.css`, migrate all live `.admin-*` rules from `globals.css` into `src/styles/studio.css`, and extract `src/styles/tokens.css` (using `url('../app/fonts/texgyreheros-*.woff2')`), `src/styles/wall.css`, and `src/styles/hud.css` per the Complete Stylesheet Domain Map in `design.md`.
- [ ] 2.3 Reduce `src/app/globals.css` to base resets + `.gallery-root` + `.sr-only` + `@import '../styles/tokens.css';`, delete `src/app/playground-wall.css`, update layout imports (`src/app/layout.tsx`, `src/app/(gallery)/`, `src/app/admin/layout.tsx`), and update `src/lib/__tests__/rawUrlAudit.test.ts` (`L66–L70`) to assert the relative `../app/fonts/` path in `src/styles/tokens.css`.
- [ ] 3.1 Export `WALL_SHADER_CFG = { tileUnits: 5.2, normalStrength: 1.4, aoStrength: 0.75 } as const` from `src/lib/lighting/playgroundLighting.ts` and wire `src/components/wall/PlaygroundPbrWall.tsx` to read `WALL_SHADER_CFG.tileUnits`, `WALL_SHADER_CFG.normalStrength`, and `WALL_SHADER_CFG.aoStrength`.
- [ ] 3.2 Extract `src/components/wall/AlbumPlacard.tsx` (pure presentational), `src/components/wall/FramedPrint.tsx` (local hover tilt/sheen reading `wasDragged()`), and `src/components/wall/MacroIsland.tsx` (wrapping existing `macroMosaic.ts`) from `src/components/wall/GalleryCanvas.tsx`, keeping `containerRef`/`worldRef`/`wallRef`, camera loop, gestures, and full keymap (`0`, `Escape`, `ArrowLeft`, `ArrowRight`, `+`, `=`, `-`, `_`) owned by `GalleryCanvas.tsx`.
- [ ] 4.1 Update `DESIGN.md` to remove stale PR #1 R3F (`troika-three-text`, `matrix3d` overlay) and `AdminDrawer` references and document the live DOM + WebGL2 PBR wall, Curator Studio route isolation, and 5-stylesheet domain map until `cssBoundaryAudit.test.ts` passes 100%.
- [ ] 5.1 Run `npm run typecheck && npm run lint && npx vitest run && npm run build` and verify 100% pass (including `cssBoundaryAudit.test.ts`, `publicBoundaryAudit.test.ts`, and `rawUrlAudit.test.ts`).
- [ ] 5.2 Run Playwright (`--workers=1`, `1440×900`, `DPR = 1`, animations disabled) against post-refactor `next start` across all 4 matrix states in `tests.md`: assert `0` `getComputedStyle` diffs against the Task `1.1` baseline, `document.fonts.check('16px "TeX Gyre Heros"') === true`, screenshot `pixelmatch <= 0.5%`, `0` console errors, and `0` `studio.css` rules on `/photos`. Populate `openspec/changes/gallery-style-and-canvas-refactor/verification.md` with the Requirement Adherence Audit Matrix, baseline diff summary, and verbatim execution logs.
- [ ] 5.3 After this refactor merges, run `openspec-revise-change gallery-visual-fidelity` to re-target its 7 `playground-wall.css` / `PlaygroundGallery` references to `src/styles/{tokens,wall,hud}.css`, `FramedPrint.tsx`, `AlbumPlacard.tsx`, and `WALL_SHADER_CFG`.

---

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify all checkboxes in `openspec/changes/gallery-style-and-canvas-refactor/tasks.md` are marked `- [x]` (note: `5.3` runs post-merge or is marked clearly for the follow-up step). Only tick boxes that genuinely ran and passed.
2. Ensure `openspec/changes/gallery-style-and-canvas-refactor/verification.md` is populated with:
   - Executive Summary & Environment
   - Requirement Adherence Audit Matrix (mapping every spec scenario to its verifying test)
   - Pre/Post `getComputedStyle` diff summary, `document.fonts.check` proof, and `pixelmatch` scores across all 4 states
   - `.admin-*` classification audit (live migrated vs. dead deleted)
   - Verbatim Execution Logs
3. Automatically run verification via `openspec-verify-change`.

---

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues**:
  1. Sync specs: `openspec specs apply --change "gallery-style-and-canvas-refactor"`.
  2. **Open a Pull Request**:
     - Ensure your work is on `feat/gallery-style-and-canvas-refactor`.
     - Stage and commit all implementation code and change artifacts (`git add openspec/changes/gallery-style-and-canvas-refactor openspec/specs <implementation-files>`), then push (`git push -u origin HEAD`).
     - Open a Pull Request via `gh pr create --fill` and report the PR URL.
- **If CRITICAL issues or failed test verification errors are detected on initial pass**:
  1. Announce: `"Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."`
  2. Delegate a single-pass repair task to `spec-coder-sub` with the verbatim failure log and instructions to make minimal targeted patches, re-run verification commands, and update `tasks.md`.
  3. Re-run `openspec-verify-change`.
  4. **If verification passes after repair**: sync specs, commit, push, and open PR via `gh pr create --fill`.
  5. **If verification STILL fails after the single repair pass**: **HALT** and present the Verification Report and remaining blockers to the user.
