# Chiaroscuro Gallery — Photo Wall MVP

A self-hosted, infinite 3D photo wall: album folders mount as borderless exhibition clusters on continuous PBR plaster, lit by warm overhead track pools, with beveled glass standoff placards, recessed cotton mats, optional YouTube soundtrack plaques, and an NYC-solar circadian mood.

## Stack

- **Next.js 16** (App Router, `cacheComponents: true`) + React 19 + TypeScript
- **React Three Fiber 9 / Three.js** for the wall (O(1) instanced passes + pooled prints)
- **Drizzle ORM + LibSQL/SQLite** (`file:./data/photo-wall.db`)
- **Vitest 5** + `fast-check` property tests
- **Bunny.net Storage/Optimizer/Pull Zone** in production, local filesystem for development
- Self-hosted **TeX Gyre Heros** (DOM `@font-face` + troika WebGL placards)

## Quick start

```bash
npm install
cp .env.example .env.local   # set a 16+ character ADMIN_PASSWORD and a long AUTH_SECRET
npm run dev
```

- Gallery: <http://localhost:3000>
- 2,000-print stress demo (50 albums, offline SVG prints): <http://localhost:3000/?demo=2000>
- Curator: click the lock / `Curate` in the top-right HUD.

The database and `drizzle/` migrations carry themselves: the first request creates `data/photo-wall.db` and applies the checked-in migration.

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | LibSQL/SQLite URL (`file:./data/photo-wall.db` by default) |
| `ADMIN_PASSWORD` | Single-owner curator password (minimum 16 characters) |
| `AUTH_SECRET` | 32+ random bytes used to sign the HttpOnly session JWT |
| `STORAGE_DRIVER` | `local` (default) or `bunny` |
| `LOCAL_UPLOAD_DIR` | Local object root (`./data/uploads`) |
| `BUNNY_*` / `CDN_BASE_URL` | Bunny Storage zone, storage key, Pull Zone URL/key, optional CDN base |

Never commit `.env*`; `.env.example` documents the contract only.

## Scripts

```bash
npm run dev        # Next dev server
npm run build      # production build
npm start          # production server
npm test           # Vitest (single-worker)
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run db:generate / db:push
```

## Architecture

Vertical slices, with pure shared math:

- `src/app/api/wall` — cached compact manifest (`'use cache'` + `cacheTag('wall')`)
- `src/app/api/admin/*` — auth, album/photo CRUD, idempotent multipart upload, YouTube inspect, tombstone retry
- `src/app/api/local-uploads/[...path]` — local object streaming
- `src/lib/layout` — `100px = 1 world unit`; placard-left 3-albums-per-row geometry shared by API and renderer
- `src/lib/storage` — Bunny/local `StorageAdapter`, tombstone deletion sweep
- `src/lib/upload` — 25 MB cap, magic-byte sniffing, Orientation-only EXIF rebuild, GPS/XMP strip, ICC preserve
- `src/lib/camera`, `src/lib/lighting` — clamped zoom/fly-to/hit-testing, analytic spotlight fixtures, offline `suncalc` moods
- `src/components/wall` — wall shader, instanced mats/shadows/placards, pooled prints, soundtrack plaque/overlay
- `src/components/admin` — lazily loaded Curator Drawer, folder reader/uploader

## Verification

Both OpenSpec changes (`backend-storage-crud`, `frontend-gallery-wall`) were implemented, verified, and archived under `openspec/changes/archive/`; their reports are at:

- `openspec/changes/archive/2026-11-23-backend-storage-crud/verification.md`
- `openspec/changes/archive/2026-11-23-frontend-gallery-wall/verification.md`

Base specs live in `openspec/specs/` (7 capabilities, all strict-valid).

`npx vitest run` → 165 tests across 13 files; `tsc`, ESLint, and `next build` are clean. The integrated-GPU `p95 ≤ 16.7 ms` / `< 256 MB` benchmark and live YouTube playback remain documented manual checks.
