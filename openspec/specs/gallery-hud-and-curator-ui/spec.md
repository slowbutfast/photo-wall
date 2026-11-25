# gallery-hud-and-curator-ui Specification

## Purpose
Delivers a strictly read-only public gallery HUD, an unobstructed Photo Focus label bar, and a server-gated Curator Studio at `/photos/admin` with a shared draft-aware wall preview, recursive folder uploads, draft resume/discard, and partial-failure retries.
## Requirements
### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger
Public `/photos` SHALL be strictly read-only with zero curator triggers, zero admin imports, and zero `/api/admin/auth` requests on page load. The public HUD SHALL enforce global Helvetica (`"Helvetica Neue", Helvetica, "TeX Gyre Heros", Arial, sans-serif`) across all controls, present a flush sharp-edged top-right `Overview` control (`gap: 0`, `border-radius: 0`, `24px` inset, solid `#FFFFFF` fill + `#111111` ink when active and solid `#111111` fill + `#FFFFFF` ink when inactive), and render no album directory: albums are discovered through the wall's placards, and the only bottom bar is the Print Focus bar. A static import-graph audit (`publicBoundaryAudit.test.ts`) SHALL enforce that `src/app/(gallery)` never transitively imports `@/components/admin/*` or references `/api/admin`.

#### Scenario: Public gallery loads zero admin UI or auth calls
- **WHEN** a visitor opens `/photos`
- **THEN** no lock or `Curate` button SHALL render, zero requests SHALL be made to `/photos/api/admin/*`, and zero admin JS chunks SHALL be downloaded

#### Scenario: No album directory bar and top-right buttons are flush sharp-edged
- **WHEN** the gallery loads in Overview or Album Focus
- **THEN** no `.hud-directory` element SHALL exist (album names appear only on wall placards; the Print Focus bar is the only bottom bar), and `.hud-top-right .hud-button` SHALL have `border-radius: 0px` with `gap: 0px` and solid `#FFFFFF`/`#111111` active/inactive contrast

### Requirement: Unobtrusive Photo Focus bar with album caption and optional manual metadata
Inspecting a single print SHALL anchor `← PREV`, `NEXT →`, the **album's caption** as a single-line centered **Title Case** Helvetica primary line (`text-transform: none`), an optional subtle subtitle containing only owner-entered fields (**Camera**, **Date**, **Location** — all off/empty by default, with zero auto-extracted EXIF), and `RETURN [ESC]` to a bright, spacious light-frosted full-width bottom bar (`rgba(244, 244, 242, 0.92)` background, `#111111` primary ink, `rgba(17, 17, 17, 0.62)` secondary ink, subtle `1px solid rgba(17, 17, 17, 0.12)` top hairline, `backdrop-filter: blur(12px)`) without blurring the gallery background (stacking caption cleanly above `>= 44px` touch controls on `< 768px` viewports).

#### Scenario: Stepping through prints shows album caption and only populated manual fields
- **WHEN** a visitor inspects a print in an album where only `Camera` and `Location` were entered by the owner (and `Date` was left empty)
- **THEN** the bottom bar SHALL display the album caption in Title Case on a light frosted `rgba(244, 244, 242, 0.92)` surface with `#111111` ink and `Camera • Location` underneath, omitting `Date` and any auto-extracted lens/shutter EXIF

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
- that album's soundtrack is **playing** (`soundtrack.playing && soundtrack.activeAlbumId === album.id`);
- the line is **overflowing** (laid-out text width exceeds the line's box width by more than `1px`).

The marquee timeline SHALL repeat indefinitely with these phases:
1. A `2000ms` **hold** at the start position, measured from when playing became true.
2. A linear scroll left, at `30px/s`, by exactly `textWidth + 40px`. During the scroll an `aria-hidden` duplicate of the text, `40px` behind the original, arrives at the original's start position.
3. An instant restart that is visually seamless, followed by the next `2000ms` hold.

While the marquee is active, both edges of the line SHALL fade out over `12px`. When it's inactive, the line SHALL truncate with an ellipsis, exactly as it does today.

When playing becomes false, or the line stops overflowing, the marquee SHALL stop immediately and the line SHALL return to its start position. Under `prefers-reduced-motion: reduce`, the marquee SHALL never run.

The timing constants SHALL live in one exported constant. The placard SHALL remain a fixed `214×200px`, and the timecode SHALL be unaffected.

#### Scenario: Long title holds two seconds after play, then scrolls
- **WHEN** a visitor plays an album whose track line `A Very Long Song Title That Keeps Going — Some Artist Name` overflows the placard
- **THEN** the line SHALL stay at its start position for `2000ms` after the play click, then scroll left at a constant `30px/s`

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
