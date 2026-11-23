# Research: `backend-storage-crud`

## Source Material

- **2026-11-22 — User Request (CRUD & CDN)**:
  > "define this sort of crud aspect of it where my plan is to just upload like folders of like walls and then upload them and then you also suggest a CDN for where I can post all the photos and stuff and right now I just want to have photos and no videos"
- **2026-11-22 — User Choices (Clarifying Answers)**:
  - Audience: Personal gallery (public read-only wall, private admin mode).
  - Stack: Next.js (App Router) + TypeScript.
  - CDN: Bunny.net Storage + Bunny Optimizer.
- **2026-11-22 / 2026-11-23 — Technical Review Findings Integrated**:
  - **MVP Hosting Target**: Self-hosted Node.js (persistent filesystem + streaming/buffered uploads up to `25 MB` without serverless 4.5 MB body caps). Vercel serverless + Turso HTTP is explicitly deferred as a non-goal.
  - **Manifest Consolidation**: At 10–20 photos/album (~2,000 photos max), a compact photo array (`{id, storagePath, width, height, aspectRatio, dominantColor, thumbHash, sortOrder}`) plus album-level `cameraName`/`dateLabel`/`locationLabel` and soundtrack metadata in `GET /api/wall` is ~100 KB gzipped and serves Photo Focus without a separate `GET /api/albums/[id]/photos` endpoint.
  - **Orientation-Only EXIF Allowlist & Lossless GPS/XMP Stripping**: `exifr` is read-only. Lossless privacy stripping removes XMP packets and all camera/GPS EXIF tags while rebuilding a minimal `APP1`/EXIF block containing **only** the `Orientation` tag (so phone portraits with orientation 5–8 do not render sideways) and preserving `APP2` ICC profiles (Display P3). Authoritative `width`/`height`/`aspectRatio` are computed *after* applying orientations 5–8.
  - **Wildcard CDN Purge**: Bunny Optimizer caches each `?width=` / `?height=` variant separately; purging `/albums/{albumId}/*` or `/albums/{albumId}/{photoId}.*` is required.
  - **Next.js 16 Caching**: Enable `cacheComponents: true` in `next.config.ts`. Use `'use cache'` + `cacheTag('wall')` with `revalidateTag('wall', { expire: 0 })` inside Route Handlers (`updateTag` is Server-Action-only and throws in Route Handlers).
  - **Recoverable Delete & Draft Lifecycle**: Persist `status: 'draft' | 'published' | 'deleting'` and `expectedCount` on `albums`, and `status: 'active' | 'deleting'` on `photos`; use tombstone state (`'deleting'`) with startup sweep + Curator Drawer **Pending Deletions** retry; allow resuming/discarding drafts. Derive 3-column positions deterministically in `computeWallGridPositions(publishedAlbums sorted by sortOrder)` instead of storing `posX`/`posY` or reserving draft holes.
  - **YouTube oEmbed Limits & SSRF Guard**: YouTube oEmbed returns `title` and `author_name` (not `durationSec` or separate artist/song). `POST /api/admin/youtube/inspect` parses `videoId` strictly, builds the oEmbed URL from `videoId` only (preventing SSRF), and returns `{ videoId, artistGuess, titleGuess }`; the Curator Drawer captures `durationSec` via a hidden `YT.Player.getDuration()` and saves it in `PATCH /api/admin/albums/[id]`.
- **Raised but not acted on**:
  - *Video uploads*: Explicitly excluded for MVP.
  - *Vercel serverless + Bunny S3 presigned PUTs*: Explicitly out of scope for MVP.

## Glossary

| Term | Meaning in this Change | Does NOT mean |
| :--- | :--- | :--- |
| **Compact Wall Manifest** | `GET /api/wall` returning `published` album summaries (with derived 3-column world positions), compact per-photo rendering array, and single `cdnBase`. | Returning raw camera EXIF, drafts, or omitting photo rows needed for macro instancing. |
| **Original Pixels (Orientation-Preserved)** | Untouched compressed pixel bitstream (no canvas/sharp re-encode) with GPS/camera EXIF & XMP stripped, an Orientation-only EXIF tag preserved, and ICC profile preserved. | Stripping Orientation (breaking portrait phone photos) or leaking GPS/camera tags. |
| **Immutable Storage Path** | `/albums/{albumId}/{photoId}.{ext}` keyed on immutable `albumId` UUID. | Slug-based paths that break when an album is renamed. |
| **Tombstone Delete (`'deleting'`)** | Marking an album/photo `'deleting'` in DB first so storage deletion + wildcard CDN purge can complete or retry before row removal. | Deleting DB rows before storage without a durable recovery record. |
| **World Scale (`100px = 1 world unit`)** | Shared unit conversion owned by `src/lib/layout/islandLayout.ts` for both backend island packing and frontend 3D placement. | Ad-hoc pixel vs. world unit assumptions. |

## External Research

- **Bunny.net Storage & Optimizer Documentation** (accessed 2026-11-22):
  - Bunny Storage HTTP API supports `PUT` and recursive directory `DELETE` (`https://{host}/{zone}/albums/{albumId}/`).
  - Bunny Pull Zone Purge API supports wildcard patterns (`/albums/{albumId}/*`, `/albums/{albumId}/{photoId}.*`) to evict all Optimizer `?width=`/`?height=` variants.
  - Pull Zone CORS header `Access-Control-Allow-Origin: *` is required for WebGL texture binding; an Edge Rule should block raw requests lacking Optimizer query parameters.
- **Next.js 16 Caching & Route Handler Auth** (accessed 2026-11-23):
  - Auth checks belong inside Route Handlers (`requireAdmin(req)`), not Next.js Middleware.
  - Next.js 16 `cacheComponents: true` + `'use cache'` + `cacheTag('wall')` paired with `revalidateTag('wall', { expire: 0 })` in Route Handlers provides immediate read-after-write invalidation (`updateTag` is Server-Action-only).
  - `next start` freezes `public/` at build time, so `LocalStorageAdapter` serves files via `GET /api/local-uploads/[...path]`.

## Candidate Tech

| Candidate | Status | Rationale & Date |
| :--- | :--- | :--- |
| **Self-Hosted Node.js + Drizzle + `@libsql/client` (`file:`)** | Adopted | Zero-config local/VPS SQLite (`PRAGMA foreign_keys = ON`) with `25 MB` buffered uploads and no serverless 4.5 MB cap (2026-11-23). |
| **Bunny.net Storage + Optimizer + Wildcard Purge** | Adopted | ~$0.01/GB storage, $9.50/mo Optimizer, 1-call recursive delete, wildcard variant purge (2026-11-23). |
| **Binary Chunk/Segment GPS+XMP Stripper (`sanitizeImage.ts`)** | Adopted | Losslessly strips JPEG APP1 GPS IFD + XMP and PNG/WebP/AVIF EXIF/XMP chunks without re-encoding pixels via `sharp` or `<canvas>` (2026-11-23). |
| **`jose` HTTP-only JWT + SHA-256 `timingSafeEqual`** | Adopted | Safe constant-time password verification without length-mismatch throw (2026-11-22). |
| **`sharp` for EXIF stripping** | Rejected | Re-encodes pixel data, violating original-pixel preservation (2026-11-23). |
| **Vercel Serverless + Turso HTTP** | Rejected (MVP) | 4.5 MB body limit and stateless HTTP pragma issues add complexity not needed for personal Node hosting (2026-11-23). |

## Patterns Adopted

- **Tombstone (`'deleting'`) → Storage Delete → Wildcard CDN Purge → Row Purge** (with startup sweep + Curator Drawer retry) → `src/app/api/admin/albums/[id]/route.ts`, `photos/[id]/route.ts`, and `deletions/retry/route.ts`.
- **DB Idempotency Pre-Check → Storage PUT → DB Upsert (with Rollback)** → `src/app/api/admin/albums/[id]/photos/route.ts`.
- **Shared Pure Geometry (`islandLayout.ts`) & LOD URL (`lodUrl.ts`)** → Shared by both `backend-storage-crud` and `frontend-gallery-wall`.

## Verified Facts

| Claim | Verification Method | Result |
| :--- | :--- | :--- |
| Workspace runs Node `v22.23.2` and `npm 10.9.8` | `node -v && npm -v` (2026-11-22) | Verified; built-in `crypto.timingSafeEqual` and `crypto.createHash('sha256')` available. |
| Workspace was not yet a git repository | `git status` (2026-11-23) | Verified; `git init` required before committing revised artifacts. |

## Unverified Assumptions

- **Next.js 16 `'use cache'` / `revalidateTag('wall', { expire: 0 })` with `cacheComponents: true`**: Documented in Next 16 reference; must be verified empirically in `verification.md` when Next.js 16 is installed in task 2.1. Cost: ~5 min.
- **Bunny Pull Zone CORS + Edge Rule + Wildcard Purge**: Unverified until user provisions Bunny Pull Zone and runs smoke test. Cost: ~10 min.

## Superseded Claims

- *Old claim (2026-11-22)*: Omit all photo arrays from `GET /api/wall` and rely on lazy per-album fetches; use `unstable_cache` + single-arg `revalidateTag`. *Why wrong*: Macro instancing needs compact photo arrays (`aspectRatio`, `dominantColor`, `thumbHash`), lazy fetching triggers ~50 concurrent requests on zoom-out, and `unstable_cache` / 1-arg `revalidateTag` are legacy in Next 16 (and `updateTag` is Server-Action-only). *Replaced by*: Compact photo array in `GET /api/wall` + `'use cache'` / `cacheTag` / `revalidateTag('wall', { expire: 0 })`.
- *Old claim (2026-11-22)*: Strip GPS using `exifr` / stream directly to Bunny; delete DB rows first with no tombstone. *Why wrong*: `exifr` is read-only, buffering is required to sniff/strip, and DB-first delete loses paths on crash. *Replaced by*: `25 MB` buffered binary segment/chunk stripper + `'deleting'` tombstone state.

## Links Out

- [frontend-gallery-wall/research.md](../frontend-gallery-wall/research.md)
