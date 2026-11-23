## ADDED Requirements

### Requirement: Fail-closed proxy gate for /admin and all /api/admin/* endpoints
Next.js 16 `src/proxy.ts` SHALL match `/admin`, `/admin/:path*`, and `/api/admin/:path*` and return `404 Not Found` unless `process.env.ADMIN_ENABLED === 'true'` (failing closed on unset, `'false'`, `'1'`, or empty values), covering every admin page and every GET, POST, PATCH, and DELETE endpoint uniformly.

#### Scenario: Disabled ADMIN_ENABLED returns 404 across /admin and all /api/admin/* routes
- **WHEN** `ADMIN_ENABLED` is unset or not strictly `'true'` and a client requests `/admin`, `GET /api/admin/auth`, `GET /api/admin/albums`, `GET /api/admin/wall-preview`, `POST /api/admin/youtube/inspect`, or `POST /api/admin/deletions/retry`
- **THEN** `src/proxy.ts` SHALL respond with `404 Not Found` before invoking any route handler or rendering any page

### Requirement: Authenticated admin wall-preview manifest endpoint
`GET /api/admin/wall-preview` SHALL enforce `requireAdmin(request)` (`401 Unauthorized` when unauthenticated) and return published + draft albums positioned via `computeWallGridPositions` alongside `cdnBase` for live curation preview in `/admin` (excluding `'deleting'` tombstones).

#### Scenario: Unauthenticated request to /api/admin/wall-preview is rejected with 401
- **WHEN** an unauthenticated client sends `GET /api/admin/wall-preview` while `ADMIN_ENABLED=true`
- **THEN** the endpoint SHALL respond with `401 Unauthorized`
