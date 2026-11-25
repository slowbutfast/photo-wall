# Surgical Patch Handoff: OpenSpec Change 'mobile-gyroscope-glare' [PATCH-02]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: `mobile-gyroscope-glare` (cross-referenced to `mobile-touch-compatibility` for the `GalleryCanvas.tsx` pointer path; PR #13 batch branch `feat/multi-20261125-0558`, worktree `/home/node/.local/share/opencode/worktree/c63da2794a700730e3a2cbe71e9e957277cb59ba/happy-condor`, HEAD `133dd21`)
- **Patch ID**: `PATCH-02`
- **Objective**: Raise the gyroscope emit dead-band to `0.004`, skip identical inline DOM style writes in `FramedPrint.tsx`, and ship the gesture-scoped pan/pinch rAF loop + `will-change` pointer guard in `GalleryCanvas.tsx` together so removing the accidental gyro heartbeat never regresses panning to 36–39 fps.
- **Feedback & Diagnostic Trace**:
  ```
  Real-Device iPhone 16 Pro Safari Web Inspector A/B (PR #13 preview @ 133dd21):

  1. Gyro noise wakeups (S4 & S2):
     - S4 (Print Focus Idle) baseline: 2 rAF loops (M:26051 + i:19074), 60 orientation events/s, 60 commits/s.
     - Reduce Motion ON removes M:26051 (confirming createGyroController is the second loop, NOT PlaygroundPbrWall).
     - Resting phone sensor noise exceeds MIN_EMIT_DELTA = 1e-3 (~0.04°), causing 60 Hz emissions and inline
       transform/sheen writes on FramedPrint (also contributing to S2's 459–513 style recalcs).
     - Fix: raise MIN_EMIT_DELTA to 0.004 (~0.2°) and skip identical formatted style writes in FramedPrint.

  2. Event-driven pan regression without gyro heartbeat (S2 Reduce Motion A/B):
     - With Reduce Motion ON, S2 panning drops to 36–39 fps (36–43% missed vsyncs) with ~110 ms holes after
       frames where no rAF was queued.
     - Root cause in GalleryCanvas.tsx: onPointerMove -> panByPixels() sets cameraRef and targetRef equal and calls
       requestFrame(), which runs once and stops. Without an active rAF while pointers are down:
       (a) WebKit can stall pointermove delivery when no rendering update is pending; and/or
       (b) markGesture's 156 ms settle timer flips will-change: transform -> auto during a brief finger pause
           while a pointer is still down, triggering full-world re-rasterization.
     - This affects production today (no gyro), denied-permission iPhones, Reduce Motion users, AND every user
       once the 0.004 gyro dead-band removes the resting heartbeat — so dead-band + pan loop MUST ship together.
  ```
- **Root Cause Analysis**:
  1. `useGyroTilt.ts` (`L34`) uses `MIN_EMIT_DELTA = 1e-3`, which is below resting MEMS noise; `FramedPrint.tsx` (`L106-L129`) writes inline styles on every callback without checking if the formatted string changed.
  2. `GalleryCanvas.tsx` (`L224-L319`, `L539-L593`) stops its rAF loop immediately after a 1-frame pan (`settled === true`) and drops `will-change: transform` on a 156 ms timeout without checking `gestureRef.current.pointers.length === 0`.

## 2. Strict Target Context Map

| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/components/wall/__tests__/useGyroTilt.test.ts` | `L223-L270` | Add a unit test in `describe('tilt pipeline', ...)` verifying that micro-jitter below `0.004` summed normalized delta (`< ~0.2°`, e.g. `beta0 + 0.1°`) emits zero `onTilt` calls, while intentional tilt (`>= 0.004`) emits normally. |
| `src/components/wall/useGyroTilt.ts` | `L32-L36` | Raise `MIN_EMIT_DELTA` from `1e-3` to `0.004` (≈0.2° combined movement). |
| `src/components/wall/FramedPrint.tsx` | `L94-L135` | Inside the gyro `useEffect`, track the last written strings (`lastFrameTransform`, `lastTiltSx`, `lastTiltSy`, `lastSheenTransform`, `lastSheenOpacity`) and skip DOM style writes when the newly formatted value equals the last written value. |
| `src/components/wall/GalleryCanvas.tsx` | `L224-L319`, `L539-L594` | 1. **Gesture-scoped rAF loop:** Start `requestFrame()` in `onPointerDown` (when `pointers.length > 0`). Keep `settled` `false` while `gestureRef.current.pointers.length > 0` so the loop ticks every vsync for the full duration of a touch/mouse drag or pinch, stopping only after the last `pointerup`/`pointercancel` once the camera settles.<br>2. **Coalesced per-frame input application:** In `onPointerMove`, record/accumulate the pending pan delta (`pendingPanRef`) and latest pinch step (`pendingPinchRef`) instead of mutating camera directly on every raw event, then flush pending pan/pinch once per frame at the top of `frame()` before clamping and calling `applyCamera()` (keep `panByPixels` before `zoomBy` for pinch, and keep `setPointerCapture` synchronously in `onPointerMove` on the `!wasDragged && state.dragged` transition).<br>3. **`will-change` pointer guard:** Never flip `will-change: transform` → `auto` while `gestureRef.current.pointers.length > 0` — guard both `frame()` (`L283`) and the `markGesture()` settle timeout (`L314`), and re-arm `markGesture()` on `endPointer` when the last pointer lifts (`pointers.length === 0`) so `will-change` still cleanly returns to `'auto'` `SETTLE_MS` after release. |
| `openspec/changes/mobile-gyroscope-glare/tasks.md`, `verification.md`, & `patch.md` | Patch 02 block / end of file | Check off `P02.1`–`P02.5`, append `PATCH-02` automated evidence + 3-way `S2` preview verification checklist in `verification.md`, and mark `PATCH-02` `RESOLVED` in `patch.md`. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the files and line ranges listed in the Target Context Map above.
- **FORBIDDEN**:
  - Do NOT touch `PlaygroundPbrWall.tsx`, `PrintSharpOverlay.tsx`, `MacroIsland.tsx`, `printImagePrefetch.ts`, `wall.css`, `hud.css`, `studio.css`, `.env`, or any Tier 1 / Tier 2 items (those belong to separate post-PR-#13 changes).
  - Do NOT modify existing passing test assertions in `useGyroTilt.test.ts` or `pinchGesture.test.ts` (note: check if any existing `useGyroTilt.test.ts` case uses a delta `< 0.004` — all current tests use `+11°` = `0.25`, well above `0.004`).
  - Do NOT break wheel zoom (`onWheel`), keyboard navigation, click/tap suppression after drag (`wasDragged`), or `2 -> 1` pinch hand-off.
- **INVARIANTS TO PRESERVE**:
  - When all pointers are up (`pointers.length === 0`) and the camera is settled, `GalleryCanvas`'s rAF loop MUST stop (`animatingRef.current = false`) and `worldRef.current.style.willChange` MUST return to `'auto'`.
  - Pinch order invariant: when flushing pending pinch + pan in `frame()`, pan first (`panByPixels(panDx, panDy)`) then zoom about the current anchor (`zoomBy(anchorX, anchorY, zoomFactor)`).
  - All 536+ Vitest tests, `tsc --noEmit`, `eslint src`, and `npm run build` MUST pass.

## 4. Visual & UI Impact
- **Desktop `(pointer: fine)`:** Zero visual diff; mouse drag panning also benefits from coalesced 1-per-vsync frame pacing and `will-change` stability during drags.
- **Mobile `(pointer: coarse)`:** Eliminates resting-phone gyro commits (`< 0.2°` jitter suppressed) and prevents the 36–39 fps pan drop when gyro is inactive (Reduce Motion, denied motion permission, or resting dead-band).

## 5. Reproduction & Verification Protocol
1. **Reproduce First (TDD Red)**:
   - Add the `< 0.004` dead-band test to `src/components/wall/__tests__/useGyroTilt.test.ts` (e.g., `beta0 = 50`, sample `beta = 50.1` → `0.1 / 44 ≈ 0.00227 < 0.004` → assert `tilts` stays `[]`).
   - Run:
     ```bash
     npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts -t "dead-band"
     ```
   - Confirm failure against `MIN_EMIT_DELTA = 1e-3`.
2. **Apply Minimal Fixes**:
   - Update `MIN_EMIT_DELTA = 0.004` in `src/components/wall/useGyroTilt.ts`.
   - Add last-written string guards in `src/components/wall/FramedPrint.tsx` (`L94-L135`).
   - Implement the gesture-scoped rAF loop, coalesced `onPointerMove` flush, and `pointers.length === 0` `will-change` guard in `src/components/wall/GalleryCanvas.tsx` (`L224-L319`, `L539-L594`).
3. **Verify Fix (TDD Green)**:
   - Run:
     ```bash
     npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts src/components/wall/__tests__/pinchGesture.test.ts
     ```
   - Confirm 100% pass.
4. **Full Regression Suite**:
   - Run:
     ```bash
     npx vitest run && npx tsc --noEmit && npx eslint src && npm run build
     ```
   - Confirm 100% clean pass.
5. **Maintainer Preview Verification (Recorded as Pending Hardware Check in `verification.md`)**:
   - Three `S2` pan runs on the PR #13 preview (iPhone 16 Pro):
     1. Gyro ON
     2. Reduce Motion ON
     3. Motion & Orientation Access DENIED (`Settings → Apps → Safari → Motion & Orientation Access` off)
   - Target: all three hold **~60 fps** while panning (vs. `36–39 fps` / `36–43%` missed baseline). *(S4 with Reduce Motion will still show `PrintSharpOverlay`'s 60 commits/s until Tier 1.)*

## 6. Surgical Patch Checklist
- [ ] P02.1 Add failing dead-band test (`< 0.004` ignored) in `src/components/wall/__tests__/useGyroTilt.test.ts` and confirm red.
- [ ] P02.2 Raise `MIN_EMIT_DELTA` to `0.004` in `src/components/wall/useGyroTilt.ts` and add no-op DOM write skip in `src/components/wall/FramedPrint.tsx`.
- [ ] P02.3 Implement gesture-scoped pan/pinch rAF loop, coalesced per-frame input flush, and `pointers.length === 0` `will-change` guard in `src/components/wall/GalleryCanvas.tsx`.
- [ ] P02.4 Re-run targeted tests and full suite (`npx vitest run && npx tsc --noEmit && npx eslint src && npm run build`) and confirm 100% pass.
- [ ] P02.5 Update `openspec/changes/mobile-gyroscope-glare/tasks.md` (`P02.1`–`P02.5` to `- [x]`), append `PATCH-02` evidence + 3-way `S2` preview check in `verification.md`, mark `PATCH-02` `RESOLVED` in `patch.md`, commit, and push to `origin/feat/multi-20261125-0558`.
