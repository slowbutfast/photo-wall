## ADDED Requirements

### Requirement: Fail-closed proxy gate for /admin and all /api/admin/* endpoints
Next.js 16 `src/proxy.ts` SHALL match `/admin`, `/admin/:path*`, `/api/admin`, and `/api/admin/:path*`, returning `404 Not Found` unless `process.env.ADMIN_ENABLED === 'true'` (failing closed on unset, `'false'`, `'1'`, or empty values) across every GET, POST, PATCH, and DELETE route, and SHALL attach `X-Robots-Tag: noindex` to `/api/admin/*` responses. `src/proxy.ts` acts strictly as an extra fail-closed gate and SHALL NOT replace `requireAdmin` / `guardAdminMutation` inside route handlers.

#### Scenario: Disabled ADMIN_ENABLED returns 404 across /admin and all /api/admin/* routes and methods
- **WHEN** `ADMIN_ENABLED` is unset or not strictly `'true'` and a client sends `GET`, `POST`, `PATCH`, or `DELETE` requests to `/admin`, `/admin/`, `/api/admin`, `/api/admin/auth`, `/api/admin/albums`, `/api/admin/albums/[id]/photos`, `/api/admin/wall-preview`, `/api/admin/youtube/inspect`, or `/api/admin/deletions/retry`
- **THEN** `src/proxy.ts` SHALL respond with `404 Not Found` before invoking any route handler or rendering any page

### Requirement: Uncached authenticated admin wall-preview endpoint and draft-aware layout option
`computeWallGridPositions(albums, options)` SHALL accept `{ includeStatuses?: AlbumStatus[] }` defaulting to `['published']` (preserving published-only public layout). `getAdminWallPreview()` and `GET /api/admin/wall-preview` SHALL NOT use `'use cache'`, SHALL enforce `requireAdmin(request)` (`401 Unauthorized` when unauthenticated), SHALL respond with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`, and SHALL return published + draft albums (excluding `'deleting'`) positioned via `computeWallGridPositions(albums, { includeStatuses: ['published', 'draft'] })` alongside `cdnBase`.

#### Scenario: Unauthenticated request to /api/admin/wall-preview is rejected with 401
- **WHEN** an unauthenticated client sends `GET /api/admin/wall-preview` while `ADMIN_ENABLED=true`
- **THEN** the endpoint SHALL respond with `401 Unauthorized`

#### Scenario: Authenticated wall-preview returns uncached published and draft albums without regressing public layout
- **WHEN** an authenticated curator requests `GET /api/admin/wall-preview` while both `published` and `draft` albums exist
- **THEN** the response SHALL include `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`, lay out both `published` and `draft` albums without overlap via `includeStatuses`, and leave default `computeWallGridPositions(albums)` published-only
