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

#### Scenario: Landscape print fits above bottom focus bar on portrait mobile screen
- **WHEN** a user on a portrait mobile viewport clicks a wide landscape print
- **THEN** the camera SHALL frame the lifted print cleanly within horizontal and vertical bounds above `bottomInsetPx`

### Requirement: Input conventions and editable-element guard
The camera controller SHALL support Figma-style wheel/pinch input (plus Safari `gesturechange`), mobile touch gestures (`touch-action: none`), and keyboard shortcuts (`Esc`, `0`, `ArrowLeft`, `ArrowRight`, `WASD`) while ignoring shortcuts whenever focus is inside an editable input.

#### Scenario: Typing in admin rename input does not move camera
- **WHEN** an admin types characters into an album title input field
- **THEN** keyboard navigation shortcuts (`WASD`, `Arrows`, `0`) SHALL NOT trigger camera movement

