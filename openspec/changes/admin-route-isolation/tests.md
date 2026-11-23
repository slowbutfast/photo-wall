# Tests: `admin-route-isolation`

## Automated Tests

1. **Fail-Closed Proxy Gate Unit Tests (`vitest`)**:
   - Command: `npx vitest run src/__tests__/proxy.test.ts`
   - Verifies `src/proxy.ts` returns `404` when `ADMIN_ENABLED` is unset, `'false'`, or `'1'` across `GET`, `POST`, `PATCH`, and `DELETE` requests to `/admin`, `/admin/`, `/api/admin`, `/api/admin/auth`, `/api/admin/albums`, `/api/admin/albums/[id]/photos`, `/api/admin/wall-preview`, `/api/admin/youtube/inspect`, and `/api/admin/deletions/retry`, and attaches `X-Robots-Tag: noindex` when `ADMIN_ENABLED === 'true'`.
2. **Draft-Aware Layout & Uncached Wall-Preview Tests (`vitest`)**:
   - Command: `npx vitest run src/lib/layout/__tests__/islandLayout.test.ts src/app/api/__tests__/wallPreview.test.ts`
   - Verifies default `computeWallGridPositions(albums)` still excludes `draft` albums, `{ includeStatuses: ['published', 'draft'] }` lays out both without overlap, and `GET /api/admin/wall-preview` returns `401` unauthenticated and `200` with `Cache-Control: private, no-store` and `X-Robots-Tag: noindex` when authenticated.
3. **Server `/admin` Page & Public `/` Read-Only Tests (`vitest`)**:
   - Command: `npx vitest run src/app/admin/__tests__/adminPage.test.tsx src/components/hud/__tests__/GalleryHud.test.tsx`
   - Mocks `next/server` (`connection`), `next/headers` (`cookies`), and `next/navigation` (`notFound`); verifies `/admin` calls `notFound()` when `ADMIN_ENABLED !== 'true'`, renders `<AdminLoginForm />` (not `<AdminWallApp />`) when unauthenticated, checks exported `metadata.robots` (`noindex, nofollow`), and verifies `GalleryHud` renders no lock icon / `Curate` button when `onOpenCurator` is omitted on `/`.
4. **`next start` Proxy Matcher & Playwright Zero-Admin-JS Integration Check**:
   - Start `next start` with `ADMIN_ENABLED=false` (without rebuilding after `next build`) and assert `404` across `/admin`, `/admin/`, `/api/admin`, `/api/admin/auth`, `/api/admin/albums`, `/api/admin/wall-preview`, `/api/admin/youtube/inspect`, and `/api/admin/deletions/retry`.
   - Restart `next start` with `ADMIN_ENABLED=true` (without rebuilding) and verify `/admin` serves the login form per request.
   - Run Playwright against `/`: collect every JS response and assert none contains a unique sentinel string exported from `FolderDropzone`/`AdminDrawer`, and assert zero requests to `/api/admin/*`.
5. **Full Regression, Typecheck, Lint & Build**:
   - Command: `npx vitest run && npm run typecheck && npm run lint && npm run build`

## Manual Verification

1. **Public `/` Clean Network & DOM Audit**:
   - Load `/` in Chrome DevTools Network tab: confirm zero requests to `/api/admin/*`, zero lock icon in HUD, and zero `AdminDrawer` chunks fetched.
2. **`/admin` Login, Draft Marker & Logout Flow**:
   - With `ADMIN_ENABLED=true`, visit `/admin` logged out → confirm login form only + `<meta name="robots" content="noindex, nofollow">`; sign in → confirm `router.refresh()` transitions to `AdminWallApp`, draft albums render with dashed outline + `"DRAFT"` placard badge, mutations refetch + re-bake the lightmap live, and clicking `Sign out` returns to the login form.
