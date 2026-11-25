## ADDED Requirements

### Requirement: Hover effects only for fine hover-capable pointers
`FramedPrint`'s pointer tilt, lift and sheen SHALL run only for events with `pointerType === 'mouse'`. Wall `:hover` visual rules in `wall.css` (print and placard lift) SHALL be wrapped in place inside `@media (hover: hover) and (pointer: fine)`. Touch interaction SHALL never leave a print or placard in a hovered or tilted state after the finger lifts. Desktop mouse behaviour SHALL be unchanged.

#### Scenario: Tapping a print does not tilt or stick
- **WHEN** a visitor taps a print on a phone
- **THEN** the print SHALL select or focus as it does today, without any tilt, sheen sweep or hover lift remaining afterwards

#### Scenario: Mouse hover tilt unchanged on desktop
- **WHEN** a desktop visitor moves a mouse over a print
- **THEN** the tilt, lift and sheen SHALL behave exactly as before

### Requirement: Inline YouTube playback on soundtrack plaques
The public Soundtrack Plaque iframe URL SHALL include `playsinline=1` alongside its existing `autoplay=1&rel=0&modestbranding=1`, so iOS plays the soundtrack inside the plaque rather than in a full-screen player.

#### Scenario: iPhone plays the soundtrack inside the plaque
- **WHEN** a visitor taps a soundtrack plaque on an iPhone
- **THEN** the video SHALL play inline within the plaque without entering the native full-screen player
