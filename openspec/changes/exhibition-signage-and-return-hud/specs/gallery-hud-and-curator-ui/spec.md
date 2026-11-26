## MODIFIED Requirements

### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger
Public `/photos` SHALL be strictly read-only with zero curator triggers, zero admin imports, and zero `/api/admin/auth` requests on page load. The public HUD SHALL enforce global Helvetica (`"Helvetica Neue", Helvetica, "TeX Gyre Heros", Arial, sans-serif`) across all controls, render no album directory and no top-right `Overview` button, and instead present a single persistent bottom-right `RETURN` button (`.hud-return-persistent`, sharp-edged `border-radius: 0`, solid `#111111` fill + `#FFFFFF` ink, `>= 44×44 px` coarse-pointer hit area, safe-area bottom/right insets) that invokes `returnOneLevel()` (`print → album`, `album → overview`). `RETURN` SHALL remain anchored in the exact same bottom-right viewport slot across `print` and `album` modes, hiding cleanly in `overview` with a smooth `0.2s` `opacity` + `translateY(6px)` transition (instant under `prefers-reduced-motion: reduce`, non-focusable via `inert` / `aria-hidden` when hidden). A static import-graph audit (`publicBoundaryAudit.test.ts`) SHALL enforce that `src/app/(gallery)` never transitively imports `@/components/admin/*` or references `/api/admin`.

#### Scenario: Public gallery loads zero admin UI or auth calls
- **WHEN** a visitor opens `/photos`
- **THEN** no lock or `Curate` button SHALL render, zero requests SHALL be made to `/photos/api/admin/*`, and zero admin JS chunks SHALL be downloaded

#### Scenario: No album directory bar or top-right Overview button, and persistent RETURN steps through focus levels
- **WHEN** the gallery is in `overview`, `album`, and `print` modes
- **THEN** no `.hud-directory` and no `.hud-top-right` `Overview` button SHALL render; `.hud-return-persistent` (`RETURN`) SHALL be hidden/inert in `overview`, visible in `print` (stepping to `album` via `returnOneLevel()`), and remain visible in the exact same bottom-right slot in `album` (stepping to `overview` via `returnOneLevel()`)

### Requirement: Unobtrusive Photo Focus bar with album caption and optional manual metadata
Inspecting a single print SHALL anchor plain `PREV` and `NEXT` buttons (with no arrow glyphs), the **album's caption** as a single-line centered **Title Case** Helvetica primary line (`text-transform: none`), an optional subtle subtitle containing only owner-entered fields (**Camera**, **Date**, **Location** — all off/empty by default, with zero auto-extracted EXIF), and a right-hand spacer matching the persistent bottom-right `RETURN` button inside a bright, spacious light-frosted full-width bottom bar (`rgba(244, 244, 242, 0.92)` background, `#111111` primary ink, `rgba(17, 17, 17, 0.62)` secondary ink, subtle `1px solid rgba(17, 17, 17, 0.12)` top hairline, `backdrop-filter: blur(12px)`) without blurring the gallery background (stacking caption cleanly above `>= 44px` touch controls on `< 768px` viewports). The bar SHALL animate in and out smoothly via `opacity 0.22s ease, transform 0.22s ease` (`translateY(10px)` + `pointer-events: none` + `inert` when hidden, instant under `prefers-reduced-motion: reduce`) while the persistent `RETURN` button stays stationary when stepping `Print Focus → Album View`.

#### Scenario: Stepping through prints shows plain PREV/NEXT, album caption, and only populated manual fields
- **WHEN** a visitor inspects a print in an album where only `Camera` and `Location` were entered by the owner (and `Date` was left empty)
- **THEN** the bottom bar SHALL display plain `PREV` and `NEXT` buttons without arrow characters, the album caption in Title Case on a light frosted `rgba(244, 244, 242, 0.92)` surface with `#111111` ink and `Camera • Location` underneath, omitting `Date` and any auto-extracted lens/shutter EXIF

#### Scenario: Exiting Print Focus to Album View fades the bottom bar with latched content while RETURN persists
- **WHEN** a visitor clicks `RETURN` in `print` mode
- **THEN** `.photo-focus-bar` SHALL keep its last visible caption/metadata latched in a ref while transitioning to hidden (`is-hidden`, `inert`, `bottomInset = 0`) so it never fades out blank, while `.hud-return-persistent` (`RETURN`) stays visible at the exact same bottom-right coordinates (`0 px` shift) ready to return to `overview`

#### Scenario: Hidden Photo Focus bar and hidden RETURN button are not focusable
- **WHEN** the gallery is in `overview` (both bar and `RETURN` hidden) or `album` (bar hidden)
- **THEN** hidden controls SHALL carry `inert` / `aria-hidden="true"` / `disabled` (`tabIndex={-1}`) so keyboard Tab focus cannot land on them

#### Scenario: Reduced motion disables HUD bar and RETURN transitions
- **WHEN** `prefers-reduced-motion: reduce` is active
- **THEN** `.photo-focus-bar` and `.hud-return-persistent` SHALL apply `transition: none` (`0s` duration) so state changes are instant

### Requirement: Safe-area-aware HUD under a viewport-fit=cover viewport
The root layout SHALL export a Next.js `viewport` with `width=device-width`, `initialScale: 1` and `viewportFit: 'cover'`. `.hud-return-persistent` SHALL offset itself from the bottom-right using `right: max(22px, env(safe-area-inset-right, 0px))` and `bottom: calc(11px + env(safe-area-inset-bottom, 0px))` (and `max(14px, ...)` / `calc(10px + ...)` at `<= 767px`), matching `.photo-focus-bar`'s bottom `env(safe-area-inset-bottom)` and horizontal `max(22px, env(safe-area-inset-left/right, 0px))` (`max(14px, ...)` at `<= 767px`) padding so portrait and landscape iPhones clear the Dynamic Island and home indicator cleanly.

#### Scenario: iPhone notch and home indicator do not cover the HUD
- **WHEN** `/photos` opens on an iPhone with a Dynamic Island, in portrait and in landscape
- **THEN** `.hud-return-persistent` and `.photo-focus-bar` controls SHALL sit fully clear of the sensor housing, rounded corners, and home indicator

#### Scenario: Desktop layout uses 22px right and 11px bottom offsets
- **WHEN** `/photos` opens in a desktop browser with no safe-area insets
- **THEN** `.hud-return-persistent` SHALL align identically to `.photo-focus-bar`'s bottom-right slot (`0 px` delta between `print` and `album` modes)

### Requirement: Coarse-pointer touch targets of at least 44 by 44 CSS pixels
Under `@media (pointer: coarse)`, every interactive screen-space HUD control SHALL have a hit area of at least `44×44` CSS px: `.hud-return-persistent` (`RETURN`) and Photo Focus `PREV` / `NEXT`. The hit area MAY be expanded with padding or an invisible `::before` overlay, so visible sizes and the fine-pointer layout stay unchanged.

#### Scenario: HUD buttons are comfortably tappable on a phone
- **WHEN** a curator measures `.hud-return-persistent` and `.photo-focus-bar .hud-button` hit boxes on a coarse-pointer device emulation
- **THEN** each SHALL be at least `44×44px`, and adjacent targets SHALL NOT overlap
