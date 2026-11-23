# spatial-camera-navigation Specification

## Purpose
Provides deterministic, aspect-aware 3D camera navigation in world units (`100px = 1 unit`, `zClamp = [2.4, 140.0]`) including clamped cursor-anchored zooming, `bottomInsetPx`-aware framing, arced fly-to transitions, and desktop/mobile input handling.
## Requirements
### Requirement: Clamped cursor-anchored zoom and damped panning
Zooming via wheel, trackpad pinch, or mobile two-finger pinch SHALL clamp camera `z` within `[2.4, 140.0]` and keep the world point under the cursor stationary (within floating-point epsilon) for the effective clamped zoom factor, anchored to the target camera position.

#### Scenario: Zooming toward a print keeps it under the cursor
- **WHEN** a user zooms in or out while holding the cursor over a specific point on the wall
- **THEN** the world coordinates under the cursor before and after the effective clamped zoom step SHALL remain invariant within epsilon

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

