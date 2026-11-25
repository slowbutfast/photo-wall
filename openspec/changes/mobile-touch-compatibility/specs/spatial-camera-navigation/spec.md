## ADDED Requirements

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
