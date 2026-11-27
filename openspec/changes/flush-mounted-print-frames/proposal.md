# Proposal: Flush-Mounted Gallery Print Frames (Dibond / Gatorboard)

## Why

The current `.photo-frame` border styling renders like a bulky molded picture frame with thick gray sloped side bevels (`border-right: 4px solid #d5d1c8`, `border-bottom: 5px solid #c6c1b7`), visible 45-degree mitered corner seams, and a deep 5-layer recessed cutout window shadow inside `.photo-window`. Replacing that heavy sculptural molding with a **flush-mounted gallery print** aesthetic (photograph with a flat archival margin mounted on rigid aluminum Dibond / archival Gatorboard) modernizes the wall while preserving the tactile physical sensation of a rigid board floating off the plaster wall — including all existing lift, 3D tilt, dynamic wall shadow, and specular sheen animations.

## What Changes

- **Flat Front Plane (`src/styles/wall.css`):**
  - Remove sloped white/gray outer bevels and 45-degree mitered corner seams on `.photo-frame` (`border-top: 0; border-left: 0; border-radius: 0;`).
  - Remove the recessed cutout inner lip shadow on `.photo-window` (`box-shadow: none;` on both desktop and `@media (pointer: coarse)`), keeping the clean flat white margin (`--frame-padding: 11px`, `--frame-bg: #f6f4ef`, zero layout geometry change).
- **Thin Rigid Matte-Black Backing Edge (`src/styles/wall.css`):**
  - Apply a crisp, uniform `2.5px` matte-black rigid board edge (`border-right: 2.5px solid #161616; border-bottom: 2.5px solid #121212;`), matching the dark core edge of the gallery's metal placards.
- **Floating Cleat Shadow (`src/styles/wall.css`):**
  - Keep the two-layer directional floating cleat shadow (tight contact shadow + soft downward offset shadow using `--sx`/`--sy` and `--tilt-sx`/`--tilt-sy`) while removing bright molded top-bevel inset highlights (replacing with a subtle `0 0 0 0.5px rgba(255, 255, 255, 0.14) inset` hairline).
- **Preserved Lift, Tilt, & Sheen:**
  - Desktop mouse hover lift (`translateZ(36px)`/`58px`), 3D `rotateX`/`rotateY` tilt, Print Focus lift, mobile Print Focus gyroscope tilt + auto-recenter, `PrintSharpOverlay` alignment, and flat `.photo-sheen` specular highlight remain 100% intact.

## Capabilities

### New Capabilities

- (None — modifies existing photo renderer frame aesthetics.)

### Modified Capabilities

- `instanced-photo-renderer`: MODIFIED `Physical single-photo inspection with 2D specular glare, 3D frame bevels, and full-fidelity neighbors` to replace thick sloped gray molding and recessed inner cutout shadows with a flush-mounted flat print plane (clean flat margin, `.photo-window { box-shadow: none }`, `border-radius: 0`), a uniform `2.5px` matte-black rigid backing edge (`#161616`/`#121212`), and a floating cleat shadow while preserving full lift, tilt, dynamic `--tilt-sx`/`--tilt-sy`, and 2D `.photo-sheen` glare.

## Impact

- **Code:** `src/styles/wall.css` (and static audit tests in `src/lib/__tests__/touchAudit.test.ts` / new `flushFrameAudit.test.ts`).
- **Layout / Geometry:** Zero change to `fitFrameInCell`, `islandLayout`, `MacroIsland`, or `PrintSharpOverlay`.
- **Dependencies / DB / APIs:** Zero new packages, zero DB changes, zero API changes.
