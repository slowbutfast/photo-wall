## ADDED Requirements

### Requirement: Coarse-pointer tap on the focused print toggles glare
On a `(pointer: coarse)` device, a click on the focused `.photo-frame` SHALL call `useWallStore.toggleGlare()` and return, without calling `onSelectPhoto`, when all of these hold:
- `tier === 'print'`;
- the frame is `focused`;
- `wasDragged()` is false.

The existing iOS motion-permission request on that tap SHALL still run.

**State.** `glareOff` SHALL default to `false`. It SHALL persist across NEXT/PREV, across leaving and re-entering Print Focus, and across album changes, for the page's lifetime. It SHALL NOT be written to any storage.

**Rendering.** While `glareOff` is true, `.wall-viewport` SHALL carry `data-glare="off"`, and a rule inside `@media (pointer: coarse)` SHALL set `background: none` on `[data-glare='off'] .photo-sheen`, with higher specificity than the base `.photo-sheen` rule and without `!important`. That makes both the focused frame's sheen and the `.print-sharp-overlay` sheen fully transparent. Gyro tilt, `translateZ`, `--tilt-sx` / `--tilt-sy` and the overlay geometry SHALL be unchanged.

**Hint.** Each toggle SHALL show a hint in an `aria-live="polite"` element for `1600ms`:
- the first time glare is turned off in a session, it reads `Glare off · tap photo to restore`;
- later toggles read `Glare off` or `Glare on`.

**Desktop.** `(pointer: fine)` devices SHALL be unaffected. The click on a focused print behaves as before, no `data-glare` attribute is set, and fine-pointer computed styles and pixels SHALL be identical.

#### Scenario: Tapping the focused print hides the glare and keeps the tilt
- **WHEN** a coarse-pointer visitor in Print Focus with motion permission granted taps the focused print and then tilts the phone
- **THEN** no glare SHALL be visible on the frame or the sharp overlay, the print SHALL still tilt and its shadow SHALL still shift, and `focusedPhotoId` SHALL be unchanged

#### Scenario: Tapping again restores the glare
- **WHEN** the visitor taps the focused print a second time
- **THEN** `data-glare` SHALL be removed and the glare SHALL resume at its anchored, gyro-driven position

#### Scenario: Glare stays off across prints
- **WHEN** glare is off and the visitor goes NEXT, then returns to Album View, then opens another print
- **THEN** the glare SHALL remain off on every focused print until it's toggled back on or the page reloads

#### Scenario: Neighbour taps and drags keep their meaning
- **WHEN** in Print Focus the visitor taps a non-focused neighbour print, or drags across the focused print
- **THEN** the neighbour tap SHALL navigate to that print as before, the drag SHALL pan, and neither SHALL toggle glare

#### Scenario: Desktop is unaffected
- **WHEN** a `(pointer: fine)` visitor clicks the focused print
- **THEN** `toggleGlare` SHALL NOT be called, `.wall-viewport` SHALL have no `data-glare` attribute, and hover glare SHALL behave exactly as before

#### Scenario: The rule is coarse-gated and only hides the sheen background
- **WHEN** `wall.css` is parsed
- **THEN** exactly one rule SHALL target `[data-glare='off'] .photo-sheen`, it SHALL sit inside `@media (pointer: coarse)`, and it SHALL declare only `background: none` (so `--sheen-strength` is still declared exactly once, on `.playground-wall-root`)
