## ADDED Requirements

### Requirement: Fail-closed admin route proxy gate and uncached draft preview manifest
The application SHALL gate `/admin`, `/admin/:path*`, `/api/admin`, and `/api/admin/:path*` (auto-prefixed with `BASE_PATH = '/photos'`) in `src/proxy.ts` while retaining `requireAdmin` and `guardAdminMutation` inside every route handler as defense in depth. When `process.env.ADMIN_ENABLED !== 'true'`, `src/proxy.ts` SHALL return `404 Not Found`. When `ADMIN_ENABLED === 'true'`, `src/proxy.ts` SHALL set `X-Robots-Tag: noindex, nofollow` and verify the `photowall_session` JWT via `jose`, redirecting unauthenticated `/admin` requests (other than `/admin/login`) to `/photos/admin/login` and returning `401 Unauthorized` for unauthenticated `/api/admin/*` requests (other than `/api/admin/auth`). An authenticated, uncached `GET /api/admin/wall-preview` endpoint SHALL return published and draft albums laid out via `computeWallGridPositions(..., { includeStatuses: ['published', 'draft'] })` with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`.

#### Scenario: Disabled admin kill switch returns 404
- **WHEN** `ADMIN_ENABLED` is unset or not `'true'` and a request hits `/photos/admin` or `/photos/api/admin/auth`
- **THEN** `src/proxy.ts` SHALL return `404 Not Found`

#### Scenario: Unauthenticated Studio request redirects to login
- **WHEN** `ADMIN_ENABLED === 'true'` and an unauthenticated browser requests `/photos/admin`
- **THEN** `src/proxy.ts` SHALL redirect to `/photos/admin/login` with `X-Robots-Tag: noindex, nofollow`

#### Scenario: Authenticated wall-preview returns published and draft albums uncached
- **WHEN** an authenticated curator requests `GET /photos/api/admin/wall-preview`
- **THEN** the response SHALL be `200 OK` with `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, and both `published` and `draft` albums laid out for `<GalleryCanvas mode="preview" />`, while `GET /photos/api/wall` continues excluding drafts
