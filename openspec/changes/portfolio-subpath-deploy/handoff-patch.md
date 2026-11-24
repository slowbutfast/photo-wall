# Surgical Patch Handoff: OpenSpec Change 'portfolio-subpath-deploy' [PATCH-01]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: `portfolio-subpath-deploy` (PR #4, branch `feat/portfolio-subpath-deploy`)
- **Patch ID**: `PATCH-01`
- **Objective**: Resolve PR #4 review feedback on `feat/portfolio-subpath-deploy`: restore `next-env.d.ts` from dev-generated paths, complete `.env.example` (Task 3.3), correct the Vercel domain claim in `research.md`, document the build-time preview-migration risk in `architecture.md`, clean up `useWallManifest.ts` and `LocalStorageAdapter.publicUrl()`, and split Task 4.3 cleanly.
- **Branch Requirement**: Apply all edits on the existing PR #4 branch `feat/portfolio-subpath-deploy` (do **not** branch from `main` and do **not** open a new PR; push commits to `feat/portfolio-subpath-deploy` to update PR #4).
- **Feedback & Diagnostic Trace**:
  ```
  1. [Important] next-env.d.ts:L3-L4 — Imports `./.next/dev/types/routes.d.ts` and
     `./.next/dev/types/root-params.d.ts` (churn from running `next dev`). On a clean checkout
     or after `next build`, those dev paths do not exist and `tsc --noEmit` can fail.
     Restore to `./.next/types/routes.d.ts` and `./.next/types/root-params.d.ts`.

  2. [Important] .env.example & tasks.md:L27 — Task 3.3 requires updating `.env.example` with
     `DATABASE_AUTH_TOKEN`, `TRUSTED_ORIGIN_HOSTS`, and notes on `TURSO_*` fallbacks and
     `CDN_BASE_URL` precedence. Update `.env.example` and mark Task 3.3 complete.

  3. [Important] openspec/changes/portfolio-subpath-deploy/research.md:L102,L129 —
     Incorrectly claims `photo-wall-phi.vercel.app` is gone from project Domains. In reality,
     `list_project_domains` still shows `photo-wall-phi.vercel.app` as the attached domain,
     while `photo-wall-joeshmo.vercel.app` is the automatic `<project>-<team>` production
     alias (preferred because it cannot be detached).

  4. [Important] openspec/changes/portfolio-subpath-deploy/architecture.md:L183 —
     Clarify under Risks that because `/api/wall` prerenders at build time (`cacheComponents`),
     any future branch adding a Drizzle migration will apply it to production Turso during its
     preview build before PR review; mitigate by scoping a separate Preview Turso DB via
     Preview-targeted `DATABASE_URL` / `DATABASE_AUTH_TOKEN`.

  5. [Nit] src/components/wall/useWallManifest.ts:L52,L72,L89 —
     Redundant double-wrap of `withBase`. Wrap once at L52:
     `const manifestUrl = withBase(options.manifestUrl ?? '/api/wall');`
     and use `manifestUrl` directly at L72 and L89 (keeps `rawUrlAudit.test.ts` green and
     still prefixes custom root-relative `options.manifestUrl`).

  6. [Nit] src/lib/storage/local.ts:L83-L85 —
     `LocalStorageAdapter.publicUrl()` returns unprefixed `/api/local-uploads/...`.
     Wrap with `withBase(...)` so it matches `LOCAL_CDN_BASE` (`/photos/api/local-uploads/...`).

  7. [Nit] openspec/changes/portfolio-subpath-deploy/tasks.md:L39 —
     Split Task 4.3 into `4.3a` (`[x]` Origin allow-list & cookie scope checks completed
     locally) and `4.3b` (`[ ]` YouTube oEmbed artist/title population — blocked in offline
     sandbox, pending networked check).
  ```
- **Root Cause Analysis**:
  - `next dev` overwrote `next-env.d.ts` before commit; `next build` restores `./.next/types/...`.
  - `.env.example` was skipped due to a sandbox read deny rule during the initial run.
  - `research.md` conflated the deployment alias list with Settings → Domains.
  - `useWallManifest.ts` defensively wrapped both default and fetch calls; `LocalStorageAdapter.publicUrl()` was outside the initial Target Context Map.

## 2. Strict Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `next-env.d.ts` | `L3-L4` | Restore `import "./.next/types/routes.d.ts";` and `import "./.next/types/root-params.d.ts";` (matching `main`; do not run `next dev` after `next build`). |
| `.env.example` | `L1-L19` | Add `DATABASE_AUTH_TOKEN=""` beneath `DATABASE_URL` with a comment that `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` are read as fallbacks; add `# TRUSTED_ORIGIN_HOSTS="gregory-lazatin.com,www.gregory-lazatin.com"` beneath `AUTH_SECRET`; update `CDN_BASE_URL` comment/example to `http://localhost:3000/photos/api/local-uploads` and note that when `STORAGE_DRIVER=bunny`, `CDN_BASE_URL` takes precedence over `BUNNY_PULL_ZONE_URL` for public URLs while purges still use `BUNNY_PULL_ZONE_URL`. *(Placeholder values only — never real secrets.)* |
| `src/components/wall/useWallManifest.ts` | `L52`, `L72`, `L89` | Change `L52` to `const manifestUrl = withBase(options.manifestUrl ?? '/api/wall');` and change `fetch(withBase(manifestUrl), ...)` at `L72` and `L89` to `fetch(manifestUrl, ...)`. |
| `src/lib/storage/local.ts` | `L1-L6`, `L83-L85` | Import `withBase` from `@/lib/basePath` and change `publicUrl(path)` to `return withBase(\`/api/local-uploads/\${path.replace(/^\\/+/, '')}\`);`. If any test under `src/lib/storage/__tests__/` asserts `publicUrl()` directly, update its expectation to `/photos/api/local-uploads/...`. |
| `openspec/changes/portfolio-subpath-deploy/research.md` | `L102`, `L129` | Replace the "dashboard no longer shows `-phi`" wording with the verified fact: `list_project_domains` still lists `photo-wall-phi.vercel.app` as the attached domain, while `photo-wall-joeshmo.vercel.app` is the automatic `<project>-<team>` production alias (both point to production; `-joeshmo` is preferred because it cannot be detached). |
| `openspec/changes/portfolio-subpath-deploy/architecture.md` | `L183` | Expand the "Previews write to the production DB" risk bullet to explicitly note that because `/api/wall` prerenders at build time, a preview build on any future branch adding a Drizzle migration will apply that migration to production Turso before PR review; mitigate by pointing Preview at a separate Turso DB via Preview-scoped `DATABASE_URL` / `DATABASE_AUTH_TOKEN`. |
| `openspec/changes/portfolio-subpath-deploy/tasks.md` | `L27`, `L39`, bottom | Mark Task 3.3 `[x]` (removing the "`.env.example` half NOT done" note); split Task 4.3 into `4.3a` (`[x]` Origin allow-list & cookie scope checks verified locally) and `4.3b` (`[ ]` YouTube oEmbed artist/title population — blocked by offline sandbox); mark `P01.1`–`P01.4` `[x]`. |
| `openspec/changes/portfolio-subpath-deploy/verification.md` | `§1 Deviations`, `§6 Maintainer follow-ups` | Update the two deviations (`LocalStorageAdapter.publicUrl()` now prefixed; `.env.example` updated), remove `.env.example` from Maintainer follow-ups, and append `PATCH-01` verification log. |
| `openspec/changes/portfolio-subpath-deploy/patch.md` | `PATCH-01` block | Mark `Status: RESOLVED` with verification summary. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the files and line ranges listed in the Target Context Map (plus any single unit test asserting `LocalStorageAdapter.publicUrl()` if one exists).
- **FORBIDDEN**:
  - Do NOT modify `.env`, `.env.local`, or any secret/credential files.
  - Do NOT alter `next.config.ts`, `src/lib/security/csp.ts`, `src/lib/auth.ts`, `src/db/index.ts`, or `src/lib/basePath.ts`.
  - Do NOT run `next dev` (which rewrites `next-env.d.ts` back to `./.next/dev/types/...`).
  - Do NOT modify existing passing test assertions other than a direct `LocalStorageAdapter.publicUrl()` assertion if present.
- **INVARIANTS TO PRESERVE**:
  - All 23 Vitest files (300 tests), including `rawUrlAudit.test.ts`, MUST pass.
  - `npm run typecheck`, `npm run lint`, and `npm run build` MUST exit `0`.
  - `git diff main -- next-env.d.ts` MUST be empty after `npm run build`.

## 4. Visual & UI Impact
- **Status: Non-visual patch.** No styling, layout, or visual changes permitted.

## 5. Reproduction & Verification Protocol
1. **Verify Pre-Fix State**:
   ```bash
   git diff main -- next-env.d.ts
   ```
   Confirm `next-env.d.ts` currently points at `./.next/dev/types/...`.
2. **Apply Minimal Fixes**: Make the mapped edits across the Target Context Map.
3. **Verify Targeted Tests**:
   ```bash
   npx vitest run src/lib/__tests__/rawUrlAudit.test.ts src/lib/storage/__tests__
   ```
   Confirm 100% pass.
4. **Full Regression Suite & Clean `next-env.d.ts` Check**:
   ```bash
   npm run build && npm run typecheck && npm run lint && npm test && git diff main -- next-env.d.ts
   ```
   Confirm all commands exit `0` and `git diff main -- next-env.d.ts` outputs nothing.
5. **Commit & Push to PR #4**: Commit all patch edits + updated `tasks.md`, `verification.md`, and `patch.md` to `feat/portfolio-subpath-deploy` and push to update PR #4.

## 6. Surgical Patch Checklist
- [ ] P01.1 Restore `next-env.d.ts` to `./.next/types/...` and update `.env.example` (completing Task 3.3).
- [ ] P01.2 Deduplicate `withBase` in `src/components/wall/useWallManifest.ts` and wrap `LocalStorageAdapter.publicUrl()` in `src/lib/storage/local.ts`.
- [ ] P01.3 Fix domain wording in `research.md`, add build-time preview-migration risk to `architecture.md`, and update `tasks.md` (3.3 `[x]`, split `4.3a`/`4.3b`).
- [ ] P01.4 Run `npm run build && npm run typecheck && npm run lint && npm test && git diff main -- next-env.d.ts` and confirm 100% pass with empty `next-env.d.ts` diff.
- [ ] P01.5 Update `verification.md`, mark `PATCH-01` `RESOLVED` in `patch.md`, check off `P01.1`–`P01.4` in `tasks.md`, and push to `feat/portfolio-subpath-deploy`.
