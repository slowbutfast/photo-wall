# spatial-camera-navigation Specification

## Purpose
Provides deterministic, aspect-aware 3D camera navigation in world units (`100px = 1 unit`, `zClamp = [2.4, 140.0]`) including clamped cursor-anchored zooming, `bottomInsetPx`-aware framing, arced fly-to transitions, and desktop/mobile input handling.
## Requirements
### Requirement: Clamped cursor-anchored zoom and damped panning
Zooming via wheel, trackpad pinch, or mobile two-finger pinch SHALL clamp camera `z` within `[2.4, 140.0]` using `cameraMath.ts`, keep the world point under the cursor stationary (within floating-point epsilon) for the effective clamped zoom factor anchored to the target camera position, derive CSS scale via one shared pure function `cameraToCssScale(z, viewportHeightCss, fovDeg) = viewportHeightCss / (2 * z * Math.tan((fovDeg * Math.PI / 180) / 2) * 100)`, and drive both `div.world` 2D CSS transforms (`cssTop = -worldY * 100`) and `PbrWallCanvas` WebGL2 uniforms from that exact same camera position, scale, viewport size, and device-pixel ratio each frame.

#### Scenario: Zooming toward a print keeps it under the cursor
- **WHEN** a user zooms in or out while holding the cursor over a specific point on the wall
- **THEN** the world coordinates under the cursor before and after the effective clamped zoom step SHALL remain invariant within epsilon

#### Scenario: WebGL2 plaster wall and CSS DOM world stay locked during zoom and pan
- **WHEN** a user pans or zooms across desktop (`1920×1080`) or mobile (`390×844`) viewports
- **THEN** `cameraToCssScale` SHALL compute the consistent on-screen scale for each viewport height, row 0 SHALL render above row 1 (`cssTop_row0 < cssTop_row1`), and the WebGL2 `PbrWallCanvas` lightmap and stucco wall SHALL remain aligned with the `.world` CSS islands without drift or sub-pixel swimming

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

