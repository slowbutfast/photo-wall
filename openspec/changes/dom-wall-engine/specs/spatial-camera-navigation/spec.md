## MODIFIED Requirements

### Requirement: Clamped cursor-anchored zoom and damped panning
Zooming via wheel, trackpad pinch, or mobile two-finger pinch SHALL use the existing world-unit `cameraMath.ts` store (`100px = 1 world unit`, `zClamp = [2.4, 140.0]`), keep the world point under the cursor stationary (within floating-point epsilon) for the effective clamped zoom factor, and drive both `div.world` 2D CSS transforms and `PbrWallCanvas` WebGL2 uniforms from the exact same camera position, scale, viewport size, and device-pixel ratio each frame.

#### Scenario: WebGL2 plaster wall and CSS DOM world stay locked during zoom and pan
- **WHEN** a user pans or zooms across desktop (`1920×1080`) or mobile (`390×844`) viewports
- **THEN** the WebGL2 `PbrWallCanvas` lightmap and stucco wall SHALL remain aligned with the `.world` CSS islands without drift or sub-pixel swimming
