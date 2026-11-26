## MODIFIED Requirements

### Requirement: Coarse-pointer gyroscope rotational glare and physical print-focus tilt
On `(pointer: coarse)` devices when `prefers-reduced-motion: reduce` is not active, `GalleryCanvas` and `FramedPrint` SHALL drive glazed print reflections from `DeviceOrientationEvent` relative to an entry baseline. The entry baseline is the full orientation `(alpha0, beta0, gamma0)` captured on the first valid reading with finite `beta` and `gamma` after entering Print Focus (`tier === 'print'` with a non-null `focusedPhotoId`) **and after the camera flight into that print has settled**. It SHALL be cleared, together with a smoother reset, on tier or focus changes and on live `screen.orientation` changes.

**Gyro hold:** While a camera flight is in progress (`GalleryCanvas` calls `setHold(true)` when a flight starts and `setHold(false)` when it ends or is cancelled), the controller SHALL discard every reading. It SHALL NOT capture a baseline, SHALL NOT emit tilt, and SHALL cancel any pending stillness recentre or glide. A focus change during a hold SHALL reset without announcing `{ nx: 0, ny: 0 }`, because the outgoing print's tilt is unwound by the focus hand-off (`print-focus-handoff`). The first valid reading after the hold is released SHALL become the baseline.

Tilt SHALL be measured as the relative rotation `R_rel = R_baseᵀ · R_cur`, where each `R = Rz(alpha) · Rx(beta) · Ry(gamma)` (W3C intrinsic Z‑X′‑Y″). From the rotated device normal `v = R_rel · (0, 0, 1)` it SHALL take two unclamped device-frame angles:
- `aboutY = atan2(v.x, v.z)`;
- `aboutX = atan2(−v.y, v.z)`.

When the baseline or the current sample lacks a finite `alpha`, `aboutY` and `aboutX` SHALL instead fall back to the wrapped Euler deltas `wrapAngleDelta(gamma − gamma0)` and `wrapAngleDelta(beta − beta0)`.

The device-frame angles SHALL then be mapped through the existing `screen.orientation.angle` sign table (`0° / 90° / 180° / 270°`), clamped to `±DEFAULT_GYRO_MAX_DEG` (`22`), and normalized into `[-0.5, +0.5]` tilt coordinates.

Non-finite or `null` `beta`/`gamma` readings SHALL be ignored without corrupting the baseline or smoother state. A `null` `alpha` alone SHALL NOT cause a reading to be ignored.

Behavior SHALL be tiered by zoom level:
- **Macro and Album tiers (`macro`, `album`):** Gyroscope sensor listening and tilt/glare effects SHALL be off, as specified by the coarse-pointer mobile render profile.
- **Print Focus (`print`):** The `focused` print SHALL apply:
  - full physical tilt (`±4°` `rotateX`/`rotateY` + `translateZ(58px)`). On `(pointer: coarse)`, `translateZ(58px)` is also the focused print's **resting** lift in CSS (`translateZ(calc(22px + 36px * var(--focus-w, 1)))`), so the first gyro emit changes only the rotation, never the apparent size. On coarse pointers the gyro writes its rotation as the custom properties `--gyro-rx` / `--gyro-ry` (degrees, unitless), and CSS composes them, scaled by `--focus-w`, into the frame transform;
  - dynamic wall cast-shadow offsets (`--tilt-sx`, `--tilt-sy`);
  - full 2D `.photo-sheen` specular translation, with `PrintSharpOverlay` mirroring all of it automatically.

On iOS 13+ where `DeviceOrientationEvent.requestPermission` exists, permission SHALL be requested synchronously inside the tap handler that enters Print Focus, at most once per session. If permission is denied or unsupported, the feature SHALL fall back silently with zero errors. Desktop `(pointer: fine)` behavior SHALL remain unchanged.

#### Scenario: Print Focus physically tilts frame, shadow, and glare with phone orientation
- **WHEN** a mobile visitor taps a print into Print Focus (granting iOS motion permission if prompted) and tilts the phone forward/backward or left/right from their entry holding angle
- **THEN** the focused print SHALL tilt smoothly up to `±4°` in `rotateX`/`rotateY`, shift `--tilt-sx`/`--tilt-sy` opposite the tilt, and sweep `.photo-sheen` in 2D across the glass (`PrintSharpOverlay` mirrored)

#### Scenario: Single-axis tilt matches the previous Euler-delta mapping
- **WHEN** the baseline and the sample share `alpha`, and only `beta` changes by `d` (or only `gamma` changes by `d`, with `|gamma|` staying below `90°`)
- **THEN** `aboutX` (respectively `aboutY`) SHALL equal `d` within `1e-6°`, the other angle SHALL be `0` within `1e-6°`, and the emitted `{ nx, ny }` SHALL equal what the Euler-delta mapping produced for the same readings

#### Scenario: Landscape hold through a gimbal crossing stays continuous
- **WHEN** the entry baseline is `(alpha 0, beta 50, gamma 80)` and the phone physically rotates `+15°` about its y axis, so the browser reports the equivalent triple `(180, 130, −85)`
- **THEN** the device-frame tilt SHALL be `aboutY ≈ 15°` and `aboutX ≈ 0°` (within `1e-6°`), and the emitted tilt SHALL NOT saturate either axis

#### Scenario: Equivalent Euler triples produce identical tilt
- **WHEN** the same physical pose is reported as `(alpha, beta, gamma)` or as `(alpha + 180, 180 − beta, gamma + 180)` (normalized into the W3C ranges)
- **THEN** the computed tilt relative to any baseline with finite `alpha` SHALL be identical within `1e-6`

#### Scenario: In-plane twist does not register as tilt
- **WHEN** the current orientation equals the baseline rotated about the device z axis (the screen normal) by any angle up to `±90°`
- **THEN** both device-frame angles SHALL be `0` within `1e-6°`

#### Scenario: Missing alpha falls back to Euler deltas without dropping the reading
- **WHEN** a reading arrives with finite `beta`/`gamma` and `alpha: null`, or the baseline was captured without a finite `alpha`
- **THEN** the reading SHALL be accepted, and the tilt SHALL be computed from the wrapped Euler deltas exactly as before this change

#### Scenario: Screen orientation change rebases baseline without jumping
- **WHEN** the device rotates between portrait and landscape (`screen.orientation` changes) while Print Focus remains active
- **THEN** the controller SHALL:
  - reset the smoother to `{ nx: 0, ny: 0 }`;
  - clear the entry baseline, so the next valid `deviceorientation` sample becomes the new neutral orientation;
  - cancel any pending stillness recentre or glide;
  - remap subsequent tilts using the new `screen.orientation.angle` without a jump

#### Scenario: Reduced motion and desktop fine-pointer browsers stay unaffected
- **WHEN** `prefers-reduced-motion: reduce` is enabled OR the visitor uses a `(pointer: fine)` desktop browser
- **THEN** no `deviceorientation` tilt or glare SHALL be applied, and desktop computed styles / hover behavior SHALL remain identical

#### Scenario: Gyro is held during a Print Focus flight and baselines after settle
- **WHEN** a coarse-pointer visitor with motion permission taps NEXT and moves the phone during the flight
- **THEN** no tilt SHALL be emitted until the flight ends, no baseline SHALL be captured from readings that arrive during the flight, and the first valid reading after the flight settles SHALL become the baseline (subsequent tilt measured relative to it)

#### Scenario: Focused print rests at the gyro lift height on coarse pointers
- **WHEN** a coarse-pointer print is focused and the gyro has not emitted (permission denied, unsupported, or held)
- **THEN** the computed transform of `.photo-frame.focused` SHALL be equivalent to `translateZ(58px)` with zero rotation, and the first non-zero gyro emit SHALL change only `rotateX`/`rotateY`
