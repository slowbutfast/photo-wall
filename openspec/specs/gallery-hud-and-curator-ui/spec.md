# gallery-hud-and-curator-ui Specification

## Purpose
Delivers a strictly read-only public gallery HUD, an unobstructed Photo Focus label bar, and a server-gated Curator Studio at `/photos/admin` with a shared draft-aware wall preview, recursive folder uploads, draft resume/discard, and partial-failure retries.
## Requirements
### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger
Public `/photos` SHALL be strictly read-only with zero curator triggers, zero admin imports, and zero `/api/admin/auth` requests on page load. The public HUD SHALL present the playground's exact Swiss-label top-right `Overview` control (`11px`, `500`, `uppercase`, `0.1em`, `24px` inset), compact centered translucent bottom dock (`max-width: min(760px, calc(100vw - 48px))`, `rgba(18,18,18,0.85)`, `blur(8px)`, horizontal edge fade masks), and tracked uppercase `PhotoFocusBar` (`← PREV` / `NEXT →` / `RETURN [ESC]`). A static import-graph audit (`publicBoundaryAudit.test.ts`) SHALL enforce that `src/app/(gallery)` never transitively imports `@/components/admin/*` or references `/api/admin`.

#### Scenario: Public gallery loads zero admin UI or auth calls
- **WHEN** a visitor opens `/photos`
- **THEN** no lock or `Curate` button SHALL render, zero requests SHALL be made to `/photos/api/admin/*`, and zero admin JS chunks SHALL be downloaded

### Requirement: Unobtrusive Photo Focus bar with album caption and optional manual metadata
Inspecting a single print SHALL anchor `Prev`, `Next`, the **album's caption** as the primary line, an optional subtle subtitle containing only owner-entered fields (**Camera**, **Date**, **Location**—all off/empty by default, with zero auto-extracted EXIF), and `Return (Esc)` to a full-width bottom bar without blurring the gallery background.

#### Scenario: Stepping through prints shows album caption and only populated manual fields
- **WHEN** a visitor inspects a print in an album where only `Camera` and `Location` were entered by the owner (and `Date` was left empty)
- **THEN** the bottom bar SHALL display the album caption as its title and `Camera • Location` underneath, omitting `Date` and any auto-extracted lens/shutter EXIF

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
