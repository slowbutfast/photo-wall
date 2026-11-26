## Target Context Map

Line numbers are on `main` @ `cdeda3b`. Re-locate by symbol after earlier edits shift them.

| File | Lines | Change |
| :--- | :--- | :--- |
| `src/lib/camera/cameraMath.ts` | `L326-L391` (`RHO` … `interpolateZoom`) | Extract the `r0`/`r1`/`S` computation into an exported `zoomPathParams(a, b)` helper used by both `interpolateZoom` and `zoomPathLength`. `interpolateZoom` output must stay bit-identical (D1). |
| `src/lib/camera/flightPlan.ts` | `[NEW]` | `flightEase`, `zoomPathLength`, `flightDurationMs`, `planFlight`, `sampleFlight` (D1) |
| `src/components/wall/focusHandoff.ts` | `[NEW]` | `createFocusHandoff(sink, { now, reducedMotion })`: `begin`, `tick`, `cancel`, `advance`, `participants` (D2) |
| `src/components/wall/GalleryCanvas.tsx` | `L81-L85` | Add `PRINT_PADDING_TOUCH_PORTRAIT = 0.08` and `HANDOFF_RELEASE_MS = 160` (D7, D2) |
| `src/components/wall/GalleryCanvas.tsx` | `L292-L303` (`applyCamera`) | Accept `settled`. On coarse pointers write `translate3d(tx, ty, 0) scale(s)`, snapped to `1/dpr` when settled. Keep the fine-pointer string byte-identical (D6). |
| `src/components/wall/GalleryCanvas.tsx` | `L306-L405` (`requestFrame` loop) | Use `sampleFlight` (replacing `L318-L320`). Call `handoff.tick(eased)` / `handoff.advance(now)`. Treat an active hand-off as not settled. Call `gyro.setHold(false)` at flight end. Pass `settled` to `applyCamera` (D1, D2, D5, D6). |
| `src/components/wall/GalleryCanvas.tsx` | `L620`, `L643` (`flightRef.current = null` in zoom/pan) | Also call `handoff.cancel()` and `gyro.setHold(false)` (D2, D5) |
| `src/components/wall/GalleryCanvas.tsx` | `L522-L535` (`flyTo`) | Store `kind` on `flightRef`. Call `gyro.setHold(true)` (D1, D5). |
| `src/components/wall/GalleryCanvas.tsx` | `L551-L590` (focus effect) | Touch-portrait padding. `planFlight(...).durationMs` replaces `720`. `handoff.begin(...)` from `prevFocusRef` before `flyTo` (D1, D2, D7). |
| `src/components/wall/GalleryCanvas.tsx` | `L940-L948` (`<PrintSharpOverlay key=…>`) | Render one overlay per participant (plus the resting focused print), keyed by photo id, with a weight getter (D4) |
| `src/components/wall/GalleryCanvas.tsx` | `L973-L1060` (`AlbumTier`, `.album-grid` at `L1021-L1027`) | `.album-grid` gets `data-album-id` for the `--print-w` sink (D2) |
| `src/components/wall/FramedPrint.tsx` | `L78-L158` (gyro reset + subscription) | On coarse pointers write `--gyro-rx` / `--gyro-ry` instead of the `transform` string. Drop the inline sheen opacity (CSS multiplies it by `w`). Skip `resetGyroStyles` while the frame has `.is-handoff`, and export the reset for `onEnd` (D5). |
| `src/components/wall/FramedPrint.tsx` | `L161-L244` (markup) | Add `data-photo-id` on `.photo-frame`. Add `.photo-shadow-rest`, `.photo-shadow-focus` and `.photo-dim` spans (`aria-hidden`) (D3, D4) |
| `src/components/wall/PrintSharpOverlay.tsx` | `L33-L56` props, `L100-L106` frame lookup, `L183-L186` live toggle, `L236-L240` cleanup | `getWeight(photoId)` prop. Look the frame up by `[data-photo-id]`. `opacity = ready ? w : 0` with identical-value skip. Mirror `.is-handoff`. Mirror the sheen via computed style on coarse (D4). |
| `src/components/wall/useGyroTilt.ts` | `L98-L102` interface, `L205-L221` `reset`, `L338-L368` `setContext`/return, `L464-L507` hook | `setHold(held)` on the controller and the handle. Readings are ignored while held. Resets while held don't announce (D5). |
| `src/components/wall/PlaygroundPbrWall.tsx` | `L93-L167` (fragment shader), `L178-L200` (`UNIFORM_NAMES`), `L385-L410` (uniform upload) | `uniform float uDither`, the IGN term after the filmic curve, `set1f('uDither', coarsePointer ? 1 : 0)` (D7) |
| `src/components/hud/PhotoFocusBar.tsx` | `L67-L70` | `RETURN<span className="hud-key-hint"> [ESC]</span>`. Update the doc comment (D7). |
| `src/styles/hud.css` | `[NEW]` rule (append near the other `@media (pointer: coarse)` rules) | `.hud-key-hint { display: none }` under coarse |
| `src/styles/wall.css` | after `L937` (end of `.photo-frame.focused` rule) | Fine-and-coarse hand-off rules: `.is-handoff` z-index (40, `.is-handoff-in` 41), `.photo-shadow-*` and `.photo-dim` base (`display: none`, absolute, `pointer-events: none`) (D3) |
| `src/styles/wall.css` | after `L968` (`.is-lit.focused::after`) | `.photo-frame.is-lit.is-handoff::after { opacity: calc(1 - var(--focus-w)); transition: none }` |
| `src/styles/wall.css` | `L1097-L1160` (coarse block) | Focused/hand-off lift and rotation via `--focus-w` and `--gyro-r*`. `.photo-cell.is-handoff-cell` perspective. Shadow spans visible under `.is-handoff` with opacity `1 − w` / `w`. Frame inset-only shadow under `.is-handoff`. Sheen opacity `0.92 · w`. `.photo-dim` visible, opacity `0.38 · p · (1 − w)`, `0` on a resting `.focused` (D3, design.md §4). |
| `src/styles/wall.css` | `L1225-L1238` (`.print-sharp-overlay`) | `.print-sharp-overlay.is-handoff { transition: none }` (D4) |
| `src/components/wall/handoffDebug.ts` | `[NEW]` | Dev-only `?debugHandoff=1` ring-buffer logger for the device attribution pass (task 4.5). It's a no-op in production builds. |
| `src/lib/camera/__tests__/flightPlan.test.ts` | `[NEW]` | tests.md |
| `src/components/wall/__tests__/focusHandoff.test.ts` | `[NEW]` | tests.md |
| `src/components/wall/__tests__/useGyroTilt.test.ts`, `gyroTilt.test.ts` | append | Hold cases (tests.md) |
| `src/components/wall/__tests__/printSharpOverlaySync.test.ts` | append (only if the sync helper changes) | Weight opacity cases |
| `src/lib/__tests__/printHandoffAudit.test.ts` | `[NEW]` | Source-text audit (tests.md) |
| `openspec/changes/mobile-print-transitions/parity/handoff-parity.mjs` | `[NEW]` | Desktop resting parity plus coarse sanity sampling |
| `openspec/specs/{spatial-camera-navigation,instanced-photo-renderer,gallery-hud-and-curator-ui,3d-pbr-wall-and-lighting}/spec.md`, `openspec/specs/print-focus-handoff/spec.md` | sync at PR time | Apply the deltas (the MODIFIED blocks replace their originals; ADDED blocks are appended, or create the new spec) |

**Out of bounds:**
- `computePlaygroundLighting` / `src/lib/lighting/**`;
- the spot texture;
- `islandLayout.ts` constants;
- the entry framing duration (`620`);
- damped-pan easing;
- pinch and wheel maths;
- the desktop mouse hover tilt handlers (`FramedPrint.tsx` `onPointerMove` / `onPointerLeave`);
- placard and soundtrack code;
- `tokens.css`;
- `playgrounds/`;
- new dependencies.

No `will-change` / `backface-visibility` on frames or cells.

## 1. Test Scaffolding (TDD)

- [x] 1.1 Create `src/lib/camera/__tests__/flightPlan.test.ts` covering easing, `S` equivalence with `interpolateZoom`, the duration fixtures (455 / 746 / 849, clamps), pan versus arc classification, sampling endpoints, and the peak-speed can-fail guard (tests.md).
- [x] 1.2 Create `src/components/wall/__tests__/focusHandoff.test.ts` with a fake sink and clock: the three flight shapes, `tick` weights, end/`onEnd`, the no-non-participant-writes guard, cancel release ≤ 0.25 per frame, re-begin from current weights, reduced motion, and the identical-tick no-write case.
- [x] 1.3 Extend `useGyroTilt.test.ts` / `gyroTilt.test.ts` with the hold cases: no emit or baseline while held, a silent reset on a focus change while held, the post-release baseline, and the recentre cancelled by hold.
- [x] 1.4 Create `src/lib/__tests__/printHandoffAudit.test.ts` (tests.md). Reuse the CSS-rule extractor approach from `placardGlassLegibility.test.ts`.
- [x] 1.5 Run `npx vitest run src/lib/camera/__tests__/flightPlan.test.ts src/components/wall/__tests__/focusHandoff.test.ts src/components/wall/__tests__/useGyroTilt.test.ts src/components/wall/__tests__/gyroTilt.test.ts src/lib/__tests__/printHandoffAudit.test.ts`. Confirm:
  - the new cases fail for the expected reasons (missing module or export, missing CSS or source text);
  - the can-fail guard's "old" half passes;
  - every pre-existing gyro case passes.

  Save the output to `logs/1.5-tdd-red.log`.

## 2. Camera Flight Timing (`cameraMath.ts`, `flightPlan.ts`, `GalleryCanvas.tsx`)

- [x] 2.1 Extract `zoomPathParams` in `cameraMath.ts` and refactor `interpolateZoom` onto it. `cameraMath.test.ts` must stay green unchanged.
- [x] 2.2 Implement `flightPlan.ts` (D1) and make 1.1 pass.
- [x] 2.3 In `GalleryCanvas`:
  - store `kind` on the flight;
  - sample with `sampleFlight`;
  - replace `flyTo(target, 720)` with `planFlight(...).durationMs`;
  - add `PRINT_PADDING_TOUCH_PORTRAIT` for coarse pointers with aspect `< 0.9`.

  Keep the entry framing at 620 ms.
- [x] 2.4 Implement the coarse device-pixel settle snap in `applyCamera` (D6). Fine pointers keep the exact existing string.

## 3. Focus Hand-off (`focusHandoff.ts`, `GalleryCanvas.tsx`, `FramedPrint.tsx`, `PrintSharpOverlay.tsx`, `wall.css`)

- [x] 3.1 Implement `focusHandoff.ts` (D2) and make 1.2 pass.
- [x] 3.2 In `FramedPrint`:
  - add `data-photo-id`;
  - add the `.photo-shadow-rest`, `.photo-shadow-focus` and `.photo-dim` spans;
  - on `.album-grid`, add `data-album-id`.
- [x] 3.3 In `GalleryCanvas`, wire the hand-off:
  - the DOM sink (cached lookups, identical-value skip, `.is-handoff`, `.is-handoff-cell`, `.is-handoff-in`);
  - `prevFocusRef`;
  - `begin` before `flyTo`;
  - `tick` / `advance` in the loop;
  - `cancel` on gesture cancels;
  - not settled while active;
  - honour `prefers-reduced-motion`.
- [x] 3.4 `PrintSharpOverlay` (D4):
  - look up the frame by id;
  - weight-driven opacity;
  - `.is-handoff` mirroring;
  - keep the 300 ms tail.

  In `GalleryCanvas`, render the overlays per participant, plus the resting focused print, keyed by photo id. The participant list is React state, updated on `begin` / `onEnd` only.
- [x] 3.5 `wall.css` hand-off rules (D3, design.md §4):
  - fine and coarse z-index;
  - falloff `::after`;
  - overlay transition off;
  - in the coarse block: lift and rotation via `--focus-w` / `--gyro-r*`, `.is-handoff-cell` perspective, shadow spans and the inset-only frame shadow, sheen `0.92 · w`, and the `.photo-dim` veil (`0.38 · p · (1 − w)`).
- [x] 3.6 Make the hand-off portion of 1.4 pass. Run the guard group (tests.md). Justify any edited existing assertion in `verification.md`.

## 4. Touch-only Fixes (`useGyroTilt.ts`, `FramedPrint.tsx`, `PlaygroundPbrWall.tsx`, `PhotoFocusBar.tsx`, `hud.css`)

- [x] 4.1 Add `setHold` to `useGyroTilt` (D5) and make 1.3 pass. Call `setHold(true)` in `flyTo`, and `setHold(false)` at flight end, on gesture cancel, and idempotently on every settled frame.
- [x] 4.2 Coarse gyro writes in `FramedPrint`: `--gyro-rx` / `--gyro-ry` replace the transform string, and the inline sheen opacity is dropped. Defer `resetGyroStyles` while the frame is `.is-handoff`; the hand-off's `onEnd` calls it.
- [x] 4.3 Add `uDither` and the IGN dither in `PlaygroundPbrWall` (D7).
- [x] 4.4 Add the `PhotoFocusBar` `hud-key-hint` span and the `hud.css` coarse rule.
- [x] 4.5 Add a dev-only `?debugHandoff=1` ring-buffer logger (guarded on `process.env.NODE_ENV !== 'production'`) for the tests.md attribution pass. It logs flight start/end, gyro emits, overlay `is-live`, the `will-change` drop, and participant weights. Keep it in `src/components/wall/handoffDebug.ts` `[NEW]`; it must compile out of production builds.
- [x] 4.6 Make all of 1.4 pass.

## 5. Verification & Empirical Audit

- [x] 5.1 Run the full gates (`npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`) and record pass counts against the baseline in `logs/5.1-*`. Try `safe-test` first and record it if it aborts.
- [x] 5.2 Write and run `parity/handoff-parity.mjs` against `cdeda3b` and head (tests.md):
  - desktop resting states × 3 moods: 0 px and 0 computed-style diffs;
  - coarse sanity sampling: the rest transform ≡ `translateZ(58px)`, veil `0.38`, snapped translation, and `box-shadow` strings constant across the mid-NEXT samples.

  Save `parity/report.json` and the logs.
- [x] 5.3 Measure in a coarse-emulation Playwright run at 393×852: the focused landscape print's on-screen width ÷ viewport width (expect ≈ 0.84), and whether any neighbour pixels appear in the side margins.
- [ ] 5.4 Run the tests.md manual checks on a real iPhone (Safari) and desktop, starting with the instrumented attribution pass. Mark anything that couldn't run as `PENDING MANUAL DEVICE VERIFICATION`, and don't claim it passed.
  - **PENDING MANUAL DEVICE VERIFICATION.** No iPhone/Safari and no WebKit in this environment. Every device-only check in `tests.md` (end-of-flight pop attribution, mat seams, shadow flicker/banding, row-wrap whip, framing/label, cadence, interruption, desktop hover feel, Safari Timelines/Layers) is unrun and not claimed. The automated equivalents that could run are mapped in `verification.md`.
- [x] 5.5 Populate `verification.md`:
  - a Requirement Adherence Matrix covering every scenario in all five delta specs;
  - the parity result;
  - the measured duration, peak-speed and fill numbers;
  - resolved and remaining research.md assumptions (especially the end-of-flight pop attribution);
  - a nomenclature audit (flight, pan flight, arc flight, path length `S`, focus hand-off, focus weight `w`, Print Focus weight `p`, participants, semantic focus, gyro hold, device-pixel settle snap, neighbour dimming);
  - verbatim logs.
