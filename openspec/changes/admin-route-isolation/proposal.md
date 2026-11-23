## Why

Exposing a lock icon and firing `GET /api/admin/auth` on every public `/` page load advertises admin controls to visitors and adds unnecessary per-visitor auth requests. Moving all photo album CRUD UI (upload, edit, delete, draft preview, client-local Lighting Preview) to a dedicated server-gated `/admin` route keeps the public `/` gallery 100% read-only while preserving browser-based curation behind a fail-closed `ADMIN_ENABLED` switch and server-verified session auth.

**Ordering / Dependency:** Apply and archive **after `dom-wall-engine`** (or rebase `dom-wall-engine`'s `gallery-hud-and-curator-ui` delta if applied first) so `MODIFIED` requirements on `gallery-hud-and-curator-ui` do not conflict at archive time.

## What Changes

- Make public `/` strictly read-only: remove the lock icon, `Curate` trigger, `GET /api/admin/auth` mount call, and `AdminDrawer` import from `GalleryHud.tsx` and `PhotoWallApp.tsx`.
- Add a single fail-closed Next.js 16 `src/proxy.ts` gate matching `/admin`, `/admin/:path*`, and `/api/admin/:path*`, returning `404 Not Found` unless `process.env.ADMIN_ENABLED === 'true'` (covering all admin GET, POST, PATCH, and DELETE endpoints).
- Add a dynamic server-rendered `/admin` page (`src/app/admin/page.tsx`, `export const dynamic = 'force-dynamic'`, `robots: { index: false, follow: false }`) that checks `ADMIN_ENABLED === 'true'` (`notFound()` otherwise), verifies the session cookie server-side, and renders either a minimal `<AdminLoginForm />` (without shipping the Curator shell) or `<AdminWallApp />` (sharing `PhotoWallApp` + `AdminDrawer` + Lighting Preview).
- Add authenticated `GET /api/admin/wall-preview` returning published + draft albums laid out via `computeWallGridPositions`, and parameterize `PhotoWallApp` / `useWallManifest` with `initialManifest` and `manifestUrl` props so `/` consumes `/api/wall` while `/admin` consumes `/api/admin/wall-preview`.

## Capabilities

### New Capabilities
<!-- None — modifies existing HUD and admin API capabilities -->

### Modified Capabilities
- `gallery-hud-and-curator-ui`: Rename & update public HUD to read-only `/` (zero lock icon, zero `/api/admin/auth` fetch, zero `AdminDrawer` chunk loaded on `/`); relocate Curator Drawer and Lighting Preview to dynamic server-gated `/admin` (`robots: noindex`).
- `admin-auth-and-crud-api`: Add fail-closed `src/proxy.ts` `ADMIN_ENABLED` `404` gate covering `/admin` and every `/api/admin/*` route, plus authenticated `GET /api/admin/wall-preview` for live draft preview in `/admin`.

## Impact

- **Security Boundary**: `ADMIN_ENABLED` is an optional off-switch between curation sessions; real protection remains server-side JWT cookie auth + rate limiting (and Cloudflare Access on a named tunnel with locked-down origin in production). Draft image URLs remain publicly fetchable by unguessable UUIDv7 path.
- **Dependencies**: None added.
