# Verification Plan: Mobile Render Profile

## Automated Tests

- `npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts`:
  - Verifies `createGyroController` attaches **zero** `deviceorientation` listeners in `macro` AND `album` tiers, attaches listeners only in `print` focus (`focusedPhotoId !== null`), and detaches immediately when returning to `album`.
- `npx vitest run src/components/wall/__tests__/zoomTier.test.ts`:
  - Verifies `resolveProjectedLodWidth(cellPx, scale, 3, 2)` clamps `effectiveDpr` to `2` for non-focused prints while `resolvePrintLodWidth(..., true)` still returns `2048`.
- `npx vitest run src/components/wall/__tests__/wallCanvasDpr.test.ts` (or `PlaygroundPbrWall` helper test):
  - Verifies `resolveWallCanvasDpr(3, true)` returns `1.0` (`MOBILE_WALL_MAX_DPR`) while `resolveWallCanvasDpr(2, false)` returns `2.0`.
- `npx vitest run src/lib/__tests__/touchAudit.test.ts`:
  - Parses **all** `@media (pointer: coarse)` blocks in `wall.css` and verifies mobile render-profile rules sit strictly under `@media (pointer: coarse)`, `:hover` gating and `touch-action` invariants survive intact, frosted placard overrides target material-specific selectors (never `.mat-aluminum`), and `cssBoundaryAudit.test.ts` stays green.
- `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build`:
  - Full automated suite passes cleanly.
- **Coarse-Pointer Playwright Computed-Style Assertion:**
  - Under Playwright coarse-pointer emulation, assert that setting `--tilt-sx` on `.photo-frame.is-lit.focused` changes its computed `box-shadow` offsets (verifying `.photo-frame.is-lit.focused` wins over `.photo-frame.is-lit`), and verify `.mat-aluminum` placards keep their metallic background.
- **Desktop Fine-Pointer Zero-Diff Check:**
  - Playwright (`1440×900`, fine pointer) confirms **0** `pixelmatch` and computed-style diffs across idle, album, print, and hovered states vs. `main`.

## Manual Verification (Real iPhone 16 Pro & Android Chrome Preview)

Compare against the **post-`render-loop-efficiency` baseline** captured in Task `1.0b`:

- **Measurable Acceptance Thresholds (`S2`, `S3`, Layers-Tab, Energy Impact):**
  - **Album View Layers-Tab count:** Reduced by **≥ 30%** vs. Task `1.0b` baseline (explicitly verifying whether `scale(1.0195)` reduces composited layers as intended).
  - **`S3` post-zoom paint spikes:** Reduced from `~19 ms` baseline to **`< 8 ms`**.
  - **`S2` / `S3` composite time & missed vsyncs:** Main-thread `composite` ms/frame reduced by **≥ 25%** with missed vsyncs **`< 5%`**.
  - **`S2` / `S4` Energy Impact:** Measurably lower than Task `1.0b` baseline; keep `MOBILE_WALL_MAX_DPR = 1.0` only if visual + Energy Impact checks confirm a benefit (otherwise revert or adjust to `1.25` with evidence).
- **Visual & Mood Acceptance (All 3 Moods: `chiaroscuro`, `concrete`, `alabaster`):**
  - **WHEN** inspecting Macro, Album View, and Print Focus on iPhone 16 Pro (testing wall DPR `1.0`, `1.25`, `1.5`)
  - **THEN** warm spotlight pools remain rich, frosted placards are legible with crisp borders/pins, flattened Album View prints (`scale(1.0195)`) match expected spacing without overlap, and Print Focus delivers crisp `2048px` photography with smooth gyro tilt, dynamic shadow, and normal-blended glare.
- **Conditional 2B Gate:**
  - **IF** post-profile traces still show dropped frames while the main thread is quiet (GPU-bound), open a follow-up change for `2B` (wall shader reduction); otherwise leave `2B` deferred.
