## Why

Curators currently have no UI to reorder photos within an album, reorder albums across the wall, or edit an existing album's placard metadata, grid columns, and YouTube soundtrack after upload. Calling `PATCH /api/admin/photos/[id]` N times per reorder risks partial failures, duplicate `sortOrder` ties, and N wall cache invalidations. Adding atomic full-permutation reorder endpoints and docking a full Album & Photo Editor into the `/photos/admin` Curator Studio completes end-to-end gallery curation with live wall-preview feedback.

**Ordering / Dependency:** Lands **after `admin-route-isolation`** (which establishes `/photos/admin`, `<GalleryCanvas mode="preview" />`, and the Studio sidebar).

## What Changes

- **Atomic Reorder & Album Read APIs:**
  - `GET /api/admin/albums/[id]`: authenticated (`requireAdmin`) album detail returning `{ album, photos, cdnBase }` with active (non-`deleting`) photos ordered by `(sortOrder, createdAt)`.
  - `PUT /api/admin/albums/[id]/photo-order`: authenticated (`guardAdminMutation`) full-permutation reorder accepting `{ photoIds: string[] }`, returning `409 order_stale` (with `activePhotoIds`) on missing/extra/duplicate/cross-album/deleting IDs, renumbering `0..n-1` atomically in one `db.batch([...])`, and calling `revalidateTag('wall', { expire: 0 })` once.
  - `PUT /api/admin/album-order`: identical full-permutation atomic `db.batch` + `409 order_stale` + single `revalidateTag('wall')` over non-`deleting` albums' `sortOrder`.
- **Pure Order & Conflict-Merge State (`src/components/admin/photoOrderState.ts`):** Pure helpers (`moveItem`, `moveToFirst`, `moveToLast`, `isOrderDirty`, `mergeStaleOrder`) so `409 order_stale` recovery preserves the curator's drag arrangement while appending newly added items and dropping deleted ones.
- **Curator Studio Album & Photo Management UI (docked in `/photos/admin` Exhibitions tab):**
  - **Exhibitions List:** Published/Draft filter, `@dnd-kit/sortable` drag-and-drop + `↑`/`↓` cross-wall album ordering with explicit **Save Wall Order / Discard** bar, and click-to-edit (bi-directional selection with `<GalleryCanvas mode="preview" />`).
  - **Album Editor (`Photos (N)` tab):** Wall-matched `gridColumns` thumbnail grid (`256px` LOD) with `@dnd-kit/sortable` pointer/touch/keyboard dragging, top-right `×` delete overlay, 4-column directional buttons (`⤒`/`←`/`→`/`⤓`), Grid/List view toggle, inline `+ Add Print` (reusing `imageCompressor.ts`), read-only state when `<= 1` photo, live optimistic preview on `<GalleryCanvas>`, sticky **Save Order / Discard** bar, and `409 order_stale` merge banner + network retry.
  - **Album Editor (`Details` tab):** Required `*` labels on **Caption\*** (`albums.title`) and **Wall Grid Columns\*** (`2–5`); clean bare labels on optional `<input type="date">` + `<input type="time">` (formatted together into `albums.dateLabel`, zero DB migration), **Geotag / Location**, and full **YouTube Soundtrack** controls (Video Link + Inspect, Song Title, Artist, Clear); Publish/Draft toggle and 2-step Delete Album.
- **Fixed-Height Placard Anatomy (Production Wall + Studio Preview):** Update `PlaygroundGallery` / `GalleryCanvas` and `playground-wall.css` so placards display the unified bold **Caption**, optional muted **[Date · Time · Location]** line, and bottom-pinned **Song Title — Artist** + **live-updating timecode** (`tabular-nums`, no green dot) above the two bottom standoff pins, at fixed `214×200px` height with the matte-black Soundtrack Plaque beneath.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `admin-auth-and-crud-api`: Add `GET /api/admin/albums/[id]`, atomic `PUT /api/admin/albums/[id]/photo-order`, and atomic `PUT /api/admin/album-order` with full-permutation `409 order_stale` optimistic concurrency and single `revalidateTag('wall')`.
- `gallery-hud-and-curator-ui`: Add the Curator Studio Exhibitions wall-order editor and two-tab Album Editor (`Photos` + `Details`) with `@dnd-kit/sortable`, live `<GalleryCanvas>` preview sync, native `<input type="date">`/`<input type="time">` pickers, full YouTube soundtrack editing, and the updated fixed-height placard anatomy with bottom live timecode.

## Impact

- **Dependencies:** Adds `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` (imported exclusively in `/photos/admin`, verified `0 KB` on `/photos` by `publicBoundaryAudit.test.ts`).
- **Database:** Zero schema migrations (`albums.title`, `albums.dateLabel`, `albums.locationLabel`, `albums.sortOrder`, `photos.sortOrder`, and soundtrack columns already exist).
- **Code:** `src/db/repository.ts`, `src/app/api/admin/albums/[id]/route.ts`, `src/app/api/admin/albums/[id]/photo-order/route.ts`, `src/app/api/admin/album-order/route.ts`, `src/components/admin/{photoOrderState.ts,AlbumEditor.tsx,CuratorStudio.tsx}`, `src/components/wall/{GalleryCanvas.tsx,PlaygroundGallery.tsx}`, `src/app/playground-wall.css`, `src/app/globals.css`.
