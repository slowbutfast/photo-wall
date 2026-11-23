# Architecture: `admin-route-isolation`

## Context

See `proposal.md` for motivation and ordering (`PR #1 + PATCH-02 → dom-wall-engine → admin-route-isolation`), `research.md` for security/bundle guarantees, and `specs/` for behavioral contracts.

## Goals / Non-Goals

**Goals:**
- Public `/` loads zero admin chrome, makes zero `/api/admin/*` requests, and loads zero admin JS chunks (verified by Playwright JS-sentinel check).
- Single fail-closed `ADMIN_ENABLED === 'true'` gate in Next.js 16 `src/proxy.ts` covers `/admin`, `/admin/`, `/api/admin`, and `/api/admin/:path*` across all HTTP methods (with `requireAdmin`/`guardAdminMutation` retained in every route handler as defense in depth).
- `/admin` evaluates `ADMIN_ENABLED` and the session cookie per request compatibly with `cacheComponents: true` (`<Suspense>` + `await connection()` / `await cookies()`, never `export const dynamic = 'force-dynamic'`).
- Share one wall renderer (`PhotoWallApp`) between `/` (`/api/wall`) and `/admin` (uncached `/api/admin/wall-preview`).

**Non-Goals:**
- Access-controlling individual draft image bytes at the Bunny CDN edge (UUIDv7 paths remain unguessable but URL-addressable).
- Local SQLite → production DB sync (explicitly rejected).

## Decisions

1. **Single Fail-Closed Gate in `src/proxy.ts` + `X-Robots-Tag: noindex`**:
   - Next.js 16 proxy matcher: `['/admin', '/admin/:path*', '/api/admin', '/api/admin/:path*']`.
   - Returns `new NextResponse('Not Found', { status: 404 })` unless `process.env.ADMIN_ENABLED === 'true'` (fails closed on unset, `'false'`, `'1'`, or empty string).
   - Attaches `X-Robots-Tag: noindex` to all `/api/admin/*` responses when enabled.
   - Acts as an extra gate only; `requireAdmin` and `guardAdminMutation` remain intact inside every route handler.

2. **Cache-Components-Compatible Dynamic `/admin` Route (`src/app/admin/page.tsx`)**:
   - Do **not** export `dynamic = 'force-dynamic'` (incompatible with `cacheComponents: true` in Next.js 16).
   - Export `metadata = { robots: { index: false, follow: false } }`.
   - Wrap the async server body in `<Suspense>` and call `await connection()` (from `next/server`) / `await cookies()` **first**, *before* reading `process.env.ADMIN_ENABLED` (returning `notFound()` unless strictly `'true'`) so the env flag is never baked at build time.
   - Verify the HTTP-only session cookie via `verifySessionToken(token)` on the server:
     - Unauthenticated → render `<AdminLoginForm />` only (calls `router.refresh()` after successful `POST /api/admin/auth`).
     - Authenticated → call uncached `getAdminWallPreview()` and render `<AdminWallApp initialManifest={preview} />` (includes Logout `DELETE /api/admin/auth` → `router.refresh()`).

3. **Draft-Aware Layout Option & Uncached Wall Preview**:
   - Extend `computeWallGridPositions(albums, options?: { includeStatuses?: AlbumStatus[] })` in `src/lib/layout/islandLayout.ts`, defaulting `includeStatuses` to `['published']` so `/api/wall` cannot regress.
   - `getAdminWallPreview()` (no `'use cache'`) and `GET /api/admin/wall-preview` (`requireAdmin`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`) pass `{ includeStatuses: ['published', 'draft'] }` (excluding `'deleting'`), previewing the post-publish wall order with drafts visually badged.
   - `PhotoWallApp` / `useWallManifest` accepts `initialManifest` and `manifestUrl = '/api/wall'`. On `/admin`, `AdminDrawer` mutation callbacks call `refetch()` on `useWallManifest` and trigger `PbrWallCanvas` GPU lightmap re-bake.

## Risks / Trade-offs

- **Static Asset Visibility of `/admin` Chunk**: Next.js emits `/admin`'s JS chunk as a static asset even though `/` never loads it. Mitigated by enforcing all authorization on the server (`/admin` SSR cookie check + `/api/admin/*` route guards + optional Cloudflare Access on a named tunnel).
- **Operational Toggle Friction**: Setting `ADMIN_ENABLED=false` requires toggling env + restarting Node to curate again. Accepted as an optional off-switch between curation batches; with Cloudflare Access on a named tunnel, `ADMIN_ENABLED=true` can stay on continuously.
