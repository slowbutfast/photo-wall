## MODIFIED Requirements

### Requirement: Coarse-pointer gyroscope rotational glare and physical print-focus tilt
On `(pointer: coarse)` devices when `prefers-reduced-motion: reduce` is not active, `GalleryCanvas` and `FramedPrint` SHALL drive glazed print reflections from `DeviceOrientationEvent` relative to an entry baseline. The entry baseline is the full orientation `(alpha0, beta0, gamma0)` captured on the first valid reading with finite `beta` and `gamma` after entering Print Focus (`tier === 'print'` with a non-null `focusedPhotoId`). It SHALL be cleared, together with a smoother reset, on tier or focus changes and on live `screen.orientation` changes.

Tilt SHALL be measured as the relative rotation `R_rel = R_baseᵀ · R_cur`, where each `R = Rz(alpha) · Rx(beta) · Ry(gamma)` (W3C intrinsic Z‑X′‑Y″). From the rotated device normal `v = R_rel · (0, 0, 1)` it SHALL take two unclamped device-frame angles:
- `aboutY = atan2(v.x, v.z)`;
- `aboutX = atan2(−v.y, v.z)`.

When the baseline or the current sample lacks a finite `alpha`, `aboutY` and `aboutX` SHALL instead fall back to the wrapped Euler deltas `wrapAngleDelta(gamma − gamma0)` and `wrapAngleDelta(beta − beta0)`.

The device-frame angles SHALL then be mapped through the existing `screen.orientation.angle` sign table (`0° / 90° / 180° / 270°`), clamped to `±DEFAULT_GYRO_MAX_DEG` (`22`), and normalized into `[-0.5, +0.5]` tilt coordinates.

Non-finite or `null` `beta`/`gamma` readings SHALL be ignored without corrupting the baseline or smoother state. A `null` `alpha` alone SHALL NOT cause a reading to be ignored.

Behavior SHALL be tiered by zoom level:
- **Macro and Album tiers (`macro`, `album`):** Gyroscope sensor listening and tilt/glare effects SHALL be off, as specified by the coarse-pointer mobile render profile.
- **Print Focus (`print`):** The `focused` print SHALL apply:
  - full physical tilt (`±4°` `rotateX`/`rotateY` + `translateZ(58px)`);
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
- **WHEN** the entry baseline is `(alpha 0, beta 50, gamma 80)` and the phone physically rotates `+15°` about its y axis, so the browser reports the equivalent triple `(180, 130, −5)`
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

## ADDED Requirements

### Requirement: Print Focus tilt auto-recentres after 3 seconds of stillness
While the gyroscope controller is listening in Print Focus and has an entry baseline, it SHALL track stillness on the unclamped device-frame tilt angles (`aboutX`, `aboutY`). The stillness window SHALL start or restart whenever either angle deviates by more than `RECENTER_STILL_BAND_DEG` (`1.5°`) from its value at the start of the current window. When a window reaches `RECENTER_STILL_MS` (`3000 ms`) without restarting, the controller SHALL recentre.

A recentre SHALL:
- replace the entry baseline with the most recent valid reading;
- keep the current smoothed tilt, without an instant reset or a `{0, 0}` announcement;
- start a glide that eases the emitted tilt toward the new target with `smoothTilt` using `RECENTER_GLIDE_TAU_MS` (`450 ms`) instead of `DEFAULT_GYRO_TAU_MS` (`85 ms`).

Glide frames SHALL be driven by `requestAnimationFrame` using the last valid reading, so the glide completes even if no further `deviceorientation` events arrive. The glide SHALL end, returning to the tracking tau, when either:
- both axes of the smoothed tilt are within `0.002` of the target, at which point the target SHALL be emitted; or
- a reading deviates beyond the stillness band from the new baseline.

The stillness timer SHALL be driven by an injected adapter timer, not by sensor event arrival. One still period SHALL produce at most one recentre; the timer SHALL re-arm only after the band is broken.

A tier or focus change, a `screen.orientation` change, a detach, or `destroy()` SHALL cancel the pending timer and any glide. Emitted values SHALL still pass through `MIN_EMIT_DELTA` gating, except for the final settle emit.

#### Scenario: Holding still at an offset glides the print back to rest
- **WHEN** a visitor in Print Focus tilts the phone `+10°` about the device x axis from the entry baseline and then holds it within `1.5°` of that pose for `3000 ms`
- **THEN** the controller SHALL make the current reading the new baseline. The emitted tilt SHALL then ease monotonically toward `{ nx: 0, ny: 0 }` with a `450 ms` time constant: about 63% of the way after `450 ms`, and within `0.002` after at most about `2.8 s`. This returns the frame to `0°` rotation and the glare to its resting position, with no instant jump.

#### Scenario: Continuous motion never recentres
- **WHEN** the visitor keeps moving the phone so that some device-frame angle leaves the `1.5°` band at least once in every `3000 ms` window
- **THEN** no recentre SHALL occur, and the tilt SHALL keep tracking the original entry baseline with the `85 ms` tracking tau

#### Scenario: Glide completes without further sensor events
- **WHEN** a recentre fires and the browser then dispatches no further `deviceorientation` events
- **THEN** rAF-driven glide frames SHALL still carry the emitted tilt to the target, and SHALL stop requesting frames once it has settled

#### Scenario: Moving during a glide hands control straight back to the hand
- **WHEN** a glide is in progress and a reading deviates by more than `1.5°` from the new baseline
- **THEN** the glide SHALL end immediately, the tracking tau SHALL apply to that reading, and a new stillness window SHALL begin

#### Scenario: A still period recentres only once
- **WHEN** the phone stays within the band for `9000 ms` after a recentre
- **THEN** no second recentre SHALL fire until the band has been broken and a fresh `3000 ms` still window completes

#### Scenario: Context changes cancel pending recentres
- **WHEN** a stillness window is in progress or a glide is running and the visitor leaves Print Focus, focuses another photo, or rotates the screen
- **THEN** the pending timer SHALL be cleared, the glide SHALL stop requesting frames, and no recentre SHALL fire afterwards

#### Scenario: Devices that never stream a reading never arm the timer
- **WHEN** Print Focus is entered with motion permission denied or with no gyroscope, so that no valid reading arrives
- **THEN** no stillness timer SHALL be armed, and nothing SHALL be emitted
