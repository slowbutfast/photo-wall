## MODIFIED Requirements

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
