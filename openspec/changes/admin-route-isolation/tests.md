## Automated Tests

- `npx vitest run src/lib/__tests__/publicBoundaryAudit.test.ts`: Walks the static import graph from `src/app/(gallery)` and asserts zero transitive imports of `@/components/admin/*` and zero `/api/admin` literals in public modules.
- `npx vitest run src/lib/security/__tests__/csp.test.ts`: Verifies `buildContentSecurityPolicy({ cdnOrigin, isDev: false, allowYoutubeApi: false })` excludes `https://www.youtube.com` while `allowYoutubeApi: true` includes `https://www.youtube.com` in `script-src` and `frame-src`.
- `npx vitest run src/lib/__tests__/rawUrlAudit.test.ts`: Confirms every new fetch under `src/app/admin` and `src/components/admin` is wrapped in `withBase()`.
- `npx vitest run src/lib/layout/__tests__/islandLayout.test.ts`: Verifies `computeWallGridPositions` defaults to `['published']` and includes drafts when `{ includeStatuses: ['published', 'draft'] }` is passed.
- `npx vitest run src/app/api/__tests__/routes.test.ts`: Verifies `GET /api/admin/wall-preview` returns `401` unauthenticated and `200` with published + draft albums + `Cache-Control: private, no-store` + `X-Robots-Tag: noindex` when authenticated, while `GET /api/wall` still excludes drafts.
- `npm run typecheck && npm run lint && npm test && npm run build`: Full regression suite exits `0`.

## Manual Verification

- **Public `/photos` isolation (`next start`)**:
  - **WHEN** `/photos?demo=4` is opened in Playwright / DevTools Network tab
  - **THEN** zero requests target `/photos/api/admin/*`, zero admin JS chunks are fetched, no lock/`Curate` button renders, and the CSP header omits `https://www.youtube.com`.
- **Fail-closed `ADMIN_ENABLED` gate (`next start`)**:
  - **WHEN** `ADMIN_ENABLED` is unset or `false` and requests hit `/photos/admin`, `/photos/admin/login`, and `/photos/api/admin/auth`
  - **THEN** all return `404`.
- **Authenticated Curator Studio (`/photos/admin`)**:
  - **WHEN** `ADMIN_ENABLED=true`, unauthenticated `/photos/admin` redirects to `/photos/admin/login`; signing in loads the persistent split Studio with `<GalleryCanvas mode="preview" />` beside the **Exhibitions | Upload | Settings** sidebar, draft albums display dashed mats + `"Draft"` badges, and the `/photos/admin` CSP header allows `https://www.youtube.com`.
- **Mobile Preview / Manage tabs (`390×844`)**:
  - **WHEN** switching between **Wall Preview** and **Manage Studio** on a narrow viewport
  - **THEN** active upload queue and draft state are preserved across switches.
