## MODIFIED Requirements

### Requirement: Clamped cursor-anchored zoom and damped panning
Zooming via wheel, trackpad pinch, or mobile two-finger pinch SHALL clamp camera `z` within `[2.4, 140.0]` using `cameraMath.ts`, keep the world point under the cursor stationary (within floating-point epsilon) for the effective clamped zoom factor, derive CSS scale via `cameraToCssScale`, and drive both `.world` 2D CSS transform (`cssTop = -worldY * 100`) and `PlaygroundPbrWall` WebGL2 uniforms in lockstep each frame (idle-stopping when stationary). Initial load and clicking `Overview` (or pressing `0`, even when already in `'overview'` after manual pan/zoom via `overviewNonce`) SHALL use aspect-aware Row-0 framing (`3 / 2 / 1` albums horizontally by viewport aspect ratio + `bottomInsetPx`), SHALL NOT re-fire on window resize or manifest refresh, and Tab focus SHALL NOT scroll the `overflow: hidden` viewport.

#### Scenario: Zooming toward a print keeps it under the cursor
- **WHEN** a user zooms in or out while holding the cursor over a specific point on the wall
- **THEN** the world coordinates under the cursor before and after the effective clamped zoom step SHALL remain invariant within epsilon

#### Scenario: Initial load and Overview/0 frame Row 0 aspect-aware without re-firing on resize
- **WHEN** a visitor loads on desktop (3 albums) or a 390px phone (1 album), pans/zooms away, and clicks `Overview` or presses `0`
- **THEN** the camera SHALL fly back to aspect-aware Row 0 above `bottomInsetPx`, and subsequent window resizes or manifest refreshes SHALL NOT yank the user's current camera position
