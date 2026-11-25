## 1. Test Scaffolding (TDD)

- [ ] 1.0 Confirm the `SoundtrackPlaque` single-player fix is merged into `main`, then branch from it.
- [ ] 1.1 Write failing `src/components/wall/__tests__/pinchGesture.test.ts`:
  - pure pinch;
  - pure slide;
  - the pinch-plus-slide world-point invariant (while camera is unclamped);
  - one-finger → two-finger → one-finger hand-off produces zero jump and preserves `dragged = true`;
  - degenerate input → `null`.
- [ ] 1.2 Write failing static audit tests (`src/lib/__tests__/touchAudit.test.ts`):
  - every `:hover` rule in `wall.css` and `hud.css` is gated inside `@media (hover: hover) and (pointer: fine)`;
  - `.album-editor-photo-media` sets `touch-action: manipulation`, `-webkit-touch-callout: none`, and `user-select: none` (and `touch-action: none` in `studio.css` stays only on `.studio-album-drag`);
  - the `viewport` export (`viewportFit: 'cover'`; no `userScalable: false` / `maximumScale`);
  - `playsinline=1` in `SoundtrackPlaque.tsx`;
  - `MouseSensor` + `TouchSensor` imports (no `PointerSensor`) in `CuratorStudio.tsx` and `AlbumEditor.tsx`.
- [ ] 1.3 Run `npx vitest run` on the new files and confirm they fail for the expected reasons.

## 2. Wall input

- [ ] 2.1 Implement `src/components/wall/pinchGesture.ts` (`pinchStep` + pure pointer hand-off state helper, D1–D2) and make 1.1 pass.
- [ ] 2.2 In `GalleryCanvas.tsx`, have `pinchRef` store both points, reset `draggedRef.current = false` ONLY on `0 -> 1` pointer count in `onPointerDown`, rebase `startX`/`startY` and preserve `draggedRef = true` on `2 -> 1` in `endPointer`, and in the `size >= 2` branch apply `panByPixels(panDx, panDy)` then `zoomBy(anchor - rect, zoomFactor)` (D1–D2).
- [ ] 2.3 Add non-passive `gesturestart` and `gesturechange` `preventDefault` listeners on the wall container, with matching cleanup (D3).

## 3. Viewport, HUD and hover gating

- [ ] 3.1 Read the Next 16 `viewport` docs in `node_modules/next/dist/docs/`, then add the `viewport` export to `src/app/layout.tsx` (D4).
- [ ] 3.2 In `hud.css`, add `max()` safe-area offsets to `.hud-top-right` (`top`/`right`) and `.photo-focus-bar` (`left`/`right` horizontal padding, base and `≤ 767px`), and add `@media (pointer: coarse)` 44 px hit-area `::before` overlays for `.hud-button` and Photo Focus controls (D4, D6).
- [ ] 3.3 Wrap every `:hover` visual rule in `wall.css` (`4` rules) and `hud.css` (`3` rules) **in place** inside its own `@media (hover: hover) and (pointer: fine)` block so cascade order is preserved (D5).
- [ ] 3.4 In `FramedPrint.tsx`, gate the tilt and sheen on `pointerType === 'mouse'`, and keep the `onPointerEnter` prefetch for all pointer types (D5).
- [ ] 3.5 In `SoundtrackPlaque.tsx`, add `playsinline=1` to the iframe URL (D8).

## 4. Studio touch reordering

- [ ] 4.1 In `CuratorStudio.tsx` and `AlbumEditor.tsx`, replace `PointerSensor` with `MouseSensor { distance: 4 }` + `TouchSensor { delay: 250, tolerance: 5 }` + the existing `KeyboardSensor` (D7).
- [ ] 4.2 In `studio.css`, set `touch-action: manipulation; -webkit-touch-callout: none; user-select: none;` on `.album-editor-photo-media` (and its list-row variant). Keep `touch-action: none` only on `.studio-album-drag` (D7).
- [ ] 4.3 Make 1.2 pass. Confirm `cssBoundaryAudit`, `photoOrderState` and the route tests are green.

## 5. Verification & Empirical Audit

- [ ] 5.1 Run `npx vitest run` (full suite), `npx tsc --noEmit`, `npx eslint .` and `npm run build`. Confirm all are clean, and record pass counts against the baseline.
- [ ] 5.2 Run the fine-pointer desktop computed-style and pixelmatch harness (including hovered states on regular/active `.hud-button`, lit/unlit `.photo-frame`, and `.museum-placard`) and confirm **0 diffs**.
- [ ] 5.3 Run every `tests.md` manual check on a real iPhone (Safari) and a real Android phone (Chrome) over the LAN, using the local DB only (including landscape `.photo-focus-bar` Dynamic Island clearance and long-press no-callout / no-`contextmenu`).
- [ ] 5.4 Resolve every `research.md` Unverified assumption with device evidence:
  - inline vs full screen;
  - audio on the first tap;
  - whether page pinch-zoom was suppressed;
  - how the long-press feels;
  - peak memory.
  
  Move anything wrong to Superseded claims, and record out-of-scope failures as follow-ups.
- [ ] 5.5 Populate `verification.md`:
  - the Requirement Adherence Matrix covering every scenario in all three delta specs;
  - device and OS versions;
  - resolved assumptions;
  - a nomenclature audit (coarse pointer, fine hover, safe area, touch target, inline playback);
  - verbatim logs.
