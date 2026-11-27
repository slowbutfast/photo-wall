# OpenCode Orchestration Handoff: OpenSpec Change 'macro-lod-continuity'

You are the orchestration agent for OpenSpec change 'macro-lod-continuity', running in OpenCode.
Execute this change with the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive
- **Change name:** macro-lod-continuity
- **Target skill:** `openspec-apply-sub` (or `/opsx:apply-sub macro-lod-continuity`)
- **Architecture paradigm:** Vertical Slice Architecture (VSA). The work is two independently revertible slices:
  1. tier hysteresis (`zoomTier.ts` plus the `GalleryCanvas` committed-tier ref);
  2. macro mosaic footprint parity (`macroMosaic.ts`, `MacroIsland.tsx`, `playgroundTheme.ts`, the `GalleryCanvas` palette prop).

  Keep geometry and palette resolution pure in `macroMosaic.ts`. Don't add shared "LOD" abstractions.
- **Branch:** `feat/macro-lod-continuity` already exists, created from `origin/main` @ `b616dbc`, with planning commit `2f0de28`. It's checked out in the git worktree `.claude/worktrees/macro-lod-continuity`. Work there.
  - Another agent session uses the main checkout and has uncommitted work in it. Don't switch its branch, reset it, or touch its working tree.
  - Don't kill processes you didn't start.
- **Read first, in order:**
  - `openspec/changes/macro-lod-continuity/research.md`. The glossary is binding nomenclature: zoom tier, promote/demote, hysteresis band, committed tier, placard plate, greeked lines, soundtrack slot, mosaic palette.
  - `proposal.md`, then `specs/instanced-photo-renderer/spec.md`, then `architecture.md` (D1–D6), then `design.md`, then `tests.md`, then `tasks.md`.
- **Next.js note:** read `AGENTS.md`. This Next.js 16 differs from your training data. No routing or server code is touched by this change.
- **Context from a failed earlier change:** read `openspec/changes/mobile-print-transitions/postmortem.md` at tag `archive/mobile-print-transitions` (`git show archive/mobile-print-transitions:openspec/changes/mobile-print-transitions/postmortem.md`).
  - That change failed on iOS compositing problems that Chromium couldn't reproduce.
  - This change is deliberately static, so it adds no per-frame styles. Keep it that way: add no CSS transitions, animations or per-frame style writes.

## 2. Target Context Map
| File | Lines | Change |
|---|---|---|
| `src/components/wall/zoomTier.ts` | L25, L88-91 | Add `MACRO_PROMOTE_SCALE = 0.25` (keep `MACRO_SCALE_THRESHOLD` as an alias) and `MACRO_DEMOTE_SCALE = 0.22`. `resolveZoomTier(scale, printFocused = false, previous?: ZoomTier)` with hysteresis (architecture D1). `TIER_STYLES` untouched. |
| `src/components/wall/GalleryCanvas.tsx` | L280 area (refs), L358, L433-436 | Add `committedTierRef`. The rAF loop reads, computes and writes it; the render path only reads it (D2). Optionally extract a pure `commitZoomTier` helper for testability. |
| `src/components/wall/GalleryCanvas.tsx` | L263, L290, L1010-1017 | `useMemo` the palette from `theme`, `placardMaterial` and `coarsePointer` (D5), and pass `palette` to `<MacroIsland>`. |
| `src/components/wall/macroMosaic.ts` | L61-69 (`MosaicPlan`), L76-125 (`planMacroMosaic`) | Add `soundtrack: MosaicRect \| null` and `placardLines: MosaicRect[]` (D3; bar rects from design.md §3). Add the pure `resolveMacroMosaicPalette(theme, material, coarse)` and the `MacroMosaicPalette` type with `key` (D4). |
| `src/components/wall/MacroIsland.tsx` | L39-47 (`mosaicSignature`), L65-78 (`paintPlaceholder`), L94-140 (`mosaicFor`), L161-167 (props) | Add the `palette` prop. The signature includes `palette.key` and whether a description exists. The painter draws the plate, edges, bars and slot per design.md, with a solid fallback when `createLinearGradient` is missing. Remove the pale fill and stroke. |
| `src/lib/lighting/playgroundTheme.ts` | L9-26 (interface), L28-83 (themes) | Add `macroPlate: { fine: [s, s, s]; coarse: [s, s, s] }` per mood, with values from design.md §2. |
| `src/components/wall/__tests__/zoomTier.test.ts` | L152-166 + new | Hysteresis table, jitter fold and can-fail guard. Existing assertions unchanged. |
| `src/components/wall/__tests__/snapshotKey.test.ts` (or `[NEW]` `galleryTierCommit.test.ts`) | new | The tier commit helper and the call-site audit. |
| `src/components/wall/__tests__/macroMosaic.test.ts` | new cases | Soundtrack rect and placard lines. |
| `src/components/wall/__tests__/MacroIsland.test.tsx` | L27, L95 (fake ctx) + new | Extend the fake; paint assertions; no `fillText`; palette signature replacement. |
| `src/lib/__tests__/macroPaletteAudit.test.ts` | `[NEW]` | Theme stops against `wall.css`, plus a can-fail guard. |
| `openspec/changes/macro-lod-continuity/parity/macro-parity.mjs` | `[NEW]` | Overview scale measurement, resting parity, confined macro diff, hysteresis probe, island count. |

**Out of bounds:**
- `wall.css`, `tokens.css` and `hud.css` (no CSS changes in this change);
- `AlbumTier` / `AlbumPlacard` / `SoundtrackPlaque` / `FramedPrint`;
- `PrintSharpOverlay`, `useGyroTilt`, `PlaygroundPbrWall`, `islandLayout.ts`;
- camera maths and flights;
- `PhotoWallApp.tsx`, `CuratorStudio.tsx`, `PlaygroundGallery.tsx`;
- `playgrounds/`.

## 3. Technical & Architectural Boundaries
- **In-scope decisions** (architecture.md):
  - **D1 hysteresis:**
    - `MACRO_PROMOTE_SCALE = 0.25` (keep the `MACRO_SCALE_THRESHOLD` alias at `0.25`) and `MACRO_DEMOTE_SCALE = 0.22`.
    - `resolveZoomTier(scale, printFocused = false, previous?)`:
      - without `previous`, today's exact behaviour;
      - `previous === 'macro'` stays macro until `scale >= 0.25`;
      - `previous` of `'album'` or `'print'` stays detailed until `scale < 0.22`;
      - a non-finite scale is always `macro`.
    - `album` vs `print` is still decided only by `printFocused`.
  - **D2 single writer:**
    - `committedTierRef` is written only in the camera rAF loop (`GalleryCanvas.tsx:433`), as read, compute, then write.
    - The render path (`L358`) reads the ref as `previous` and never writes it.
    - The snapshot-key logic is otherwise unchanged.
  - **D3 plan geometry (pure):**
    - `MosaicPlan.soundtrack` comes from `computeAlbumGrid(...).soundtrack` through the existing `toBuffer` mapping, and is `null` without a soundtrack.
    - `MosaicPlan.placardLines` always has the title bar, and two caption bars only when `album.description?.trim()` is non-empty.
    - Bar rects come from design.md §3, in placard-local CSS px.
  - **D4 palette (pure):**
    - `PlaygroundTheme.macroPlate = { fine: [3 stops], coarse: [3 stops] }` per mood.
    - `resolveMacroMosaicPalette(theme, material, coarse)` returns a palette with a stable `key`.
    - The key and whether a description exists are added to `mosaicSignature`, so a palette change replaces mosaics through the existing defer-disposal path.
    - `macroPaletteAudit.test.ts` guards the stops against `wall.css`.
  - **D5 plumbing:**
    - `GalleryCanvas` builds the palette with `useMemo([theme, placardMaterial, coarsePointer])` and passes it as the `palette` prop to `<MacroIsland>`.
    - No changes to `PhotoWallApp`, `CuratorStudio` or `PlaygroundGallery`.
  - **D6 paint order** (once per canvas):
    1. `clearRect`;
    2. cells (unchanged);
    3. placard shadow, plate, edges, bars;
    4. soundtrack slot shadow, fill, stroke.

    Thumbnail `onload` still draws only its own cell. When `createLinearGradient` is missing, fill with the 55% stop as a solid colour.
  - **Commits:** two slice commits as listed in tasks 2.3 and 3.5, staged with explicit paths, followed by the verification commit.
- **Hard exclusions / no-go:**
  - **Environment:** don't modify `.env`, `.env.*` or credential files, and never print or commit them.
  - **Dependencies:** don't introduce any external dependencies.
  - **Scope:** don't make code changes outside the Target Context Map without prior task coverage. In particular, don't change any CSS (`wall.css`, `tokens.css`, `hud.css`), `AlbumTier`/`AlbumPlacard`/`SoundtrackPlaque`/`FramedPrint`, `PrintSharpOverlay`, `useGyroTilt`, `PlaygroundPbrWall`, `islandLayout.ts`, camera maths and flights, or `playgrounds/`.
  - **Slice 3 is out of scope.** No `--detail-a`, no opacity fades, no dual-mounting `MacroIsland` and `AlbumTier`, no pre-mounting `AlbumTier`.
  - **The mosaic contract:**
    - no `fillText`, `measureText` or font APIs;
    - no soundtrack thumbnail or iframe requests;
    - no new DOM elements inside `MacroIsland`;
    - don't use `--color-placard-core` for the plate (it's only for the soundtrack slot and foamcore).
  - **Overview framing:** if task 1.1 finds an Overview scale inside `[0.22, 0.25)`, record it and flag it in verification.md. Don't retune the framing.
  - **Data safety:** preview and production share the production Turso DB and Bunny storage. Never write against them. Verify only on local dev (`STORAGE_DRIVER=local`, `?demo=4&mood=<m>`, `?demo=1000`).
  - **Git hygiene:**
    - Stage explicit paths only; never `git add -A`.
    - Never use a bare `git stash` / `git stash pop`, because the stash is shared.
    - Keep browser profile or performance JSON exports out of the repo; they contain auth cookies.

## 4. Visual & UI Design Specifications & Vision Verification
- **Theme:** Macro Placard Continuity. At Overview, the mosaic paints the same silhouette and dominant tone as the up-close placard column. Every colour mirrors an existing `wall.css` value.
- **Key tokens:**
  - **Acrylic plate** (`linear-gradient(138deg, …)`, stops at 0/55/100%):
    - chiaroscuro and concrete, fine pointer: `rgba(24,28,26,0.58)`, `rgba(18,22,20,0.46)`, `rgba(26,30,28,0.54)`;
    - alabaster, both pointers: `rgba(30,36,33,0.78)`, `rgba(22,27,24,0.74)`, `rgba(34,40,36,0.78)`;
    - chiaroscuro, coarse: `rgba(26,31,28,0.62)`, `rgba(18,22,20,0.52)`, `rgba(28,33,30,0.6)`;
    - concrete, coarse: `rgba(32,37,33,0.68)`, `rgba(24,28,25,0.58)`, `rgba(34,39,35,0.66)`.
  - **Plate edges:** top 1.5 placard-px `rgba(242,255,248,0.72)`; bottom 3 placard-px `rgba(140,185,165,0.52)`.
  - **Other materials:**
    - aluminum: plate `#d2d5d9`, title ink `rgba(17,17,17,0.38)`, caption ink `rgba(17,17,17,0.26)`;
    - foamcore: plate `#161616`, title ink `rgba(244,246,244,0.30)`, caption ink `rgba(240,244,241,0.20)`.
  - **Greeked ink (acrylic):** title is `glassInk` at alpha 0.34; caption is `glassCap`'s RGB at alpha 0.24.
  - **Soundtrack slot:** `#161616` fill, 1 buffer-px stroke `rgba(255,255,255,0.08)`.
  - **Shadows:** flat `rgba(0,0,0,0.45)` at `+2` buffer px in y, the same as print cells.
  - **Bars** (placard-local px in a 214×200 box): title `(24, 24, 104, 10)` always; caption `(24, 50, 150, 6)` and `(24, 67, 112, 6)` only with a description.
- **Component anatomy and states:**
  - The `MacroIsland` canvas paints cells, then the plate group, then the slot. Before thumbnails arrive, cells keep the `#f6f4ef` placeholder while the plate and slot are already final.
  - Hover, active and focus are unchanged (`outline: 1px solid var(--color-primary)`, offset 2px).
  - Removed: the pale `rgba(226,242,234,0.18)` fill and the `rgba(240,245,242,0.22)` stroke.
  - Tier boundary: promote at 0.25, demote below 0.22.
- **Responsive layout:** the same geometry on every pointer. Coarse pointers use the `coarse` acrylic stops; alabaster keeps its own. Touch targets are unchanged (the whole island is the button).
- **Multi-modal vision verification:**
  - `deepseek-flash` natively supports vision inputs. Capture screenshots with Playwright (Chromium only; WebKit isn't installed) and inspect the image files directly. Cover the Overview crops for all three moods on fine pointers, plus 393×852 coarse emulation for alabaster and chiaroscuro. The plate tone should match the Album-tier placard, and each album with a soundtrack should have a dark slot under its placard.
  - The iPhone checks need the maintainer's device: oscillation feel, footprint at the swap, and the demote-frame hitch on `?demo=1000`. Leave them marked `PENDING MANUAL DEVICE VERIFICATION`, and complete every automated task.

## 5. Test Scaffolding & Verification Commands
- **Primary test runner:** `npx vitest run <file>` (Vitest).
- **Full gates:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- **TDD requirement:**
  - Task group 1 must scaffold failing tests before any implementation code is touched. Verify they fail for the intended reasons, and save the output to `openspec/changes/macro-lod-continuity/logs/1.7-tdd-red.log`.
  - Task 1.1 (the Overview scale measurement against base `b616dbc`) runs first.
- **Narrow loop files:**
  - `src/components/wall/__tests__/zoomTier.test.ts`
  - `src/components/wall/__tests__/snapshotKey.test.ts` (or `[NEW]` `galleryTierCommit.test.ts`)
  - `src/components/wall/__tests__/macroMosaic.test.ts`
  - `src/components/wall/__tests__/MacroIsland.test.tsx`
  - `src/lib/__tests__/macroPaletteAudit.test.ts` `[NEW]`
- **Guard group** (must stay green):
  - `src/components/wall/__tests__/wallCanvasDpr.test.ts`
  - `src/lib/__tests__/touchAudit.test.ts`
  - `src/lib/__tests__/cssBoundaryAudit.test.ts`
  - `src/lib/__tests__/sheenGlareAudit.test.ts`
  - `src/lib/camera/__tests__/cameraMath.test.ts`
  - `src/lib/layout/__tests__/islandLayout.test.ts`

  The existing `resolveZoomTier` assertions (`zoomTier.test.ts:152-166`) must pass unchanged. Any edited existing assertion must be justified in `verification.md`.
- **Parity and measurement harness:** `openspec/changes/macro-lod-continuity/parity/macro-parity.mjs` `[NEW]`, adapted from `openspec/changes/alabaster-glass-legibility/parity/placard-parity.mjs`.
  - Base `b616dbc` against head, served locally, Playwright Chromium, 1440×900, 3 moods.
  - Album and Print rest: 0 px and 0 computed-style diffs.
  - Overview: differences confined per pixel to the plate and slot rects.
  - The hysteresis probe: exactly 1 `.island-mosaic` transition on head, against at least 4 on base.
  - The detail-island count ratio at scale 0.221 (head) against 0.25 (base) on `?demo=1000`. About 1.29 is expected; record the actual value.
- **Resource and concurrency rules:**
  - During task implementation, run only the narrowest test file for the code you changed. Don't run full test discovery or headless browser suites on every checkbox.
  - Wrap heavy runs with `safe-test` (e.g. `safe-test npx vitest run`), or run single-worker (`--workers=1`).
  - Known issue: `safe-test`'s `ulimit -v` cap can't instantiate this suite's WebAssembly. If it aborts for that reason, record the failure log and run the serialized direct command.
  - Stop any `next start` or dev servers you launched once the harness finishes.

## 6. Implementation Task Checklist
## 1. Test Scaffolding (TDD)

- [ ] 1.1 Measure first. Run `macro-parity.mjs --measure-only` against base `b616dbc`. Record the Overview-settled CSS scale for `?demo=4` (1440×900, 393×852 coarse) and `?demo=1000` (1440×900) in `logs/1.1-overview-scale.log`. Note in research.md (Verified facts) whether any value falls in `[0.22, 0.25)`. If one does, continue but flag it in verification.md; don't change the Overview framing.
- [ ] 1.2 Write failing tests for hysteresis in `zoomTier.test.ts`: the constants, the `previous` table, the jitter fold with exactly 1 change, and the can-fail guard showing at least 4 changes without `previous`.
- [ ] 1.3 Write failing tests for the tier commit: the `commitZoomTier` helper (or an equivalent) and the `GalleryCanvas.tsx` call-site audit (three-argument calls at both sites, with the ref written only in the rAF loop).
- [ ] 1.4 Write failing tests for footprint geometry in `macroMosaic.test.ts`: `plan.soundtrack` against `grid.soundtrack`, `null` without a soundtrack, `placardLines` count by description, and the bars inside the plate.
- [ ] 1.5 Write failing tests for footprint paint in `MacroIsland.test.tsx`: extend the fake context, then assert the plate stops, slot fill, bar rects, zero `fillText`, no pale fill, no extra `Image.src`, the gradient fallback and palette-signature replacement.
- [ ] 1.6 Write a failing `src/lib/__tests__/macroPaletteAudit.test.ts`: theme stops against `wall.css` rules, the material fills, key equality and inequality, and the can-fail mutation guard.
- [ ] 1.7 Run the new and extended files. Confirm every new test fails for the intended reason and every pre-existing assertion still passes. Save the output to `logs/1.7-tdd-red.log`.

## 2. Slice 1: Tier hysteresis (commit 1)

- [ ] 2.1 Implement `MACRO_PROMOTE_SCALE`, `MACRO_DEMOTE_SCALE` and the `previous` parameter in `zoomTier.ts` (D1). Update the module doc comment.
- [ ] 2.2 Add `committedTierRef` in `GalleryCanvas.tsx`: read, compute and write at L433, read-only at L358 (D2). The snapshot key logic is otherwise unchanged.
- [ ] 2.3 Run `zoomTier.test.ts`, the tier-commit test and `snapshotKey.test.ts` until green. Commit with explicit paths: `feat(wall): hysteresis on the macro tier boundary`.

## 3. Slice 2: Macro mosaic footprint parity (commit 2)

- [ ] 3.1 Add `macroPlate` to `PlaygroundTheme` and all three themes (design.md §2).
- [ ] 3.2 Add `soundtrack` and `placardLines` to `planMacroMosaic`, plus `resolveMacroMosaicPalette` and its type (D3, D4).
- [ ] 3.3 Update `MacroIsland.tsx`: the `palette` prop, the signature with `palette.key` and description presence, and the new `paintPlaceholder` with its paint order (D6). Remove the pale fill and stroke.
- [ ] 3.4 Pass the `useMemo` palette from `GalleryCanvas.tsx` to `<MacroIsland>` (D5).
- [ ] 3.5 Run `macroMosaic.test.ts`, `MacroIsland.test.tsx` and `macroPaletteAudit.test.ts` until green. Commit with explicit paths: `feat(wall): macro mosaic reserves placard and soundtrack footprint`.

## 4. Verification & Empirical Audit

- [ ] 4.1 Run the guard group and the full gates (`npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`). Record the pass counts in `logs/4.1-*.log`. For the full suite, try `safe-test` first and record the WebAssembly failure if it occurs.
- [ ] 4.2 Run `macro-parity.mjs` in full against base and head:
  - Album and Print rest: 0 px and 0 style diffs.
  - Overview: differences confined to the plate and slot rects.
  - The hysteresis probe: 1 transition against at least 4.
  - The island-count ratio at `0.221` against `0.25`.
  - Save crops and `report.json` under `parity/`. Inspect the crops visually: the plate tone should match the up-close placard.
- [ ] 4.3 Populate `verification.md`:
  - an executive summary and the environment;
  - a Requirement Adherence Audit Matrix, mapping every scenario in `specs/instanced-photo-renderer/spec.md` to its test or harness check;
  - resolved assumptions (Overview scale, island ratio, the band against jitter), with numbers;
  - a nomenclature audit against the research.md glossary;
  - verbatim logs.
  - Mark the iPhone checks in tests.md (Manual Verification) as `PENDING MANUAL DEVICE VERIFICATION`.

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify every checkbox in `tasks.md` is marked `- [x]`. Only tick boxes that genuinely ran and passed. iPhone-only checks stay marked `PENDING MANUAL DEVICE VERIFICATION`.
2. Data preservation: no data model is touched. Confirm `git diff --stat b616dbc -- src/lib/db src/app/api src/lib/layout` is empty.
3. Make sure `openspec/changes/macro-lod-continuity/verification.md` contains:
   - an executive summary and the environment;
   - a Requirement Adherence Audit Matrix mapping every scenario in `specs/instanced-photo-renderer/spec.md` to its verifying test or harness check;
   - resolved assumptions and empirical proof: the Overview-settled scales, the island-count ratio, the hysteresis probe counts, and parity results;
   - a nomenclature and code-symbol audit against the research.md glossary;
   - verbatim execution logs.
4. Run verification automatically with `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues:**
  1. Sync the delta specs with the `openspec-sync-specs` skill for `macro-lod-continuity` (one MODIFIED and one ADDED requirement in `instanced-photo-renderer`).
  2. Open a pull request:
     - Work on `feat/macro-lod-continuity`.
     - Stage explicit paths: `git add openspec/changes/macro-lod-continuity openspec/specs <implementation-files>`. Never `git add -A`.
     - Commit, then push with `git push -u origin HEAD`.
     - Open the PR with `gh pr create` and a concise title, for example `feat(wall): macro tier hysteresis and placard footprint parity`. Summarise `proposal.md` and `verification.md` in the body, include the Overview crops, and list the pending iPhone checks explicitly. Report the PR URL.
     - Don't merge the PR.
- **If critical issues or failed test verification appear on the initial pass:**
  1. Announce: "Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."
  2. Delegate a single-pass repair task to `spec-coder-sub` with the verification failure context:
     > "Fix the specific verification failures and test errors reported for change 'macro-lod-continuity'. Refer to the error log, make minimal targeted patches to resolve the failures, run verification commands, and update tasks.md."
  3. Re-run verification with `openspec-verify-change`.
  4. **If verification passes after the repair:** sync the delta specs with `openspec-sync-specs`, then stage explicit paths, commit, push the branch and open the PR with `gh pr create`.
  5. **If verification still fails after the single repair pass:** halt. Don't loop or re-run again. Present the Verification Report and the remaining blockers to the user for manual guidance.
