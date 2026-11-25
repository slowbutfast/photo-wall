## ADDED Requirements

### Requirement: Coarse-pointer gyroscope rotational glare and physical print-focus tilt
On `(pointer: coarse)` devices when `prefers-reduced-motion: reduce` is not active, `GalleryCanvas` and `FramedPrint` SHALL drive glazed print reflections from `DeviceOrientationEvent` using relative-to-entry baseline calibration (`(beta0, gamma0)` captured when entering `album` or `print` tier) mapped through `screen.orientation.angle` (`0° / 90° / 180° / 270°`) into normalized `[-0.5, +0.5]` tilt coordinates (`DEFAULT_GYRO_MAX_DEG = 22`). Behavior SHALL be tiered by zoom level:
- **Macro tier (`scale < 0.25`):** Gyroscope sensor listening and tilt/glare effects SHALL be off.
- **Album tier (`album`):** Prints SHALL apply a subtle glare-only `.photo-sheen` translation (`30%` amplitude) with zero 3D frame rotation and zero cast-shadow shift.
- **Print Focus (`print`):** The `focused` print SHALL apply full physical tilt (`±4°` `rotateX`/`rotateY` + `translateZ(58px)`), dynamic wall cast-shadow offsets (`--tilt-sx`, `--tilt-sy`), and full 2D `.photo-sheen` specular translation (`PrintSharpOverlay` mirroring both automatically).

On iOS 13+ where `DeviceOrientationEvent.requestPermission` exists, permission SHALL be requested synchronously inside the tap handler entering Print Focus (at most once per session) and fall back silently with zero errors if denied or unsupported. Desktop `(pointer: fine)` behavior SHALL remain unchanged.

#### Scenario: Print Focus physically tilts frame, shadow, and glare with phone orientation
- **WHEN** a mobile visitor taps a print into Print Focus (granting iOS motion permission if prompted) and tilts the phone forward/backward or left/right from their entry holding angle
- **THEN** the focused print SHALL tilt smoothly up to `±4°` in `rotateX`/`rotateY`, shift `--tilt-sx`/`--tilt-sy` opposite the tilt, and sweep `.photo-sheen` in 2D across the glass (`PrintSharpOverlay` mirrored)

#### Scenario: Album View sweeps subtle glare without wobbling frames
- **WHEN** a mobile visitor tilts their phone in `album` tier
- **THEN** `.photo-sheen` SHALL sweep gently at `30%` amplitude while `.photo-frame` rotation and cast shadows remain stationary

#### Scenario: Reduced motion and desktop fine-pointer browsers stay unaffected
- **WHEN** `prefers-reduced-motion: reduce` is enabled OR the visitor uses a `(pointer: fine)` desktop browser
- **THEN** no `deviceorientation` tilt or glare SHALL be applied, and desktop computed styles / hover behavior SHALL remain identical
