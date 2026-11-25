# Verification Plan: Print Sharpness and LOD Fix

## Automated Tests

- `npx vitest run src/components/wall/__tests__/zoomTier.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts`:
  - Verifies `PRINT_FOCUS_LOD_WIDTH === 2048`.
  - Verifies `resolvePrintLodWidth(CELL_PX, 3.5, 1, true) === 2048` (DPR 1 focused print upgrades to `2048`).
  - Verifies `resolvePrintLodWidth(CELL_PX, 3.5, 1, false) === 800` (unfocused sibling prints keep projected-size bucket).
  - Verifies `cssBoundaryAudit.test.ts` remains green.
- `npm run typecheck && npm run lint && npx vitest run && npm run build`:
  - Full typecheck, lint, unit suite, and production Next.js build pass with zero regressions.

## Manual / Playwright Verification

- **Print Focus Sharpness & LOD Check (`1440×900`, `DPR = 1`, `next start`)**:
  - **WHEN** opening `/photos?demo=4&mood=chiaroscuro`, entering Album Focus, and clicking a print into Print Focus
  - **THEN**:
    1. `getComputedStyle(focusedFrame).willChange === 'auto'` and `getComputedStyle(sheen).willChange === 'auto'`.
    2. The focused `<img class="photo-img">` `src` uses the `2048` bucket (`width=2048` or `height=2048` or `2048` LOD query), while unfocused sibling frames remain on `800`.
    3. Screenshot inspection confirms crisp print edges and smooth hover tilt without stutter.
- **Live CDN Sanity Check (Manual in Browser DevTools)**:
  - In production `/photos`, select focused `<img>` in DevTools and confirm `$0.naturalWidth` (or `naturalHeight`) is `~2048` (ruling out any Bunny Optimizer cap).
