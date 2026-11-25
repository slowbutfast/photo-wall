## 1. Test Scaffolding (TDD)

- [x] 1.0 Confirm the `SoundtrackPlaque` single-player fix is merged into `main`, then branch from it. <!-- verified on `main` @ 3e59548: SoundtrackPlaque.tsx calls `showsIframeFor(state, album.id)`. Orchestrator mandated branch `feat/multi-20261125-0558` instead of `feat/mobile-touch-compatibility`. -->
- [x] 1.1 Write failing `src/components/wall/__tests__/pinchGesture.test.ts`:
  - pure pinch;
  - pure slide;
  - the pinch-plus-slide world-point invariant (while camera is unclamped);
  - one-finger → two-finger → one-finger hand-off produces zero jump and preserves `dragged = true`;
  - degenerate input → `null`.
- [x] 1.2 Write failing static audit tests (`src/lib/__tests__/touchAudit.test.ts`):
  - every `:hover` rule in `wall.css` and `hud.css` is gated inside `@media (hover: hover) and (pointer: fine)`;
  - `.album-editor-photo-media` sets `touch-action: manipulation`, `-webkit-touch-callout: none`, and `user-select: none` (and `touch-action: none` in `studio.css` stays only on `.studio-album-drag`);
  - the `viewport` export (`viewportFit: 'cover'`; no `userScalable: false` / `maximumScale`);
  - `playsinline=1` in `SoundtrackPlaque.tsx`;
  - `MouseSensor` + `TouchSensor` imports (no `PointerSensor`) in `CuratorStudio.tsx` and `AlbumEditor.tsx`.
- [x] 1.3 Run `npx vitest run` on the new files and confirm they fail for the expected reasons. <!-- 9 failed / 1 passed: `Cannot find module '../pinchGesture'` for 1.1; every 1.2 assertion failed on the pre-change source (ungated `:hover`, `touch-action: none`, no viewport export, no `playsinline=1`, `PointerSensor`). -->

## 2. Wall input

- [x] 2.1 Implement `src/components/wall/pinchGesture.ts` (`pinchStep` + pure pointer hand-off state helper, D1–D2) and make 1.1 pass. <!-- `npx vitest run src/components/wall/__tests__/pinchGesture.test.ts` → 9/9 pass. -->
- [x] 2.2 In `GalleryCanvas.tsx`, have `pinchRef` store both points, reset `draggedRef.current = false` ONLY on `0 -> 1` pointer count in `onPointerDown`, rebase `startX`/`startY` and preserve `draggedRef = true` on `2 -> 1` in `endPointer`, and in the `size >= 2` branch apply `panByPixels(panDx, panDy)` then `zoomBy(anchor - rect, zoomFactor)` (D1–D2). <!-- Implemented as a single `gestureRef: GestureState` driven by the pure helpers (`pinchRef`/`draggedRef`/`pointersRef` collapsed into it). -->
- [x] 2.3 Add non-passive `gesturestart` and `gesturechange` `preventDefault` listeners on the wall container, with matching cleanup (D3). <!-- `npx tsc --noEmit` clean. -->

## 3. Viewport, HUD and hover gating

- [x] 3.1 Read the Next 16 `viewport` docs in `node_modules/next/dist/docs/`, then add the `viewport` export to `src/app/layout.tsx` (D4). <!-- Read `…/04-functions/generate-viewport.md`; `viewportFit?: 'auto' | 'cover' | 'contain'` confirmed in `extra-types.d.ts`. -->
- [x] 3.2 In `hud.css`, add `max()` safe-area offsets to `.hud-top-right` (`top`/`right`) and `.photo-focus-bar` (`left`/`right` horizontal padding, base and `≤ 767px`), and add `@media (pointer: coarse)` 44 px hit-area `::before` overlays for `.hud-button` and Photo Focus controls (D4, D6).
- [x] 3.3 Wrap every `:hover` visual rule in `wall.css` (`4` rules) and `hud.css` (`3` rules) **in place** inside its own `@media (hover: hover) and (pointer: fine)` block so cascade order is preserved (D5).
- [x] 3.4 In `FramedPrint.tsx`, gate the tilt and sheen on `pointerType === 'mouse'`, and keep the `onPointerEnter` prefetch for all pointer types (D5).
- [x] 3.5 In `SoundtrackPlaque.tsx`, add `playsinline=1` to the iframe URL (D8).

## 4. Studio touch reordering

- [x] 4.1 In `CuratorStudio.tsx` and `AlbumEditor.tsx`, replace `PointerSensor` with `MouseSensor { distance: 4 }` + `TouchSensor { delay: 250, tolerance: 5 }` + the existing `KeyboardSensor` (D7).
- [x] 4.2 In `studio.css`, set `touch-action: manipulation; -webkit-touch-callout: none; user-select: none;` on `.album-editor-photo-media` (and its list-row variant). Keep `touch-action: none` only on `.studio-album-drag` (D7).
- [x] 4.3 Make 1.2 pass. Confirm `cssBoundaryAudit`, `photoOrderState` and the route tests are green. <!-- `npx vitest run …/pinchGesture.test.ts …/touchAudit.test.ts …/cssBoundaryAudit.test.ts` → 3 files / 27 tests pass; `photoOrderState` + `publicBoundaryAudit` + `rawUrlAudit` → 3 files / 29 tests pass. -->

## 5. Verification & Empirical Audit

- [x] 5.1 Run `npx vitest run` (full suite), `npx tsc --noEmit`, `npx eslint .` and `npm run build`. Confirm all are clean, and record pass counts against the baseline.
  <!-- vitest: 33 files / 482 tests pass (baseline 31 / 463 → +2 files, +19 tests, 0 lost). tsc: exit 0.
       eslint: `npx eslint src` exit 0 and `npx eslint . --ignore-pattern 'test-results/**'` exit 0;
       raw `npx eslint .` fails *only* on the gitignored `test-results/parity-baseline/.next/**` build
       artifacts left by the previous parity harness (929 errors, all inside that directory) — a
       pre-existing environment condition, not this change. `npm run build`: exit 0.
       See `verification.md` §3 for verbatim logs. -->
- [x] 5.2 Run the fine-pointer desktop computed-style and pixelmatch harness (including hovered states on regular/active `.hud-button`, lit/unlit `.photo-frame`, and `.museum-placard`) and confirm **0 diffs**.
  <!-- Orchestrator-run against production `next start` for `main` @ 3e59548 and this branch, Chromium 1440×900
       DPR 1, 11 states (idle, active-HUD hover, album, placard/frame hover, print, focused-frame hover,
       Photo Focus regular + primary hover, admin login). pixelmatch: 0 pixels in every state. Computed
       styles identical in 10/11 states; the one `print` entry was PrintSharpOverlay rAF settle jitter,
       reproduced between two head runs while the screenshot stayed at 0 pixels. Coarse pass: 44px `::before`
       hit area on both 390×844 and 1024×800, `viewport-fit=cover`, touch tap leaves transform/sheen unchanged.
       Full evidence in `verification.md` §8. -->
- [ ] 5.3 Run every `tests.md` manual check on a real iPhone (Safari) and a real Android phone (Chrome) over the LAN, using the local DB only (including landscape `.photo-focus-bar` Dynamic Island clearance and long-press no-callout / no-`contextmenu`).
  <!-- BLOCKED: no physical device attached to this session. Exact maintainer steps are in `verification.md` §7. -->
- [ ] 5.4 Resolve every `research.md` Unverified assumption with device evidence:
  - inline vs full screen;
  - audio on the first tap;
  - whether page pinch-zoom was suppressed;
  - how the long-press feels;
  - peak memory.
  
  Move anything wrong to Superseded claims, and record out-of-scope failures as follow-ups.
  <!-- BLOCKED: same reason as 5.3 — every item needs device evidence. `verification.md` §6/§7 list the
       measurement to take for each assumption. -->
- [x] 5.5 Populate `verification.md`:
  - the Requirement Adherence Matrix covering every scenario in all three delta specs;
  - device and OS versions;
  - resolved assumptions;
  - a nomenclature audit (coarse pointer, fine hover, safe area, touch target, inline playback);
  - verbatim logs.
  <!-- Written. Device/OS columns are marked PENDING (no device attached); verbatim logs in §3. -->
