> [!NOTE]
> This document specifies **technical system architecture only** (data flow, storage, APIs, concurrency, state synchronization, and security).
> All visual, aesthetic, and UI design decisions (colors, typography, component styling, responsive layout) must be defined in `design.md`.

## Context

The wall is a DOM world (`.wall-world`), scaled and translated imperatively by `GalleryCanvas`'s rAF camera loop. A WebGL2 plaster wall sits behind it (`PlaygroundPbrWall`), and the crisp `PrintSharpOverlay` is mounted outside the scaled world.

Today, focus is a single boolean per print:
- `focusedPhotoId` changes at the tap;
- React re-renders `FramedPrint` with `focused`, which flips `.focused` / `.is-focused-cell`;
- the focus effect calls `flyTo(target, 720)`.

Every visual consequence of focus hangs off those classes: falloff overlay, z-index, touch 3D context, touch focused shadow, sheen visibility, overlay mount and gyro scope. So they all happen at the tap, while the camera takes 720 ms (research.md, Verified facts).

Constraints:
- **Desktop at rest** (`(pointer: fine)`) must stay pixel- and computed-style-identical. The parity harness is the gate.
- **Touch work per frame:** the `mobile-render-profile` layer and paint budget must hold. That means no new composited layers at rest and no `box-shadow` animation.
- **No WebKit locally:** iOS can't be reproduced here; the device pass is manual (tests.md).
- **Off-limits:** don't touch `playgrounds/`. No new dependencies.

## System Architecture Diagram

```mermaid
sequenceDiagram
  participant UI as PhotoFocusBar / FramedPrint
  participant Store as useWallStore
  participant GC as GalleryCanvas (focus effect)
  participant FP as flightPlan.ts
  participant Loop as rAF camera loop
  participant HO as focusHandoff.ts
  participant Gyro as useGyroTilt controller
  participant DOM as .photo-frame / .album-grid / overlays

  UI->>Store: stepPhoto(+1) / enterPrint / returnOneLevel
  Store-->>GC: focusedPhotoId, viewMode (React render: .focused flips)
  GC->>FP: planFlight(camera, target, viewport)
  FP-->>GC: { kind: pan|arc, durationMs }
  GC->>HO: begin({ outgoing, incoming, printFrom, printTo })
  GC->>Gyro: setHold(true)
  loop every vsync while flight or hand-off active
    Loop->>FP: sampleFlight(plan, t) → camera, e
    Loop->>DOM: world.style.transform
    Loop->>HO: tick(e) / tickRelease(now)
    HO->>DOM: --focus-w on ≤2 frames, --print-w on grid, .is-handoff classes
    Loop->>DOM: overlay wake (opacity = w)
  end
  Loop->>HO: end() when e = 1 and releases done
  HO->>DOM: remove .is-handoff, clear --focus-w, clear outgoing gyro vars
  Loop->>Gyro: setHold(false) on flight end/cancel
  Loop->>DOM: touch settled frame: snapped translate3d(...) scale(s)
```

## Goals / Non-Goals

**Goals:**
- **One clock.** The camera, the focus look, the crisp overlay and the touch dimming all read the same eased progress.
- **Path-scaled flight durations**, and constant-zoom pans for short same-zoom steps.
- **Two-element per-frame work** during a hand-off, using custom properties that feed only `transform` and `opacity`.
- **Gyro tilt** never baselines on, or emits during, a flight.
- **Resting desktop appearance** is unchanged.

**Non-Goals:**
- Per-print proximity weights, or any style writes to non-participants (other than one `--print-w` per focused grid).
- A camera-following spotlight; any change to `computePlaygroundLighting` or the spot texture.
- Blanket `will-change` / `backface-visibility`.
- Restyling the mat bevel borders.
- Changing the entry/Overview framing duration (620 ms), the damped-pan easing (0.24), pinch, or the wheel.
- Changing the desktop hover tilt path (`FramedPrint` mouse handlers).

## Technical Decisions

### D1: A pure `flightPlan.ts` owns timing and sampling
`src/lib/camera/flightPlan.ts` `[NEW]` exports:
- `flightEase(t)`: smoothstep, clamped to `[0, 1]`;
- `zoomPathLength(a, b)`: the van Wijk `S`. `interpolateZoom`'s internals move into a shared helper in `cameraMath.ts`, so the two can never diverge;
- `flightDurationMs(S) = clamp(round(300 + 380·S), 450, 1100)`;
- `planFlight(from, to, viewport, fovDeg) → { kind: 'pan' | 'arc', durationMs }`;
- `sampleFlight(from, to, kind, t) → { camera, eased }`.

A flight is `pan` when `|ln(z1/z0)| ≤ 0.05` and the screen distance at the start zoom is at most 1.5 viewport widths. In pan mode, `z = z0·(z1/z0)^e` and `x`/`y` lerp by `e`.

`flightRef` gains `kind`. The loop calls `sampleFlight` in place of the inline smoothstep plus `interpolateZoom`, at `GalleryCanvas.tsx:317-325`. The focus effect (`:589`) calls `flyTo(target, planFlight(...).durationMs)`. The entry framing (`:548`) keeps 620 ms (its kind still comes from `planFlight`).

*Alternatives:*
- Extend `flyTo` in place: rejected, because it leaves the timing untestable without a DOM.
- Spring physics: rejected, because there's no closed-form duration to share with the hand-off.

### D2: Semantic focus versus visual weight, `focusHandoff.ts`
`src/components/wall/focusHandoff.ts` `[NEW]` is a DOM-agnostic controller, the same shape as `createOverlaySyncScheduler`:

```text
createFocusHandoff(sink: {
  setWeight(photoId, w | null),        // null = clear inline --focus-w + .is-handoff(.is-handoff-cell)
  setPrintWeight(albumId, p | null),   // --print-w on .album-grid[data-album-id]
  onEnd(photoId),                      // outgoing finished: clear deferred gyro vars, unmount its overlay
}, { now, reducedMotion })
  begin({ outgoing, incoming, printFrom, printTo, albumId })
  tick(eased)                          // flight-driven
  cancel()                             // flight cancelled → 160 ms release toward targets
  advance(now) → boolean               // drives releases; true while anything is still animating
  participants() → { photoId, w }[]    // for overlay mounting
```

Rules (spec `print-focus-handoff`):
- Incoming `w = e`. Outgoing `w = w₀·(1 − e)`.
- On re-begin, the previous incoming becomes outgoing with `w₀` equal to its current weight, and the previous outgoing releases over 160 ms.
- A release is `w(t) = w_start + (target − w_start)·flightEase(elapsed/160)`.
- Reduced motion: every target applies immediately.

The sink in `GalleryCanvas` resolves frames with `container.querySelector('.photo-frame[data-photo-id="…"]')`, cached per photo id until disconnected. It writes `style.setProperty('--focus-w', w.toFixed(4))` and skips identical strings.

The loop:
- calls `handoff.tick(eased)` on flight frames, or `handoff.advance(now)` otherwise;
- treats "hand-off active" as not settled (`:385-390`), so the rAF keeps running;
- calls `handoff.cancel()` where `flightRef.current = null` on gestures (`:620`, `:643`).

`begin` runs in the focus effect just before `flyTo`. It uses a `prevFocusRef` holding the last `{ albumId, photoId, viewMode }`:
- album → print: `printFrom 0 → printTo 1`;
- print → print: `1 → 1`;
- print → album: `1 → 0`.

*Alternatives:* CSS transitions with `transition-duration: var(--flight-ms)` and `cubic-bezier(1/3, 0, 2/3, 1)`, the exact smoothstep. Rejected: they start one commit late, can't follow a cancel or retarget, and would still animate `box-shadow` (research.md, Candidate tech).

### D3: CSS keyed on `.is-handoff` + `--focus-w`, resting rules untouched
All new rules apply only under `.is-handoff` / `.is-handoff-cell`, or (touch) through `var(--focus-w, 1)` on `.focused`, where the fallback reproduces today's resting values. So at rest, desktop selectors and computed values are unchanged.

- **Falloff:** `.photo-frame.is-lit.is-handoff::after { opacity: calc(1 - var(--focus-w)); transition: none; }`.
- **Stacking:** `.is-handoff { z-index: 40 }`. The incoming print gets `z-index: 41` from the sink, via the `.is-handoff-in` class.
- **Touch lift** (inside `@media (pointer: coarse)`): `.photo-frame.focused, .photo-frame.is-handoff` take `transform: translateZ(calc(22px + 36px * var(--focus-w, 1))) rotateY(calc(var(--gyro-ry, 0) * var(--focus-w, 1) * 1deg)) rotateX(calc(var(--gyro-rx, 0) * var(--focus-w, 1) * 1deg))`. `.photo-cell.is-handoff-cell` gets the same `perspective` / `preserve-3d` as `.is-focused-cell`.
- **Touch shadow:** two `<span aria-hidden>` layers, `.photo-shadow-rest` and `.photo-shadow-focus`. They're always in the DOM, `display: none` except under `.is-handoff` on coarse. Each carries one static outer `box-shadow` (the outer part of the `.is-lit` resting value and of the `.is-lit.focused` value), with `opacity: calc(1 - w)` and `calc(w)` respectively. Under `.is-handoff` the frame keeps only its inset highlight in `box-shadow`. The values are in design.md.

  The span layers paint inside the frame's stacking context, at `z-index: -1` with `inset` equal to the negative border widths, so their outer shadow matches the frame's border box.
- **Neighbour veil:** `.photo-dim` span, `display: none` on fine pointers. On coarse its opacity is `calc(var(--print-w, 0) * (1 - var(--focus-w, 0)) * <strength>)`. The `.focused` print gets `--focus-w` treated as `1` through a CSS rule (`.photo-frame.focused .photo-dim { opacity: 0 }` when not `.is-handoff`).

### D4: Crisp overlay is per-participant and finds frames by id
- `FramedPrint` adds `data-photo-id` to `.photo-frame`. That's an attribute only, so there's no visual change.
- `PrintSharpOverlay` resolves `.photo-frame[data-photo-id]` in place of `.photo-frame.focused` (`PrintSharpOverlay.tsx:102`).
- It gains a `weightRef` / `getWeight(photoId)` prop. In `sync`, it writes `box.style.opacity = ready ? w : 0` and skips identical values. The `.is-live` class still marks readiness.
- CSS: `.print-sharp-overlay.is-handoff { transition: none }`, with the class mirrored from the frame.
- `GalleryCanvas` renders `participants()`, plus the resting focused print, as overlays keyed by photo id, replacing the single `key={focusedPhotoId}` instance (`:940-948`). The participant list is React state, updated only on `begin` and `onEnd`, never per frame.
- `active` becomes "this photo is the resting focused print in Print Focus, or a participant".
- The scheduler's 300 ms tail and its event wiring are unchanged; the hand-off wakes it through the existing `cameraWakeRef` path.

### D5: Gyro hold and touch custom properties
- **`setHold`:** `createGyroController` gains `setHold(held: boolean)`, and `useGyroTilt` exposes it on `GyroTiltHandle`.
  - While held, `handleReading` returns early;
  - `baseline`, `stillAnchor` and the pending tick are cleared, and the still timer is cancelled.
  - A `setContext` reset while held passes `announce = false`.
- **Callers:** `GalleryCanvas` calls `setHold(true)` in `flyTo`, and `setHold(false)` when the flight ends (`t >= 1`) or is cancelled.
- **Touch writes:** on coarse pointers, `FramedPrint`'s gyro subscription writes `--gyro-rx`, `--gyro-ry` (degrees, unitless), `--tilt-sx`, `--tilt-sy`, and the sheen transform. It no longer writes the full `transform` string. Sheen opacity becomes `calc(0.92 * var(--focus-w, 1))` through CSS, not an inline `'0.92'`.
- **Deferred reset:** `resetGyroStyles` on unsubscribe skips clearing while the frame has `.is-handoff`. The hand-off's `onEnd(photoId)` calls it when the outgoing weight reaches 0.
- **Desktop:** the mouse hover path is unchanged.

### D6: Touch device-pixel settle snap
In `applyCamera(settled)` on coarse pointers:

```text
tx = -camera.x*100*s
ty = camera.y*100*s
transform = translate3d(tx, ty, 0) scale(s)
```

When `settled` is true, `tx` and `ty` are rounded to `1/dpr` CSS px, with `dpr` taken from `viewportRef`. With `transform-origin: 0 0`, this is the same matrix as today's string.

Fine pointers keep the existing string exactly (`GalleryCanvas.tsx:298`). The loop passes `settled` into `applyCamera` on the settle frame.

### D7: Touch portrait padding, dither, label
- **Portrait padding:** `PRINT_PADDING_TOUCH_PORTRAIT = 0.08`, used in the focus effect (`:560-563`) when `coarsePointerRef.current && aspect < 0.9`.
- **Dither:** `PlaygroundPbrWall` adds `uniform float uDither`, set from its existing `coarsePointer` prop. It adds `color += uDither * (ign(gl_FragCoord.xy) - 0.5) / 255.0` after the filmic curve.
- **Label:** `PhotoFocusBar` renders `RETURN<span className="hud-key-hint"> [ESC]</span>`. `hud.css` adds `@media (pointer: coarse) { .hud-key-hint { display: none } }`.

## Risks / Trade-offs

- **Unattributed end-of-flight pop.** The end-of-flight pop has three candidate causes (research.md, Unverified assumptions) → The gyro hold plus the 58 px rest and the overlay crossfade address two of them. The tests.md instrumented device pass attributes the remainder; WebKit's re-raster when `will-change` drops is out of scope unless measured.
- **Span shadows may not match `box-shadow` exactly.** Span-based shadows may differ by sub-pixel anti-aliasing from the frame `box-shadow` at hand-off start and end → They exist only under `.is-handoff` on coarse, so desktop parity is unaffected. Accept up to 1 LSB on touch. Fallback: crossfade only the focused-shadow span over an unchanged frame resting shadow.
- **Custom property writes force style recalc.** Writing `--focus-w` recalcs style for the frame subtree (two frames), and `--print-w` recalcs the grid subtree (about 20 frames) during album↔print flights only → These are bounded and only during flights. Measure on device: if the grid recalc shows up in the Timelines profile, write the veil weight only to the veils.
- **Lingering overlays.** Two overlays can be mounted during print→print → Each is a single `<img>` from the prefetch LRU (`MAX_HELD = 3` covers the outgoing and incoming prints). The outgoing one unmounts at `w = 0`.
- **Flight timing on desktop.** Path-scaled durations change desktop flights (455–1100 ms instead of 720) → The maintainer approved desktop scope. Parity is asserted at rest only.
- **Gyro hold after a cancelled flight.** If a hold is never released (an exception mid-flight), tilt stays off → `setHold(false)` also runs on every settle frame where no flight is active. It's idempotent.
- **Re-entrancy.** The hand-off's `begin` runs inside a React effect while the loop runs in rAF → Both are on the main thread and the controller is synchronous. `begin` must read the current weights, not cached targets (unit-tested).

## Migration & Rollback Plan

- No data, schema or API changes; this is client-only.
- Ship as a single PR. Rollback is reverting the PR.
- Every behaviour has a single seam:
  - `flightPlan.ts`;
  - `focusHandoff.ts` (the sink can be no-op'd, so the classes alone apply as today);
  - the coarse CSS block;
  - `uDither`.

  So a partial revert is mechanical if one piece misbehaves on device.
