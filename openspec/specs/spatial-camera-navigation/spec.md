# spatial-camera-navigation Specification

## Purpose
Provides deterministic, aspect-aware 3D camera navigation in world units (`100px = 1 unit`, `zClamp = [2.4, 140.0]`) including clamped cursor-anchored zooming, `bottomInsetPx`-aware framing, arced fly-to transitions, and desktop/mobile input handling.
## Requirements

### Requirement: Clamped cursor-anchored zoom and damped panning
Zooming via wheel, trackpad pinch, or mobile two-finger pinch SHALL clamp camera `z` within `[2.4, 140.0]` using `cameraMath.ts`, keep the world point under the cursor stationary (within floating-point epsilon) for the effective clamped zoom factor, derive CSS scale via `cameraToCssScale`, and drive both `.world` 2D CSS transform (`cssTop = -worldY * 100`) and `PlaygroundPbrWall` WebGL2 uniforms in lockstep each frame (idle-stopping when stationary). Initial load and clicking `Overview` (or pressing `0`, even when already in `'overview'` after manual pan/zoom via `overviewNonce`) SHALL use aspect-aware Row-0 framing (`3 / 2 / 1` albums horizontally by viewport aspect ratio + `bottomInsetPx`), SHALL NOT re-fire on window resize or manifest refresh, and Tab focus SHALL NOT scroll the `overflow: hidden` viewport.

#### Scenario: Zooming toward a print keeps it under the cursor
- **WHEN** a user zooms in or out while holding the cursor over a specific point on the wall
- **THEN** the world coordinates under the cursor before and after the effective clamped zoom step SHALL remain invariant within epsilon

#### Scenario: Initial load and Overview/0 frame Row 0 aspect-aware without re-firing on resize
- **WHEN** a visitor loads on desktop (3 albums) or a 390px phone (1 album), pans/zooms away, and clicks `Overview` or presses `0`
- **THEN** the camera SHALL fly back to aspect-aware Row 0 above `bottomInsetPx`, and subsequent window resizes or manifest refreshes SHALL NOT yank the user's current camera position

### Requirement: Default entry view frames the first row of three albums horizontally
On initial load (and when triggering `Overview` / `0`), the camera SHALL compute the horizontal bounding box of **row 0** (the first up to 3 published albums across the top row of the 3-column wall) via `computeFirstRowBounds(placements)` and fit those 3 albums comfortably across the viewport width with margin—rather than zooming out to show the entire wall at once. Visitors SHALL remain free to pan down through subsequent rows or zoom out to macro view (`zClamp[1] = 140.0`) at any time.

#### Scenario: Initial load frames row 0 horizontally instead of all 50 albums
- **WHEN** a visitor opens a gallery containing 12 or 50 published albums
- **THEN** the initial camera SHALL frame the first row (albums 1–3) fitting horizontally across the viewport width starting at row 0, leaving lower rows naturally below the fold to pan into or zoom out toward

### Requirement: Arced fly-to transitions and bottom-inset-aware framing
Flying between distant exhibitions or into an individual print SHALL follow a smooth van Wijk–Nuij `interpolateZoom` trajectory and compute target `z` and `y` against both horizontal and vertical FOV, lifted print plane `z = 0.54`, and `bottomInsetPx` (bottom focus bar + mobile safe area).

**Duration.** Every focus flight (Album Focus, Print Focus, PREV/NEXT, RETURN) SHALL derive its duration from the van Wijk–Nuij path length `S` between the current camera and the target:

`durationMs = clamp(round(300 + 380 · S), 450, 1100)`

where `S = (r1 − r0) / ρ` with `ρ = √2`, or `|ln(z1 / z0)| / ρ` when the centres coincide. The initial entry / Overview framing SHALL keep its fixed `620 ms`.

**Pan versus arc flights.** A flight SHALL be a **pan flight** when both of these hold:
- `|ln(z1 / z0)| ≤ 0.05`;
- the screen-space distance between the centres is at most `1.5` viewport widths, measured at the starting zoom.

A pan flight keeps zoom constant: `z` interpolates geometrically, and `x`/`y` interpolate linearly by the eased progress. Every other flight SHALL be an **arc flight** sampled with `interpolateZoom`.

**Easing.** Both kinds SHALL use one shared easing, `flightEase(t) = t²(3 − 2t)`. The focus hand-off (`print-focus-handoff`) reads the same eased progress.

**Touch portrait print padding.** On `(pointer: coarse)` with viewport aspect `< 0.9`, Print Focus framing SHALL use padding `0.08` instead of `0.14`, so the print fills `84%` of the limiting axis. Desktop and landscape touch keep `0.14`.

**Device-pixel settle snap.** On `(pointer: coarse)`, the world transform SHALL be written as `translate3d(tx, ty, 0) scale(s)`, which is the same matrix as the existing `scale(s) translate3d(…)` with `transform-origin: 0 0`. On the settled frame, `tx` and `ty` SHALL be rounded to the nearest `1 / devicePixelRatio` CSS px. Fine pointers SHALL keep the existing transform string byte-for-byte.

#### Scenario: Landscape print fits above bottom focus bar on portrait mobile screen
- **WHEN** a user on a portrait mobile viewport clicks a wide landscape print
- **THEN** the camera SHALL frame the lifted print cleanly within horizontal and vertical bounds above `bottomInsetPx`

#### Scenario: Flight duration scales with path length
- **WHEN** NEXT steps to the adjacent print (`S ≈ 0.41`) versus wrapping from the end of a 5-column row to the next row (`S ≈ 1.45`) at the same zoom
- **THEN** the adjacent flight SHALL last `455 ms ± 1` and the wrap `849 ms ± 1`, and no flight SHALL be shorter than `450 ms` or longer than `1100 ms`

#### Scenario: Adjacent same-zoom step pans without zooming
- **WHEN** a flight's endpoints share `z` and lie `0.92` viewport widths apart
- **THEN** every sampled camera state SHALL have `z` equal to the start `z` within `1e-9`, and `x`/`y` SHALL equal `from + flightEase(t) · (to − from)`

#### Scenario: Row wrap keeps the arc
- **WHEN** a flight's endpoints share `z` but lie `3.81` viewport widths apart
- **THEN** the flight SHALL be an arc flight whose samples equal `interpolateZoom(from, to, flightEase(t))`

#### Scenario: Portrait touch Print Focus fills 84% of the width
- **WHEN** a coarse-pointer visitor on a `393×852` viewport focuses a landscape print
- **THEN** the target camera SHALL be computed with padding `0.08`, and the same action on a fine pointer SHALL still use `0.14`

#### Scenario: Touch world translation lands on device pixels at rest
- **WHEN** a coarse-pointer flight or gesture settles on a `dpr = 3` device
- **THEN** the world transform's translation components SHALL be integer multiples of `1/3` CSS px, while a fine-pointer browser's world transform string SHALL be identical to the pre-change format

### Requirement: Input conventions and editable-element guard
The camera controller SHALL support Figma-style wheel/pinch input (plus Safari `gesturechange`), mobile touch gestures (`touch-action: none`), and keyboard shortcuts (`Esc`, `0`, `ArrowLeft`, `ArrowRight`, `WASD`) while ignoring shortcuts whenever focus is inside an editable input.

#### Scenario: Typing in admin rename input does not move camera
- **WHEN** an admin types characters into an album title input field
- **THEN** keyboard navigation shortcuts (`WASD`, `Arrows`, `0`) SHALL NOT trigger camera movement


### Requirement: Two-finger pinch zooms and pans together, and never zooms the page
While two touch pointers are down on the wall and the camera is unclamped, the camera SHALL zoom by the ratio of the current and previous finger distance, anchored at the current midpoint, and in the same frame pan by the midpoint's screen-space movement since the previous move, so the world point under the fingers stays under the fingers.

When one finger lifts, the gesture SHALL continue as a one-finger pan from the remaining finger's current position, with no jump.

The browser's own page pinch-zoom SHALL NOT occur over the wall on iOS Safari or Android Chrome.

#### Scenario: Pinch while sliding pans the wall
- **WHEN** a visitor pinches outward while moving both fingers 120px to the right while the camera is unclamped
- **THEN** the wall SHALL zoom in about the moving midpoint and translate 120px to the right on screen, so the content under the midpoint stays under it

#### Scenario: Pure pinch keeps zoom-only behaviour
- **WHEN** a visitor pinches with a stationary midpoint
- **THEN** the camera SHALL zoom about that midpoint with no net pan, identical to today

#### Scenario: Lifting one finger hands off to a one-finger pan
- **WHEN** a visitor lifts one finger mid-pinch and keeps dragging the other
- **THEN** panning SHALL continue from that finger's current position without a jump, and a click SHALL NOT fire on release

#### Scenario: Page zoom is suppressed over the wall
- **WHEN** a visitor pinches on the wall on iPhone Safari
- **THEN** only the gallery camera SHALL zoom; the page's visual viewport SHALL stay at scale 1
