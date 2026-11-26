# Patch: mobile-print-transitions

Implementation summary for the reviewer. Planning artifacts are in
`research.md`, `proposal.md`, `architecture.md`, `design.md`, `tests.md` and
`tasks.md`; empirical results are in `verification.md`.

## What landed

### Flight timing (vertical slice)

- `src/lib/camera/cameraMath.ts` — `zoomPathParams(a, b)` extracts the van Wijk
  `r0`/`r1`/`S`/`d1` computation. `interpolateZoom` is refactored onto it and
  keeps its output bit-identical (`cameraMath.test.ts` unchanged and green).
  `snapToDevicePixel(value, dpr)` is the settle-snap helper.
- `src/lib/camera/flightPlan.ts` `[NEW]` — `flightEase`, `zoomPathLength`,
  `flightDurationMs`, `planFlight` (pan vs arc), `sampleFlight`. Pan requires
  `|ln(z1/z0)| ≤ 0.05` and ≤ 1.5 viewport widths at the start zoom.
- `GalleryCanvas` — flights carry `kind`, sample through `sampleFlight`, derive
  the duration from `planFlight(...).durationMs` (the 620 ms entry framing is
  unchanged), and use `PRINT_PADDING_TOUCH_PORTRAIT = 0.08` on coarse portraits.

### Focus hand-off (vertical slice)

- `src/components/wall/focusHandoff.ts` `[NEW]` — `createFocusHandoff`, the
  `begin`/`tick`/`cancel`/`advance`/`participants` controller with the 160 ms
  release, re-begin from current weights, reduced-motion instant targets, and
  identical-tick write skipping.
- `GalleryCanvas` — DOM sink (frames cached by `[data-photo-id]`, identical
  values skipped), `prevFocusRef`, `begin` before `flyTo`, tick/advance in the
  rAF loop, `cancel` on gesture cancels, hand-off counted as "not settled", and
  one `PrintSharpOverlay` per participant plus the resting focused print.
- `FramedPrint` — `data-photo-id`, the two shadow spans and the `.photo-dim`
  veil; coarse gyro writes `--gyro-rx`/`--gyro-ry` and the sheen opacity is
  composed in CSS.
- `PrintSharpOverlay` — looks up its frame by photo id, takes `getWeight`, writes
  `opacity = ready ? w : 0`, mirrors `.is-handoff`, and mirrors the coarse sheen
  from computed style.
- `wall.css` — `.is-handoff` stacking, falloff `1 − w`, coarse lift/rotation,
  cell perspective, static shadow-span crossfade, inset-only frame shadow during
  the hand-off, sheen `0.92 · w`, neighbour veil `0.38 · p · (1 − w)`, and the
  overlay transition disabled during the hand-off.

### Touch-only fixes

- `useGyroTilt` — `setHold` on the controller and handle; readings are dropped,
  no baseline is captured, the still-timer/recentre/glide are cancelled, and a
  focus change while held does not announce zero. `GalleryCanvas` holds on
  flight start and releases on flight end, cancel, and every settled frame.
- `PlaygroundPbrWall` — `uDither` uniform and the ±0.5/255 IGN term after the
  filmic curve (desktop passes `0`).
- `PhotoFocusBar` + `hud.css` — `RETURN<span class="hud-key-hint"> [ESC]</span>`
  hidden on coarse pointers by CSS only.
- `handoffDebug.ts` `[NEW]` — dev-only `?debugHandoff=1` ring buffer (flight,
  gyro, overlay readiness, will-change, weights), folded out of production.

## Deliberate deviations from the plan (all justified)

1. **No `.is-handoff-in` class.** Stacking uses `.is-handoff` (`z-index: 40`) and
   `.is-handoff.focused` (`z-index: 41`). The incoming print is the semantically
   focused one, so the class would duplicate state the DOM already has.
2. **`.hud-key-hint { display: contents }` outside the coarse query.** The return
   button is `inline-flex` with `gap: 6px`; a span child becomes a second flex
   item and grows the desktop label by the gap, which shifted the centred Photo
   Focus info by ~2 px. `display: contents` keeps the text run contiguous, so
   desktop parity is 0 px / 0 computed-style diffs. Coarse pointers still hide it.
3. **Peak-speed guard metric.** `flightPlan.test.ts` samples the camera centre
   at each sample's own zoom and compares the old fixed 720 ms arc with the new
   plan: 9.34 → 7.91 viewport widths/s. The research note's absolute figures
   (13.5 → 5.7) came from a slightly different apparent-speed metric; the guard
   asserts the relative drop plus the fixed bounds, and 5-column-wrap duration
   from the real 3.81-viewport geometry is 850 ms (±1 of the 849 fixture).
4. **Settle-snap evidence in the browser.** Chrome serialises `transform` to six
   significant digits, so a 1/3-px translation reads back as `2170.67`. The
   parity harness checks the nearest-device-pixel distance with a 0.02 px
   tolerance, and `snapToDevicePixel` is unit-tested directly.

## Not changed

No data model, DB, storage, API, auth or env file. `src/lib/db` and
`src/app/api` are untouched. No new dependencies. No `will-change` /
`backface-visibility` on frames or cells; no animated `box-shadow`.
