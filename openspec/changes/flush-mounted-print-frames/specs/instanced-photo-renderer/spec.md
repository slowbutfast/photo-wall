## MODIFIED Requirements

### Requirement: Physical single-photo inspection with 2D specular glare, 3D frame bevels, and full-fidelity neighbors
During single-photo inspection (`viewMode === 'print'`) and `PREV`/`NEXT` navigation, `GalleryCanvas` and `FramedPrint` SHALL keep all neighboring prints rendered at 100% opacity and full material fidelity (zero `.dimmed` ghosting or placeholder fades) and drive transitions purely through continuous camera flight (`x, y, z`) without unmounting or resetting frame images. Each `.photo-frame` SHALL present a **flush-mounted gallery print** (rigid aluminum Dibond / Gatorboard aesthetic): a single flat front plane with clean white margin (`--frame-padding: 11px`), zero sloped outer bevels or 45-degree mitered corner seams (`border-top: 0; border-left: 0; border-radius: 0`), zero recessed inner cutout lip (`.photo-window { box-shadow: none }` on both fine and coarse pointers), a crisp uniform matte-black rigid backing edge (`border-right: 2.5px solid #161616; border-bottom: 2.5px solid #121212`), and a floating cleat wall shadow driven by `--sx`/`--sy` and `--tilt-sx`/`--tilt-sy` (bound to `-rotateY` and `rotateX`). Lift (`translateZ`), 3D `rotateX`/`rotateY` tilt, and `.photo-sheen` (2D elliptical `radial-gradient` specular highlight tracking tilt opposite the tilt angle) SHALL remain fully active.

#### Scenario: Neighboring prints stay at 100% fidelity during single-photo inspection and NEXT navigation
- **WHEN** a visitor clicks a print to enter `print` view and presses `NEXT`
- **THEN** no `.photo-frame` SHALL receive a `.dimmed` class or reduced opacity (`opacity === '1'`), and the camera SHALL fly smoothly to the next print's wall coordinates without fading through a placeholder box

#### Scenario: Tilting a focused frame shifts 2D specular glare and cast shadow in both X and Y
- **WHEN** a visitor moves the pointer horizontally and vertically across a focused `.photo-frame`
- **THEN** `.photo-sheen` SHALL translate a soft 2D radial specular bloom along both X and Y axes opposite to the tilt direction, and `--tilt-sx` / `--tilt-sy` SHALL shift the frame's cast shadow opposite to `-rotateY` and `rotateX`

#### Scenario: Flush-mounted print renders flat front plane with matte-black rigid backing edge and floating shadow
- **WHEN** prints render in Album View or Print Focus on desktop or mobile
- **THEN** `.photo-frame` SHALL have `border-top-width: 0px`, `border-left-width: 0px`, `border-right: 2.5px solid #161616`, `border-bottom: 2.5px solid #121212`, and `border-radius: 0px`; `.photo-window` SHALL have `box-shadow: none`; and hover/focus lift, tilt, and `.photo-sheen` animations SHALL remain active
