## MODIFIED Requirements

### Requirement: Single build-time base path
The app SHALL be served under the base path `/photos`. The value SHALL be defined exactly once, as the exported constant `BASE_PATH` in `src/lib/basePath.ts`, and `next.config.ts` SHALL set `basePath` by importing that constant. No other module SHALL hard-code the string `/photos`. The base path SHALL NOT vary by deployment environment.

#### Scenario: Pages and route handlers resolve under the base path
- **WHEN** a production build is served and a client requests `/photos`, `/photos/api/wall` and `/photos/textures/wall/wall_albedo.webp`
- **THEN** each SHALL return `200`, and the same paths without the `/photos` prefix SHALL return `404`

#### Scenario: Base path has one source of truth
- **WHEN** the repository is searched for the literal `'/photos'` or `"/photos"` outside `src/lib/basePath.ts`, tests and OpenSpec artifacts
- **THEN** there SHALL be no matches

## ADDED Requirements

### Requirement: Preview deployments redirect the root into the base path
When `VERCEL_ENV` is `preview` at build time, the app SHALL register temporary (`307`) redirects, outside the base path, from `/` to `BASE_PATH`, from `/admin` to `BASE_PATH + '/admin'`, and from `/admin/:path*` to `BASE_PATH + '/admin/:path*'`. Destinations SHALL be derived from `BASE_PATH`. For any other `VERCEL_ENV` value, or when it is unset, no such redirects SHALL be registered. These redirects SHALL be redirects, never rewrites, so that every admin request reaches `proxy.ts` under the base path.

#### Scenario: Preview root opens the wall
- **WHEN** a preview build is served and a client requests `/`
- **THEN** the response SHALL be `307` with `Location: /photos`, and following it SHALL return the wall with `200`

#### Scenario: Preview admin path reaches the gated admin page
- **WHEN** a preview build is served and a signed-out client requests `/admin`
- **THEN** the response SHALL be `307` to `/photos/admin`, which `proxy.ts` SHALL then redirect to `/photos/admin/login` (or answer `404` when `ADMIN_ENABLED` is not `'true'`)

#### Scenario: Nested admin paths and query strings are preserved
- **WHEN** a preview build is served and a client requests `/admin/login?next=x`
- **THEN** the response SHALL be `307` to `/photos/admin/login?next=x`

#### Scenario: Non-preview builds register no root redirects
- **WHEN** `previewRootRedirects` is called with `'production'`, `'development'` or `undefined`
- **THEN** it SHALL return an empty list, and a production build SHALL keep answering `404` for `/` and `/admin`
