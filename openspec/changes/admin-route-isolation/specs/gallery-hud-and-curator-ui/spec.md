## RENAMED Requirements

- FROM: `### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger`
  TO: `### Requirement: Strictly read-only public gallery HUD on /`

## MODIFIED Requirements

### Requirement: Strictly read-only public gallery HUD on /
The public `/` visitor interface SHALL omit any lock icon or `Curate` trigger, make zero `GET /api/admin/auth` requests on mount, load zero admin drawer JS chunks, and present only `Overview`, a horizontally scrollable bottom Exhibition Room Directory with subtle edge fade masks, and the unobstructed `PhotoFocusBar`, consuming published-only `GET /api/wall`.

#### Scenario: Public visitor on / sees zero admin controls and triggers zero auth requests
- **WHEN** any visitor loads `/`
- **THEN** the top-right HUD SHALL display only `Overview` (no lock icon or `Curate` button), the browser SHALL make zero requests to `/api/admin/*`, and no loaded JS response on `/` SHALL contain admin-only bundle code (`AdminDrawer` / `FolderDropzone`)

### Requirement: Lazy-loaded Curator Drawer with resilient folder upload and soundtrack editor
Admin UI code SHALL be reachable exclusively from `/admin` (never imported or triggered on `/`) and SHALL support recursive folder drag-and-drop (synchronous `dataTransfer.items` snapshot, looping `readEntries()` past 100 entries, leaf-folder grouping, `32px` ThumbHash, UUIDv7 + XHR `upload.onprogress`), optional YouTube URL paste (`POST /api/admin/youtube/inspect` with hidden `YT.Player.getDuration()` capture) with editable **Artist** and **Song Title**, optional **Camera / Date / Location** inputs, client-local **Lighting Preview**, **Pending Deletions** retry list, explicit `PATCH` publish on all-success, and per-file retry + draft Resume/Discard on partial failure.

#### Scenario: Dropping a folder with >100 photos and mixed video files succeeds and publishes from /admin
- **WHEN** an authenticated curator on `/admin` drops a folder containing 120 photos and 3 `.mp4` videos onto the Curator dropzone
- **THEN** the uploader SHALL read all 120 photos, notify that the 3 videos were skipped, upload all 120 via XHR, send `PATCH` to publish the album, and refresh the wall and GPU lightmap live

## ADDED Requirements

### Requirement: Request-time server-gated /admin route for Curator UI and live draft preview
All album CRUD UI (`AdminDrawer`, `FolderDropzone`, draft management, Pending Deletions retry, Logout, and client-local Lighting Preview) SHALL live exclusively under `/admin` (`metadata: { robots: { index: false, follow: false } }`). Compatible with Next.js 16 `cacheComponents: true` (without `export const dynamic = 'force-dynamic'`), `/admin` SHALL wrap its request-time logic in `<Suspense>`, call `await connection()` (or `await cookies()`) *before* reading `process.env.ADMIN_ENABLED` (returning `notFound()` unless strictly `'true'`), and verify the HTTP-only session cookie on the server—rendering only `<AdminLoginForm />` (which calls `router.refresh()` on login) when unauthenticated, and rendering `<AdminWallApp />` (with Logout `DELETE /api/admin/auth` → `router.refresh()` and `PhotoWallApp` wired to `manifestUrl="/api/admin/wall-preview"`) when authenticated. Drafts SHALL render in their `sortOrder` positions (previewing the post-publish wall) with a distinct `"Draft"` visual indicator; mutations in `AdminDrawer` SHALL call `useWallManifest.refetch()` and re-bake the `PbrWallCanvas` GPU lightmap live.

#### Scenario: Unauthenticated visitor to /admin sees only the login form and noindex metadata
- **WHEN** an unauthenticated visitor requests `/admin` while `ADMIN_ENABLED=true`
- **THEN** the server SHALL respond with `robots: noindex, nofollow` and render only `<AdminLoginForm />` without shipping the Curator shell or draft manifest

#### Scenario: Authenticated curator on /admin previews drafts live and re-bakes the lightmap on mutation
- **WHEN** an authenticated curator on `/admin` creates, publishes, edits, or deletes an album
- **THEN** `AdminDrawer` SHALL invoke `useWallManifest.refetch()` against uncached `GET /api/admin/wall-preview`, visually mark draft albums, and re-bake the `PbrWallCanvas` GPU lightmap live while `/` continues to show only published albums from `GET /api/wall`
