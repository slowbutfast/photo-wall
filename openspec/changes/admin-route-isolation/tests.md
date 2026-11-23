# Tests: `admin-route-isolation`

## Automated Tests

1. **Fail-Closed Proxy Gate Unit Tests (`vitest`)**:
   - Command: `npx vitest run src/__tests__/proxy.test.ts`
   - Verifies `src/proxy.ts` returns `404` when `ADMIN_ENABLED` is unset, `'false'`, or `'1'` across `/admin`, `/admin/sub`, `GET /api/admin/auth`, `POST /api/admin/auth`, `GET /api/admin/albums`, `GET /api/admin/wall-preview`, `POST /api/admin/youtube/inspect`, and `POST /api/admin/deletions/retry`, and allows them through when `ADMIN_ENABLED === 'true'`.
2. **Admin Wall-Preview & Route Auth Tests (`vitest`)**:
   - Command: `npx vitest run src/app/api/__tests__/wallPreview.test.ts`
   - Verifies `GET /api/admin/wall-preview` returns `401` when unauthenticated and returns both `published` and `draft` albums (excluding `'deleting'`) laid out via `computeWallGridPositions` when authenticated.
3. **Server `/admin` Page & Public `/` Read-Only Tests (`vitest`)**:
   - Command: `npx vitest run src/app/admin/__tests__/adminPage.test.tsx src/components/hud/__tests__/GalleryHud.test.tsx`
   - Verifies `/admin` calls `notFound()` when `ADMIN_ENABLED !== 'true'`, renders `<AdminLoginForm />` (not `<AdminWallApp />`) when unauthenticated, sets `robots: { index: false, follow: false }`, and verifies `GalleryHud` renders no lock icon / `Curate` button when `onOpenCurator` is omitted on `/`.
4. **Full Regression, Typecheck, Lint & Build**:
   - Command: `npx vitest run && npm run typecheck && npm run lint && npm run build`
   - Confirms `/` loads zero `AdminDrawer` / `FolderDropzone` chunks and `/admin` is dynamically rendered (`ƒ`).

## Manual Verification

1. **Public `/` Clean Network & DOM Audit**:
   - Load `/` in Chrome DevTools Network tab: confirm zero requests to `/api/admin/auth`, zero lock icon in HUD, and zero `AdminDrawer` chunks fetched.
2. **`ADMIN_ENABLED` Toggle & `/admin` Flow**:
   - With `ADMIN_ENABLED=false`, visit `/admin` and `/api/admin/auth` → confirm `404 Not Found`.
   - With `ADMIN_ENABLED=true`, visit `/admin` logged out → confirm login form only + `<meta name="robots" content="noindex, nofollow">`; sign in → confirm draft albums render on `/admin` live preview while remaining absent on `/`.
