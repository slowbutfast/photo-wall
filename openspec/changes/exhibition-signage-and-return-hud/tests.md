# Verification Plan: Exhibition Title Signage & Persistent Return HUD

## Automated Tests

- `npx vitest run src/components/hud/__tests__/GalleryHud.test.tsx` (using `// @vitest-environment jsdom` for DOM/focus/`inert` assertions):
  - Verifies no `.hud-top-right` / `Overview` button renders in any `viewMode`.
  - Verifies `.hud-return-persistent` (`RETURN`, all caps, no `[ESC]` / `hud-key-hint`) is hidden + `disabled`/`tabIndex={-1}` in `overview` and visible/active in both `album` and `print` modes, invoking `returnOneLevel()`.
  - Verifies `PhotoFocusBar` renders plain `PREV` and `NEXT` (no `←` / `→` glyphs), no duplicate `RETURN` button, sets `is-hidden` + `inert` when `viewMode !== 'print'`, and **retains its last visible caption/metadata** while transitioning to hidden (never fading out blank).
- `npx vitest run src/components/wall/__tests__/ExhibitionTitleSign.test.tsx` (`// @vitest-environment jsdom`):
  - Verifies `greg's` / `photo wall` renders inside the grid-locked `.exhibition-title-placard.mat-aluminum` banner (WITHOUT `.museum-placard` class), with `452 × 200px` inline dimensions and no standoffs.
  - Verifies `← home` renders as `<a href="https://gregory-lazatin.com">` flush-left beneath the banner.
  - Integration test with a real native `pointerdown` → `pointermove` sequence dispatched on `.exhibition-home-link` inside a wall container confirming the native `GalleryCanvas` listener ignores `.exhibition-sign-column` and starts zero wall pan.
- `npx vitest run src/lib/camera/__tests__/cameraMath.test.ts`:
  - Verifies `computeFirstRowBounds` stays unchanged, the grid-locked constants (`4.52u × 2.0u`, `0.94u` gap), and `includeTitleSign(bounds, placements)` expands `minX` to the album placard's left edge − gap − width while recomputing both `width` and center `x` (including a narrow portrait `390×844` case and non-index-0 top-left album placement).
- `npx vitest run src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts src/lib/__tests__/publicBoundaryAudit.test.ts`:
  - Verifies `.exhibition-home-link:hover` is wrapped inside `@media (hover: hover) and (pointer: fine)`, zero ungated `:hover` rules exist, the aluminium widening leaves coarse acrylic checks green, and `printHandoffAudit.test.ts` is updated to remove the reversed `hud-key-hint` `[ESC]` assertion.
- `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build`:
  - Verifies `metadata.title === "greg's photo wall"` and full suite / production build pass cleanly.

## Playwright & Browser Verification (Measurable Assertions)

- **Desktop (`1440×900`) & Mobile (`390×844`) across `chiaroscuro`, `concrete`, `alabaster`:**
  - `document.title === "greg's photo wall"`.
  - `.exhibition-title-placard.mat-aluminum` measures `452 × 200px` at world scale, its top and bottom edges are `0 px` flush with the adjacent album placard, and its gap equals the album placard → first photo-column gap.
  - `← home` is flush-left with the banner (`0 px` left delta) and hovers `-3px` with `text-decoration-line: none`; native `pointerdown` + `pointermove` starting on `.exhibition-sign-column` produces `0 px` wall pan.
  - `.hud-return-persistent` `getBoundingClientRect()` is identical (`0 px` delta in `top`/`left`/`width`/`height`) between `print` and `album` modes; under `prefers-reduced-motion: reduce`, `.photo-focus-bar` and `.hud-return-persistent` report `transitionDuration === '0s'`.
  - At `390×844` portrait entry the banner stays fully framed; the doubled width lowers entry scale to ~`0.217` (macro tier), and in Album View `.hud-return-persistent` does not cover focused album photos.
