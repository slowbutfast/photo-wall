## Automated Tests

- `npx vitest run src/components/admin/__tests__/photoOrderState.test.ts`:
  - `moveItem`, `moveToFirst`, `moveToLast`, `isOrderDirty`.
  - `mergeStaleOrder`: preserves curator's relative order for surviving IDs, drops concurrently deleted IDs, appends newly uploaded IDs at the end, produces zero duplicates.
  - `formatCombinedDateLabel` / `parseCombinedDateLabel`: round-trips `<input type="date">` + `<input type="time">` through `albums.dateLabel` cleanly (both set, date-only, time-only, both empty).
- `npx vitest run src/app/api/__tests__/routes.test.ts`:
  - `GET /api/admin/albums/[id]`: `401` unauthenticated, `404` unknown album, `409` deleting album, `200` with ordered active photos for published and draft albums.
  - `PUT /api/admin/albums/[id]/photo-order`: happy-path `0..n-1` atomic reorder reflected in `GET /api/wall`, idempotent repeat save, `401` unauthenticated, `403` untrusted `Origin`, `404` unknown album, `409 order_stale` (missing ID, duplicate ID, cross-album ID, `deleting` photo ID), cross-album isolation.
  - `PUT /api/admin/album-order`: happy-path `0..m-1` atomic album reorder, `409 order_stale` on stale/incomplete list, `401`/`403` auth & CSRF enforcement.
- `npx vitest run src/lib/__tests__/publicBoundaryAudit.test.ts src/lib/__tests__/rawUrlAudit.test.ts`: Confirms `@dnd-kit/*` and all new admin fetches stay strictly inside `/photos/admin` and wrapped in `withBase()`.
- `npm run typecheck && npm run lint && npm test && npm run build`: Full regression suite exits `0`.

## Manual Verification

- **Photo reordering & persistence**:
  - **WHEN** a curator opens an album in `/photos/admin`, drags print #8 to slot #1 (and tests keyboard arrows + `⤒`/`←`/`→`/`⤓`), clicks **Save Order**, and reloads `/photos`
  - **THEN** the new order persists on the wall, in Album Focus, and in Print Focus `← Prev` / `Next →`.
- **Cross-wall album reordering**:
  - **WHEN** a curator drags Album 3 to slot 1 in **Exhibitions** and clicks **Save Wall Order**
  - **THEN** the wall re-orders immediately and persists across reloads.
- **Details tab & fixed-height placard**:
  - **WHEN** a curator edits **Caption\***, picks **Date** / **Time** via `<input type="date">` / `<input type="time">`, enters **Geotag / Location**, and sets **YouTube Soundtrack** in **Details**
  - **THEN** the fixed-height placard (`214×200px`) updates live with bold Caption, muted optional metadata, and bottom Song Title — Artist + live timecode (no green dot) when playing.
- **Concurrent `409 order_stale` recovery**:
  - **WHEN** Tab B uploads a print while Tab A is reordering, and Tab A clicks **Save Order**
  - **THEN** Tab A merges the new print at the end while preserving its drag order and saves cleanly on retry.
