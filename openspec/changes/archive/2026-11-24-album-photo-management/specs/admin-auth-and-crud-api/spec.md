## ADDED Requirements

### Requirement: Single-album admin read and atomic full-permutation photo and album reordering
The admin API SHALL provide:
- `GET /api/admin/albums/[id]` (guarded by `requireAdmin`) returning `{ album, photos, cdnBase }` with all `status = 'active'` photos ordered by `(sortOrder, createdAt)` for both `published` and `draft` albums (`404` if missing, `409 album_deleting` if deleting).
- `PUT /api/admin/albums/[id]/photo-order` (guarded by `guardAdminMutation`) accepting `{ photoIds: string[] }`, validating that `photoIds` is an exact permutation of the album's active (`status = 'active'`) photo IDs (no duplicates, no missing IDs, no foreign/cross-album/deleting IDs), returning `409 order_stale` with `{ error: 'order_stale', activePhotoIds }` on mismatch, persisting dense `sortOrder = 0..n-1` atomically in a single `db.batch([...])`, and calling `revalidateTag('wall', { expire: 0 })` exactly once.
- `PUT /api/admin/album-order` (guarded by `guardAdminMutation`) accepting `{ albumIds: string[] }`, validating an exact permutation of all non-`deleting` album IDs (`published` and `draft`), returning `409 order_stale` with `{ error: 'order_stale', activeAlbumIds }` on mismatch, persisting dense `sortOrder = 0..m-1` atomically in a single `db.batch([...])`, and calling `revalidateTag('wall', { expire: 0 })` exactly once.

#### Scenario: Atomic photo reorder persists across wall and Print Focus navigation
- **WHEN** an authenticated curator sends `PUT /photos/api/admin/albums/[id]/photo-order` with a valid permutation of all active photo IDs in that album
- **THEN** the server SHALL return `200`, assign dense `sortOrder` `0..n-1` atomically without altering any other album, revalidate the `wall` cache tag once, and subsequent `GET /photos/api/wall` and `GET /photos/api/admin/albums/[id]` responses SHALL return photos in that exact order

#### Scenario: Stale, duplicate, missing, or cross-album photo IDs return 409 order_stale
- **WHEN** `PUT /photos/api/admin/albums/[id]/photo-order` receives a list missing an active photo, containing a duplicate ID, containing a photo from another album, or containing a `deleting` photo
- **THEN** the server SHALL reject the request with `409` `{ error: 'order_stale', activePhotoIds }` without modifying any `sortOrder`

#### Scenario: Atomic cross-wall album reorder persists and rejects stale lists
- **WHEN** an authenticated curator sends `PUT /photos/api/admin/album-order` with an exact permutation of non-`deleting` album IDs
- **THEN** the server SHALL return `200` and persist dense `albums.sortOrder` `0..m-1` atomically; if the list is stale or incomplete, it SHALL return `409` `{ error: 'order_stale', activeAlbumIds }`

#### Scenario: Unauthenticated or cross-origin reorder requests are rejected
- **WHEN** a client sends `PUT /photos/api/admin/albums/[id]/photo-order` or `PUT /photos/api/admin/album-order` without a valid `photowall_session` cookie or with an untrusted `Origin`
- **THEN** the server SHALL return `401 Unauthorized` or `403 Forbidden` respectively
