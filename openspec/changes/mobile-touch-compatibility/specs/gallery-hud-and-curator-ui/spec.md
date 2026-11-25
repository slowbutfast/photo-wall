## ADDED Requirements

### Requirement: Safe-area-aware HUD under a viewport-fit=cover viewport
The root layout SHALL export a Next.js `viewport` with `width=device-width`, `initialScale: 1` and `viewportFit: 'cover'`. `.hud-top-right` SHALL offset itself using `max(24px, env(safe-area-inset-top, 0px))` and `max(24px, env(safe-area-inset-right, 0px))` (and `max(12px, ...)` at `<= 767px`). `.photo-focus-bar` SHALL keep its bottom `env(safe-area-inset-bottom)` padding and set horizontal padding to `max(22px, env(safe-area-inset-left, 0px))` and `max(22px, env(safe-area-inset-right, 0px))` (and `max(14px, ...)` at `<= 767px`) so landscape iPhones clear the Dynamic Island on either side. On devices without insets, the HUD SHALL render pixel-identically to today.

#### Scenario: iPhone notch and home indicator do not cover the HUD
- **WHEN** `/photos` opens on an iPhone with a Dynamic Island, in portrait and in landscape
- **THEN** `.hud-top-right` and `.photo-focus-bar` controls SHALL sit fully clear of the sensor housing and rounded corners, and the bottom bar's text SHALL sit above the home indicator

#### Scenario: Desktop layout unchanged
- **WHEN** `/photos` opens in a desktop browser with no safe-area insets
- **THEN** HUD positions SHALL match the pre-change computed-style baseline exactly

### Requirement: Coarse-pointer touch targets of at least 44 by 44 CSS pixels
Under `@media (pointer: coarse)`, every interactive screen-space HUD control SHALL have a hit area of at least `44×44` CSS px: `.hud-button` and Photo Focus Prev/Next/Back. The hit area MAY be expanded with padding or an invisible `::before` overlay, so visible sizes and the fine-pointer layout stay unchanged.

#### Scenario: HUD buttons are comfortably tappable on a phone
- **WHEN** a curator measures `.hud-button` hit boxes on a coarse-pointer device emulation
- **THEN** each SHALL be at least `44×44px`, and adjacent targets SHALL NOT overlap

### Requirement: HUD hover effects only for fine hover-capable pointers
HUD `:hover` visual rules in `hud.css` SHALL be wrapped in place inside `@media (hover: hover) and (pointer: fine)` so touch taps never leave HUD buttons in a hovered state while desktop cascade order (including `.hud-button.active` and `.photo-focus-bar .hud-button-primary`) stays identical.

#### Scenario: Active HUD button retains active fill when hovered on desktop
- **WHEN** a desktop visitor hovers over an active `.hud-button.active` or `.photo-focus-bar .hud-button-primary`
- **THEN** the button SHALL preserve its exact pre-change hover appearance

### Requirement: Touch-safe drag reordering in the Curator Studio
`CuratorStudio` (wall order) and `AlbumEditor` (photo order) SHALL use `MouseSensor` (`distance: 4`), `TouchSensor` (`delay: 250ms`, `tolerance: 5px`) and the existing `KeyboardSensor`, instead of `PointerSensor`. Draggable photo tiles SHALL use `touch-action: manipulation`, `-webkit-touch-callout: none`, and `user-select: none`. `touch-action: none` SHALL remain only on dedicated drag handles (`.studio-album-drag`).

#### Scenario: Swiping over the photo grid scrolls the editor
- **WHEN** a curator on a phone swipes vertically across the Album Editor's photo tiles
- **THEN** the panel SHALL scroll, and no drag SHALL start

#### Scenario: Long-press drags a photo
- **WHEN** a curator presses a photo tile for 250ms without moving more than 5px, then drags
- **THEN** the tile SHALL pick up and reorder exactly as it does with a mouse drag, and **Save Order** SHALL persist the new order

#### Scenario: Mouse and keyboard reordering unchanged
- **WHEN** a curator reorders with a mouse (a 4px movement) or with the keyboard sensor
- **THEN** behaviour SHALL be identical to before the change
