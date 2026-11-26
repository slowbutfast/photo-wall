## ADDED Requirements

### Requirement: Focused look is handed off by flight progress, not by the focus class flip
`GalleryCanvas` SHALL decouple the **semantic focus** from the **visual focused look**. The semantic focus is `focusedPhotoId`, `.focused` / `.is-focused-cell`, tier, LOD, click routing and gyro scope; it still changes at the tap. The visual focused look SHALL be transferred between prints by a **focus hand-off** driven by the eased progress `e = flightEase(t)` of the camera flight started for that focus change.

**Participants and weights**
- A hand-off has at most two **participants**: the **outgoing** print (focused before the change, if any) and the **incoming** print (focused after it, if any).
- Each participant carries a **focus weight `w` ∈ [0, 1]**, written every camera frame as the inline custom property `--focus-w` on its `.photo-frame`.
- **Incoming:** `w = e`.
- **Outgoing:** `w = w₀ · (1 − e)`, where `w₀` is its weight when the hand-off began. `w₀` is `1` for a resting focused print.

**Participant classes**
- While a hand-off runs, each participant SHALL carry `.is-handoff` on its `.photo-frame` and `.is-handoff-cell` on its `.photo-cell`.
- When `e` reaches `1`, the hand-off SHALL end. It removes those classes and the inline `--focus-w`, after which the resting `.focused` / unfocused CSS applies unchanged.

**What follows `w`**
- No other print SHALL receive per-frame style writes from the hand-off.
- While `.is-handoff` is present, these SHALL follow `w` with no CSS transition:
  - the light falloff overlay: `.photo-frame.is-lit::after` opacity `= 1 − w`;
  - the crisp overlay opacity: `= w` once its image is decoded;
  - stacking: participants sit above non-participants, and the incoming print sits above the outgoing one.
- The resting look at `w = 1` SHALL be computed-style-identical to the resting `.focused` look, and at `w = 0` to the resting unfocused look.

**Flight shapes covered**
- Album → print: incoming only.
- Print → print (PREV/NEXT): both participants.
- Print → album (RETURN): outgoing only.

#### Scenario: NEXT hands the focused look across during the flight
- **WHEN** a visitor in Print Focus taps NEXT and the camera is at eased progress `e = 0.5`
- **THEN** the outgoing frame SHALL have `--focus-w: 0.5` and falloff opacity `0.5`, the incoming frame SHALL have `--focus-w: 0.5` and falloff opacity `0.5`, and no other `.photo-frame` SHALL carry `--focus-w` or `.is-handoff`

#### Scenario: The outgoing print keeps its focused look at the tap
- **WHEN** NEXT is tapped and the first camera frame of the flight renders
- **THEN** the outgoing print's falloff opacity SHALL be `≤ 0.05`, its crisp overlay SHALL still be mounted and opaque, and on coarse pointers its lift and focused shadow SHALL be unchanged from rest

#### Scenario: The incoming print arrives fully focused when the camera lands
- **WHEN** the flight's last frame renders (`t = 1`)
- **THEN** the incoming print's falloff opacity SHALL be `0`, its crisp overlay opacity `1` (if decoded), and the following camera-settle frame SHALL produce no further change in its computed transform, falloff opacity, overlay opacity or shadow-layer opacities

#### Scenario: Resting desktop states are pixel-identical to main
- **WHEN** the desktop parity harness captures Overview, Album Focus, Print Focus and hovered states at rest on a `(pointer: fine)` `1440×900` viewport
- **THEN** screenshots and `.photo-frame` / `.print-sharp-overlay` computed styles SHALL have `0` diffs against `main`

### Requirement: Interrupted and overlapping hand-offs never snap
**Cancelled flight**
- **WHEN** a camera flight is cancelled by a drag, pinch or wheel gesture,
- **THEN** its hand-off SHALL complete toward its target weights (incoming → 1, outgoing → 0) over `160 ms` using `flightEase`, driven by the camera rAF loop. The loop SHALL keep running until the hand-off ends.

**New focus change mid-hand-off**
- **WHEN** a new focus change starts a new flight while a hand-off is still running:
  - the previous incoming print SHALL become the new outgoing print, with `w₀` equal to its current weight;
  - any previous outgoing print with `w > 0` SHALL release to `0` over `160 ms`.
- At no point SHALL any participant's weight change by more than `0.25` between two consecutive camera frames, except at `prefers-reduced-motion: reduce`.

**Reduced motion**
- **WHEN** `prefers-reduced-motion: reduce` is active,
- **THEN** weights SHALL jump directly to their targets on the first frame. This is the same instant behaviour as before this change.

#### Scenario: Dragging mid-flight completes the hand-off smoothly
- **WHEN** a visitor taps NEXT and starts a drag at `e = 0.3`
- **THEN** the incoming weight SHALL rise from `0.3` to `1` and the outgoing weight fall from `0.7` to `0` over `160 ms ± 1 frame`, with no single-frame step larger than `0.25`

#### Scenario: Rapid double NEXT re-targets without a jump
- **WHEN** NEXT is tapped twice, the second time at `e = 0.6` of the first flight
- **THEN** the first incoming print SHALL continue from `w = 0.6` as the new outgoing print, the original outgoing print SHALL release from `0.4` to `0` over `160 ms`, and the third print SHALL start from `w = 0`

### Requirement: Crisp overlay crossfades with the hand-off
`PrintSharpOverlay` SHALL locate its frame by photo id (`.photo-frame[data-photo-id="<id>"]`), not by `.photo-frame.focused`.

**Instances**
- `GalleryCanvas` SHALL mount one overlay per participant, keyed by photo id, while a hand-off runs. At rest it mounts exactly one overlay, for the focused print in Print Focus.
- An outgoing participant's overlay SHALL stay mounted until its weight reaches `0`. This includes RETURN to Album Focus, where the tier flips at the tap.

**Opacity**
- An overlay's opacity SHALL be `w` once its image is decoded, and `0` before that.
- While its frame carries `.is-handoff`, the existing `0.14 s` opacity transition SHALL NOT apply.
- The existing event-driven sync and its `300 ms` settling tail are unchanged.

#### Scenario: Outgoing print stays sharp while it leaves
- **WHEN** NEXT is tapped in Print Focus
- **THEN** the outgoing print's overlay SHALL remain mounted and track its frame until the outgoing weight reaches `0`, and SHALL unmount on the frame after that

#### Scenario: RETURN fades the crisp overlay with the zoom-out
- **WHEN** RETURN is pressed in Print Focus
- **THEN** the overlay SHALL stay mounted during the print → album flight with opacity equal to the outgoing weight, and SHALL unmount when the hand-off ends

### Requirement: Coarse-pointer lift, focused shadow, tilt and sheen follow the focus weight
On `(pointer: coarse)` the following SHALL be driven by `--focus-w`, using only `transform` and `opacity` changes per frame.

**Lift**
- `.photo-frame.focused` and `.photo-frame.is-handoff` SHALL use `translateZ(calc(22px + 36px · w))`, so `58px` at rest when focused.
- They SHALL be composed with the gyro rotation: `rotateY(--gyro-ry · w)` and `rotateX(--gyro-rx · w)`.
- `.photo-cell.is-handoff-cell` SHALL keep `perspective` and `preserve-3d` like `.is-focused-cell`, so the outgoing print does not flatten mid-flight.

**Focused shadow**
- During a hand-off, the participant's outer shadow SHALL move from its `box-shadow` to two pre-rendered shadow layers inside the frame: the resting directional shadow at opacity `1 − w` and the focused shadow at opacity `w`.
- At rest the shadow layers SHALL be hidden, and the frame's `box-shadow` SHALL be exactly the current `.is-lit` / `.is-lit.focused` value.

**Tilt and sheen**
- The gyro's sheen opacity SHALL be multiplied by `w`.
- The outgoing print's gyro-written custom properties SHALL NOT be cleared until its hand-off ends, so its tilt unwinds with `w` instead of snapping to zero at the tap.

**Box shadows**
- No `box-shadow` value SHALL change between consecutive frames of a hand-off.

#### Scenario: Outgoing print sinks back during the flight on touch
- **WHEN** a coarse-pointer visitor taps NEXT and the flight reaches `e = 0.5`
- **THEN** the outgoing frame's computed transform SHALL be equivalent to `translateZ(40px)` with rotation scaled by `0.5`, its focused-shadow layer opacity SHALL be `0.5`, and its cell SHALL still have `perspective` and `preserve-3d`

#### Scenario: Hand-off frames repaint no box shadows
- **WHEN** consecutive camera frames of a coarse-pointer hand-off are sampled
- **THEN** the computed `box-shadow` of every `.photo-frame` and shadow layer SHALL be identical between the frames, and only `--focus-w`, `opacity` and `transform` values SHALL differ

### Requirement: Coarse-pointer neighbour dimming in Print Focus
On `(pointer: coarse)`, `zoomTierStyle('print').focusDimming` SHALL be honoured.

**The veil**
- Each `FramedPrint` SHALL render a `.photo-dim` veil inside its frame. It's `display: none` on fine pointers.
- Its opacity SHALL be `p · (1 − w)`:
  - `p` is the **Print Focus weight**, written as `--print-w` on the focused album's `.album-grid`;
  - `w` is the frame's focus weight (`0` for non-participants, `1` for the resting focused print).

**The Print Focus weight `p`**
- `p` SHALL ramp `0 → 1` with `e` on an album → print flight.
- It SHALL ramp `1 → 0` on a print → album flight.
- It SHALL stay `1` during print → print flights and at rest in Print Focus.
- It SHALL be `0` (or absent) outside Print Focus.

The veil colour and strength are defined in `design.md`.

#### Scenario: Neighbours dim on entering Print Focus and stay dim through NEXT
- **WHEN** a coarse-pointer visitor taps a print from Album Focus, waits for the flight to settle, then taps NEXT
- **THEN** non-participant prints' veils SHALL ramp from `0` to full strength during the first flight and remain at full strength during the NEXT flight, while the outgoing veil fades in as `1 − w` and the incoming veil fades out as `w`

#### Scenario: Desktop has no dimming veil
- **WHEN** Print Focus renders on a `(pointer: fine)` browser
- **THEN** every `.photo-dim` SHALL compute `display: none`
