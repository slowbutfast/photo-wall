# Architecture: `admin-route-isolation`

## Context

See `proposal.md` for motivation and ordering (`after dom-wall-engine`), `research.md` for security/bundle guarantees, and `specs/` for behavioral contracts.

## Goals / Non-Goals

**Goals:**
- Public `/` loads zero admin chrome, makes zero `/api/admin/auth` requests, and imports zero admin JS chunks.
- Single fail-closed `ADMIN_ENABLED === 'true'` gate in Next.js 16 `src/proxy.ts` covers `/admin` and every `/api/admin/*` route (GET and mutations alike).
- `/admin` evaluates `ADMIN_ENABLED` and the session cookie on the server per request (`force-dynamic`, `robots: noindex`), shipping only `<AdminLoginForm />` when unauthenticated.
- Share one wall renderer (`PhotoWallApp`) between `/` (`/api/wall`) and `/admin` (`/api/admin/wall-preview`).

**Non-Goals:**
- Access-controlling individual draft image bytes at the Bunny CDN edge (UUIDv7 paths remain unguessable but URL-addressable).
- Local SQLite → production DB sync (explicitly rejected).

## Decisions

1. **Single Fail-Closed Gate in `src/proxy.ts`**:
   - Next.js 16 proxy matcher: `['/admin', '/admin/:path*', '/api/admin/:path*']`.
   - Returns `new NextResponse('Not Found', { status: 404 })` unless `process.env.ADMIN_ENABLED === 'true'` (fails closed on unset, `'false'`, `'1'`, or empty string).
   - Covers `/admin`, `GET/POST/DELETE /api/admin/auth`, `GET/POST /api/admin/albums`, `PATCH/DELETE /api/admin/albums/[id]`, `POST /api/admin/albums/[id]/photos`, `PATCH/DELETE /api/admin/photos/[id]`, `POST /api/admin/youtube/inspect`, `POST /api/admin/deletions/retry`, and `GET /api/admin/wall-preview`.

2. **Dynamic Server-Evaluated `/admin` Route (`src/app/admin/page.tsx`)**:
   - Declares `export const dynamic = 'force-dynamic'` and `export const metadata = { robots: { index: false, follow: false } }`.
   - Checks `if (process.env.ADMIN_ENABLED !== 'true') notFound();` before reading cookies or rendering any client component.
   - Reads the HTTP-only session cookie via `cookies()` and calls `verifySessionToken(token)` on the server:
     - Unauthenticated → renders `<AdminLoginForm />` only (never ships `AdminDrawer` or draft manifest).
     - Authenticated → calls `getAdminWallPreview()` on the server and renders `<AdminWallApp initialManifest={preview} />`.

3. **Shared Renderer Seam (`PhotoWallApp` & `useWallManifest`)**:
   - `PhotoWallApp` accepts `initialManifest`, `manifestUrl = '/api/wall'`, and optional `adminToolbarSlot` (undefined on `/`).
   - `GalleryHud` removes all lock icon / `Curate` / `authenticated` state; optional `onOpenCurator?: () => void` is passed only by `AdminWallApp` on `/admin`.
   - `GET /api/admin/wall-preview` enforces `requireAdmin(request)` (`401` if unauthenticated) and returns published + draft albums positioned via `computeWallGridPositions` alongside `cdnBase`.

## Risks / Trade-offs

- **Static Asset Visibility of `/admin` Chunk**: Next.js emits `/admin`'s JS chunk as a static asset even though `/` never loads it. Mitigated by enforcing all authorization on the server (`/admin` SSR cookie check + `/api/admin/*` route guards + optional Cloudflare Access on a named tunnel).
- **Operational Toggle Friction**: Setting `ADMIN_ENABLED=false` requires toggling env + restarting Node to curate again. Accepted as an optional off-switch between curation batches; with Cloudflare Access on a named tunnel, `ADMIN_ENABLED=true` can stay on continuously.
