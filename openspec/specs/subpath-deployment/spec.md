# subpath-deployment Specification

## Purpose
TBD - created by archiving change portfolio-subpath-deploy. Update Purpose after archive.
## Requirements
### Requirement: Single build-time base path
The app SHALL be served under the base path `/photos`. The value SHALL be defined exactly once, as the exported constant `BASE_PATH` in `src/lib/basePath.ts`, and `next.config.ts` SHALL set `basePath` by importing that constant. No other module SHALL hard-code the string `/photos`.

#### Scenario: Pages and route handlers resolve under the base path
- **WHEN** a production build is served and a client requests `/photos`, `/photos/api/wall` and `/photos/textures/wall/wall_albedo.webp`
- **THEN** each SHALL return `200`, and the same paths without the `/photos` prefix SHALL return `404`

#### Scenario: Base path has one source of truth
- **WHEN** the repository is searched for the literal `'/photos'` or `"/photos"` outside `src/lib/basePath.ts`, tests and OpenSpec artifacts
- **THEN** there SHALL be no matches

### Requirement: Root-relative client URLs carry the base path
Every root-relative URL the browser requests from photo-wall SHALL pass through the pure helper `withBase(path)`. This covers `fetch` and `XMLHttpRequest` targets, `<img>`/`<iframe>`/`new Image()` sources and manifest endpoint defaults. `withBase` SHALL prefix paths beginning with a single `/` with `BASE_PATH`. It SHALL return absolute URLs (`http:`, `https:`, `data:`, `blob:`, protocol-relative `//`) unchanged, and it SHALL NOT double-prefix a path that already starts with `BASE_PATH/` or equals `BASE_PATH`.

#### Scenario: API fetch is prefixed
- **WHEN** `withBase('/api/wall')` is called
- **THEN** it SHALL return `/photos/api/wall`

#### Scenario: Absolute and already-prefixed URLs pass through
- **WHEN** `withBase` receives `https://cdn.example.com/a.jpg`, `//cdn.example.com/a.jpg`, `data:image/png;base64,AA`, `/photos/api/wall` or `/photos`
- **THEN** it SHALL return each input unchanged

#### Scenario: No raw root-relative client URLs remain
- **WHEN** modules under `src/app`, `src/components`, `src/store` and `src/lib/dev` (excluding `__tests__` and `src/app/api/**` route handlers) are searched, after stripping comments, for single-quoted, double-quoted or template literals beginning with `/api/`, `/textures/`, `/demo` or `/fonts/` that are not the argument of `withBase(`
- **THEN** there SHALL be no matches

#### Scenario: Wall loads end-to-end under the base path
- **WHEN** `http://localhost:<port>/photos?demo=4` is opened in a browser
- **THEN** the manifest, the four wall textures, the demo photos and the YouTube thumbnails SHALL all load with `200`, and no request SHALL target a path outside `/photos/` on the app origin

### Requirement: Base-path-safe webfonts
TeX Gyre Heros `@font-face` sources SHALL be referenced with bundler-relative `url()` paths, so the emitted font URLs live under `/photos/_next/static/`. No `@font-face` `src` SHALL use an absolute `/fonts/` path.

#### Scenario: Fonts load under the base path
- **WHEN** the production build is served under `/photos` and the wall page renders
- **THEN** every `.woff2` request SHALL resolve under `/photos/_next/static/` with `200`, and the computed font of the placard title SHALL resolve to TeX Gyre Heros where Helvetica Neue and Helvetica are unavailable

### Requirement: photo-wall emits its own Content-Security-Policy
Every photo-wall response SHALL carry a static `Content-Security-Policy` header and `X-Frame-Options: DENY`, set in `next.config.ts` `headers()` and built by `buildContentSecurityPolicy({ cdnOrigin, isDev, allowYoutubeApi })`. Public routes (`/photos` and all non-admin paths via negative-lookahead `source`) SHALL use `allowYoutubeApi: false` (`default-src 'self'`; `script-src 'self' 'unsafe-inline'` plus `'unsafe-eval'` only when `isDev`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:` plus the public CDN origin when configured; `font-src 'self'`; `connect-src 'self'` plus `ws:` only when `isDev`; `frame-src https://www.youtube-nocookie.com`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`). Studio routes (`/photos/admin` and `/photos/admin/:path*`) SHALL use `allowYoutubeApi: true`, adding `https://www.youtube.com` to `script-src` and `frame-src` so the curator's YouTube IFrame API duration probe succeeds in Studio without loosening the public gallery CSP.

#### Scenario: Public routes keep strict CSP without youtube.com scripts
- **WHEN** `buildContentSecurityPolicy({ cdnOrigin: 'https://cdn.gregory-lazatin.com', isDev: false, allowYoutubeApi: false })` is called (or `GET /photos` is served)
- **THEN** `img-src` SHALL include `https://cdn.gregory-lazatin.com`, `frame-src` SHALL be `https://www.youtube-nocookie.com`, `frame-ancestors` SHALL be `'none'`, and `script-src` SHALL NOT contain `https://www.youtube.com`, `'unsafe-eval'`, or `ws:`

#### Scenario: Studio routes allow YouTube IFrame API for duration probing
- **WHEN** `buildContentSecurityPolicy({ cdnOrigin: 'https://cdn.gregory-lazatin.com', isDev: false, allowYoutubeApi: true })` is called (or `GET /photos/admin` is served)
- **THEN** `script-src` and `frame-src` SHALL allow `https://www.youtube.com` so curator soundtrack inspection populates `durationSec` cleanly while `frame-ancestors 'none'` remains enforced
