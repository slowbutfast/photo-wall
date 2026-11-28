# gallery-hud-and-curator-ui Specification

## Purpose
Delivers a strictly read-only public gallery HUD, an unobstructed Photo Focus label bar, and a server-gated Curator Studio at `/photos/admin` with a shared draft-aware wall preview, recursive folder uploads, draft resume/discard, and partial-failure retries.
## Requirements
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
- **THEN** `.photo-focus-bar` SHALL keep its last visible caption/metadata latched from the last visible album/photo while transitioning to hidden (`is-hidden`, `inert`, `bottomInset = 0`) so it never fades out blank, while `.hud-return-persistent` (`RETURN`) stays visible at the exact same bottom-right coordinates (`0 px` shift) ready to return to `overview`

#### Scenario: Hidden Photo Focus bar and hidden RETURN button are not focusable
- **WHEN** the gallery is in `overview` (both bar and `RETURN` hidden) or `album` (bar hidden)
- **THEN** hidden controls SHALL carry `inert` / `aria-hidden="true"` / `disabled` (`tabIndex={-1}`) so keyboard Tab focus cannot land on them

#### Scenario: Reduced motion disables HUD bar and RETURN transitions
- **WHEN** `prefers-reduced-motion: reduce` is active
- **THEN** `.photo-focus-bar` and `.hud-return-persistent` SHALL apply `transition: none` (`0s` duration) so state changes are instant

### Requirement: Lazy-loaded Curator Drawer with resilient folder upload and soundtrack editor
All curation tools SHALL live exclusively inside the persistent split **Curator Studio** at `/photos/admin` (replacing the floating drawer over `/photos`). On desktop (`>= 1024px`), the Studio SHALL render the shared `<GalleryCanvas mode="preview" />` on the left beside a persistent `440px` sidebar with three top-level tabs: **Exhibitions** (published + draft album directory), **Upload** (recursive `FolderDropzone` with `client-upload-compression`, 20-photo cap recovery, optional Date/Time/Location and YouTube soundtrack inspect), and **Settings** (client-local Lighting Preview, Placard Material selector `.mat-acrylic` / `.mat-aluminum` / `.mat-foamcore`, Pending Deletions retry list, and Sign Out). On mobile (`< 1024px`), the Studio SHALL switch between **Wall Preview** and **Manage Studio** tabs without losing unsaved order, upload queue, or draft state. Draft albums in `<GalleryCanvas mode="preview" />` SHALL render with dashed mats and a `"Draft"` placard badge.

#### Scenario: Studio renders live draft-aware preview beside Upload and Settings
- **WHEN** an authenticated curator opens `/photos/admin`
- **THEN** `<GalleryCanvas mode="preview" />` SHALL display both published and draft albums (with dashed mats and `"Draft"` badges on drafts) beside the persistent **Exhibitions | Upload | Settings** sidebar, and switching Placard Material or Lighting Preview in Settings SHALL update the preview immediately

#### Scenario: Mobile Studio tabs preserve in-progress upload and draft state
- **WHEN** a curator on a `< 1024px` viewport starts an upload or edits a draft in **Manage Studio** and toggles to **Wall Preview** and back
- **THEN** the upload queue and unsaved draft state SHALL remain intact without resetting

### Requirement: Curator Studio album wall reordering and two-tab Album Editor
Inside `/photos/admin`, the Studio's **Exhibitions** tab SHALL support:
- Filtering albums by `All`, `Published`, and `Draft`, reordering albums across the wall via `@dnd-kit/sortable` drag-and-drop and accessible `↑`/`↓` buttons with an explicit **Save Wall Order / Discard** bar (`PUT /photos/api/admin/album-order`), and bi-directional selection with `<GalleryCanvas mode="preview" />`.
- Opening any published or draft album into a two-tab **Album Editor**:
  - **`Photos (N)` tab:** Wall-matched `gridColumns` thumbnail grid (`256px` LOD) + List view toggle, `@dnd-kit/sortable` pointer/touch/keyboard dragging, top-right `×` delete overlay (preventing card toolbar overflow), 4-column equal-width directional controls (`⤒`, `←`, `→`, `⤓`), `+ Add Print` (reusing `client-upload-compression`), read-only reorder state when `photos.length <= 1`, live optimistic preview on `<GalleryCanvas mode="preview" />`, explicit sticky **Save Order / Discard** bar, `409 order_stale` auto-merge via `mergeStaleOrder` preserving the curator's arrangement, and retry on network failure.
  - **`Details` tab:** Required fields marked with `*` (**Caption\*** mapped to `albums.title`, **Wall Grid Columns\*** `2–5`), optional fields with clean bare labels (native `<input type="date">` and `<input type="time">` formatted together into `albums.dateLabel`, **Geotag / Location**, and full **YouTube Soundtrack** Video Link + Inspect + editable Song Title + editable Artist + Clear), Publish / Move to Draft toggle, and 2-step Delete Album confirmation.

#### Scenario: Dragging or keyboard-moving prints updates live preview and saves atomically
- **WHEN** a curator drags print #8 into slot #1 (or uses keyboard arrows / `⤒` / `←` / `→` / `⤓`) in the Album Editor and clicks **Save Order**
- **THEN** `<GalleryCanvas mode="preview" />` SHALL reflect the move immediately during editing, clicking **Save Order** SHALL send one `PUT /photos/api/admin/albums/[id]/photo-order` request via `withBase`, and reloading `/photos` SHALL show the saved order on the wall and in Print Focus `← Prev` / `Next →`

#### Scenario: Concurrent upload triggers 409 order_stale merge without losing drag order
- **WHEN** another tab uploads a photo while the curator is reordering and the curator clicks **Save Order**
- **THEN** the editor SHALL catch `409 order_stale`, preserve the curator's relative order for existing photos, append the newly uploaded photo at the end via `mergeStaleOrder`, display a clear merge notice, and allow saving cleanly

#### Scenario: Details tab edits Caption, Date/Time, Location, and YouTube Soundtrack live
- **WHEN** a curator edits **Caption\***, picks a **Date** and **Time** via `<input type="date">` / `<input type="time">`, enters **Geotag / Location**, and sets or inspects a **YouTube Soundtrack** in the `Details` tab
- **THEN** the fixed-height placard and soundtrack plaque on `<GalleryCanvas mode="preview" />` SHALL update live, saving SHALL persist `dateLabel` as the combined Date + Time string via `PATCH /photos/api/admin/albums/[id]`, and clearing optional fields SHALL collapse metadata cleanly with zero stray separators

#### Scenario: Saving other Details never erases an unparseable legacy date label
- **WHEN** an album's stored `dateLabel` is free text the Date/Time inputs cannot represent (e.g. `"October 2025"` from the Upload tab), and the curator edits only Caption, Location, Grid Columns, or Soundtrack and saves
- **THEN** the editor SHALL show the stored label as the current value, keep it in the live preview, and send it back unchanged in the `PATCH`; it SHALL be replaced only when the curator sets the Date or Time inputs, and cleared only through an explicit **Clear date** action

#### Scenario: Reordering under a Published or Draft filter moves only the visible albums
- **WHEN** the Exhibitions list is filtered to `Published` or `Draft` and the curator drags a row or presses `↑` / `↓`
- **THEN** the move SHALL be computed over the visible rows only (`↑` / `↓` enabled by visible position), every filtered-out album SHALL keep its exact slot in the full wall order, and the result SHALL be identical to an unfiltered move when the filter is `All`

### Requirement: Fixed-height placard anatomy with unified Caption, optional metadata, and live timecode
Gallery placards on both `/photos` and `/photos/admin` SHALL maintain fixed `214×200px` proportions top-aligned beside the photo grid (never stretching to photo-grid height), with the matte-black Soundtrack Plaque beneath when a soundtrack is attached. Each placard SHALL display:
1. Primary bold **Caption** (`albums.title`) anchored top-left.
2. Tight optional muted **Metadata line** showing only populated `[Date · Time · Location]` fields.
3. When a soundtrack is attached, a bottom-pinned footer above the two bottom standoff pins showing **Song Title — Artist** and a **live-updating timecode** (`tabular-nums`, e.g. `0:42 / 3:25`) with no green indicator dot.

#### Scenario: Playing a soundtrack ticks the placard timecode cleanly without a status dot
- **WHEN** a visitor or curator plays an album's Soundtrack Plaque
- **THEN** the placard's bottom timecode SHALL update automatically in `M:SS / M:SS` format using `tabular-nums` with no green indicator dot, and the placard height SHALL remain fixed at `214×200px`

### Requirement: New album uploads default to chronological capture-time order
When the Studio **Upload** tab (`FolderDropzone`) creates a new draft album from a folder drop or a file pick, it SHALL order that album's image files by capture time, oldest first, before applying the `MAX_PHOTOS_PER_ALBUM` cap and before creating the draft.

Capture time SHALL be read from the original `File` bytes, before `prepareUploadFile` compresses or re-encodes them, using these tags in this order of preference:
1. the Exif sub-IFD's `DateTimeOriginal` (`0x9003`);
2. otherwise `DateTimeDigitized` (`0x9004`);
3. otherwise IFD0 `DateTime` (`0x0132`).

The reader SHALL support EXIF in JPEG `APP1`, PNG `eXIf`, and WebP `EXIF` chunks. Capture times SHALL be compared as local wall-clock values, ignoring `OffsetTimeOriginal`.

Ties SHALL be broken by `SubSecTimeOriginal` (`0x9291`), compared as a decimal fraction (`"5"` is `.5`, `"20"` is `.20`; a missing value counts as `.0`), then by natural filename order (numeric-aware, case-insensitive). Photos with no valid capture time SHALL follow every dated photo, in natural filename order. A malformed, truncated or all-zero (`0000:00:00 00:00:00`) timestamp SHALL count as no capture time and SHALL NOT reject or fail the upload.

Each file's position in the resulting order SHALL be the `sortOrder` sent with its upload. That position SHALL stay fixed across retries.

`+ Add Print` in the Album Editor SHALL keep appending to the end of the existing album unchanged.

#### Scenario: Folder drop uploads prints oldest-first regardless of pick order
- **WHEN** a curator drops a folder whose files arrive as `C.jpg` (`DateTimeOriginal` `2025:10:05 18:00:00`), `A.jpg` (`2025:10:05 09:00:00`) and `B.jpg` (`2025:10:05 12:30:00`)
- **THEN** the draft SHALL list `A.jpg`, `B.jpg`, `C.jpg`, the uploads SHALL send `sortOrder` `0`, `1`, `2` respectively, and the saved album SHALL render prints in that order

#### Scenario: Same-second burst shots break ties by sub-seconds, then filename
- **WHEN** three files share `DateTimeOriginal` `2025:10:05 12:00:00`: `IMG_10.jpg` with `SubSecTimeOriginal` `20`, `IMG_2.jpg` with `SubSecTimeOriginal` `50`, and `IMG_3.jpg` with no sub-seconds
- **THEN** the order SHALL be `IMG_3.jpg` (`.0`), then `IMG_10.jpg` (`.20`), then `IMG_2.jpg` (`.50`)
- **AND WHEN** two files share the same timestamp and both lack sub-seconds
- **THEN** they SHALL be ordered by natural filename order, so `IMG_2.jpg` comes before `IMG_10.jpg`

#### Scenario: Photos without a capture time follow dated photos
- **WHEN** a folder contains two dated JPEGs, plus a PNG screenshot and a JPEG with EXIF stripped (neither has a capture time)
- **THEN** the two dated JPEGs SHALL come first in capture-time order, followed by the two undated files in natural filename order, and all four SHALL upload successfully

#### Scenario: Missing DateTimeOriginal falls back to DateTimeDigitized, then DateTime
- **WHEN** a file has no `DateTimeOriginal` but has `DateTimeDigitized`, or has neither but has IFD0 `DateTime`
- **THEN** the first available tag in that order SHALL be used as its capture time

#### Scenario: Malformed EXIF degrades to undated instead of failing
- **WHEN** a file's EXIF is truncated, has an IFD offset past the end of the buffer, has a non-ASCII or wrongly shaped timestamp, or holds the all-zero placeholder
- **THEN** the reader SHALL return no capture time without throwing, and the file SHALL be ordered as undated and uploaded normally

#### Scenario: Cap keeps the earliest photos of an oversized folder
- **WHEN** a curator drops a folder of 25 dated photos in arbitrary order
- **THEN** the draft SHALL contain the 20 earliest by capture time in chronological order, and the existing overflow notice SHALL report 5 photos skipped

#### Scenario: Compressed uploads keep their chronological position
- **WHEN** a dated photo larger than 4.0 MiB is compressed by `prepareUploadFile` (which discards EXIF)
- **THEN** its `sortOrder` SHALL still reflect the capture time read from the original file

#### Scenario: Retry keeps the original position
- **WHEN** the second-oldest photo's upload fails and the curator clicks **Retry failed**
- **THEN** the retried upload SHALL send the same `sortOrder` `1`, and the album SHALL keep its chronological order

#### Scenario: Add Print still appends
- **WHEN** a curator uses `+ Add Print` in an existing album's Photos tab with a photo older than every existing print
- **THEN** the new print SHALL be appended at the end, not sorted into position

### Requirement: Playing soundtrack track line scrolls as a Spotify-style marquee when it overflows
`AlbumPlacard`'s **track line** (`Song Title — Artist`) SHALL become a seamless horizontal marquee only while both of these hold:
- that album's soundtrack is **playing** (`soundtrack.playing && soundtrack.activeAlbumId === album.id`), where `playing` means the player reported PLAYING, as defined by "Placard timecode follows the player's reported playback position";
- the line is **overflowing** (laid-out text width exceeds the line's box width by more than `1px`).

The marquee timeline SHALL repeat indefinitely with these phases:
1. A `2000ms` **hold** at the start position, measured from when playing became true (the first PLAYING report after the click, not the click itself).
2. A linear scroll left, at `30px/s`, by exactly `textWidth + 40px`. During the scroll an `aria-hidden` duplicate of the text, `40px` behind the original, arrives at the original's start position.
3. An instant restart that is visually seamless, followed by the next `2000ms` hold.

While the marquee is active, both edges of the line SHALL fade out over `12px`. When it's inactive, the line SHALL truncate with an ellipsis, exactly as it does today.

When playing becomes false, or the line stops overflowing, the marquee SHALL stop immediately and the line SHALL return to its start position. Under `prefers-reduced-motion: reduce`, the marquee SHALL never run.

The timing constants SHALL live in one exported constant. The placard SHALL remain a fixed `214×200px`, and the timecode SHALL be unaffected.

#### Scenario: Long title holds two seconds after play, then scrolls
- **WHEN** a visitor plays an album whose track line `A Very Long Song Title That Keeps Going — Some Artist Name` overflows the placard
- **THEN** the line SHALL stay at its start position for `2000ms` after the player first reports PLAYING, then scroll left at a constant `30px/s`

#### Scenario: The loop is seamless and holds before every cycle
- **WHEN** the marquee completes a scroll cycle
- **THEN** the duplicate text SHALL sit exactly where the original began, the restart SHALL produce no visible jump, and the line SHALL hold for `2000ms` before scrolling again

#### Scenario: Short titles never move
- **WHEN** an album whose track line fits within the placard is played
- **THEN** no animation SHALL run, no duplicate SHALL render, and no edge fade SHALL apply

#### Scenario: Idle placards keep the ellipsis
- **WHEN** an album with an overflowing track line is not playing (for example before play, or while another album is playing)
- **THEN** its track line SHALL be static and truncated with an ellipsis

#### Scenario: Stopping playback snaps the line back
- **WHEN** the soundtrack stops via stop, track end, returning to overview, or another album starting
- **THEN** the animation SHALL be cancelled, the duplicate SHALL be removed, and the line SHALL show its start with an ellipsis

#### Scenario: Reduced motion disables the ticker
- **WHEN** the visitor's OS requests `prefers-reduced-motion: reduce` and they play an album with an overflowing track line
- **THEN** the line SHALL remain static with an ellipsis, and its full text SHALL remain available via the `title` attribute

#### Scenario: Late font load re-evaluates overflow
- **WHEN** the line is measured before TeX Gyre Heros finishes loading and its width changes afterwards
- **THEN** overflow and scroll distance SHALL be re-measured, and the marquee SHALL start, stop or adjust its distance to match

#### Scenario: Accessibility tree sees the title once
- **WHEN** the marquee is active
- **THEN** the duplicate copy SHALL be `aria-hidden="true"`, and the placard button's accessible name SHALL be unchanged

#### Scenario: Measurement disagreement never oscillates
- **WHEN** the browser reports the playing track line as overflowing in its idle layout but fitting once the marquee strip is mounted (or the reverse)
- **THEN** the marquee SHALL activate at most `2` times for that play session, SHALL NOT toggle on every measurement, and the page SHALL stay responsive

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

### Requirement: Placard timecode follows the player's reported playback position
`soundtrack.playing` SHALL mean that the mounted player has reported YouTube player state `1` (PLAYING) and hasn't since reported `-1`, `0`, `2`, `3` or `5`.

Clicking a soundtrack facade SHALL mount the player with `playing: false`. A `player-state` event carrying a state of `1` SHALL set `playing: true`, and any other state SHALL set it false. State `0` SHALL additionally apply the existing `track-ended` transition.

The reported position SHALL be held in a `soundtrackClock` store key, `{ albumId, positionSec, at }`, separate from the `soundtrack` slice. `positionSec` is the last reported `currentTime`; `at` is the `performance.now()` time the report arrived. Writes to `soundtrackClock` SHALL NOT change the identity of `useWallStore.getState().soundtrack`.

The placard timecode SHALL read:
- `0:00` while the player is mounted but not playing and no position has been reported;
- `positionSec + (now − at) / 1000`, clamped to `[0, durationSec]` and floored to whole seconds, while playing;
- the last reported `positionSec` while paused or buffering.

It SHALL keep its `M:SS / M:SS` format and `tabular-nums`. If the bridge is unavailable (no message from the iframe within `3000ms` of its `load` event), the timecode SHALL fall back to the pre-change wall clock, started at the fallback moment.

#### Scenario: Refused autoplay leaves the timecode at zero
- **WHEN** a visitor clicks an unplayed soundtrack facade and the player reports `-1` and then `5`, but never `1`
- **THEN** the placard timecode SHALL read `0:00 / <duration>` for as long as the player stays unstarted, and the track line marquee SHALL NOT start

#### Scenario: Timecode starts when the video starts
- **WHEN** the player reports `3` (buffering) for 2 s after the click, then `1` with `currentTime` `0.2`
- **THEN** the timecode SHALL read `0:00` throughout the buffering, then advance from the PLAYING report, staying within `1s` of the player's reported `currentTime` at every later report

#### Scenario: Pausing in the YouTube controls pauses the timecode
- **WHEN** a playing video reaches `0:42` and the visitor pauses it in the YouTube player (state `2`, `currentTime` `42.3`)
- **THEN** the timecode SHALL hold `0:42`, `soundtrack.playing` SHALL be false, and the marquee SHALL stop and return to its start position

#### Scenario: Track end stops the clock
- **WHEN** the player reports state `0`
- **THEN** `soundtrack.playing` SHALL be false through the `track-ended` transition, and the timecode SHALL stop at no more than `durationSec`

#### Scenario: Position reports do not re-render the wall
- **WHEN** the player sends ten consecutive `infoDelivery` messages that change only `currentTime`
- **THEN** `useWallStore.getState().soundtrack` SHALL keep the same object identity across all ten, and only `soundtrackClock` SHALL change

#### Scenario: Silent bridge falls back to the wall clock
- **WHEN** the iframe fires `load` and sends no message for `3000ms`
- **THEN** `soundtrack.playing` SHALL become true and the timecode SHALL tick as a wall clock from that moment, matching the pre-change behaviour
