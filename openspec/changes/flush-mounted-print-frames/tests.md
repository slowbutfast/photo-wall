# Verification Plan: Flush-Mounted Gallery Print Frames

## Automated Tests

- `npx vitest run src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts` (plus flush-frame CSS audit assertions):
  - Asserts `.playground-wall-root .photo-frame` declares `border-right: 2.5px solid #161616`, `border-bottom: 2.5px solid #121212`, `border-top: 0` (or `border: none` prior), `border-left: 0`, and `--frame-radius: 0px` (no `#d5d1c8` / `#c6c1b7` gray bevel borders).
  - Asserts `.playground-wall-root .photo-window` declares `box-shadow: none` (zero recessed inner cutout shadows on desktop or coarse pointers).
  - Asserts `.photo-frame.is-lit.focused` still consumes `--tilt-sx` / `--tilt-sy`, `:hover` rules remain wrapped in `@media (hover: hover) and (pointer: fine)`, and `cssBoundaryAudit` passes.
- `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build`:
  - Full unit test suite, typecheck, lint, and production build pass with zero regressions.

## Playwright & Visual Verification

- **Desktop (`1440×900`, fine pointer) & Mobile (`390×844`, coarse pointer) across `chiaroscuro`, `concrete`, `alabaster`:**
  - Computed styles on `.photo-frame`: `borderTopWidth === '0px'`, `borderLeftWidth === '0px'`, `borderRightWidth === '2.5px'`, `borderBottomWidth === '2.5px'`, `borderRadius === '0px'`.
  - Computed style on `.photo-window`: `boxShadow === 'none'`.
  - Desktop hover & Print Focus: `.photo-frame` lifts (`translateZ`), tilts (`rotateX`/`rotateY`), shifts `--tilt-sx`/`--tilt-sy` cast shadow, and sweeps `.photo-sheen`; `PrintSharpOverlay` stays aligned (`0 px` delta).
  - Coarse Print Focus: setting `--tilt-sx: 12px` shifts `.photo-frame.is-lit.focused` computed `box-shadow` offsets.
