# OpenCode Orchestration Handoff: OpenSpec Change 'flush-mounted-print-frames'

You are the orchestration agent for OpenSpec change 'flush-mounted-print-frames' running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive
- **Change Name**: `flush-mounted-print-frames`
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub flush-mounted-print-frames`)
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). Maintain strict isolation between feature compartments and avoid horizontal abstractions.
- **Branch Setup (Task 1.0)**: Branch `feat/flush-mounted-print-frames` directly from `origin/main` (`c626136`) and bring in the committed change directory cleanly:
  ```bash
  git fetch origin main
  git checkout -b feat/flush-mounted-print-frames origin/main
  git checkout main -- openspec/changes/flush-mounted-print-frames
  git add openspec/changes/flush-mounted-print-frames
  git commit -m "docs(openspec): import flush-mounted-print-frames planning artifacts"
  ```
  *(Do NOT sweep unrelated dirty/untracked files from the working tree into commits; always stage explicit paths.)*

## 2. Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/lib/__tests__/touchAudit.test.ts` (or `[NEW] src/lib/__tests__/flushFrameAudit.test.ts`) | `wall.css` audit assertions | Add TDD static CSS assertions verifying flush-mounted `.photo-frame` (`border-right: 2.5px solid #161616`, `border-bottom: 2.5px solid #121212`, `border: none` / zero top & left borders, zero gray bevels `#d5d1c8`/`#c6c1b7`, `--frame-radius: 0px`), flat `.photo-window` (`box-shadow: none` on desktop and `@media (pointer: coarse)`), and preserved `.photo-frame.is-lit.focused` `--tilt-sx`/`--tilt-sy` shadow consumption. Update any existing pinned `.photo-window` inset-shadow assertion in `touchAudit.test.ts` to expect `box-shadow: none`. |
| `src/styles/wall.css` | `--frame-radius`, `.photo-frame` (`L993-L1034`), `.photo-frame.is-lit*`, `.photo-window` (`L1128-L1141`), coarse `.photo-window` (`L1257-L1261`) | Set `--frame-radius: 0px`; replace `.photo-frame` sloped gray outer bevel borders (`#d5d1c8` / `#c6c1b7` / white top-left highlights) with `border: none; border-right: 2.5px solid #161616; border-bottom: 2.5px solid #121212;`; set `.photo-window { box-shadow: none; }` on both desktop and coarse pointers; refine `.photo-frame.is-lit`, `:hover`, and `.focused` / `.is-lit.focused` floating cleat shadows by replacing the bright molded top-bevel inset highlight (`0 1px 0 rgba(255, 252, 242, ...) inset`) with a subtle hairline (`0 0 0 0.5px rgba(255, 255, 255, 0.14) inset`) while preserving `--sx`/`--sy`, `--tilt-sx`/`--tilt-sy`, `translateZ(...)` lift, 3D tilt, and `.photo-sheen`. |

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions**:
  - Pure CSS visual transition in `src/styles/wall.css` with **zero** JS, React, or layout-geometry changes.
  - Keep `--frame-padding: 11px` and `--frame-bg: #f6f4ef` unchanged so `fitFrameInCell`, `MacroIsland`, `islandLayout`, and `PrintSharpOverlay` have 0 px geometry/layout drift.
  - Preserve ALL existing lift (`translateZ(22px)` / `36px` / `58px`), `transform-style: preserve-3d`, `transition: transform 0.24s ...`, 3D `rotateX`/`rotateY` hover and focus tilt, mobile Print Focus gyroscope tilt + 3 s auto-recenter, `--tilt-sx`/`--tilt-sy` shadow shifts, `.photo-sheen` specular highlight, and `@media (pointer: coarse)` render-profile optimizations (`scale(1.0195)` flattening on non-focused frames, `.photo-frame.is-lit.focused` specificity).
  - Keep all `:hover` rules wrapped inside `@media (hover: hover) and (pointer: fine)` so `touchAudit.test.ts` and `cssBoundaryAudit.test.ts` stay 100% green.
- **Hard Exclusions / No-Go**:
  - Do NOT modify `.env`, `.env.*`, or credential files.
  - Do NOT introduce unapproved external dependencies.
  - Do NOT modify React components (`FramedPrint.tsx`, `GalleryCanvas.tsx`, `PrintSharpOverlay.tsx`, `MacroIsland.tsx`), layout math (`islandLayout.ts`, `fitFrameInCell`), or add Polaroid bottom chins / full-bleed cropping.
  - Do NOT perform code modifications outside the Target Context Map without prior task coverage.

## 4. Visual & UI Design Specifications & Vision Verification
- **Theme**: Chiaroscuro Gallery — Flush-Mounted Print Frames (Aluminum Dibond / Archival Gatorboard)
- **Key Tokens**:
  - Rigid Backing Edge: `border: none; border-right: 2.5px solid #161616; border-bottom: 2.5px solid #121212;`
  - Flat Front Margin (`--frame-bg`): `#f6f4ef` | Padding (`--frame-padding`): `11px` (unchanged)
  - Corner Radius (`--frame-radius`): `0px` (sharp flush-mounted corners, zero mitered bevel seams)
  - Inner Window (`.photo-window`): `box-shadow: none` on BOTH desktop (`pointer: fine`) and mobile (`pointer: coarse`)
- **Component Anatomy & States**:
  - **Resting (`.photo-frame.is-lit`)**: Flat `#f6f4ef` plane (`11px` margin), crisp `2.5px` matte-black right/bottom backing edge, `0px` radius, subtle `0.5px` hairline edge (`0 0 0 0.5px rgba(255, 255, 255, 0.14) inset`), plus two-layer floating cleat shadow (tight contact shadow + soft directional downward shadow via `--sx`/`--sy`).
  - **Desktop Hover (`.photo-frame.is-lit:hover` inside `@media (hover: hover) and (pointer: fine)`)**: Lifts to `translateZ(36px)` with 3D `rotateX`/`rotateY` tilt, shifts floating cleat shadow (`--tilt-sx`/`--tilt-sy`), and sweeps `.photo-sheen` across the flat print plane.
  - **Print Focus (`.photo-frame.is-lit.focused`)**: Lifts to `translateZ(58px)` with 3D tilt (mouse on desktop, gyroscope on mobile), dynamic floating cleat shadow (`--tilt-sx`/`--tilt-sy`), and flat `.photo-sheen` specular highlight (`PrintSharpOverlay` aligned at 0 px delta).
- **Responsive Layout**:
  - Desktop `1440×900` (`pointer: fine`) and Mobile `390×844` (`pointer: coarse`) across all three moods (`chiaroscuro`, `concrete`, `alabaster`).
  - Touch targets and coarse-pointer render profile remain unchanged (`scale(1.0195)` non-focused flattening, single-layer directional shadow, `.photo-frame.is-lit.focused` preserving `--tilt-sx`/`--tilt-sy`).
- **Multi-Modal Vision Verification**:
  - Capture Playwright screenshots on desktop (`1440×900`) and mobile (`390×844`) across `chiaroscuro`, `concrete`, and `alabaster` (resting album view, desktop hover/focus tilt, and mobile print focus with `--tilt-sx: 12px`), and inspect the resulting image files directly to verify crisp `2.5px` dark backing edges, flat front plane (no inner shadow or gray bevels), floating cleat elevation, and active tilt/sheen.
  - If any physical hardware display calibration (e.g. real iPhone display) is required beyond Playwright headless inspection, leave that specific physical check marked for manual maintainer review while completing all automated code, test, and Playwright verification tasks.

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: `npx vitest run`
- **Targeted Audit Tests**: `npx vitest run src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts` (plus `src/lib/__tests__/flushFrameAudit.test.ts` if created)
- **Full Validation Gate**: `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build`
- **TDD Requirement**: Task group `## 1` MUST scaffold failing unit/static-audit tests before touching `src/styles/wall.css`. Verify they fail initially.
- **Resource & Concurrency Rules**:
  - During task implementation, run ONLY the narrowest test file corresponding to the modified code. Do NOT run full test discovery or headless browser E2E suites on every task checkbox.
  - When running heavy test suites or Playwright verification, wrap commands with `safe-test` (e.g. `safe-test npx vitest run`) or run with single worker (`--workers=1`) to serialize execution and prevent memory thrashing.

## 6. Implementation Task Checklist
- [ ] 1.0 Branch `feat/flush-mounted-print-frames` from `origin/main` (`c626136`).
- [ ] 1.1 Add failing flush-frame assertions in `src/lib/__tests__/touchAudit.test.ts` (or a new `src/lib/__tests__/flushFrameAudit.test.ts`): `.photo-frame` uses `2.5px` `#161616`/`#121212` right/bottom backing edge with zero `#d5d1c8`/`#c6c1b7` bevels and `0px` radius, `.photo-window` uses `box-shadow: none` on desktop and coarse, and `.photo-frame.is-lit.focused` preserves `--tilt-sx`/`--tilt-sy`.
- [ ] 1.2 Run `npx vitest run src/lib/__tests__/touchAudit.test.ts` (and new audit file if added) and confirm new assertions fail before editing `wall.css`.
- [ ] 2.1 Update `src/styles/wall.css`: set `--frame-radius: 0px`, replace `.photo-frame` sloped gray borders with `border: none; border-right: 2.5px solid #161616; border-bottom: 2.5px solid #121212;`, set `.photo-window { box-shadow: none; }` on both desktop and coarse pointers, and refine `.photo-frame.is-lit` / `:hover` / `.focused` floating cleat shadows (removing bright top-bevel inset highlight while preserving `--sx`/`--sy`, `--tilt-sx`/`--tilt-sy`, lift, tilt, and `.photo-sheen`).
- [ ] 2.2 Run `npx vitest run src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts` and confirm 100% pass.
- [ ] 3.1 Run `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build` and verify 100% pass.
- [ ] 3.2 Run Playwright verification on desktop (`1440×900`) and mobile (`390×844`) across `chiaroscuro`, `concrete`, and `alabaster` confirming computed border/radius/`box-shadow: none` values, preserved hover/focus lift + tilt + `.photo-sheen` + `PrintSharpOverlay` alignment, and coarse `--tilt-sx` shadow shift; inspect screenshots directly.
- [ ] 3.3 Record automated + Playwright evidence in `openspec/changes/flush-mounted-print-frames/verification.md`.

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify all checkboxes in `openspec/changes/flush-mounted-print-frames/tasks.md` are marked `- [x]`. Only tick boxes that genuinely ran and passed.
2. Check layout/geometry invariance: confirm `--frame-padding` stays `11px` and `PrintSharpOverlay` has `0 px` alignment delta.
3. Ensure `openspec/changes/flush-mounted-print-frames/verification.md` is populated with:
   - Executive Summary & Environment
   - Requirement Adherence Audit Matrix (mapping every spec scenario in `openspec/changes/flush-mounted-print-frames/specs/instanced-photo-renderer/spec.md` to its verifying test / Playwright check)
   - Resolved Assumptions & Empirical Proof (computed CSS values + Playwright screenshot inspection notes across all 3 moods on desktop & mobile)
   - Nomenclature & Code Symbol Audit
   - Verbatim Execution Logs
4. Automatically run verification via `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues**:
  1. Sync delta specs via the `openspec-sync-specs` skill for `flush-mounted-print-frames`.
  2. **Open a Pull Request**:
     - Ensure your work is on `feat/flush-mounted-print-frames` branched from `origin/main` (`c626136`).
     - Stage and commit all implementation code and every artifact within the change directory (`git add openspec/changes/flush-mounted-print-frames openspec/specs src/styles/wall.css src/lib/__tests__`), then push the branch (`git push -u origin HEAD`).
     - Open a Pull Request using `gh pr create --fill` (or with a concise title and a body summarizing `proposal.md` and `verification.md`) and report the PR URL.
- **If CRITICAL issues or failed test verification errors are detected on initial pass**:
  1. Announce: "Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."
  2. Delegate a single-pass repair task to `spec-coder-sub` with the verification failure context:
     > "Fix the specific verification failures and test errors reported for change 'flush-mounted-print-frames'. Refer to the error log, make minimal targeted patches to resolve the failures, run verification commands, and update tasks.md."
  3. Re-run verification via `openspec-verify-change`.
  4. **If verification passes after repair**:
     - Sync delta specs via the `openspec-sync-specs` skill for `flush-mounted-print-frames`.
     - Stage, commit, push branch, and open PR via `gh pr create --fill`.
  5. **If verification STILL fails after the single repair pass**:
     - **HALT**: Do NOT loop or re-run again. Present the Verification Report and remaining blockers to the user for manual guidance.
