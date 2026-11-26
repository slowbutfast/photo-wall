## Automated Tests

Runner: `npx vitest run` (Node environment). For narrow loops, run the single file. Full-suite note from `alabaster-glass-legibility`: `safe-test` cannot instantiate the suite's WebAssembly under its `ulimit -v` cap. Try it first. If it aborts for that reason, record the failure and run the serialized direct command.

- `npx vitest run src/lib/camera/__tests__/flightPlan.test.ts` `[NEW]` covers the `spatial-camera-navigation` MODIFIED requirement:
  - **Easing:** `flightEase` is smoothstep and clamps outside `[0, 1]`.
  - **Path length:**
    - `zoomPathLength` equals the `S` used inside `interpolateZoom`. A shared helper is asserted by sampling `interpolateZoom` at `t = 1` versus the `S`-parameterised path.
    - It's `|ln(z1/z0)|/√2` for coincident centres.
  - **Duration** for the research.md fixtures (z = 6.2, step = `CELL_SIZE + GUTTER`, aspect 393/852): adjacent `455 ± 1`, 4-col wrap `746 ± 1`, 5-col wrap `849 ± 1`. It clamps to 450 for `S = 0` and to 1100 for very large `S`.
  - **Pan vs arc:**
    - adjacent (0.92 vw) is `pan`;
    - 3.81 vw is `arc`;
    - a 1.4 vw step with a 10% zoom change is `arc`.
  - **Sampling:**
    - pan samples keep `z` constant within `1e-9`, and `x`/`y` equal the eased lerp;
    - arc samples equal `interpolateZoom(from, to, flightEase(t))`;
    - both hit `from` at `t = 0` and `to` at `t = 1` exactly.
  - **Can-fail guard:** the old fixed 720 ms smoothstep-arc peak speed for the 5-col wrap measures `> 12` vw/s, and the new plan measures `< 7` vw/s.

- `npx vitest run src/components/wall/__tests__/focusHandoff.test.ts` `[NEW]` uses a fake sink and clock and covers `print-focus-handoff`:
  - **Shapes:**
    - album→print: incoming only, `p` goes `0 → 1`;
    - print→print: both participants, `p` stays `1`;
    - print→album: outgoing only, `p` goes `1 → 0`.
  - **Weights:**
    - `tick(0.5)` gives incoming 0.5 and outgoing 0.5;
    - `tick(1)` calls `setWeight(id, null)` for both and `onEnd(outgoing)` once;
    - no `setWeight` calls ever go to a non-participant.
  - **Cancel:** `cancel()` at `e = 0.3` releases to the targets over 160 ms. Every consecutive-frame step is ≤ 0.25 at 16.7 ms frames, and `advance` returns false after completion.
  - **Re-begin at `e = 0.6`:**
    - the old incoming becomes outgoing with `w₀ = 0.6`;
    - the old outgoing releases from 0.4 to 0 over 160 ms;
    - the new incoming starts at 0.
  - **Reduced motion:** targets apply on the first call.
  - **Idempotence:** a repeated identical `tick` value produces no sink writes.

- `npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts src/components/wall/__tests__/gyroTilt.test.ts` (extended) covers the `instanced-photo-renderer` MODIFIED requirement:
  - **While held:** readings produce no emits and no baseline. A focus change while held resets without announcing `{0,0}`.
  - **After release:** the first valid reading becomes the baseline, and a subsequent `+d` tilt emits relative to it, not to a reading taken during the hold.
  - **Recentre:** the still-timer recentre is cancelled by `setHold(true)`.
  - **Unchanged:** every existing scenario (Euler parity, gimbal crossing, in-plane twist, screen-orientation rebase, recentre) passes unchanged.

- `npx vitest run src/components/wall/__tests__/printSharpOverlaySync.test.ts` (extended, if the sync helper gains the weight write). Opacity follows the supplied weight once ready, is `0` before decode, and identical weights cause no write. The existing 300 ms tail cases are unchanged.

- `npx vitest run src/lib/__tests__/printHandoffAudit.test.ts` `[NEW]` is a source-text audit in the style of `touchAudit.test.ts` / `placardGlassLegibility.test.ts`:
  - **`wall.css`:**
    - every new hand-off rule is scoped to `.is-handoff`, `.is-handoff-cell`, `.photo-shadow-*`, `.photo-dim` or `var(--focus-w, 1)`;
    - the coarse block contains the `translateZ(calc(22px + 36px * var(--focus-w, 1)))` lift and `.photo-cell.is-handoff-cell` perspective;
    - `.photo-dim` is `display: none` outside `@media (pointer: coarse)`;
    - no `will-change` or `backface-visibility` is added to `.photo-frame` / `.photo-cell`;
    - no `box-shadow` value references `--focus-w` or `--print-w`.
  - **`hud.css`:** a coarse rule hides `.hud-key-hint`.
  - **`PhotoFocusBar.tsx`:** renders `hud-key-hint` containing `[ESC]`.
  - **`PlaygroundPbrWall.tsx`:** declares `uDither` and the IGN constants `52.9829189`, `0.06711056` and `0.00583715`.
  - **`GalleryCanvas.tsx`:**
    - no longer contains `flyTo(target, 720)`;
    - declares `PRINT_PADDING_TOUCH_PORTRAIT = 0.08`;
    - has no `key={focusedPhotoId ?? 'none'}` on `PrintSharpOverlay`.
  - **`FramedPrint.tsx`:** sets `data-photo-id`, and on the coarse gyro path writes `--gyro-rx` / `--gyro-ry` instead of a full transform string.

- `npx vitest run src/components/wall/__tests__/wallCanvasDpr.test.ts src/components/wall/__tests__/zoomTier.test.ts src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts src/lib/__tests__/sheenGlareAudit.test.ts src/lib/camera/__tests__/cameraMath.test.ts` is the guard group and must stay green. Any edit to an existing assertion must be justified in `verification.md`. The expected candidates are touch-audit assertions that pin the old coarse focused transform, or the gyro's inline transform string.

- **Full gates:** `npx vitest run` (serialized full suite), `npx tsc --noEmit`, `npx eslint .`, `npm run build`.

- **Desktop resting parity** (`parity/handoff-parity.mjs` `[NEW]`, adapted from `openspec/changes/alabaster-glass-legibility/parity/placard-parity.mjs`):
  - **Setup:** build `main` (`cdeda3b`) and head, then serve both locally (`STORAGE_DRIVER=local`). Run Playwright Chromium, fine pointer, 1440×900, `?demo=4&mood=<chiaroscuro|concrete|alabaster>`.
  - **States** (captured after settle plus 1 s): Overview, Album Focus, Print Focus (print 0), Print Focus after NEXT, after PREV, after RETURN, and hovering a focused print.
  - **Expect:**
    - 0 differing pixels;
    - identical computed styles for `.photo-frame`, `.photo-cell`, `.photo-frame::after`, `.print-sharp-overlay` and `.wall-world` (`transform` string included);
    - the DOM may differ only by the added `data-photo-id` attribute and the hidden spans.
  - **Coarse sanity** (`hasTouch`, `isMobile`, 393×852, alabaster):
    - record the focused frame's computed transform at rest (≡ `translateZ(58px)`), the `.photo-dim` opacity on a neighbour (`0.38`), and the world transform translation (multiples of `1/dpr`);
    - mid-NEXT, sample 5 frames via `requestAnimationFrame` and record `--focus-w`, falloff opacity and shadow-span opacities for both participants, asserting that the `box-shadow` strings are constant across the samples.

## Manual Verification

Run local dev on the LAN (`next dev -H 0.0.0.0`, local DB, `STORAGE_DRIVER=local`, `?demo=4`) or a read-only preview. Use a real iPhone (Safari, portrait) and a desktop browser. Record before/after screen recordings of 6 consecutive NEXT taps that include a row wrap. Store them outside the repo and link from `verification.md`. Mark anything not run as `PENDING MANUAL DEVICE VERIFICATION`.

- **Instrumented attribution pass (iPhone, run first):**
  - **WHEN** you load with `?debugHandoff=1`, which logs to an on-screen ring buffer:
    - flight start/end;
    - every gyro emit;
    - overlay `is-live` toggles;
    - the `will-change` drop;
    - per-frame participant weights.
  - **WHEN** you also tap NEXT 6 times, with motion permission granted and then denied.
  - **THEN** no gyro emit occurs between flight start and end. The incoming weight reaches 1 on the same frame the flight ends. Record which, if any, of the three pop candidates still lands after flight end.
  - The debug flag is dev-only. Strip it before the PR, or guard it on `process.env.NODE_ENV !== 'production'`.
- **1. End-of-transition pop / trapezoid:**
  - **WHEN** you tap NEXT repeatedly while holding the phone naturally.
  - **THEN** the incoming print rises and sharpens as it arrives, and nothing changes size, tilt or shadow after the camera stops. There's no trapezoid skew mid-flight.
- **2. Mat corner seams:**
  - **WHEN** a NEXT flight settles.
  - **THEN** no diagonal hairlines are visible at the mat corners at rest. Note any shimmer during motion, but it isn't a failure.
- **3. Shadow flicker and banding:**
  - **WHEN** you take an adjacent NEXT (a pan flight).
  - **THEN** the neighbour shadows don't thicken or flicker mid-pan, and the chiaroscuro spotlight pools show no visible bands.
- **4. Row-wrap whip:**
  - **WHEN** you tap NEXT at the end of a row.
  - **THEN** the camera arcs out and in over about 0.75–0.85 s without streaking.
- **5. Framing and label:**
  - **WHEN** you open Print Focus on a landscape print in portrait.
  - **THEN** the print fills about 84% of the width, side neighbours are off-screen, top and bottom neighbours are dimmed, and the bar reads `RETURN`.
- **Cadence (maintainer report 2):**
  - **WHEN** you tap NEXT.
  - **THEN** the outgoing print keeps its lift, shadow, sharpness and brightness at the tap and recedes progressively as the camera leaves. The neighbours stay dimmed throughout.
- **Interruption:**
  - **WHEN** you drag mid-NEXT, or double-tap NEXT.
  - **THEN** nothing snaps: the hand-off finishes within about 160 ms and re-targets smoothly.
- **Desktop:**
  - **WHEN** you step NEXT/PREV/RETURN with the mouse and the keyboard.
  - **THEN** the falloff and crisp overlay hand off with the camera, resting states look exactly as on production, hover tilt is unchanged, and the bar reads `RETURN [ESC]`.
- **Performance (iPhone, Safari Web Inspector → Timelines):**
  - **WHEN** you record 6 NEXT taps.
  - **THEN** there are no new persistent compositing layers at rest versus `main` (Layers tab), and style recalc during a hand-off is bounded to the participants (and the grid during album↔print).
