# Verification Plan: Exhibition Title Signage & Persistent Return HUD

## Automated Tests

- `npx vitest run src/components/hud/__tests__/GalleryHud.test.tsx` (using `// @vitest-environment jsdom` for DOM/focus/`inert` assertions):
  - Verifies no `.hud-top-right` / `Overview` button renders in any `viewMode`.
  - Verifies `.hud-return-persistent` (`RETURN`, all caps, no `[ESC]` / `hud-key-hint`) is hidden + `disabled`/`tabIndex={-1}` in `overview` and visible/active in both `album` and `print` modes, invoking `returnOneLevel()`.
  - Verifies `PhotoFocusBar` renders plain `PREV` and `NEXT` (no `←` / `→` glyphs), no duplicate `RETURN` button, sets `is-hidden` + `inert` when `viewMode !== 'print'`, and **retains its last visible caption/metadata** while transitioning to hidden (never fading out blank).
- `npx vitest run src/components/wall/__tests__/ExhibitionTitleSign.test.tsx` (`// @vitest-environment jsdom`):
  - Verifies `greg's photo` / `wall` renders inside `.exhibition-title-placard.mat-acrylic` (WITHOUT `.museum-placard` class) with both `.placard-standoff.left` and `.placard-standoff.right`.
  - Verifies `← home` renders as `<a href="https://gregory-lazatin.com">`.
  - Integration test with a real native `pointerdown` → `pointermove` sequence dispatched on `.exhibition-home-link` inside a wall container confirming the native `GalleryCanvas` listener ignores `.exhibition-sign-column` and starts zero wall pan.
- `npx vitest run src/lib/camera/__tests__/cameraMath.test.ts`:
  - Verifies `computeFirstRowBounds` stays unchanged, and `includeTitleSign(bounds, placements)` expands `minX` to `firstLeft - TITLE_SIGN_GAP - TITLE_SIGN_WIDTH` while recomputing both `width` and center `x` (including a narrow portrait `390×844` case and non-index-0 top-left album placement).
- `npx vitest run src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts src/lib/__tests__/publicBoundaryAudit.test.ts`:
  - Verifies `.exhibition-home-link:hover` is wrapped inside `@media (hover: hover) and (pointer: fine)`, zero ungated `:hover` rules exist, widened `:is(.museum-placard, .exhibition-title-placard).mat-acrylic` passes coarse-pointer frosted checks, and `printHandoffAudit.test.ts` is updated to remove the reversed `hud-key-hint` `[ESC]` assertion.
- `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build`:
  - Verifies `metadata.title === "greg's photo wall"` and full suite / production build pass cleanly.

## Playwright & Browser Verification (Measurable Assertions)

- **Desktop (`1440×900`) & Mobile (`390×844`) across `chiaroscuro`, `concrete`, `alabaster`:**
  - `document.title === "greg's photo wall"`.
  - Existing `.museum-placard.mat-acrylic` computed styles remain identical after `:is(...)` selector widening (0 resting desktop diff on album placards), and `.exhibition-title-placard.mat-acrylic` inherits PR #17's dark Alabaster plate (`#f4f6f4` ink).
  - `← home` hover shifts `.home-arrow` by `-3px` with `text-decoration-line: none`; native `pointerdown` + `pointermove` starting on `.exhibition-sign-column` produces `0 px` wall pan.
  - `.hud-return-persistent` `getBoundingClientRect()` is identical (`0 px` delta in `top`/`left`/`width`/`height`) between `print` and `album` modes; under `prefers-reduced-motion: reduce`, `.photo-focus-bar` and `.hud-return-persistent` report `transitionDuration === '0s'`.
  - At `390×844` portrait entry, Row-0 top-left album occupies `>= 60%` viewport width, and in Album View `.hud-return-persistent` does not cover focused album photos (or reserve bottom inset if needed).
