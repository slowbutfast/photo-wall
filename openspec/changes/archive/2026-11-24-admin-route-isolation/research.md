# Research: `admin-route-isolation`

## Source Material

- **2026-11-23 — User Request**:
  > "can you propose how we can hide all the photo album CRUD features from the public version of the app?"
  > "can you ff the artifacts of a new separate openspec change"
- **2026-11-23 — Two-Agent Security & Architecture Review Findings**:
  1. **Remove all admin UI and auth probes from `/`**: Pulling the lock icon, `Curate` trigger, `AdminDrawer` import, and `GET /api/admin/auth` mount call off `/` makes the public gallery 100% read-only and improves caching.
  2. **Single Fail-Closed Gate in Next.js 16 `src/proxy.ts`**: Do NOT scatter `ADMIN_ENABLED` checks inside `guardAdminMutation` (which misses `GET /api/admin/auth`, `GET /api/admin/albums`, `GET /api/admin/wall-preview`). Place a single fail-closed check (`process.env.ADMIN_ENABLED === 'true'`) in Next.js 16 `src/proxy.ts` matching `/admin`, `/admin/:path*`, and `/api/admin/:path*`, returning `404 Not Found` for any other value.
  3. **Dynamic Server-Evaluated `/admin` Route (`robots: noindex`)**: `/admin/page.tsx` MUST declare `export const dynamic = 'force-dynamic'` so it cannot be statically cached while disabled, re-check `ADMIN_ENABLED === 'true'` (`notFound()` otherwise), verify the HTTP-only JWT cookie on the server, and render only a minimal `<AdminLoginForm />` when unauthenticated (never shipping the Curator app shell to unauthenticated requests).
  4. **Precise Security & Bundle Guarantees**:
     - `ADMIN_ENABLED` is an optional off-switch between curation sessions, NOT a replacement for authentication or Cloudflare Access (on a named tunnel with origin locked down).
     - Public `/` loads zero admin chrome, zero `/api/admin/auth` requests, and zero admin JS chunks; `/admin`'s code-split static chunk still exists as a build asset, and enforcement stays on the server.
     - Draft image URLs on Bunny / `/api/local-uploads` are unguessable (UUIDv7 74-bit entropy) but publicly fetchable by URL; hiding CRUD does not mean drafts are access-controlled at the CDN edge.
  5. **Shared Manifest Seam & Live Preview**: `PhotoWallApp` / `useWallManifest` accepts `initialManifest` and `manifestUrl` props so `/` renders `GET /api/wall` (published only) while `/admin` renders `GET /api/admin/wall-preview` (published + draft albums laid out via `computeWallGridPositions`).
  6. **Option 3 (Local SQLite → Prod Sync) Rejected**: Copying a live SQLite file risks torn copies and storage/DB drift.

## Glossary

| Term | Meaning in this Change | Does NOT mean |
| :--- | :--- | :--- |
| **Read-Only Public `/` Route** | Public gallery entry point with zero lock icon, zero `Curate` button, zero `GET /api/admin/auth` calls, and zero `AdminDrawer` imports. | Removing `/admin`'s static build chunks from `.next/static/` or replacing server auth. |
| **Fail-Closed `src/proxy.ts` Gate** | Single Next.js 16 proxy check returning `404` on `/admin` and `/api/admin/:path*` unless `process.env.ADMIN_ENABLED === 'true'`. | A substitute for JWT session auth or Cloudflare Access. |
| **Admin Live Wall Preview (`GET /api/admin/wall-preview`)** | Authenticated manifest endpoint returning published + draft albums laid out via `computeWallGridPositions` for `/admin`. | Exposing drafts on public `GET /api/wall`. |

## Candidate Tech

| Candidate | Status | Rationale & Date |
| :--- | :--- | :--- |
| **Next.js 16 `src/proxy.ts` + Dynamic SSR `/admin` + `GET /api/admin/wall-preview`** | Adopted | Single fail-closed gate across all admin GET/POST/PATCH/DELETE routes, server-verified login before shipping Curator shell, zero admin chrome/fetches on `/` (2026-11-23). |
| **Local-only SQLite sync to production (Option 3)** | Rejected | Torn SQLite copies and Bunny Storage vs SQLite DB drift (2026-11-23). |
| **Per-handler `ADMIN_ENABLED` checks in `guardAdminMutation`** | Rejected | Misses `GET /api/admin/auth` and `GET /api/admin/albums` (2026-11-23). |

## Links Out

- [dom-wall-engine/proposal.md](../dom-wall-engine/proposal.md)
- [backend-storage-crud/proposal.md](../backend-storage-crud/proposal.md)
