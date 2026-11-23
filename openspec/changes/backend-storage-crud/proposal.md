## Why

An infinite 3D photo gallery needs a fast, privacy-safe persistence and media pipeline that serves thousands of print placements in a compact payload, preserves original pixel data while stripping GPS/XMP location leaks, and supports recoverable folder uploads and deletions.

## What Changes

- Bootstrap the **Next.js 16 + TypeScript + Drizzle ORM + Vitest** project foundation and shared pure modules (`src/lib/layout/islandLayout.ts` with `100px = 1 world unit`, `src/lib/cdn/lodUrl.ts`).
- Introduce **SQLite / LibSQL** persistence (self-hosted Node MVP target) with `PRAGMA foreign_keys = ON`, `albums` (`status: 'draft' | 'published' | 'deleting'`, `expectedCount`, optional `cameraName`/`dateLabel`/`locationLabel`, optional YouTube soundtrack fields), and `photos` (`thumbHash`, `contentHash`, cascade FK).
- Implement **Next.js 16 cached manifest endpoints**: `GET /api/wall` (`'use cache'` + `cacheTag('wall')`) returning `published` album summaries, compact per-photo rendering metadata, and `cdnBase`; `GET /api/albums/[id]/photos` returning detail metadata for `published` albums only.
- Add **`POST /api/admin/youtube/inspect`** for minimal YouTube URL validation and oEmbed `Artist`/`Song` extraction.
- Implement **StorageAdapter** for **Bunny.net Storage + Optimizer + Wildcard Purge** (`/albums/{albumId}/*`, `/albums/{albumId}/{photoId}.*`) and **LocalStorageAdapter** (`/api/local-uploads/[...path]`).
- Add **binary image sanitization** (`25 MB` max buffer, `413` on oversize, `415` on magic-byte mismatch, server-derived `width`/`height`, EXIF allowlist, lossless JPEG GPS/XMP strip & PNG/WebP/AVIF EXIF/XMP chunk drop preserving ICC profiles).
- Add **hardened admin auth & CRUD** (`GET/POST/DELETE /api/admin/auth` with rate-limiting & SHA-256 `timingSafeEqual`, `Origin` CSRF check, draft reservation/resume/discard, publish-time completion & overlap check with `updateTag('wall')`, and tombstone-backed recoverable delete).

## Capabilities

### New Capabilities
- `wall-manifest-and-db`: Next.js/Drizzle/LibSQL bootstrap, `albums` (`draft` / `published` / `deleting`, `expectedCount`) and `photos` schema, Next.js 16 cached compact wall manifest, `published`-only detail endpoint, and shared world-unit layout math (`100px = 1 unit`).
- `storage-and-cdn-pipeline`: `StorageAdapter` for Bunny.net Storage/Optimizer/Wildcard Purge and local dev route streaming, shared `lodUrl.ts`, magic-byte validation (`413`/`415`), lossless GPS/XMP stripping preserving ICC profiles, and tombstone-recoverable delete.
- `admin-auth-and-crud-api`: Rate-limited `GET/POST/DELETE` admin auth, `Origin` CSRF checks, explicit multipart upload contract with server-derived dimensions and EXIF allowlist, idempotent UUIDv7 upserts, and publish-time overlap resolution.

### Modified Capabilities
<!-- None (greenfield repository) -->

## Impact

- **Dependencies**: `next@^16`, `react@^19`, `react-dom@^19`, `drizzle-orm`, `@libsql/client`, `drizzle-kit`, `jose`, `vitest`, `typescript`.
- **Downstream Dependency**: `frontend-gallery-wall` depends on this change for project bootstrap, shared `islandLayout.ts` / `lodUrl.ts`, and API contracts.
- **Deployment Target**: Self-hosted Node.js (MVP target); Vercel serverless is an explicit non-goal.

### Revision: 2026-11-23 15:45 UTC
- **Feedback Source**: Peer Review Audits (Two Agents)
- **Key Changes**:
  - `proposal.md` / `tasks.md`: Moved project bootstrap and shared `islandLayout.ts` (`100px = 1 unit`) + `lodUrl.ts` into `backend-storage-crud` so it runs standalone; declared self-hosted Node MVP target.
  - `specs/`: Added explicit `POST /api/admin/albums/[id]/photos` multipart contract, server-derived dimensions, EXIF allowlist, XMP GPS stripping, `GET /api/admin/auth`, `published`-only `/api/albums/[id]/photos`, compact photos in `/api/wall`, wildcard CDN purge, and `'deleting'` tombstone lifecycle.
  - `architecture.md` / `tests.md`: Updated to Next 16 `'use cache'` / `updateTag('wall')`, added Vitest route-handler integration tests against temp `file:` LibSQL + mocked Bunny client.
