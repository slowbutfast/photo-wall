## RENAMED Requirements

- FROM: `### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger`
  TO: `### Requirement: Strictly read-only public gallery HUD on /`

## MODIFIED Requirements

### Requirement: Strictly read-only public gallery HUD on /
The public `/` visitor interface SHALL omit top-left coordinate telemetry, omit any lock icon or `Curate` trigger, make zero `GET /api/admin/auth` requests on mount, import zero admin drawer chunks, and present only `Overview`, a horizontally scrollable bottom Exhibition Room Directory with subtle edge fade masks, and the unobstructed `PhotoFocusBar`, consuming published-only `GET /api/wall`.

#### Scenario: Public visitor on / sees zero admin controls and triggers zero auth requests
- **WHEN** any visitor loads `/`
- **THEN** the top-right HUD SHALL display only `Overview` (no lock icon or `Curate` button), the browser SHALL make zero requests to `/api/admin/auth`, and the `/` route SHALL load zero `AdminDrawer` / `FolderDropzone` chunks

## ADDED Requirements

### Requirement: Dynamic server-gated /admin route for Curator UI and live draft preview
All album CRUD UI (`AdminDrawer`, `FolderDropzone`, draft management, Pending Deletions retry, and client-local Lighting Preview) SHALL live exclusively under `/admin` (`export const dynamic = 'force-dynamic'`, `robots: { index: false, follow: false }`). `/admin` SHALL verify `process.env.ADMIN_ENABLED === 'true'` (`notFound()` otherwise) and verify the HTTP-only session cookie on the server per request—rendering only a minimal `<AdminLoginForm />` when unauthenticated and rendering `<AdminWallApp />` (sharing `PhotoWallApp` with `manifestUrl="/api/admin/wall-preview"` to show published + draft albums live) when authenticated.

#### Scenario: Unauthenticated visitor to /admin sees only the login form and noindex metadata
- **WHEN** an unauthenticated visitor requests `/admin` while `ADMIN_ENABLED=true`
- **THEN** the server SHALL respond with `robots: noindex, nofollow` and render only `<AdminLoginForm />` without shipping the Curator shell or draft manifest

#### Scenario: Authenticated curator on /admin previews drafts live without exposing them on /
- **WHEN** an authenticated curator opens `/admin` and creates or publishes a draft album
- **THEN** `/admin` SHALL render published + draft albums from `GET /api/admin/wall-preview` and update the wall live on publish/edit/delete, while `/` continues to show only published albums from `GET /api/wall`
