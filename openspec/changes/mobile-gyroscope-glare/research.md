# Research: Mobile Gyroscope Rotational Glare

## Source material

### 2026-11-25 — User Feature Request & Design Decisions

> could you propose this new change, I was thinking on mobile, we could use the gyroscope to basically simulate a photo rotational glare, but I'm not sure exactly what the difference would be on for each zoom level. But I'm thinking definitely for the individual photo zoom level, we could make the effect most apparent or like tilting your phone forward and backwards, left and right, would basically affect the glare. So it really felt like you were rotating a real physical photograph in real life.

> yeah i like that. Then to clarify, what you mean is that when you're in the album view, only the glare effect is apparent. But then when you're in the print tier, then the whole photo itself moves with the shadow as well?
> yeah thats fine. I'm thinking that's fine too, 'cause maybe that would clue people into the fact that there's this tilt feature. So I'm okay explicitly doing that.

### Raised but not acted on

- **Custom in-HUD opt-in icon/button for gyroscope permission:** Rejected for v1. Calling `DeviceOrientationEvent.requestPermission()` directly on the first tap into Print Focus uses the native iOS permission sheet as a natural discovery cue with zero extra HUD chrome. Can be added later if needed.
- **Gyroscope effects at Macro tier (`scale < 0.25`):** Excluded. At Macro tier, islands render as pre-baked `<canvas>` mosaics (`MacroIsland.tsx`) with no `.photo-frame` or `.photo-sheen` DOM elements.
- **Full 3D frame wobble across all 12–20 frames in Album View:** Rejected. Tilting every print simultaneously in Album View feels visually noisy; Album View uses a subtle `~30%` glare-only `.photo-sheen` sweep (`0` frame rotation, `0` shadow shift).

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Relative-to-Entry Baseline (`beta0, gamma0`)** | The device orientation snapshot captured when entering `album` or `print` tier so the current comfortable hand-holding angle (`~35°–60°`) maps to neutral `(nx = 0, ny = 0)`. | Raw absolute `beta = 0, gamma = 0` (phone flat on a table). |
| **Normalized Tilt (`nx, ny`)** | Values in `[-0.5, +0.5]` clamped at `±22°` (`DEFAULT_GYRO_MAX_DEG = 22`) and mapped through `screen.orientation.angle`, matching `FramedPrint`'s existing mouse tilt coordinate space. | Raw degrees `[-180, 180]`. |
| **Album-Tier Glare-Only Sweep** | Applying `30%` of `(nx, ny)` to `.photo-sheen` `translate3d` in `album` tier with zero `rotateX`/`rotateY` frame transform and zero `--tilt-sx`/`--tilt-sy` shadow shift. | Tilting all 12–20 frames in Album View. |
| **Print-Focus Full Physical Tilt** | Applying full `(nx, ny)` to the focused frame's `rotateX`/`rotateY` (`±4°`, `translateZ(58px)`), dynamic cast shadow (`--tilt-sx`/`--tilt-sy`), and `.photo-sheen` sweep (`PrintSharpOverlay` mirrors both automatically). | Applying 3D tilt to unfocused sibling frames. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| MDN `DeviceOrientationEvent` & iOS 13+ `requestPermission()` | `deviceorientation` provides `beta` (`[-180, 180]` front-back) and `gamma` (`[-90, 90]` left-right); iOS Safari requires `DeviceOrientationEvent.requestPermission()` inside a user gesture on HTTPS. | CC-BY-SA (docs) | 2026-11-25 |
| MDN `ScreenOrientation.angle` | `0`, `90`, `180`, `270` (`-90`) rotation angles needed to align `beta`/`gamma` deltas with portrait vs landscape viewports. | CC-BY-SA (docs) | 2026-11-25 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Native `DeviceOrientationEvent` + pure `gyroTilt.ts` math (`~60` lines) | **Adopted** | Zero new npm dependencies; outputs `(nx, ny)` in `[-0.5, +0.5]` matching `FramedPrint`'s existing mouse tilt math. | 2026-11-25 |
| Generic `Gyroscope` Sensor API (`new Gyroscope()`) | **Rejected** | Unsupported in iOS Safari (`DeviceOrientationEvent` works on both iOS Safari and Android Chrome). | 2026-11-25 |

## Patterns adopted

- **Shared `[-0.5, +0.5]` tilt coordinate space:** `FramedPrint.tsx` already drives `rotateX`, `rotateY`, `--tilt-sx`, `--tilt-sy`, and `.photo-sheen` `translate3d` from `(nx, ny)` in `[-0.5, +0.5]`; `PrintSharpOverlay.tsx` already mirrors `frame`'s computed `transform` and `.photo-sheen` every rAF. Feeding gyroscope `(nx, ny)` into the same transform/shadow/sheen model keeps mouse and mobile physically consistent.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `FramedPrint.tsx` already uses normalized `(nx, ny)` for tilt, `--tilt-sx`/`--tilt-sy`, and `.photo-sheen` | `FramedPrint.tsx:L74-L88` (`maxTilt = 4` when focused, `sheen = translate3d(-nx * 38%, -ny * 38%, 0)`) | `read_file` on `src/components/wall/FramedPrint.tsx` | 2026-11-25 | stable |
| `PrintSharpOverlay.tsx` mirrors focused frame `transform` and `.photo-sheen` every rAF | `PrintSharpOverlay.tsx:L75-L96` copies `getComputedStyle(frame).transform` and `sheenIn.style.transform`/`opacity` | `read_file` on `src/components/wall/PrintSharpOverlay.tsx` | 2026-11-25 | stable |
| `mobile-touch-compatibility` gates `FramedPrint` pointer tilt on `pointerType === 'mouse'` | Scheduled prerequisite before this change (`openspec/changes/mobile-touch-compatibility/`) | `read_file` on `mobile-touch-compatibility/architecture.md` | 2026-11-25 | stable |

## Unverified assumptions

- Exact feel of `DEFAULT_GYRO_MAX_DEG = 22` and `smoothTilt` `alpha = 0.18` on real iPhone Safari and Android Chrome hardware (requires LAN/HTTPS device verification in `tests.md`).
- Whether iOS 17/18 Safari fires `deviceorientation` reliably inside an iframe-less top-level vs cross-origin rewritten `/photos` context (verify on real iPhone over HTTPS).

## Superseded claims

- None yet.

## Links out

- [openspec/specs/instanced-photo-renderer/spec.md](../../specs/instanced-photo-renderer/spec.md)
- [openspec/changes/mobile-touch-compatibility/proposal.md](../mobile-touch-compatibility/proposal.md)
- [src/components/wall/FramedPrint.tsx](../../../src/components/wall/FramedPrint.tsx)
- [src/components/wall/PrintSharpOverlay.tsx](../../../src/components/wall/PrintSharpOverlay.tsx)
