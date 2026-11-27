# Tasks: Exhibition Title Signage & Persistent Return HUD

## Target Context Map

| File (repo-relative) | Target Symbol / Lines | Purpose |
| :--- | :--- | :--- |
| `src/components/hud/__tests__/GalleryHud.test.tsx` | `L1-L50` | TDD tests for removed `Overview`, persistent `RETURN` (`overview` hidden / `album` & `print` visible calling `returnOneLevel()`), and arrow-less `PREV` / `NEXT` + `is-hidden`/`inert` `PhotoFocusBar`. |
| `src/components/wall/__tests__/ExhibitionTitleSign.test.tsx` | `[NEW]` | TDD tests for `.exhibition-title-placard.mat-acrylic` (`greg's photo` / `wall` + standoffs), `<a href="https://gregory-lazatin.com">` (`← home`), and `pointerdown` stopPropagation. |
| `src/app/layout.tsx` | `metadata.title` (`L5-L9`) | Rename browser tab title from `'Chiaroscuro Gallery'` to `"greg's photo wall"`. |
| `src/components/hud/GalleryHud.tsx` | `GalleryHud` (`L1-L30`) | Remove top-right `Overview` button; render persistent bottom-right `RETURN` button (`.hud-return-persistent`) calling `returnOneLevel()`, hidden/inert in `overview` and visible in `album` & `print`. |
| `src/components/hud/PhotoFocusBar.tsx` | `PhotoFocusBar` (`L15-L73`) | Remove arrow glyphs from `PREV`/`NEXT`, remove duplicate `RETURN` / `hud-key-hint` (replace with right spacer aligned to `.hud-return-persistent`), latch last visible `{ album, photo }` in a ref so the `0.22s` exit fade never renders blank, and keep mounted with `is-hidden` + `inert` when `viewMode !== 'print'`. |
| `src/styles/hud.css` | `.hud-top-right`, `.photo-focus-bar`, `.hud-return-persistent` | Remove `.hud-top-right`; add `.hud-return-persistent` anchored to exact bottom-right slot (matching `.photo-focus-bar` safe-area & `≤ 767px` / coarse `44×44 px` rules); add `0.22s` / `0.2s` slide/fade transitions + `prefers-reduced-motion: reduce` override. |
| `src/components/wall/ExhibitionTitleSign.tsx` | `[NEW]` | Render the in-world 2 × 1 `.exhibition-sign-column` banner with `.exhibition-title-placard.mat-acrylic` (no `.museum-placard` class; `greg's` / `photo wall` flush-left, existing standoffs) and `<a href="https://gregory-lazatin.com">` (`← home`, flush-left beneath). |
| `src/lib/camera/cameraMath.ts` | `computeFirstRowBounds` + `includeTitleSign` (`[NEW]`) | Keep `computeFirstRowBounds` pure; add grid-locked `TITLE_SIGN_WIDTH = 2 × PLACARD_WIDTH + GUTTER`, `TITLE_SIGN_HEIGHT`, `TITLE_SIGN_GAP = PLACARD_GAP`, `findTopLeftAlbum`, and `includeTitleSign(bounds, placements)` expanding `minX` to the album placard's left edge − gap − width and recomputing union `width` and center `x`. |
| `src/components/wall/GalleryCanvas.tsx` | Native `onPointerDown`, `onClick`, entry bounds, `.wall-world` | Return early in native `onPointerDown` and `onClick` when `target.closest('.exhibition-sign-column')`; call `includeTitleSign` on Row-0 entry bounds; mount `<ExhibitionTitleSign />` left of the true top-left album placard inside `.wall-world`, top/bottom flush with it. |
| `src/styles/wall.css` | `.mat-acrylic` + sign rules | Widen `.museum-placard.mat-acrylic` base/text/standoff/coarse selectors to `:is(.museum-placard, .exhibition-title-placard).mat-acrylic` (reusing the existing dark glass, Alabaster plate and frosted fallback); add `.exhibition-sign-column` and `.exhibition-home-link` (mood-adaptive ink, fine-pointer hover `-3px` arrow shift with **no underline**, reduced-motion override). |

---

## 1. Test Scaffolding (TDD)

- [x] 1.0 Branch `feat/exhibition-signage-and-return-hud` directly from `main` (`6e56645`) for parallel execution with **`mobile-print-transitions`** (not yet merged; `printHandoffAudit.test.ts` is absent on this branch and is recorded in `verification.md` for post-merge reconciliation).
- [x] 1.1 Update `src/components/hud/__tests__/GalleryHud.test.tsx` (`// @vitest-environment jsdom`) testing: no `Overview` button, persistent `RETURN` hidden/`disabled`/`tabIndex={-1}` in `overview` and active in `album`/`print` calling `returnOneLevel()`, plain `PREV`/`NEXT` without arrows, `PhotoFocusBar` `is-hidden` + `inert` when not in `print`, and latched last-visible caption during exit fade.
- [x] 1.2 Write failing `src/components/wall/__tests__/ExhibitionTitleSign.test.tsx` (`// @vitest-environment jsdom`) covering `.exhibition-title-placard.mat-acrylic` (without `.museum-placard`), standoffs, `https://gregory-lazatin.com` (`← home`), and a native `pointerdown` + `pointermove` wall-container test proving `.exhibition-sign-column` never starts a pan; add `includeTitleSign` tests (incl. narrow `390×844` portrait & non-index-0 top-left album) in `cameraMath.test.ts` and a `layout.tsx` `metadata.title` test.
- [x] 1.3 Run targeted Vitest files and confirm new assertions fail before implementation.

## 2. Page Title, Persistent Return HUD, & Bar Transitions

- [x] 2.1 Update `metadata.title` in `src/app/layout.tsx` to `"greg's photo wall"`.
- [x] 2.2 Refactor `src/components/hud/GalleryHud.tsx`, `src/components/hud/PhotoFocusBar.tsx` (keep its last visible caption painted during the exit fade from the retained `focusedAlbumId`), and `src/styles/hud.css` (remove `Overview` / `hud-key-hint` `[ESC]`, add `.hud-return-persistent` aligned to `.photo-focus-bar`, remove arrows from `PREV`/`NEXT`, codify `0.22s`/`0.2s` slide/fade transitions + `inert` + `prefers-reduced-motion: reduce` + safe-area & coarse `44×44 px` targets) until `GalleryHud.test.tsx` passes; `printHandoffAudit.test.ts` is absent on this branch (post-merge reconciliation noted in `verification.md`).

## 3. Exhibition Title Placard & Wayfinding Home Link

- [x] 3.1 Implement `src/components/wall/ExhibitionTitleSign.tsx` (grid-locked `452 × 200px` `.exhibition-title-placard.mat-acrylic` banner reusing the existing Beveled Glass material/standoffs, with flush-left `greg's` / `photo wall` and painted flush-left `← home` link to `https://gregory-lazatin.com`).
- [x] 3.2 Add `includeTitleSign` + `findTopLeftAlbum` in `src/lib/camera/cameraMath.ts` (keeping `computeFirstRowBounds` pure; accepting the shared visible `columnGutter` and rightmost photo-frame `contentRight`), update `src/components/wall/GalleryCanvas.tsx` (native `onPointerDown` + `onClick` `.exhibition-sign-column` exclusion, derive the banner x from the album placard left, entry bounds wrapper, mount `<ExhibitionTitleSign />` flush with the album placard), and update `src/styles/wall.css` (widen `.mat-acrylic` rules via `:is(.museum-placard, .exhibition-title-placard).mat-acrylic`, add mood-adaptive `← home` ink and fine-pointer `-3px` arrow hover with no underline).
- [x] 3.3 Confirm `ExhibitionTitleSign.test.tsx`, `cameraMath.test.ts`, `touchAudit.test.ts`, `cssBoundaryAudit.test.ts`, and `publicBoundaryAudit.test.ts` all pass.

## 4. Verification & Empirical Audit

- [x] 4.1 Run `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build` and verify 100% pass.
- [x] 4.2 Run Playwright verification on desktop (`1440×900`) and mobile (`390×844`) across all 3 moods (`chiaroscuro`, `concrete`, `alabaster`): assert `document.title === "greg's photo wall"`, `.exhibition-title-placard.mat-acrylic` is `452 × 200px` with top/bottom `0 px` delta against the adjacent album placard, the banner→placard gap equals the visible placard→first-framed-photo gutter, outer left/right Overview margins match with no photo crop, `← home` is flush-left with the banner and hovers `-3px` with no underline, native `pointerdown`+`pointermove` on `.exhibition-sign-column` produces `0 px` pan, `RETURN` rect has `0 px` delta between `print` and `album`, `prefers-reduced-motion: reduce` reports `0s`, and coarse `44×44 px` touch target.
- [x] 4.3 Record automated + Playwright evidence in `openspec/changes/exhibition-signage-and-return-hud/verification.md`.

## Patch 01: Anchor the title banner to a stable wall frame

- [x] P01.1 Scaffold failing tests: mixed-size row 0 (short album in column 1, tall album in column 2, narrow album in column 1 under a wider column) → banner right edge + gutter == column-1 placard left, banner top == every row-0 placard top; `computeRowZeroFrame` unit cases; top/left-aligned placements in `computeWallGridPositions`
- [x] P01.2 Apply the fix in `islandLayout.ts` (cell top/left alignment), `cameraMath.ts` (`computeRowZeroFrame`, frame-based `includeTitleSign`, `findTopLeftAlbum` = leftmost in row 0), and `GalleryCanvas.tsx` (`titleSignPosition` from the frame)
- [x] P01.3 Verify reproduction tests pass and run the full regression suite + desktop/mobile Playwright check
- [x] P01.4 Update verification.md and mark PATCH-01 resolved in patch.md
