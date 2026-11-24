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
Every photo-wall response SHALL carry a static `Content-Security-Policy` header, set in `next.config.ts` `headers()` and built by a pure function `buildContentSecurityPolicy({ cdnOrigin, isDev })`. The policy SHALL contain at least: `default-src 'self'`; `script-src 'self' 'unsafe-inline'`, plus `'unsafe-eval'` only when `isDev`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:` plus the public CDN origin when one is configured; `font-src 'self'`; `connect-src 'self'`, plus `ws:` only when `isDev`; `frame-src https://www.youtube-nocookie.com`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`. The same `headers()` entry SHALL also set `X-Frame-Options: DENY`. `script-src` SHALL NOT allow `https://www.youtube.com`, so the curator's best-effort YouTube IFrame API duration probe (`loadYouTubeIframeApi` in `src/lib/youtube/iframeApi.ts`) is blocked, and inspecting a soundtrack SHALL still succeed with `durationSec` left unset. The CDN origin SHALL be derived from the public CDN base (see `storage-and-cdn-pipeline`) as scheme plus host only, never including a path.

#### Scenario: Production policy allows the CDN and YouTube only
- **WHEN** `buildContentSecurityPolicy({ cdnOrigin: 'https://cdn.gregory-lazatin.com', isDev: false })` is called
- **THEN** `img-src` SHALL include `https://cdn.gregory-lazatin.com`, `frame-src` SHALL be exactly `https://www.youtube-nocookie.com`, `frame-ancestors` SHALL be `'none'`, and the string SHALL NOT contain `'unsafe-eval'`, `ws:` or `https://www.youtube.com`

#### Scenario: No CDN configured
- **WHEN** `buildContentSecurityPolicy({ cdnOrigin: null, isDev: true })` is called
- **THEN** `img-src` SHALL be `'self' data: blob:`, and `script-src` SHALL include `'unsafe-eval'`

#### Scenario: CDN origin strips paths
- **WHEN** the public CDN base is `https://zone.b-cdn.net/albums/`
- **THEN** the derived `cdnOrigin` SHALL be `https://zone.b-cdn.net`

#### Scenario: Curator soundtrack inspect degrades without the IFrame API
- **WHEN** a signed-in curator inspects a valid YouTube URL in the Curator Drawer under the production CSP
- **THEN** the inspect result SHALL populate the artist and title guesses from `/api/admin/youtube/inspect`, `durationSec` SHALL remain unset (manual entry still possible), and the only CSP violations logged SHALL be for `https://www.youtube.com/iframe_api`

#### Scenario: Header is present on pages and route handlers
- **WHEN** a production build serves `GET /photos` and `GET /photos/api/wall`
- **THEN** both responses SHALL include the `Content-Security-Policy` and `X-Frame-Options: DENY` headers, and the browser console SHALL show zero CSP violations while the wall loads, a print is focused and a soundtrack iframe is started

