## Why

Stepping through prints with PREV/NEXT feels mechanical, and on iPhone Safari it shows five rendering artifacts (research.md, Source material).

The cadence problem comes from the **semantic focus** classes flipping at the tap, while the camera takes a fixed 720 ms to arrive:
- The outgoing print loses its focused look while it's still centred.
- The incoming print gains it while it's still an off-centre sliver.

The fixed duration also turns a row-wrap NEXT into a 13.5 viewport-widths/s whip with a 57% zoom-out (research.md, Verified facts).

The work is scoped now because the maintainer has started an animation cleanup and made the four scoping decisions (research.md, maintainer decisions).

## What Changes

**Flight timing (desktop + touch)**
- Every focus **flight** (album, print, PREV/NEXT, RETURN) derives its duration from the van Wijk **path length `S`**: `clamp(300 + 380·S, 450, 1100)` ms. That's 455 ms for an adjacent step and 849 ms for a 5-column wrap. The entry framing keeps 620 ms.
- Short same-zoom steps become **pan flights**: zoom stays constant and x/y follow the eased progress. Long or zoom-changing flights stay **arc flights**.
- One shared easing, `flightEase` (smoothstep), drives the camera and every hand-off quantity.

**Focus hand-off (desktop + touch)**
- The visual focused look moves from the outgoing to the incoming print through a **focus weight `w`** (`--focus-w`), driven by flight progress. Only the **participants** (at most two prints) animate.
- `.focused` / `focusedPhotoId` still change at the tap for click routing, ARIA, LOD and gyro scope.
- On desktop, the hand-off carries:
  - the light falloff overlay opacity;
  - the crisp overlay crossfade (`PrintSharpOverlay` stays mounted for the outgoing print until `w = 0`);
  - z-order.
- On touch it also carries lift (`translateZ 22→58px`), the focused shadow (opacity crossfade of pre-rendered shadow layers), the gyro tilt, and the sheen.
- A gesture that cancels a flight finishes the hand-off over 160 ms instead of snapping.
- Resting appearance at `w ∈ {0, 1}` is unchanged on desktop: **0-px parity at rest**.

**Touch only (`(pointer: coarse)`)**
- **Gyro hold:** no baseline capture and no tilt during a flight. The baseline is taken from the first valid reading after settle, not from the tap jolt.
- The focused print rests at `translateZ(58px)` in CSS, so the gyro's first emit no longer changes its size.
- **Device-pixel settle snap** of the world translation on the settled frame, so mat corners are crisp at rest.
- ½-LSB interleaved-gradient-noise dither in the wall fragment shader.
- Portrait (`aspect < 0.9`) Print Focus padding `0.08` instead of `0.14`, so the print fills about 84% of the limiting axis.
- **Neighbour dimming**: wire up `zoomTierStyle('print').focusDimming` as an opacity veil over non-participant prints, ramped by the **Print Focus weight `p`**.
- The Photo Focus bar reads `RETURN` (the `[ESC]` hint is hidden by CSS).

**Not changing**
- No blanket `will-change`/`backface-visibility`.
- No per-print proximity weights.
- No camera-following spotlight (research.md, Raised but not acted on).

## Capabilities

### New Capabilities
- `print-focus-handoff`: the flight-progress-driven transfer of the focused look between prints. It covers participants, focus weight, interruption, crisp-overlay crossfade, touch lift/shadow/tilt continuity, and touch neighbour dimming.

### Modified Capabilities
- `spatial-camera-navigation`: "Arced fly-to transitions and bottom-inset-aware framing" now specifies path-scaled duration, pan versus arc flights, the shared easing, touch portrait print padding, and the touch device-pixel settle snap.
- `instanced-photo-renderer`: "Coarse-pointer gyroscope rotational glare and physical print-focus tilt" now has its baseline captured after the flight settles (gyro hold) and a `translateZ(58px)` resting lift.
- `gallery-hud-and-curator-ui`: "Unobtrusive Photo Focus bar…" now reads `RETURN` on coarse pointers and `RETURN [ESC]` on fine pointers.
- `3d-pbr-wall-and-lighting`: ADDED a touch-only wall dither requirement.

## Impact

- **Code:**
  - `src/lib/camera/flightPlan.ts` `[NEW]`;
  - `src/lib/camera/cameraMath.ts` (export the path length);
  - `src/components/wall/focusHandoff.ts` `[NEW]`;
  - `GalleryCanvas.tsx` (flight loop, `flyTo` callers, `applyCamera` snap, hand-off wiring, overlays, padding);
  - `FramedPrint.tsx` (data attribute, gyro writes custom properties on touch, deferred reset, dim veil);
  - `PrintSharpOverlay.tsx` (locates the frame by photo id; weight-driven opacity);
  - `useGyroTilt.ts` (`setHold`);
  - `PlaygroundPbrWall.tsx` (`uDither`);
  - `PhotoFocusBar.tsx`;
  - `wall.css`, `hud.css`.
- **Tests:** new unit suites for the flight plan and the hand-off controller; extended gyro and overlay suites; CSS source audits. The desktop parity harness compares resting states only.
- **Performance:** per-frame work during a hand-off is custom-property writes on two frames plus `opacity`/`transform` changes. There are no new compositing layers at rest, and no `box-shadow` animation.
- **Dependencies:** none.
- **Risk:** iOS behaviour can't be reproduced locally (no Playwright WebKit). The end-of-flight pop has three candidate causes, and the on-device instrumented pass in tests.md attributes it.
