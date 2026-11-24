## MODIFIED Requirements

### Requirement: photo-wall emits its own Content-Security-Policy
Every photo-wall response SHALL carry a static `Content-Security-Policy` header and `X-Frame-Options: DENY`, set in `next.config.ts` `headers()` and built by `buildContentSecurityPolicy({ cdnOrigin, isDev, allowYoutubeApi })`. Public routes (`/photos` and all non-admin paths via negative-lookahead `source`) SHALL use `allowYoutubeApi: false` (`default-src 'self'`; `script-src 'self' 'unsafe-inline'` plus `'unsafe-eval'` only when `isDev`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:` plus the public CDN origin when configured; `font-src 'self'`; `connect-src 'self'` plus `ws:` only when `isDev`; `frame-src https://www.youtube-nocookie.com`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`). Studio routes (`/photos/admin` and `/photos/admin/:path*`) SHALL use `allowYoutubeApi: true`, adding `https://www.youtube.com` to `script-src` and `frame-src` so the curator's YouTube IFrame API duration probe succeeds in Studio without loosening the public gallery CSP.

#### Scenario: Public routes keep strict CSP without youtube.com scripts
- **WHEN** `buildContentSecurityPolicy({ cdnOrigin: 'https://cdn.gregory-lazatin.com', isDev: false, allowYoutubeApi: false })` is called (or `GET /photos` is served)
- **THEN** `img-src` SHALL include `https://cdn.gregory-lazatin.com`, `frame-src` SHALL be `https://www.youtube-nocookie.com`, `frame-ancestors` SHALL be `'none'`, and `script-src` SHALL NOT contain `https://www.youtube.com`, `'unsafe-eval'`, or `ws:`

#### Scenario: Studio routes allow YouTube IFrame API for duration probing
- **WHEN** `buildContentSecurityPolicy({ cdnOrigin: 'https://cdn.gregory-lazatin.com', isDev: false, allowYoutubeApi: true })` is called (or `GET /photos/admin` is served)
- **THEN** `script-src` and `frame-src` SHALL allow `https://www.youtube.com` so curator soundtrack inspection populates `durationSec` cleanly while `frame-ancestors 'none'` remains enforced
