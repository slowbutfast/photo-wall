## ADDED Requirements

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

### Requirement: Fixed-height placard anatomy with unified Caption, optional metadata, and live timecode
Gallery placards on both `/photos` and `/photos/admin` SHALL maintain fixed `214×200px` proportions top-aligned beside the photo grid (never stretching to photo-grid height), with the matte-black Soundtrack Plaque beneath when a soundtrack is attached. Each placard SHALL display:
1. Primary bold **Caption** (`albums.title`) anchored top-left.
2. Tight optional muted **Metadata line** showing only populated `[Date · Time · Location]` fields.
3. When a soundtrack is attached, a bottom-pinned footer above the two bottom standoff pins showing **Song Title — Artist** and a **live-updating timecode** (`tabular-nums`, e.g. `0:42 / 3:25`) with no green indicator dot.

#### Scenario: Playing a soundtrack ticks the placard timecode cleanly without a status dot
- **WHEN** a visitor or curator plays an album's Soundtrack Plaque
- **THEN** the placard's bottom timecode SHALL update automatically in `M:SS / M:SS` format using `tabular-nums` with no green indicator dot, and the placard height SHALL remain fixed at `214×200px`
