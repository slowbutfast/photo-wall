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

### Requirement: Fail-closed environment templates, boot-time auth checks, and strict proxy-chain fallback
`.env.example` SHALL use empty/fail-closed placeholders for `ADMIN_PASSWORD` and `AUTH_SECRET` (never valid-length hardcoded strings) with secret-generation instructions, and `.env.example` + `README.md` SHALL document `TRUSTED_PROXY_HOPS=1` (for Cloudflare Tunnel) and the `x-real-ip` proxy overwrite requirement. `src/instrumentation.ts` SHALL check `ADMIN_PASSWORD` length at boot (throwing in production and logging a loud warning in dev if `< 16` chars) and warn in production if `TRUSTED_PROXY_HOPS` is unset. When `TRUSTED_PROXY_HOPS` is configured and `X-Forwarded-For` has fewer entries than `hops`, `getClientKey` SHALL return `'direct'` rather than falling back to client-controllable `X-Real-IP`.

#### Scenario: Short X-Forwarded-For chain under configured TRUSTED_PROXY_HOPS returns direct instead of X-Real-IP
- **WHEN** `TRUSTED_PROXY_HOPS=2` and a request arrives with a 1-entry `X-Forwarded-For` and a spoofed `X-Real-IP`
- **THEN** `getClientKey(request)` SHALL return `'direct'` and SHALL NOT trust `X-Real-IP`

#### Scenario: Boot check rejects short ADMIN_PASSWORD in production
- **WHEN** `NODE_ENV=production` and `ADMIN_PASSWORD` is shorter than 16 characters during `register()`
- **THEN** `src/instrumentation.ts` SHALL throw an explicit configuration error at startup
