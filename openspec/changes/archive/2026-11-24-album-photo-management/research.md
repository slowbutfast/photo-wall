## Source material

**2026-11-24, two-agent architecture proposals + maintainer visual playtest sign-off (`playgrounds/album_curator_playground.html`):**

- Atomic within-album photo ordering via `PUT /api/admin/albums/[id]/photo-order` (`{ photoIds: string[] }`) enforcing full permutation against active (non-`deleting`) photos (`409 order_stale` on mismatch), renumbering densely `0..n-1` in a single `db.batch([...updates])`, and calling `revalidateTag('wall', { expire: 0 })` once.
- Cross-wall album ordering via `PUT /api/admin/album-order` (`{ albumIds: string[] }`) using the same full-permutation `db.batch` + `409 order_stale` pattern over non-`deleting` albums.
- `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` approved for pointer, touch, and keyboard reordering inside the `/photos/admin` Studio bundle (`0 KB` shipped to public `/photos`).
- Visual playtest refinements locked in on `playgrounds/album_curator_playground.html`:
  - Fixed-height placards (`214×200px` top-aligned beside the photo grid, with matte-black Soundtrack Plaque beneath, never stretching to photo-grid height).
  - Unified placard anatomy: primary bold **Caption** (replaces separate Title + Caption; maps to `albums.title`), optional muted **[Date · Time · Location]** line (collapses when empty), and bottom-pinned **Song Title — Artist** + **live-updating timecode** (`tabular-nums`, no green dot) above the two bottom standoff pins.
  - Album Editor has two tabs: **`Photos (N)`** (wall-matched `gridColumns` thumbnail grid with top-right `×` delete overlay + 4-column directional controls `⤒`/`←`/`→`/`⤓` + Grid/List toggle + `+ Add Print` + `409 order_stale` merge banner + explicit **Save Order / Discard** bar) and **`Details`** (required `*` on **Caption\*** and **Wall Grid Columns\***, bare labels on optional `<input type="date">` + `<input type="time">` stored together in `albums.dateLabel`, **Geotag / Location**, and full **YouTube Soundtrack** Video Link + Inspect + Song Title + Artist + Clear).

### Raised but not acted on

- **Dedicated `timeLabel` DB column:** Rejected in favor of formatting `<input type="date">` + `<input type="time">` together into the existing `albums.dateLabel` column so zero Drizzle DB migration is required.
- **Autosave on every drag drop:** Rejected because each save calls `revalidateTag('wall')` and a mid-drag `409` is disruptive; explicit **Save Order / Discard** bar is used instead.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Full permutation | `photoIds` (or `albumIds`) contains every active (non-`deleting`) ID in the target set exactly once—no duplicates, no missing IDs, no foreign IDs. | A partial list or sparse index update. |
| `409 order_stale` | Optimistic concurrency rejection when another tab/request added or deleted a photo/album since the editor loaded, returning `{ error: 'order_stale', activePhotoIds }` (or `activeAlbumIds`) so the client merges cleanly. | A fatal conflict that discards the curator's drag arrangement. |
| Unified Caption | The single primary placard line stored in `albums.title` (`description` no longer displayed separately on the placard). | A separate second paragraph beneath a title. |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` | **Adopted** | Touch, pointer, and keyboard (`Space` + Arrow keys) grid sorting; ships only in `/photos/admin` (`0 KB` on `/photos`). | 2026-11-24 |
| Native HTML5 Drag-and-Drop | Rejected | Broken on mobile touch and lacks accessible keyboard sorting. | 2026-11-24 |

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `photos.sortOrder` and `albums.sortOrder` exist | Both integer columns exist with default `0` | Read `src/db/schema.ts:13,49` | 2026-11-24 | stable |
| Read path orders by `(sortOrder, createdAt)` | `listPublishedAlbumsWithPhotos()` and `listAdminAlbums()` order by `asc(sortOrder), asc(createdAt)` | Read `src/db/repository.ts:44,60,85` | 2026-11-24 | stable |
| Grid layout is row-major | `computeAlbumGrid` places cell `i` at `row = floor(i / columns)`, `col = i % columns` | Read `src/lib/layout/islandLayout.ts` | 2026-11-24 | stable |
| `GET /api/admin/albums/[id]` does not exist yet | `src/app/api/admin/albums/[id]/route.ts` only exports `PATCH` and `DELETE` | Read `src/app/api/admin/albums/[id]/route.ts` | 2026-11-24 | stable |

## Links out

- `openspec/changes/admin-route-isolation/`: prerequisite change creating `/photos/admin` persistent split Curator Studio and `<GalleryCanvas mode="preview" />`.
- `playgrounds/album_curator_playground.html`: approved interactive visual reference for the Studio sidebar, photo grid, `Details` tab, and fixed-height placard anatomy.
