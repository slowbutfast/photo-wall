## MODIFIED Requirements

### Requirement: Clamped cursor-anchored zoom and damped panning
Zooming via wheel, trackpad pinch, or mobile two-finger pinch SHALL clamp camera `z` within `[2.4, 140.0]` using `cameraMath.ts`, keep the world point under the cursor stationary (within floating-point epsilon) for the effective clamped zoom factor, derive CSS scale via `cameraToCssScale`, and drive both `.world` CSS transform (`cssTop = -worldY * 100`) and `PlaygroundPbrWall` WebGL2 uniforms in lockstep each frame. Initial load and clicking `Overview` (or pressing `0`, even when already in `'overview'` after manual pan/zoom via `overviewNonce`) SHALL frame **Row 0 (the first up to 3 albums horizontally)** in the upper-center viewport.

#### Scenario: Zooming toward a print keeps it under the cursor
- **WHEN** a user zooms in or out while holding the cursor over a specific point on the wall
- **THEN** the world coordinates under the cursor before and after the effective clamped zoom step SHALL remain invariant within epsilon

#### Scenario: Initial load and Overview/0 always frame Row 0 horizontally in lockstep with the WebGL2 wall
- **WHEN** a visitor loads the gallery or pans/zooms away and then clicks `Overview` or presses `0`
- **THEN** the camera SHALL smoothly fly back to frame Row 0 (albums 1–3 horizontally) while `PlaygroundPbrWall` and `.world` remain locked with zero drift
