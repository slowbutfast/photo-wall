# OpenCode Orchestration Handoff: OpenSpec Change 'exhibition-signage-and-return-hud'

You are the orchestration agent for OpenSpec change `exhibition-signage-and-return-hud` running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive
- **Change Name**: `exhibition-signage-and-return-hud`
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub exhibition-signage-and-return-hud`)
- **Branching & Parallel Execution Note**: Create and switch to `feat/exhibition-signage-and-return-hud` directly from current `main` (`3943e25`, which sits on `origin/main` `cdeda3b` + PR #17). This change is intentionally running **in parallel** with `mobile-print-transitions` — do **NOT** block waiting for `mobile-print-transitions` to merge. If `printHandoffAudit.test.ts` is not yet present on this branch, skip editing it and note it in `verification.md` for post-merge reconciliation once `mobile-print-transitions` lands.
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). Maintain strict isolation between feature compartments and avoid horizontal abstractions.

## 2. Target Context Map

| File Path (relative to repo root) | Target Symbol / Lines | Modification Summary |
|---|---|---|
| `src/components/hud/__tests__/GalleryHud.test.tsx` | `L1-L50` | Switch to `// @vitest-environment jsdom`; TDD tests for removed `Overview`, persistent `RETURN` (`overview` hidden/`disabled`/`tabIndex={-1}` vs. `album` & `print` visible calling `returnOneLevel()`), plain `PREV` / `NEXT` without arrows, `PhotoFocusBar` `is-hidden` + `inert`, and latched last-visible caption during exit fade. |
| `src/components/wall/__tests__/ExhibitionTitleSign.test.tsx` | `[NEW]` | `// @vitest-environment jsdom` TDD tests for `.exhibition-title-placard.mat-acrylic` (WITHOUT `.museum-placard` class; `greg's photo` / `wall` + `.placard-standoff.left`/`.right`), `<a href="https://gregory-lazatin.com">` (`← home`), and a native `pointerdown` + `pointermove` wall-container test proving `.exhibition-sign-column` never starts a pan. |
| `src/lib/camera/__tests__/cameraMath.test.ts` | Existing suite | Keep all `computeFirstRowBounds` tests unchanged; add tests for `findTopLeftAlbum` and `includeTitleSign(bounds, placements)` (expanding `minX` to `firstLeft - TITLE_SIGN_GAP - TITLE_SIGN_WIDTH`, recomputing union `width` and center `x`, covering narrow portrait `390×844` and non-index-0 top-left album). |
| `src/app/layout.tsx` | `metadata.title` (`L5-L9`) | Rename browser tab title from `'Chiaroscuro Gallery'` to `"greg's photo wall"`. |
| `src/components/hud/GalleryHud.tsx` | `GalleryHud` (`L1-L30`) | Remove top-right `Overview` button; render persistent bottom-right `RETURN` button (`.hud-return-persistent`) calling `returnOneLevel()`, hidden (`is-hidden`, `aria-hidden`, `disabled`, `tabIndex={-1}`) in `overview` and visible in `album` & `print`. |
| `src/components/hud/PhotoFocusBar.tsx` | `PhotoFocusBar` (`L15-L73`) | Remove arrow glyphs (`←`/`→`) from `PREV`/`NEXT`, remove duplicate `RETURN` button (replace with `.photo-focus-return-spacer` aligned to `.hud-return-persistent`), latch last visible `{ album, photo }` in a ref so the `0.22s` exit fade never renders blank, and keep mounted with `is-hidden` + boolean `inert` when `viewMode !== 'print'` (keeping `setBottomInset(0)` when `!visible`). |
| `src/styles/hud.css` | `.hud-top-right`, `.photo-focus-bar`, `.hud-return-persistent` | Remove `.hud-top-right`; add `.hud-return-persistent` at `right: max(22px, env(safe-area-inset-right, 0px))` and `bottom: calc(11px + env(safe-area-inset-bottom, 0px))` (`14px` / `10px` on `≤ 767px`, `z-index: 70`, `>= 44×44 px` coarse hit target); add `0.22s` / `0.2s` slide/fade transitions + `@media (prefers-reduced-motion: reduce)` `transition: none`. |
| `src/components/wall/ExhibitionTitleSign.tsx` | `[NEW]` | Render `.exhibition-sign-column` with `.exhibition-title-placard.mat-acrylic` (no `.museum-placard` class; `greg's photo` / `wall` + `.placard-standoff.left`/`.right`) and `<a href="https://gregory-lazatin.com">` (`← home`) with `onPointerDown={(e) => e.stopPropagation()}` as belt-and-suspenders. |
| `src/lib/camera/cameraMath.ts` | `computeFirstRowBounds` + new helpers | Keep `computeFirstRowBounds` pure; export `TITLE_SIGN_WIDTH = 1.52`, `TITLE_SIGN_GAP = 0.64`, `findTopLeftAlbum`, and `includeTitleSign(bounds, placements)`. |
| `src/components/wall/GalleryCanvas.tsx` | Native `onPointerDown`, `onClick`, entry bounds, `.wall-world` | Return early at top of native `onPointerDown` and `onClick` when `(event.target as HTMLElement | null)?.closest('.exhibition-sign-column')`; wrap Row-0 entry bounds with `includeTitleSign`; mount `<ExhibitionTitleSign />` left of `findTopLeftAlbum(placements)` inside `.wall-world`. |
| `src/styles/wall.css` | `.mat-acrylic` (`L614`, `L638-639`, `L648-657`, `L685`, `L1170-1181`) + sign rules | Widen `.museum-placard.mat-acrylic` selectors to `:is(.museum-placard, .exhibition-title-placard).mat-acrylic` (preserving exact `0,3,0` specificity, PR #17 Alabaster dark plate `#F4F6F4` ink, standoffs, and coarse frosted fallback); add `.exhibition-sign-column` and `.exhibition-home-link` (mood-adaptive ink, `@media (hover: hover) and (pointer: fine)` `-3px` arrow hover with **no underline**, reduced-motion override). |

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions**:
  - **D1:** Single persistent `.hud-return-persistent` (`RETURN`) in `GalleryHud.tsx` + right spacer & ref-latched `{ album, photo }` in `PhotoFocusBar.tsx` (`0 px` shift between `print` and `album`; `inert` when hidden).
  - **D2:** Keep `computeFirstRowBounds` pure; wrap with `includeTitleSign(bounds, placements)` using `findTopLeftAlbum(placements)` and recomputing union `width` and center `x`.
  - **D3:** Native `GalleryCanvas` `onPointerDown` + `onClick` target check ignoring `.exhibition-sign-column` (since native listeners run before React root delegation).
  - **D4:** Widen existing `.museum-placard.mat-acrylic` rules via `:is(.museum-placard, .exhibition-title-placard).mat-acrylic` — **never** add `.museum-placard` class to the title sign.
- **Hard Exclusions / No-Go**:
  - Do NOT modify `.env`, `.env.*`, or credential files.
  - Do NOT introduce unapproved external dependencies.
  - Do NOT alter `/admin/*` Curator Studio tab titles or chrome.
  - Do NOT revert PR #17's dark Alabaster acrylic plate (`rgba(30,36,33,0.78)` + `#F4F6F4` ink).
  - Do NOT add an underline on `.exhibition-home-link:hover`, and do NOT leave any `:hover` rule outside `@media (hover: hover) and (pointer: fine)`.

## 4. Visual & UI Design Specifications & Vision Verification
- **Theme**: Chiaroscuro Gallery — Exhibition Signage & Persistent Return HUD (`design.md`)
- **Key Tokens**:
  - **Title Placard (`.exhibition-title-placard.mat-acrylic`):** `152px` wide, `padding: 16px 14px 24px`, verbatim `.mat-acrylic` across all 3 moods (including PR #17 dark Alabaster plate `#F4F6F4` ink and coarse-pointer `backdrop-filter: none` frosted fallback), cylindrical `.placard-standoff.left` / `.right`, `15.5px / 700 / 1.2` Helvetica centered two lines (`greg's photo` / `wall`).
  - **Wayfinding Home Link (`.exhibition-home-link`):** Centered `14px` beneath placard, `13.5px / 500`, mood-adaptive ink (`#d6d4cd` on `chiaroscuro`, `#e5e3dc` on `concrete`, `#111111` on `alabaster`; hover `#ffffff` / `#ffffff` / `#000000`), `-3px` arrow shift on fine-pointer hover, **no underline**.
  - **HUD Controls & Transitions:** Plain `PREV`, `NEXT`, `RETURN` (`11px / 500` uppercase, `border-radius: 0`, `>= 44×44 px` coarse target); `.photo-focus-bar` `opacity 0.22s ease, transform 0.22s ease` (`translateY(10px)`); `.hud-return-persistent` `opacity 0.2s ease, transform 0.2s ease` (`translateY(6px)`); instant (`0s`) under `prefers-reduced-motion: reduce`.
- **Multi-Modal Vision Verification**:
  - Capture Playwright screenshots on desktop (`1440×900`) and mobile (`390×844`) across `chiaroscuro`, `concrete`, and `alabaster` and inspect directly to verify alignment, legibility, PR #17 Alabaster dark plate parity, and `0 px` `RETURN` shift between `print` and `album`.

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: `npx vitest run` (Node default; use `// @vitest-environment jsdom` for DOM/pointer/`inert` test files).
- **TDD Requirement**: Task Group 1 MUST scaffold failing unit/integration tests before touching implementation code. Verify they fail initially.
- **Targeted Loop Command**:
  `npx vitest run src/components/hud/__tests__/GalleryHud.test.tsx src/components/wall/__tests__/ExhibitionTitleSign.test.tsx src/lib/camera/__tests__/cameraMath.test.ts`
- **Full Regression & Audit Command**:
  `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build` (plus Playwright verification wrapped with `safe-test` and `--workers=1`).

## 6. Implementation Task Checklist
- [ ] 1.0 Branch `feat/exhibition-signage-and-return-hud` from `main` (`3943e25`, parallel with `mobile-print-transitions`).
- [ ] 1.1 Update `src/components/hud/__tests__/GalleryHud.test.tsx` (`// @vitest-environment jsdom`) testing: no `Overview` button, persistent `RETURN` hidden/`disabled`/`tabIndex={-1}` in `overview` and active in `album`/`print` calling `returnOneLevel()`, plain `PREV`/`NEXT` without arrows, `PhotoFocusBar` `is-hidden` + `inert` when not in `print`, and latched last-visible caption during exit fade.
- [ ] 1.2 Write failing `src/components/wall/__tests__/ExhibitionTitleSign.test.tsx` (`// @vitest-environment jsdom`) covering `.exhibition-title-placard.mat-acrylic` (without `.museum-placard`), standoffs, `https://gregory-lazatin.com` (`← home`), and a native `pointerdown` + `pointermove` wall-container test proving `.exhibition-sign-column` never starts a pan; add `includeTitleSign` tests (incl. narrow `390×844` portrait & non-index-0 top-left album) in `cameraMath.test.ts` and a `layout.tsx` `metadata.title` test.
- [ ] 1.3 Run targeted Vitest files and confirm new assertions fail before implementation.
- [ ] 2.1 Update `metadata.title` in `src/app/layout.tsx` to `"greg's photo wall"`.
- [ ] 2.2 Refactor `src/components/hud/GalleryHud.tsx`, `src/components/hud/PhotoFocusBar.tsx` (ref-latching last visible `{ album, photo }` while hidden), and `src/styles/hud.css` (remove `Overview`, add `.hud-return-persistent` aligned to `.photo-focus-bar`, remove arrows from `PREV`/`NEXT`, codify `0.22s`/`0.2s` slide/fade transitions + `inert` + `prefers-reduced-motion: reduce` + safe-area & coarse `44×44 px` targets) until `GalleryHud.test.tsx` passes (update `printHandoffAudit.test.ts` only if present on branch).
- [ ] 3.1 Implement `src/components/wall/ExhibitionTitleSign.tsx` (`.exhibition-title-placard.mat-acrylic` with cylindrical standoffs + painted `← home` link to `https://gregory-lazatin.com`).
- [ ] 3.2 Add `includeTitleSign` + `findTopLeftAlbum` in `src/lib/camera/cameraMath.ts` (keeping `computeFirstRowBounds` pure), update `src/components/wall/GalleryCanvas.tsx` (native `onPointerDown` + `onClick` `.exhibition-sign-column` exclusion, entry bounds wrapper, mount `<ExhibitionTitleSign />`), and update `src/styles/wall.css` (widen `.mat-acrylic` rules via `:is(.museum-placard, .exhibition-title-placard).mat-acrylic`, add mood-adaptive `← home` ink and fine-pointer `-3px` arrow hover with no underline).
- [ ] 3.3 Confirm `ExhibitionTitleSign.test.tsx`, `cameraMath.test.ts`, `touchAudit.test.ts`, `cssBoundaryAudit.test.ts`, and `publicBoundaryAudit.test.ts` all pass.
- [ ] 4.1 Run `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build` and verify 100% pass.
- [ ] 4.2 Run Playwright verification on desktop (`1440×900`) and mobile (`390×844`) across all 3 moods (`chiaroscuro`, `concrete`, `alabaster`): assert `document.title === "greg's photo wall"`, `0` resting desktop diff on `.museum-placard.mat-acrylic`, `.exhibition-title-placard.mat-acrylic` inherits PR #17's dark Alabaster plate, `← home` hover `-3px` arrow shift with no underline, native `pointerdown`+`pointermove` on `.exhibition-sign-column` produces `0 px` pan, `RETURN` `getBoundingClientRect()` has `0 px` delta between `print` and `album`, `prefers-reduced-motion: reduce` reports `0s` transition duration, `390×844` Row-0 album width `>= 60%` viewport, and coarse `44×44 px` touch target.
- [ ] 4.3 Record automated + Playwright evidence in `openspec/changes/exhibition-signage-and-return-hud/verification.md`.

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify all checkboxes in `tasks.md` are marked `- [x]`. Only tick boxes that genuinely ran and passed.
2. Ensure `openspec/changes/exhibition-signage-and-return-hud/verification.md` is populated with:
   - Executive Summary & Environment
   - Requirement Adherence Audit Matrix (mapping every spec scenario to its verifying test)
   - Resolved Assumptions & Empirical Proof (including `390×844` portrait album width & Album View `RETURN` overlap check)
   - Nomenclature & Code Symbol Audit
   - Verbatim Execution Logs
3. Automatically run verification via `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues**:
  1. Sync delta specs via `openspec-sync-specs` for `exhibition-signage-and-return-hud` and confirm `openspec validate --specs --strict` passes.
  2. **Open a Pull Request**:
     - Ensure work is on `feat/exhibition-signage-and-return-hud`.
     - Stage and commit all implementation code and change artifacts (`git add openspec/changes/exhibition-signage-and-return-hud openspec/specs <implementation-files>`), then push (`git push -u origin HEAD`).
     - Open a Pull Request via `gh pr create --fill` summarizing `proposal.md` and `verification.md` (noting that `mobile-print-transitions` should merge first, followed by a quick `git merge origin/main` + `printHandoffAudit.test.ts` sync on this PR).
- **If CRITICAL issues or failed test verification errors are detected on initial pass**:
  1. Announce: `"Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."`
  2. Delegate 1 targeted repair task to `spec-coder-sub` with the verbatim error log.
  3. Re-run `openspec-verify-change`. If still failing after 1 repair pass, **HALT** and present diagnostics to the user.
