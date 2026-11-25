# OpenCode Orchestration Handoff: OpenSpec Change 'mobile-touch-compatibility'

You are the orchestration agent for OpenSpec change `mobile-touch-compatibility` running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

> **Prerequisite Check (`Task 1.0`):** Confirm the `SoundtrackPlaque` single-player fix (`showsIframeFor(state, albumId)`) is merged into `main` before cutting `feat/mobile-touch-compatibility` from `main`. (If `SoundtrackPlaque.tsx` on `main` still calls `showsIframe(state)` without `album.id`, **HALT** and notify the user before editing `SoundtrackPlaque.tsx`.)

---

## 1. Orchestration Directive
- **Change Name**: `mobile-touch-compatibility`
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub mobile-touch-compatibility`)
- **Feature Branch**: Create and work on `feat/mobile-touch-compatibility` cut from `main`.
- **Architecture Paradigm**: Capability-gated progressive enhancement (`@media (hover: hover) and (pointer: fine)`, `@media (pointer: coarse)`, `event.pointerType === 'mouse'`) — **zero** desktop visual or behavioral regressions.

---

## 2. Target Context Map

| File Path (relative to repo root) | Target Lines | Modification Summary |
| :--- | :--- | :--- |
| `src/components/wall/__tests__/pinchGesture.test.ts` | `[NEW]` | TDD tests for `pinchStep` (pure pinch, pure slide, unclamped pinch+slide world-point invariant `eps = 1e-6`, degenerate `null`) AND 1-finger → 2-finger → 1-finger hand-off (zero jump, `dragged = true`). |
| `src/lib/__tests__/touchAudit.test.ts` | `[NEW]` | Static audit asserting `:hover` rules in `wall.css`/`hud.css` are inside `@media (hover: hover) and (pointer: fine)`, `.album-editor-photo-media` has `touch-action: manipulation` + `-webkit-touch-callout: none` + `user-select: none` (`touch-action: none` in `studio.css` only on `.studio-album-drag`), `viewportFit: 'cover'` without `userScalable: false`/`maximumScale`, `playsinline=1` in `SoundtrackPlaque.tsx`, and `MouseSensor`+`TouchSensor` (no `PointerSensor`) in `CuratorStudio.tsx`/`AlbumEditor.tsx`. |
| `src/components/wall/pinchGesture.ts` | `[NEW]` | Pure `pinchStep(prev, curr)` + pure pointer hand-off state helpers. |
| `src/components/wall/GalleryCanvas.tsx` | `L149`, `L545-L640` | Store `{ a, b }` in `pinchRef`; reset `draggedRef = false` ONLY on `0 -> 1` in `onPointerDown`; rebase `startX`/`startY` and keep `draggedRef = true` on `2 -> 1` in `endPointer`; in `size >= 2`, call `panByPixels(panDx, panDy)` then `zoomBy(anchor - rect, zoomFactor)`; register non-passive `gesturestart`/`gesturechange` `preventDefault()` listeners with cleanup. |
| `src/app/layout.tsx` | `L1-L23` | Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`, then export `viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }`. |
| `src/styles/hud.css` | `L26-L39`, `L62-L70`, `L83-L100`, `L141-L183` | Use `max(24px, env(safe-area-inset-top/right, 0px))` on `.hud-top-right` (`max(12px, ...)` at `<= 767px`) and `max(22px, env(safe-area-inset-left/right, 0px))` on `.photo-focus-bar` (`max(14px, ...)` at `<= 767px`); wrap each `:hover` rule **in place** inside `@media (hover: hover) and (pointer: fine)`; add `>= 44×44px` invisible `::before` hit areas on `.hud-button` and Photo Focus controls under `@media (pointer: coarse)`. |
| `src/styles/wall.css` | `L666`, `L799`, `L966`, `L1040` | Wrap each of the 4 `:hover` visual rules **in place** inside `@media (hover: hover) and (pointer: fine)` (preserving cascade order and keeping `cssBoundaryAudit.test.ts` green). |
| `src/components/wall/FramedPrint.tsx` | `L69-L102` | Gate hover tilt and `.photo-sheen` on `event.pointerType === 'mouse'` (keep `onPointerEnter` image prefetch for all pointer types). |
| `src/components/wall/SoundtrackPlaque.tsx` | `L125-L134` | Append `&playsinline=1` to the YouTube embed URL. |
| `src/components/admin/CuratorStudio.tsx` | `L22-L25`, `L212-L215` | Replace `PointerSensor` with `MouseSensor { distance: 4 }`, `TouchSensor { delay: 250, tolerance: 5 }`, and `KeyboardSensor`. |
| `src/components/admin/AlbumEditor.tsx` | `L22-L25`, `L234-L237` | Replace `PointerSensor` with `MouseSensor { distance: 4 }`, `TouchSensor { delay: 250, tolerance: 5 }`, and `KeyboardSensor`. |
| `src/styles/studio.css` | `L761`, `L942-L955` | Set `touch-action: manipulation; -webkit-touch-callout: none; user-select: none;` on `.album-editor-photo-media` (and list-row variant); keep `touch-action: none` only on `.studio-album-drag`. |

---

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions**:
  - Pan first (`panByPixels(panDx, panDy)`), then zoom around current midpoint (`zoomBy(anchor - rect, zoomFactor)`).
  - Wrap each `:hover` rule **in place** (do not collect at bottom of file) so `.hud-button.active`, `.photo-frame.is-lit:hover`, and `.photo-focus-bar .hud-button-primary` keep exact desktop specificity/source-order.
  - Omit scaled-world `.soundtrack-plaque` / capture layer from the `44×44px` screen-pixel rule.
  - Do **NOT** set `userScalable: false` or `maximumScale` on `viewport`.
- **Hard Exclusions / No-Go**:
  - Do **NOT** modify `.env`, `.env.*`, or credential files.
  - Do **NOT** introduce new npm dependencies (`@dnd-kit/core` already exports `MouseSensor` and `TouchSensor`).
  - Do **NOT** write to preview or production databases during verification.

---

## 4. Visual & UI Design Specifications & Desktop Parity Gate
- **Desktop Zero-Diff Mandate**: Run Playwright (`--workers=1`, `1440×900`, `DPR = 1`, fine pointer) against `next start` before and after on `/photos?demo=4&mood=chiaroscuro` (idle, album, print, **and hovered states** on regular/active `.hud-button`, lit/unlit `.photo-frame`, `.museum-placard`) plus `/photos/admin` and confirm **0 computed-style diffs** and **0% pixelmatch diff**.
- **Mobile Emulation Checks**: Verify coarse-pointer `>= 44×44px` hit boxes (`::before` overlays), `viewport-fit=cover` meta tag, landscape safe-area padding on `.photo-focus-bar`, and no stuck tilt after touch tap (`PrintSharpOverlay` stays flat).
- **Real-Device Checks (`tests.md` §Manual Verification)**: Note any physical iPhone Safari / Android Chrome checks that require maintainer LAN verification cleanly in `verification.md` without blocking automated checks.

---

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: `npx vitest run` (run directly — do **NOT** wrap Vitest with `safe-test`, which OOMs on this suite).
- **TDD Requirement**: Task group `## 1` MUST scaffold failing `pinchGesture.test.ts` and `touchAudit.test.ts` and verify they fail before modifying implementation code.
- **Targeted Loop Command**:
  ```bash
  npx vitest run src/components/wall/__tests__/pinchGesture.test.ts src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts
  ```
- **Final Regression Gate**:
  ```bash
  npx tsc --noEmit && npx eslint . && npx vitest run && npm run build
  ```

---

## 6. Implementation Task Checklist

- [ ] 1.0 Confirm the `SoundtrackPlaque` single-player fix is merged into `main`, then branch from it.
- [ ] 1.1 Write failing `src/components/wall/__tests__/pinchGesture.test.ts` (pure pinch, pure slide, unclamped pinch+slide invariant, 1→2→1 finger hand-off zero-jump test, degenerate `null`).
- [ ] 1.2 Write failing `src/lib/__tests__/touchAudit.test.ts` (gated `:hover` in `wall.css`/`hud.css`, `.album-editor-photo-media` `touch-action: manipulation` + `-webkit-touch-callout: none` + `user-select: none`, `touch-action: none` only on `.studio-album-drag`, `viewportFit: 'cover'` without `userScalable: false`/`maximumScale`, `playsinline=1`, `MouseSensor`+`TouchSensor` without `PointerSensor`).
- [ ] 1.3 Run `npx vitest run` on the new files and confirm they fail for the expected reasons.
- [ ] 2.1 Implement `src/components/wall/pinchGesture.ts` (`pinchStep` + pure pointer hand-off state helper) and make 1.1 pass.
- [ ] 2.2 Update `GalleryCanvas.tsx` (`pinchRef` stores `{ a, b }`, reset `draggedRef` only on `0 -> 1`, rebase `startX`/`startY` and keep `draggedRef = true` on `2 -> 1`, pan then zoom in `size >= 2`).
- [ ] 2.3 Add non-passive `gesturestart` and `gesturechange` `preventDefault` listeners on the wall container with cleanup.
- [ ] 3.1 Read `node_modules/next/dist/docs/` for Next 16 `viewport`, then add `export const viewport` to `src/app/layout.tsx`.
- [ ] 3.2 In `hud.css`, add `max()` safe-area offsets to `.hud-top-right` and `.photo-focus-bar` (`base` and `<= 767px`), plus `@media (pointer: coarse)` 44 px hit-area `::before` overlays for `.hud-button` and Photo Focus controls.
- [ ] 3.3 Wrap every `:hover` visual rule in `wall.css` (`4` rules) and `hud.css` (`3` rules) **in place** inside `@media (hover: hover) and (pointer: fine)`.
- [ ] 3.4 In `FramedPrint.tsx`, gate tilt and sheen on `pointerType === 'mouse'` (keep `onPointerEnter` prefetch for all pointer types).
- [ ] 3.5 In `SoundtrackPlaque.tsx`, add `playsinline=1` to the iframe URL.
- [ ] 4.1 In `CuratorStudio.tsx` and `AlbumEditor.tsx`, replace `PointerSensor` with `MouseSensor { distance: 4 }` + `TouchSensor { delay: 250, tolerance: 5 }` + `KeyboardSensor`.
- [ ] 4.2 In `studio.css`, set `touch-action: manipulation; -webkit-touch-callout: none; user-select: none;` on `.album-editor-photo-media` (and list-row variant); keep `touch-action: none` only on `.studio-album-drag`.
- [ ] 4.3 Make 1.2 pass and confirm `cssBoundaryAudit`, `photoOrderState`, and route tests are green.
- [ ] 5.1 Run `npx tsc --noEmit && npx eslint . && npx vitest run && npm run build`.
- [ ] 5.2 Run the fine-pointer desktop computed-style + pixelmatch harness (including `:hover` states) and confirm **0 diffs**, plus Playwright coarse-pointer/touch-target checks.
- [ ] 5.3 Record automated + Playwright evidence (and mark physical iPhone Safari / Android Chrome LAN checks cleanly if no physical device is attached) in `openspec/changes/mobile-touch-compatibility/verification.md`.

---

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify all automated checkboxes in `tasks.md` are marked `- [x]`, populate `verification.md` with Requirement Adherence Matrix and verbatim logs, and run `openspec-verify-change`.
2. **If verification succeeds with zero critical issues**:
   - Sync specs (`openspec specs apply --change "mobile-touch-compatibility"`), commit on `feat/mobile-touch-compatibility`, push (`git push -u origin HEAD`), and open a Pull Request via `gh pr create --fill`.
3. **If CRITICAL issues fail**: run at most **1** bounded repair pass via `spec-coder-sub`, re-verify, and either open the PR or **HALT** and report blockers.
