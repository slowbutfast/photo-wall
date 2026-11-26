# OpenCode Orchestration Handoff: OpenSpec Change 'mobile-print-transitions'

You are the orchestration agent for OpenSpec change 'mobile-print-transitions', running in OpenCode.
Execute this change with the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive
- **Change name:** mobile-print-transitions
- **Target skill:** `openspec-apply-sub` (or `/opsx:apply-sub mobile-print-transitions`)
- **Architecture paradigm:** Vertical Slice Architecture (VSA). Keep the flight-timing slice (`src/lib/camera/flightPlan.ts`) and the hand-off slice (`src/components/wall/focusHandoff.ts`) isolated, pure and DOM-agnostic. `GalleryCanvas` is the only integrator. Don't add horizontal "animation" abstractions.
- **Branch:** `feat/mobile-print-transitions` already exists. Its planning commit `fbfe037` sits on `main` @ `cdeda3b`. Do all work on this branch, in a git worktree: `git worktree add ../photo-wall-mpt feat/mobile-print-transitions`.
  - Another agent session shares the main checkout. Don't switch its branch, and don't kill processes you didn't start (no `pkill -f next-server`).
- **Read first, in order:**
  - `openspec/changes/mobile-print-transitions/research.md`: the glossary is binding nomenclature;
  - `proposal.md`;
  - `specs/**`;
  - `architecture.md` (decisions D1–D7);
  - `design.md`;
  - `tests.md`;
  - `tasks.md`.
- **Next.js note:** read `AGENTS.md`. This Next.js 16 differs from your training data. No routing or server code is touched by this change.

## 2. Target Context Map
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

## 3. Technical & Architectural Boundaries
- **In-scope decisions** (architecture.md):
  - **D1 flight timing:**
    - `flightDurationMs = clamp(round(300 + 380·S), 450, 1100)` from the van Wijk path length `S`. That's 455 / 746 / 849 ms for adjacent / 4-col / 5-col wraps.
    - **Pan flight** (constant zoom) when `|ln(z1/z0)| ≤ 0.05` and the screen distance is ≤ 1.5 viewport widths; otherwise **arc flight** via `interpolateZoom`.
    - Shared `flightEase` = smoothstep.
    - Entry framing stays 620 ms.
    - `interpolateZoom` output must stay bit-identical after extracting `zoomPathParams`.
  - **D2 focus hand-off:**
    - `focusedPhotoId` and the `.focused` classes still flip at the tap (**semantic focus**). The visual look follows `--focus-w`, written on at most two **participants**: incoming `w = e`, outgoing `w = w₀·(1 − e)`.
    - `--print-w` goes on the focused `.album-grid`.
    - A cancelled flight releases over 160 ms. Re-begin continues from the current weights.
    - Under reduced motion, weights jump to their targets.
    - The rAF loop stays alive while the hand-off is active.
  - **D3 CSS:** new rules apply only under `.is-handoff` / `.is-handoff-cell`, or via `var(--focus-w, 1)` fallbacks, so resting desktop CSS is byte-for-byte unchanged in effect.
    - On touch, lift is `translateZ(calc(22px + 36px * w))`, so 58 px at rest.
    - Shadow crossfade uses two static `box-shadow` spans with `opacity` only.
    - The `.photo-dim` veil is `display: none` on fine pointers.
  - **D4 crisp overlay:**
    - `PrintSharpOverlay` finds frames by `[data-photo-id]`.
    - One overlay per participant, keyed by photo id. The participant list is React state, updated on `begin` / `onEnd` only, never per frame.
    - Opacity is `w` once decoded.
    - The 300 ms tail is unchanged.
  - **D5 gyro hold:**
    - `setHold(true)` in `flyTo`; `setHold(false)` on flight end, on cancel, and idempotently on every settled frame.
    - No baseline and no emits while held. Resets while held don't announce.
    - On touch the gyro writes `--gyro-rx` / `--gyro-ry` instead of a transform string.
    - The outgoing print's gyro vars are cleared in the hand-off's `onEnd`, not at unsubscribe.
  - **D6 settle snap (touch only):** `translate3d(tx, ty, 0) scale(s)`, snapped to `1/dpr` on the settled frame. Fine pointers keep today's exact transform string.
  - **D7 touch only:** portrait (`aspect < 0.9`) Print padding `0.08`; `uDither` IGN dither (±0.5/255); `RETURN<span class="hud-key-hint"> [ESC]</span>`, hidden by CSS on coarse.
- **Hard exclusions / no-go:**
  - **Environment:** don't modify `.env`, `.env.*` or credential files, and never print or commit them.
  - **Dependencies:** don't introduce any external dependencies.
  - **Scope:** don't make code changes outside the Target Context Map without prior task coverage. In particular, never touch `playgrounds/`, `src/lib/lighting/**`, `islandLayout.ts`, placard or soundtrack code, the desktop mouse hover handlers, the pinch and wheel maths, or the damped-pan easing.
  - **No `will-change` / `backface-visibility`** on `.photo-frame` or `.photo-cell`. Don't animate `box-shadow`, `filter` or `background` per frame. Don't write per-frame styles to non-participant prints (`--print-w` on the grid is the only exception).
  - **No moving spotlight**, and no changes to `computePlaygroundLighting` or the spot texture.
  - **Data safety:** preview and production share the production Turso DB and Bunny storage. Never write against them. Verify only on local dev (`STORAGE_DRIVER=local`, `?demo=4&mood=<m>`).
  - **Git hygiene:**
    - Stage explicit paths only; never `git add -A`.
    - Never use a bare `git stash` / `git stash pop`, because the stash is shared.
    - Keep any browser profile or performance JSON exports out of the repo; they contain auth cookies.

## 4. Visual & UI Design Specifications & Vision Verification
- **Theme:** Continuous Print Focus Hand-off. There are no new colours; every quantity interpolates between two existing resting values.
- **Key tokens:**
  - Mat / surface `#F6F4EF` | overlay backing `#141412` | Photo Focus bar ink `#111111`, muted `rgba(17,17,17,0.62)`;
  - veil `rgba(8, 7, 5, 0.38 · p · (1 − w))`;
  - motion:
    - `flightEase` ≡ `cubic-bezier(0.3333, 0, 0.6667, 1)`;
    - `handoffReleaseMs` 160;
    - touch lift 22 → 58 px;
    - touch-portrait padding 0.08.
- **Component anatomy and states** (design.md §4):
  - **Resting `w = 0` / `w = 1`:** identical to today on desktop. On touch, the only resting difference is the 58 px lift.
  - **Hand-off (`.is-handoff`):** falloff `::after` opacity `1 − w`; overlay opacity `w`; z-index 40 (incoming 41).
  - **Touch extras during the hand-off:**
    - lift `22 + 36·w px`;
    - rotation `--gyro-r* · w`;
    - `.photo-shadow-rest` opacity `1 − w` and `.photo-shadow-focus` opacity `w`;
    - the frame keeps only its inset highlight `rgba(255,252,242, calc(0.2 + 0.78*var(--lit-top,1)))`;
    - sheen `0.92 · w`;
    - veil `0.38 · p · (1 − w)`.
  - **Shadow span values:** copy them verbatim from design.md §4.
  - **Hover and focus-visible:** unchanged.
- **Responsive layout:**
  - **Phone portrait** (coarse, aspect `< 0.9`): padding 0.08, `RETURN` label.
  - **Coarse landscape:** padding 0.14, with the veil, dither, snap and gyro hold all active.
  - **Desktop:** everything unchanged at rest; `RETURN [ESC]`.
  - **Touch targets:** unchanged, at least 44 px.
- **Multi-modal vision verification:**
  - `deepseek-flash` natively supports vision inputs. For visual tasks, capture UI state screenshots with Playwright (Chromium only; WebKit isn't installed) and inspect the image files directly. Examples: the desktop parity crops; a coarse-emulation 393×852 Print Focus fill check.
  - iOS-specific checks (the end-of-flight pop, seams, banding, gyro, Safari Timelines/Layers) need the maintainer's iPhone. Leave them marked `PENDING MANUAL DEVICE VERIFICATION`, and complete every automated code, test and layout task.

## 5. Test Scaffolding & Verification Commands
- **Primary test runner:** `npx vitest run <file>` (Vitest, Node environment).
- **Full gates:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- **TDD requirement:** task group 1 must scaffold failing tests before any implementation code is touched. Verify they fail for the expected reasons, and save the output to `openspec/changes/mobile-print-transitions/logs/1.5-tdd-red.log`.
- **Narrow loop files:**
  - `src/lib/camera/__tests__/flightPlan.test.ts`
  - `src/components/wall/__tests__/focusHandoff.test.ts`
  - `src/components/wall/__tests__/useGyroTilt.test.ts`
  - `src/components/wall/__tests__/gyroTilt.test.ts`
  - `src/components/wall/__tests__/printSharpOverlaySync.test.ts`
  - `src/lib/__tests__/printHandoffAudit.test.ts`
- **Guard group** (must stay green):
  - `src/components/wall/__tests__/wallCanvasDpr.test.ts`
  - `src/components/wall/__tests__/zoomTier.test.ts`
  - `src/lib/__tests__/touchAudit.test.ts`
  - `src/lib/__tests__/cssBoundaryAudit.test.ts`
  - `src/lib/__tests__/sheenGlareAudit.test.ts`
  - `src/lib/camera/__tests__/cameraMath.test.ts`

  Any edited existing assertion must be justified in `verification.md`. The expected candidates are `touchAudit` assertions that pin the old coarse focused transform, or the gyro's inline transform string.
- **Desktop resting parity:** write `openspec/changes/mobile-print-transitions/parity/handoff-parity.mjs`, adapted from `openspec/changes/alabaster-glass-legibility/parity/placard-parity.mjs`.
  - **Setup:** build `cdeda3b` and head and serve both locally. Playwright Chromium, fine pointer, 1440×900, 3 moods.
  - **States:** Overview, Album, Print, after NEXT / PREV / RETURN, and hover.
  - **Expect:** 0 px and 0 computed-style diffs, including the `.wall-world` transform string.
  - **Coarse sanity sampling:** follow tests.md.
- **Resource and concurrency rules:**
  - During task implementation, run only the narrowest test file for the code you changed. Don't run full test discovery or headless browser suites on every checkbox.
  - Wrap heavy runs with `safe-test` (e.g. `safe-test npx vitest run`), or run single-worker (`--workers=1`).
  - Known issue: `safe-test`'s `ulimit -v` cap can't instantiate this suite's WebAssembly. If it aborts for that reason, record the failure log and run the serialized direct command.

## 6. Implementation Task Checklist
## 1. Test Scaffolding (TDD)

- [ ] 1.1 Create `src/lib/camera/__tests__/flightPlan.test.ts` covering easing, `S` equivalence with `interpolateZoom`, the duration fixtures (455 / 746 / 849, clamps), pan versus arc classification, sampling endpoints, and the peak-speed can-fail guard (tests.md).
- [ ] 1.2 Create `src/components/wall/__tests__/focusHandoff.test.ts` with a fake sink and clock: the three flight shapes, `tick` weights, end/`onEnd`, the no-non-participant-writes guard, cancel release ≤ 0.25 per frame, re-begin from current weights, reduced motion, and the identical-tick no-write case.
- [ ] 1.3 Extend `useGyroTilt.test.ts` / `gyroTilt.test.ts` with the hold cases: no emit or baseline while held, a silent reset on a focus change while held, the post-release baseline, and the recentre cancelled by hold.
- [ ] 1.4 Create `src/lib/__tests__/printHandoffAudit.test.ts` (tests.md). Reuse the CSS-rule extractor approach from `placardGlassLegibility.test.ts`.
- [ ] 1.5 Run `npx vitest run src/lib/camera/__tests__/flightPlan.test.ts src/components/wall/__tests__/focusHandoff.test.ts src/components/wall/__tests__/useGyroTilt.test.ts src/components/wall/__tests__/gyroTilt.test.ts src/lib/__tests__/printHandoffAudit.test.ts`. Confirm:
  - the new cases fail for the expected reasons (missing module or export, missing CSS or source text);
  - the can-fail guard's "old" half passes;
  - every pre-existing gyro case passes.

  Save the output to `logs/1.5-tdd-red.log`.

## 2. Camera Flight Timing (`cameraMath.ts`, `flightPlan.ts`, `GalleryCanvas.tsx`)

- [ ] 2.1 Extract `zoomPathParams` in `cameraMath.ts` and refactor `interpolateZoom` onto it. `cameraMath.test.ts` must stay green unchanged.
- [ ] 2.2 Implement `flightPlan.ts` (D1) and make 1.1 pass.
- [ ] 2.3 In `GalleryCanvas`:
  - store `kind` on the flight;
  - sample with `sampleFlight`;
  - replace `flyTo(target, 720)` with `planFlight(...).durationMs`;
  - add `PRINT_PADDING_TOUCH_PORTRAIT` for coarse pointers with aspect `< 0.9`.

  Keep the entry framing at 620 ms.
- [ ] 2.4 Implement the coarse device-pixel settle snap in `applyCamera` (D6). Fine pointers keep the exact existing string.

## 3. Focus Hand-off (`focusHandoff.ts`, `GalleryCanvas.tsx`, `FramedPrint.tsx`, `PrintSharpOverlay.tsx`, `wall.css`)

- [ ] 3.1 Implement `focusHandoff.ts` (D2) and make 1.2 pass.
- [ ] 3.2 In `FramedPrint`:
  - add `data-photo-id`;
  - add the `.photo-shadow-rest`, `.photo-shadow-focus` and `.photo-dim` spans;
  - on `.album-grid`, add `data-album-id`.
- [ ] 3.3 In `GalleryCanvas`, wire the hand-off:
  - the DOM sink (cached lookups, identical-value skip, `.is-handoff`, `.is-handoff-cell`, `.is-handoff-in`);
  - `prevFocusRef`;
  - `begin` before `flyTo`;
  - `tick` / `advance` in the loop;
  - `cancel` on gesture cancels;
  - not settled while active;
  - honour `prefers-reduced-motion`.
- [ ] 3.4 `PrintSharpOverlay` (D4):
  - look up the frame by id;
  - weight-driven opacity;
  - `.is-handoff` mirroring;
  - keep the 300 ms tail.

  In `GalleryCanvas`, render the overlays per participant, plus the resting focused print, keyed by photo id. The participant list is React state, updated on `begin` / `onEnd` only.
- [ ] 3.5 `wall.css` hand-off rules (D3, design.md §4):
  - fine and coarse z-index;
  - falloff `::after`;
  - overlay transition off;
  - in the coarse block: lift and rotation via `--focus-w` / `--gyro-r*`, `.is-handoff-cell` perspective, shadow spans and the inset-only frame shadow, sheen `0.92 · w`, and the `.photo-dim` veil (`0.38 · p · (1 − w)`).
- [ ] 3.6 Make the hand-off portion of 1.4 pass. Run the guard group (tests.md). Justify any edited existing assertion in `verification.md`.

## 4. Touch-only Fixes (`useGyroTilt.ts`, `FramedPrint.tsx`, `PlaygroundPbrWall.tsx`, `PhotoFocusBar.tsx`, `hud.css`)

- [ ] 4.1 Add `setHold` to `useGyroTilt` (D5) and make 1.3 pass. Call `setHold(true)` in `flyTo`, and `setHold(false)` at flight end, on gesture cancel, and idempotently on every settled frame.
- [ ] 4.2 Coarse gyro writes in `FramedPrint`: `--gyro-rx` / `--gyro-ry` replace the transform string, and the inline sheen opacity is dropped. Defer `resetGyroStyles` while the frame is `.is-handoff`; the hand-off's `onEnd` calls it.
- [ ] 4.3 Add `uDither` and the IGN dither in `PlaygroundPbrWall` (D7).
- [ ] 4.4 Add the `PhotoFocusBar` `hud-key-hint` span and the `hud.css` coarse rule.
- [ ] 4.5 Add a dev-only `?debugHandoff=1` ring-buffer logger (guarded on `process.env.NODE_ENV !== 'production'`) for the tests.md attribution pass. It logs flight start/end, gyro emits, overlay `is-live`, the `will-change` drop, and participant weights. Keep it in `src/components/wall/handoffDebug.ts` `[NEW]`; it must compile out of production builds.
- [ ] 4.6 Make all of 1.4 pass.

## 5. Verification & Empirical Audit

- [ ] 5.1 Run the full gates (`npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`) and record pass counts against the baseline in `logs/5.1-*`. Try `safe-test` first and record it if it aborts.
- [ ] 5.2 Write and run `parity/handoff-parity.mjs` against `cdeda3b` and head (tests.md):
  - desktop resting states × 3 moods: 0 px and 0 computed-style diffs;
  - coarse sanity sampling: the rest transform ≡ `translateZ(58px)`, veil `0.38`, snapped translation, and `box-shadow` strings constant across the mid-NEXT samples.

  Save `parity/report.json` and the logs.
- [ ] 5.3 Measure in a coarse-emulation Playwright run at 393×852: the focused landscape print's on-screen width ÷ viewport width (expect ≈ 0.84), and whether any neighbour pixels appear in the side margins.
- [ ] 5.4 Run the tests.md manual checks on a real iPhone (Safari) and desktop, starting with the instrumented attribution pass. Mark anything that couldn't run as `PENDING MANUAL DEVICE VERIFICATION`, and don't claim it passed.
- [ ] 5.5 Populate `verification.md`:
  - a Requirement Adherence Matrix covering every scenario in all five delta specs;
  - the parity result;
  - the measured duration, peak-speed and fill numbers;
  - resolved and remaining research.md assumptions (especially the end-of-flight pop attribution);
  - a nomenclature audit (flight, pan flight, arc flight, path length `S`, focus hand-off, focus weight `w`, Print Focus weight `p`, participants, semantic focus, gyro hold, device-pixel settle snap, neighbour dimming);
  - verbatim logs.

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify every checkbox in `tasks.md` is marked `- [x]`. Only tick boxes that genuinely ran and passed. Device-only checks stay unticked, or are ticked with an explicit `PENDING MANUAL DEVICE VERIFICATION` note, exactly as `alabaster-glass-legibility` task 3.4 did.
2. Data preservation: no data model is touched. Confirm that no DB, storage or manifest code changed (`git diff --stat cdeda3b -- src/lib/db src/app/api` must be empty).
3. Make sure `openspec/changes/mobile-print-transitions/verification.md` contains:
   - an executive summary and the environment;
   - a Requirement Adherence Audit Matrix mapping every scenario in all five delta specs to its verifying test or check;
   - resolved assumptions and empirical proof: measured durations, peak speeds, the portrait fill ratio, parity results, and the end-of-flight pop attribution status;
   - a nomenclature and code-symbol audit against the research.md glossary;
   - verbatim execution logs.
4. Run verification automatically with `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues:**
  1. Sync the delta specs with the `openspec-sync-specs` skill for `mobile-print-transitions`. This covers four MODIFIED/ADDED deltas plus the new `print-focus-handoff` spec.
  2. Open a pull request:
     - Work on `feat/mobile-print-transitions`.
     - Stage explicit paths: `git add openspec/changes/mobile-print-transitions openspec/specs <implementation-files>`. Never `git add -A`.
     - Commit, then push with `git push -u origin HEAD`.
     - Open the PR with `gh pr create` and a concise title, for example `feat(print-focus): continuous hand-off and path-scaled flights`. Summarise `proposal.md` and `verification.md` in the body, and list the pending iPhone checks explicitly. Report the PR URL.
     - Don't merge the PR.
- **If critical issues or failed test verification appear on the initial pass:**
  1. Announce: "Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."
  2. Delegate a single-pass repair task to `spec-coder-sub` with the verification failure context:
     > "Fix the specific verification failures and test errors reported for change 'mobile-print-transitions'. Refer to the error log, make minimal targeted patches to resolve the failures, run verification commands, and update tasks.md."
  3. Re-run verification with `openspec-verify-change`.
  4. **If verification passes after the repair:** sync the delta specs with `openspec-sync-specs`, then stage explicit paths, commit, push the branch and open the PR with `gh pr create`.
  5. **If verification still fails after the single repair pass:** halt. Don't loop or re-run again. Present the Verification Report and the remaining blockers to the user for manual guidance.
