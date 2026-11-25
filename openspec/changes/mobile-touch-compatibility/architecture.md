> [!NOTE]
> This document specifies **technical system architecture only** (data flow, storage, APIs, concurrency, state synchronization, and security).
> All visual, aesthetic, and UI design decisions (colors, typography, component styling, responsive layout) must be defined in `design.md`.

## Context

- **Input:** `GalleryCanvas` owns all wall input through native listeners on the container. Wheel is non-passive. `pointerdown/move/up/cancel` feed a `pointersRef` map, and pinch is a two-entry branch that only zooms. A 5 px `DRAG_THRESHOLD_PX` separates taps from drags (`GalleryCanvas.tsx:545-640`).
- **Hover tilt:** `FramedPrint` applies its tilt from `onPointerMove` for every pointer type.
- **Studio sortables:** both use dnd-kit `PointerSensor { distance: 4 }`. The photo tile itself is the activator, with `touch-action: none`.
- **Viewport:** the root layout has no `viewport` export.
- **Prerequisite:** the `SoundtrackPlaque` single-player fix must merge first. It touches the same file, and its per-album guard is a prerequisite for a sane touch test of the plaque.

## System Architecture Diagram

```mermaid
flowchart TD
  subgraph Wall input (GalleryCanvas)
    PD[pointerdown] --> PM{pointers}
    PM -->|1| PAN[panByPixels dx,dy]
    PM -->|2| PG[pinchGesture.step prev,curr]
    PG -->|zoomFactor, anchor| Z[zoomBy]
    PG -->|panDx, panDy| PAN
    GS[gesturestart / gesturechange<br/>WebKit] -->|preventDefault| X[no page zoom]
  end
  subgraph Hover gating
    FP[FramedPrint onPointerMove] -->|pointerType==='mouse'| TILT[tilt + sheen]
    CSS[:hover rules] -->|@media hover:hover & pointer:fine| LIFT[lift]
  end
  subgraph Studio sortables
    MS[MouseSensor distance 4] --> DND[DndContext]
    TS[TouchSensor delay 250 / tol 5] --> DND
    KS[KeyboardSensor] --> DND
  end
```

## Goals / Non-Goals

**Goals:**
- Correct touch behaviour on iPhone Safari and Android Chrome, with **zero** desktop change: the computed-style and pixelmatch baselines stay identical with a fine pointer emulated.
- The pinch math is a pure, unit-tested helper.
- No new dependencies.

**Non-Goals:**
- Capping image size or DPR, `backdrop-filter` budgets, double-tap zoom, landscape layouts. All are measured only (research: Raised but not acted on).
- Fixing a silent first tap on iOS, if a device confirms it. That gets recorded for a follow-up, because the public CSP forbids the IFrame API that could detect it.

## Technical Decisions

**D1: A pure `src/components/wall/pinchGesture.ts`.**
- **Signature:** `pinchStep(prev: { a: Pt; b: Pt }, curr: { a: Pt; b: Pt }) => { zoomFactor; anchor: Pt; panDx; panDy } | null`.
- **Values:**
  - `zoomFactor = dist(curr) / dist(prev)`;
  - `anchor = mid(curr)`;
  - `pan = mid(curr) − mid(prev)`.
- **Null case:** returns `null` for degenerate distances (≤ 0 or non-finite).
- **How `GalleryCanvas` applies it:** in the `size >= 2` branch, `panByPixels(panDx, panDy)` first, then `zoomBy(anchor − rect, zoomFactor)`. Panning first, then zooming about the *current* midpoint, keeps the world point under the fingers fixed. A unit test checks that with a reference camera transform.
- **State change:** `pinchRef` stores both points instead of only a distance.
- **Alternative rejected:** zooming about the previous midpoint, then panning. The result drifts by `(1 − factor)` × the midpoint delta.

**D2: One-finger hand-off without jump.** Currently `onPointerDown` (`GalleryCanvas.tsx:553`) resets `draggedRef.current = false` on **every** pointer down — including the second finger. If a user drags 1 finger (`draggedRef = true`), touches a 2nd finger, and lifts it before a `pointermove`, `draggedRef` becomes `false`; the next move exceeds `DRAG_THRESHOLD_PX` and calls `panByPixels(clientX - startX, …)` (`L590-L594`), causing a full jump back across the whole drag. Fix:
- Only reset `draggedRef.current = false` when `pointersRef.current.size === 1` (the `0 -> 1` pointer transition).
- When `pointersRef.current.size` drops from `2 -> 1` in `endPointer`, keep `draggedRef.current = true` and rebase the remaining pointer's `startX = x`, `startY = y` so `panByPixels(dx, dy)` continues smoothly and release never fires a click.
- Extract the pointer-count / `dragged` / `pinchRef` transition logic into pure helpers in `pinchGesture.ts` so a unit test verifies the `1-finger drag → 2nd finger down → 2nd finger up → 1-finger move` sequence produces zero jump.

**D3: WebKit page-zoom guard.** Register `gesturestart` and `gesturechange` listeners on the wall container, non-passive, that call `preventDefault()`. They're registered unconditionally: these events only exist in WebKit, so the listeners are inert elsewhere. This sits alongside the existing `touch-action: none` and costs nothing.

**D4: Viewport export & `max()` safe-area insets.** Add `export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }` in `src/app/layout.tsx` (matching `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`, without `maximumScale` or `userScalable: false`).
- `.hud-top-right`: `top: max(24px, env(safe-area-inset-top, 0px))`, `right: max(24px, env(safe-area-inset-right, 0px))` (and `max(12px, ...)` inside `<= 767px`).
- `.photo-focus-bar`: keep bottom `env(safe-area-inset-bottom, 0px)` and set horizontal padding to `max(22px, env(safe-area-inset-left, 0px))` / `max(22px, env(safe-area-inset-right, 0px))` (and `max(14px, ...)` inside `<= 767px`) so landscape iPhones clear the Dynamic Island on either side without doubling spacing.

**D5: Gating hover in two layers (wrap in place).**
- **JS:** `FramedPrint.onPointerMove` and the hover branch of `onPointerLeave` return early unless `event.pointerType === 'mouse'`. The `onPointerEnter` prefetch stays for every pointer type, since it's a warm-up that also helps touch.
- **CSS:** Wrap **each** `:hover` rule **in place** inside its own `@media (hover: hover) and (pointer: fine)` block in `wall.css` (`4` rules) and `hud.css` (`3` rules) — do **not** collect them at the bottom of the file, which would reorder the cascade against `.hud-button.active` (`hud.css:62/67`), `.photo-frame:hover`/`.photo-frame.is-lit:hover` (`wall.css:966/1040`), and `.photo-focus-bar .hud-button:hover`/`.hud-button-primary` (`hud.css:141/152`). `touchAudit.test.ts` enforces that zero ungated `:hover` rules exist (preventing sticky touch hover).

**D6: Touch targets without changing visuals (HUD controls only).** Under `@media (pointer: coarse)`, give `.hud-button` and Photo Focus Prev/Next/Back `position: relative`, plus an invisible `::before` with `inset: min(0px, (44px − 100%) / 2)` (or `-7px` vertically for the 30 px height). Visible boxes are unchanged. (The scaled-world `.soundtrack-plaque` / capture layer is omitted because its screen size depends on camera zoom rather than CSS pixels.)

**D7: Studio sensors & callout suppression.** Use `useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }), useSensor(KeyboardSensor, …))` in both `CuratorStudio.tsx` and `AlbumEditor.tsx` (sharing one sensor config for consistent Studio feel). Change `.album-editor-photo-media` (and its list-row variant) to `touch-action: manipulation; -webkit-touch-callout: none; user-select: none;` so swiping scrolls and 250 ms long-presses drag without triggering iOS image callouts or Android `contextmenu` selection. `.studio-album-drag` keeps `touch-action: none`.

**D8: `playsinline=1`.** A one-parameter change to the plaque iframe URL. The parameter order is otherwise kept as it is, so any existing snapshot or URL assertion only gains a parameter.

## Risks / Trade-offs

- **[Risk]** The hover CSS move changes the cascade order, which would show up as a desktop diff. → Gate on the fine-pointer pixelmatch and computed-style harness showing 0 diffs.
- **[Risk]** The 250 ms long-press feels slow for curators who drag a lot on a tablet with a mouse. → The mouse still uses `MouseSensor` at 4 px, so only touch pays the delay.
- **[Risk]** iOS ignores `gesturestart.preventDefault()` in some versions. → Verify on a device. `touch-action: none` remains the primary guard.
- **[Trade-off]** Touch users lose the tilt and sheen entirely. That's intentional: there's no hover on touch, and a tilt frozen after a tap reads as a bug.

## Migration & Rollback Plan

- No data, API or env impact. Each decision is an independent hunk, so a partial revert is possible.
- Merge after the `SoundtrackPlaque` single-player fix.
- Verify on local dev, plus a device on the same LAN (`next dev -H 0.0.0.0`). Never write to the preview or production databases. Read-only viewing of production `/photos` from a phone is fine for the final check.
