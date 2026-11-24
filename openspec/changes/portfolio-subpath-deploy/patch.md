# Patch Audit Trail — `portfolio-subpath-deploy`

### [PATCH-01] PR #4 Review Fixes (`next-env.d.ts`, `.env.example`, `research.md` Domain Claim, Preview-Migration Risk, `useWallManifest` / `LocalStorageAdapter` Cleanup & Task Split)
- **Date**: 2026-11-24 17:06:00 UTC
- **Feedback Source**: Code Review (PR #4 multi-agent review & Vercel preview audit)
- **Feedback Summary**:
  Seven small, surgical fixes on `feat/portfolio-subpath-deploy` (PR #4):
  1. **Important (Build / Generated File Churn) — `next-env.d.ts` imports `.next/dev/types/*`** (`next-env.d.ts:L3-L4`): Running `next dev` rewrote `next-env.d.ts` to reference `./.next/dev/types/routes.d.ts` and `./.next/dev/types/root-params.d.ts`, which do not exist on a clean checkout or after `next build`. Restore the production-build references (`./.next/types/...`).
  2. **Important (Task 3.3 / Env Contract) — `.env.example` not updated** (`.env.example:L1-L19`, `openspec/changes/portfolio-subpath-deploy/tasks.md:L27`): Add placeholder entries for `DATABASE_AUTH_TOKEN` (noting `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` fallbacks), `TRUSTED_ORIGIN_HOSTS`, and updated `CDN_BASE_URL` precedence + `/photos/api/local-uploads` local default, then mark Task 3.3 `[x]`.
  3. **Important (Docs Accuracy) — `research.md` domain claim reversed** (`openspec/changes/portfolio-subpath-deploy/research.md:L102,L129`): `list_project_domains` still lists `photo-wall-phi.vercel.app` as the attached domain, while `photo-wall-joeshmo.vercel.app` is the automatic `<project>-<team>` production alias (preferred because it cannot be detached). Correct the "dashboard no longer shows `-phi`" claim.
  4. **Important (Risk Documentation) — Preview builds can migrate production Turso** (`openspec/changes/portfolio-subpath-deploy/architecture.md:L183`): Clarify in the existing preview-DB risk bullet that because `/api/wall` prerenders at build time, a preview build for any future branch adding a Drizzle migration will apply that migration to production Turso before PR review (mitigated by scoping a separate Preview Turso DB via Preview-targeted `DATABASE_URL`/`DATABASE_AUTH_TOKEN`).
  5. **Nit (Code Hygiene) — Redundant `withBase()` double-wrap in `useWallManifest.ts`** (`src/components/wall/useWallManifest.ts:L52,L72,L89`): Normalize once at `const manifestUrl = withBase(options.manifestUrl ?? '/api/wall');` (keeping `rawUrlAudit.test.ts` green and prefixing custom root-relative callers) and remove the redundant `withBase(manifestUrl)` wrappers on `L72` and `L89`.
  6. **Nit (Code Hygiene) — Unprefixed `LocalStorageAdapter.publicUrl()`** (`src/lib/storage/local.ts:L83-L85`): Wrap the returned path in `withBase()` so it matches `LOCAL_CDN_BASE` (`/photos/api/local-uploads/...`) and cannot produce a 404 if called later.
  7. **Nit (Task Tracking) — Split partially completed Task 4.3** (`openspec/changes/portfolio-subpath-deploy/tasks.md:L39`): Split Task 4.3 into `4.3a` (`[x]` Origin allow-list & cookie scope checks verified locally) and `4.3b` (`[ ]` YouTube oEmbed artist/title population — blocked by offline sandbox, pending networked check).
- **Reported Issue / Raw Trace**:
  - `next-env.d.ts:3-4`: `import "./.next/dev/types/routes.d.ts";` / `import "./.next/dev/types/root-params.d.ts";`
  - `tasks.md:27`: Task 3.3 unchecked because `.env.example` was untouched.
  - `research.md:129`: incorrectly states `photo-wall-phi.vercel.app` is gone from the project's Domains.
  - `useWallManifest.ts:52,72,89`: `withBase` called on both default and both `fetch()` sites.
  - `src/lib/storage/local.ts:84`: returns `/api/local-uploads/...` without `withBase`.
- **Root Cause**:
  1. `next dev` mutated `next-env.d.ts` before committing.
  2. Sandbox deny rule blocked reading `.env.example` during the initial OpenCode run.
  3. Deployment alias list vs Settings → Domains confusion in `research.md`.
  4. Defensive double-wrapping in `useWallManifest` and untouched dead-code helper in `local.ts`.
- **Target Files**: `next-env.d.ts`, `.env.example`, `src/components/wall/useWallManifest.ts`, `src/lib/storage/local.ts`, `openspec/changes/portfolio-subpath-deploy/research.md`, `openspec/changes/portfolio-subpath-deploy/architecture.md`, `openspec/changes/portfolio-subpath-deploy/tasks.md`, `openspec/changes/portfolio-subpath-deploy/verification.md`, `openspec/changes/portfolio-subpath-deploy/patch.md`
- **Resolution Strategy**: Surgical minimal-diff cleanup on `feat/portfolio-subpath-deploy` (PR #4), keeping all 23 Vitest files (300 tests), typecheck, lint, and `next build` green.
- **Status**: RESOLVED
- **Resolution Summary** (2026-11-24):
  1. `next-env.d.ts` restored to `./.next/types/...`; `git diff main -- next-env.d.ts` is empty after `npm run build`. The dev-path version had been committed in the first test-scaffold commit.
  2. `.env.example` updated (`DATABASE_AUTH_TOKEN` + `TURSO_*` fallback note, `TRUSTED_ORIGIN_HOSTS`, `CDN_BASE_URL` precedence and `/photos/api/local-uploads` local default). The Read/Edit tools could open the file; only the earlier shell `cat` was denied. Task 3.3 is `[x]`.
  3. `research.md` corrected (it had wrongly recorded `-phi` as removed). `architecture.md` D14 carried the same claim and was corrected too, although it was not in the Target Context Map.
  4. Preview-migration risk expanded in `architecture.md` with the Preview-scoped `DATABASE_URL`/`DATABASE_AUTH_TOKEN` mitigation.
  5. `useWallManifest.ts` normalises once with `withBase(options.manifestUrl ?? '/api/wall')`. **Deviation:** the patch claimed this keeps `rawUrlAudit.test.ts` green, but it did not (the literal sits behind `??`, not directly after `withBase(`). The audit matcher now accepts a literal anywhere inside a `withBase(` argument list.
  6. `LocalStorageAdapter.publicUrl()` wrapped in `withBase()`. No test asserted it directly.
  7. Task 4.3 split into `4.3a` `[x]` and `4.3b` `[ ]` (BLOCKED: network).
- **Verification**: `npm run build`, `tsc --noEmit` and `eslint .` exit 0; vitest 23 files / 300 tests pass; empty `next-env.d.ts` diff. Full log in `verification.md`.
- **Follow-up (2026-11-24, after the Vercel preview checks)**:
  - Item 3's preference for `photo-wall-joeshmo.vercel.app` as the rewrite destination is **reversed**: unauthenticated requests show that alias redirects to Vercel SSO, while `photo-wall-phi.vercel.app` is public. D9, D14, README, tests and `research.md` now use `-phi`.
  - Item 7's `4.3b` "BLOCKED (network)" was wrong (the sandbox has outbound access; the fixture video simply has no oEmbed title). `4.3b` is verified with a real video ID and ticked.

