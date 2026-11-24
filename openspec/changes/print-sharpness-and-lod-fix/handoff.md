# OpenCode Orchestration Handoff: OpenSpec Change 'print-sharpness-and-lod-fix'

You are the orchestration agent for OpenSpec change `print-sharpness-and-lod-fix` running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

---

## 1. Orchestration Directive
- **Change Name**: `print-sharpness-and-lod-fix`
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub print-sharpness-and-lod-fix`)
- **Feature Branch**: Create and work on `feat/print-sharpness-and-lod-fix` cut from `main`.
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). Keep changes strictly bounded to the Target Context Map.

---

## 2. Target Context Map

| File Path (relative to repo root) | Target Lines | Modification Summary |
| :--- | :--- | :--- |
| `src/components/wall/__tests__/zoomTier.test.ts` | `L13-L20`, `L88-L96` | Add TDD unit tests asserting `PRINT_FOCUS_LOD_WIDTH === 2048`, `resolvePrintLodWidth(CELL_PX, 3.5, 1, true) === 2048`, and `resolvePrintLodWidth(CELL_PX, 3.5, 1, false) === 800`. |
| `src/styles/wall.css` | `L484-L493`, `L955-L966`, `L1109-L1120` | Remove permanent `will-change: transform;` from `.wall-world` (`L490`, managed dynamically by `GalleryCanvas.tsx` `markGesture`) and `.photo-frame` (`L962`), and `will-change: transform, opacity;` from `.photo-sheen` (`L1116`). |
| `src/components/wall/zoomTier.ts` | `L14-L55` | Export `PRINT_FOCUS_LOD_WIDTH = LOD_BUCKETS[LOD_BUCKETS.length - 1]` (`2048`) and `resolvePrintLodWidth(cellPx, scale, dpr, focused)`. |
| `src/components/wall/FramedPrint.tsx` | `L14`, `L106-L116` | Use `focused ? PRINT_FOCUS_LOD_WIDTH : lodWidth` (or `resolvePrintLodWidth`) when calling `lodUrl(photo, ...)` so the focused print always requests `2048px` while unfocused siblings keep `lodWidth`. |

---

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions**:
  - Remove permanent `will-change` declarations from `.wall-world`, `.photo-frame`, and `.photo-sheen` in `src/styles/wall.css` so Chromium re-rasterizes settled frames at full zoom scale (while keeping `GalleryCanvas.tsx`'s dynamic `markGesture` `willChange` toggle on `.wall-world`).
  - Keep `resolveProjectedLodWidth` unchanged for unfocused sibling prints and overview/album tiers; upgrade **only** the active `focused` print in Print Focus to `PRINT_FOCUS_LOD_WIDTH` (`2048`).
- **Hard Exclusions / No-Go**:
  - Do **NOT** modify `.env`, `.env.*`, or credential files.
  - Do **NOT** introduce any new npm dependencies.
  - Do **NOT** change camera `ZOOM_MIN` / `ZOOM_MAX` or `PRINT_PADDING`.
  - Do **NOT** load `2048px` images for unfocused sibling prints.

---

## 4. Visual & UI Design Specifications & Vision Verification
- **Status: Non-visual / Rendering Fidelity Bugfix.** No color tokens, typography, spacing, or HUD layout rules are changed.
- **Playwright Verification (`--workers=1`, `1440×900`, `DPR = 1`, `next start`)**:
  - Open `/photos?demo=4&mood=chiaroscuro`, enter Album Focus, and click a print into Print Focus.
  - Verify `getComputedStyle(focusedFrame).willChange === 'auto'` and `getComputedStyle(sheen).willChange === 'auto'`.
  - Verify the focused `<img class="photo-img">` `src` uses the `2048` bucket while unfocused sibling frames remain on `800`.
  - Capture and visually inspect a Print Focus screenshot to confirm crisp rendering and smooth hover tilt without stutter.

---

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: `npx vitest run` (run directly — do **NOT** wrap Vitest with `safe-test`, which OOMs on this suite).
- **TDD Requirement**: Task group `## 1` MUST scaffold failing unit tests in `src/components/wall/__tests__/zoomTier.test.ts` and verify they fail before modifying implementation code.
- **Targeted Loop Command**:
  ```bash
  npx vitest run src/components/wall/__tests__/zoomTier.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts
  ```
- **Final Regression Gate**:
  ```bash
  npm run typecheck && npm run lint && npx vitest run && npm run build
  ```

---

## 6. Implementation Task Checklist

- [ ] 1.1 Extend `src/components/wall/__tests__/zoomTier.test.ts` with failing tests asserting `PRINT_FOCUS_LOD_WIDTH === 2048`, `resolvePrintLodWidth(CELL_PX, 3.5, 1, true) === 2048`, and `resolvePrintLodWidth(CELL_PX, 3.5, 1, false) === 800`.
- [ ] 1.2 Run `npx vitest run src/components/wall/__tests__/zoomTier.test.ts` and confirm the new tests fail before implementation.
- [ ] 2.1 Remove permanent `will-change: transform;` from `.wall-world` (`L490`) and `.photo-frame` (`L962`), and `will-change: transform, opacity;` from `.photo-sheen` (`L1116`) in `src/styles/wall.css`.
- [ ] 2.2 Export `PRINT_FOCUS_LOD_WIDTH` and `resolvePrintLodWidth` from `src/components/wall/zoomTier.ts`, and update `src/components/wall/FramedPrint.tsx` (`L110`) to pass `focused ? PRINT_FOCUS_LOD_WIDTH : lodWidth` into `lodUrl(photo, ...)`.
- [ ] 3.1 Run `npm run typecheck && npm run lint && npx vitest run && npm run build` and verify 100% pass (including `zoomTier.test.ts` and `cssBoundaryAudit.test.ts`).
- [ ] 3.2 Run Playwright (`--workers=1`, `1440×900`, `DPR = 1`) against `next start` on `/photos?demo=4&mood=chiaroscuro`: enter Print Focus and verify `getComputedStyle(focusedFrame).willChange === 'auto'`, `getComputedStyle(sheen).willChange === 'auto'`, focused `<img class="photo-img">` requests the `2048` bucket while unfocused siblings remain on `800`, and inspect a captured Print Focus screenshot. Populate `openspec/changes/print-sharpness-and-lod-fix/verification.md` with Requirement Adherence Audit Matrix and verbatim execution logs.

---

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify all checkboxes in `openspec/changes/print-sharpness-and-lod-fix/tasks.md` are marked `- [x]`. Only tick boxes that genuinely ran and passed.
2. Ensure `openspec/changes/print-sharpness-and-lod-fix/verification.md` is populated with:
   - Executive Summary & Environment
   - Requirement Adherence Audit Matrix (mapping every spec scenario to its verifying test)
   - Playwright `willChange` + `2048`/`800` LOD proof + screenshot inspection notes
   - Verbatim Execution Logs
3. Automatically run verification via `openspec-verify-change`.

---

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues**:
  1. Sync specs: `openspec specs apply --change "print-sharpness-and-lod-fix"`.
  2. **Open a Pull Request**:
     - Ensure your work is on `feat/print-sharpness-and-lod-fix`.
     - Stage and commit all implementation code, `openspec/specs`, and change artifacts (`git add openspec/changes/print-sharpness-and-lod-fix openspec/specs <implementation-files>`), then push (`git push -u origin HEAD`).
     - Open a Pull Request via `gh pr create --fill` and report the PR URL.
- **If CRITICAL issues or failed test verification errors are detected on initial pass**:
  1. Announce: `"Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."`
  2. Delegate a single-pass repair task to `spec-coder-sub` with the verbatim failure log and instructions to make minimal targeted patches, re-run verification commands, and update `tasks.md`.
  3. Re-run `openspec-verify-change`.
  4. **If verification passes after repair**: sync specs, commit, push, and open PR via `gh pr create --fill`.
  5. **If verification STILL fails after the single repair pass**: **HALT** and present the Verification Report and remaining blockers to the user.
