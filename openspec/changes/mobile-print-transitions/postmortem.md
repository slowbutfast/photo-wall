# Postmortem: mobile-print-transitions (reverted, not merged)

**Outcome.** PR #18 was not merged. The maintainer reverted the approach after
iPhone testing on the Versailles preview. The final round reported ghost and
detached photos during NEXT, unchanged mat-corner seams, neighbours that stayed
grey and popped on arrival, and a loss of the tactile depth the inspection view
had before. (The round before it had also reported horizontal tearing while
tilting.) The work is archived at the
tag `archive/mobile-print-transitions` (it contains this document, the PATCH-01
commits that never reached the PR branch, and the evidence harnesses).

`main` is unchanged by this change. Nothing here needs to be reverted on `main`.

## What the change set out to fix

Two maintainer reports, quoted verbatim in `research.md`:

1. Five mobile artifacts during NEXT: end-of-transition pop and trapezoid skew,
   mat-corner seams, shadow flicker and banding, a row-wrap whip, and a framing
   and `RETURN [ESC]` label problem on portrait phones.
2. A stilted cadence: the outgoing print dropped its focused look at the tap,
   the incoming print popped at the end, and neighbour dimming was binary.

## What was attempted

| Area | Change | Where |
| :--- | :--- | :--- |
| Flight timing | Duration from the van Wijk path length `S` (`clamp(300 + 380·S, 450, 1100)`), pan flights at constant zoom for short steps, shared smoothstep easing | `flightPlan.ts` `[NEW]`, `cameraMath.ts` |
| Focus hand-off | The focused look moves between the two participating prints along the flight's eased progress, instead of flipping at the tap | `focusHandoff.ts` `[NEW]`, `GalleryCanvas.tsx`, `wall.css` |
| Crisp overlay | One `PrintSharpOverlay` per participant, opacity following the weight | `PrintSharpOverlay.tsx` |
| Touch lift and shadow | Lift `22 → 58 px` by weight, shadow as two opacity-crossfaded layers | `wall.css`, `FramedPrint.tsx` |
| Gyro | Hold during flights so no baseline is taken on the tap jolt; tilt as `--gyro-*` custom properties | `useGyroTilt.ts`, `FramedPrint.tsx` |
| Seams | Snap the world translation to whole device pixels when settled (touch only) | `GalleryCanvas.tsx` |
| Banding | Interleaved-gradient-noise dither in the wall shader (coarse only) | `PlaygroundPbrWall.tsx` |
| Framing and label | Portrait Print Focus padding `0.14 → 0.08`, `[ESC]` hint hidden on touch | `GalleryCanvas.tsx`, `PhotoFocusBar.tsx`, `hud.css` |
| Neighbour dimming | `.photo-dim` veil, `0.38 · p · (1 − w)`, touch only | `FramedPrint.tsx`, `wall.css` |

Commits on the archived branch, in order:

- `425323b` feat(print-focus): continuous hand-off and path-scaled flights (PR #18 head)
- `8244f1d` fix: wake every crisp overlay, restore resting glare, sync overlay in the camera frame
- `bfb73c1` fix: hand off along Overview flights and release the print weight smoothly
- `afe7ea7` fix: remove the transparent veil from the resting focused 3D frame
- `930b645`, `61cd9f7` docs: PATCH-01 record and probe evidence

The last four were written after the first iPhone round and **never pushed to
the PR branch**, so the preview the maintainer tested last was `425323b`, without
them.

## Visual evidence

Captured with `parity/overlay-screenshots.mjs`: Playwright Chromium, coarse
emulation (393×852, dpr 2, touch), Print Focus on the `?demo=4` fixture, then
NEXT, with the page clock slowed 10× so each screenshot lands at a known point
of the 455 ms flight. Offsets in the file names are real flight milliseconds.
**These are Chromium frames, not the maintainer's iPhone recording.** They show
the frozen-overlay bug, which reproduces in Chromium. They do not show the
WebKit-only problems.

| Flight offset | PR head `425323b` | PATCH-01 |
| :--- | :--- | :--- |
| ~220 ms | [`pr18-next-221ms.png`](evidence/pr18-next-221ms.png): a landscape photo with no mat or frame floats in the middle of the wall, overlapping both neighbouring frames | [`patch-next-223ms.png`](evidence/patch-next-223ms.png): a clean pan, nothing floating |
| ~390 ms | [`pr18-next-392ms.png`](evidence/pr18-next-392ms.png): the same mat-less landscape copy of the **outgoing** print sits on top of the **incoming** portrait frame, with a second offset ghost edge behind the window | [`patch-next-392ms.png`](evidence/patch-next-392ms.png) |
| settled | [`pr18-next-593ms.png`](evidence/pr18-next-593ms.png): clean again; the ghost only disappears when the hand-off ends | [`patch-next-598ms.png`](evidence/patch-next-598ms.png) |

This matches the maintainer's recording: the orange-jacket photo detaching from
its frame during the row wrap, and a translucent duplicate bleeding past the mat
on every horizontal NEXT.

Numbers (`parity/overlay-follow-report.json`, coarse emulation, every
animation frame of a NEXT):

| Metric | PR head | PATCH-01 |
| :--- | :--- | :--- |
| Worst overlay-to-photo-window IoU, at overlay opacity 1 | 0.15–0.20 | 0.997 |
| Frames below 0.9 IoU | 9 of 66 | 0 of 68 |
| `--print-w` and lit neighbour veils left after leaving via Overview | `1.0` and 12 | cleared and 0 |

## Why it did not work

**1. The first verification measured the wrong thing.** The parity harness
compared computed styles and screenshots at rest. 21/21 desktop states at 0 px
looked conclusive, but the bug lived in *where a crisp layer sat during a
flight*. Nothing sampled that. The overlay position metric above is cheap and
would have caught it on day one.

**2. The hand-off multiplied a fragile mechanism.** `PrintSharpOverlay` mirrors
a DOM frame's transform into a separate layer on every camera frame. Before this
change there was one overlay and it was mounted for the whole of Print Focus.
The hand-off needs two at once, which exposed a single-slot wake registry: the
newer overlay replaced the older one, which then froze on screen. That is the
ghost and the floating photo. It was fixed in PATCH-01 (`Set` registry,
immediate sync), but by then the PR had already gone to the preview.

**3. The remaining problems are WebKit compositing, and the loop was blind.**
There is no WebKit or iPhone in the development environment. Mat-corner seams,
the horizontal tearing while tilting, and the compositor-level pop could only be
judged by the maintainer on a device, one preview build at a time. Each round
fixed what Chromium could show and left the rest unconfirmed. The seam hypothesis
(sub-pixel translation) was tested by the settle snap and did not work. The
tearing candidate (a transparent `.photo-dim` coplanar with the photo window in a
`preserve-3d` context) was a guess that never got a device check.

**4. A claim in the review feedback was wrong.** The final iPhone feedback said
the PR removed the 3D tilt and the dynamic shadow. A gyro probe
(`parity/gyro-tilt-probe.mjs`: synthetic readings on `main`, the PR head and
PATCH-01) found rotation (0.083), resting depth and tilt-driven shadow identical
on all three. The real regression was smaller and different: the focused glare
stayed at 0.44 instead of lifting to 0.92, because the gyro's inline sheen
opacity was removed. A print that tilts with no glare moving across it reads as
flat, which is probably what was seen. `main` also had a binary pop that the PR
did improve: 236 single-frame opacity steps through a NEXT on `main`, against 12
(a smooth ramp) on the PR.

**5. Scope outran what could be verified.** Eleven changes shipped together
(timing, hand-off, overlay, gyro, snap, dither, padding, label, veil, shadow
layers, flight kinds). When the iPhone showed artifacts, there was no way to
attribute them to one change without bisecting by hand on a device.

## What stayed unresolved

- Mat-corner diagonal seams (present at rest, on `main` too).
- Horizontal tearing while tilting on iOS Safari.
- Neighbour "gray tint then pop" on arrival, on WebKit.
- The end-of-flight pop attribution (`?debugHandoff=1`, never run on a device).
- Pinching out of Print Focus never leaves Print Focus (`viewMode` is not tied to
  zoom). Unrelated to this change and present on `main`.

## If this is attempted again

- **Start from the device.** Reproduce each artifact on the iPhone first with
  the `?debugHandoff=1` ring buffer, and add the overlay-geometry check and the
  gyro probe from this branch to the harness before touching anything.
- **Ship in slices that can be reverted independently.** The flight timing
  (`flightPlan.ts`, pure and fully unit-tested, measured 455 / 746 / 849 ms for
  adjacent, 4-column and 5-column wraps) has no dependency on the overlay or the
  hand-off and is the most defensible piece on its own.
- **Do not duplicate the crisp overlay.** Hide it at the tap and bring it back
  once the camera lands, instead of crossfading two live overlays.
- **Facts worth keeping** (all in `research.md` and `design.md`): desktop's
  focused shadow equals its resting shadow because `.photo-frame.is-lit` outranks
  `.focused` by source order, so a shadow crossfade only matters on touch; and
  `touchAudit` pins `transform-style: preserve-3d` on the focused frame.

## Reproducing the evidence

```bash
# build and serve the two commits (STORAGE_DRIVER=local, never a remote DB)
SHOT_TARGETS="pr18=http://127.0.0.1:3141,patch=http://127.0.0.1:3142" \
SHOT_OUT=openspec/changes/mobile-print-transitions/evidence \
PARITY_MODULE=<playwright-core>/index.js \
node openspec/changes/mobile-print-transitions/parity/overlay-screenshots.mjs

OVERLAY_TARGETS="pr18=...,patch=..." node .../parity/overlay-follow.mjs
PROBE_TARGETS="main=...,pr18=...,patch=..."  node .../parity/gyro-tilt-probe.mjs
```
