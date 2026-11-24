# OpenCode Orchestration Handoff: OpenSpec Change 'portfolio-subpath-deploy'

You are the orchestration agent for OpenSpec change 'portfolio-subpath-deploy' running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive
- **Change Name**: portfolio-subpath-deploy
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub portfolio-subpath-deploy`)
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). Maintain strict isolation between feature compartments and avoid horizontal abstractions.
- **Branch**: work on `feat/portfolio-subpath-deploy`, cut from `main` at or after `a26d19e` (the planning-artifact commit).
- **Read first**: `openspec/changes/portfolio-subpath-deploy/{research,proposal,architecture,tests,tasks}.md` and `specs/**`. Architecture decisions D1–D10 are binding. The Glossary in `research.md` defines `BASE_PATH`, `withBase`, *public CDN base*, *trusted origin host* and *Turso env (integration)*. Use those names exactly.
- **Next.js 16.4.6**: per `AGENTS.md`, read `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/{basePath,headers}.md` before you touch `next.config.ts`.

## 2. Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/lib/basePath.ts` | `[NEW]` | Dependency-free module. `export const BASE_PATH = '/photos'` and `withBase(path)` per D2: prefix a single leading `/`; pass through `//`, `http(s):`, `data:`, `blob:` and relative paths; idempotent on `BASE_PATH`, `BASE_PATH/…` and `BASE_PATH?…`. No `@/` imports, because `next.config.ts` imports it by relative path. |
| `next.config.ts` | `L1-L11` | Add `basePath: BASE_PATH` via `import { BASE_PATH } from './src/lib/basePath'`. Add `async headers()` with one `{ source: '/:path*' }` entry: `Content-Security-Policy` from `buildContentSecurityPolicy({ cdnOrigin: cdnOriginFrom(process.env.CDN_BASE_URL \|\| process.env.BUNNY_PULL_ZONE_URL), isDev: process.env.NODE_ENV !== 'production' })`, plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. Add `outputFileTracingIncludes: { '/**': ['./drizzle/**/*'] }` (D12). Keep the existing `cacheComponents`, `serverExternalPackages` and `experimental` keys. |
| `src/db/index.ts` | `L12-L50` | Add the exported pure `resolveDatabaseConfig(env): { url, authToken? }`, with URL `DATABASE_URL \|\| TURSO_DATABASE_URL \|\| 'file:./data/photo-wall.db'` and token `DATABASE_AUTH_TOKEN \|\| TURSO_AUTH_TOKEN \|\| undefined` (D11). `createDatabase({ url, authToken })` calls `createClient({ url, authToken })`. In `getDb()`, add `.catch` to clear `cachedDatabase` on rejection and rethrow (D13). Keep `ensureDatabaseDirectory`, the `PRAGMA foreign_keys = ON` and the runtime `migrate()` as they are. |
| `drizzle.config.ts` | `L1-L10` | Same precedence, duplicated inline (don't import from `src/`). `dialect: url.startsWith('libsql:') ? 'turso' : 'sqlite'`, `dbCredentials: { url, authToken }`. |
| `src/app/api/__tests__/routes.test.ts` | `L239` | Update the call to `createDatabase({ url: databaseUrl })`. |
| `src/db/__tests__/connection.test.ts` | `[NEW]` | Task 1.6. Mock `@libsql/client` and reset module state between cases (`vi.resetModules()`), because `cachedDatabase` is module-level. |
| `src/lib/security/csp.ts` | `[NEW]` | Pure `cdnOriginFrom(base?: string): string \| null` (`new URL(base).origin`; returns `null` for empty, root-relative or invalid input) and `buildContentSecurityPolicy({ cdnOrigin, isDev })`. Directives: `default-src 'self'`; `script-src 'self' 'unsafe-inline'` (+`'unsafe-eval'` dev only); `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:` (+cdnOrigin); `font-src 'self'`; `connect-src 'self'` (+`ws:` dev only); `frame-src https://www.youtube-nocookie.com`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`. **Never** add `https://www.youtube.com`. Relative imports only, since `next.config.ts` imports it. |
| `src/lib/auth.ts` | `L5`, `L151-L168`, `L188-L196` | `SESSION_COOKIE_NAME = 'photowall_session'`. Append the `TRUSTED_ORIGIN_HOSTS` entries (split on `,`, trim, lower-case, drop empties) inside `allowedHosts()`. `sessionCookie()` and `clearedSessionCookie()` both use `Path=${BASE_PATH}`. Leave `getClientKey` / `TRUSTED_PROXY_HOPS` untouched. |
| `src/lib/storage/index.ts` | `L7`, `L50-L59` | `LOCAL_CDN_BASE = withBase('/api/local-uploads')`. `getCdnBase()` uses `process.env.CDN_BASE_URL \|\| process.env.BUNNY_PULL_ZONE_URL` (empty string counts as unset). Error message unchanged. |
| `src/lib/storage/bunny.ts` | — | **No change.** Purge stays on `pullZoneUrl`; a test asserts this. |
| `src/lib/dev/fakeManifest.ts` | `L328`, `L332` | `cdnBase: withBase('/demo')`. |
| `src/store/useWallStore.ts` | `L148`, `L239` | `fetch(withBase('/api/wall'))`, `fetch(withBase('/api/admin/auth'))`. |
| `src/components/PhotoWallApp.tsx` | `L87` | Default `manifestUrl = withBase('/api/wall')`. |
| `src/components/wall/useWallManifest.ts` | `L51`, `L71`, `L88` | Default `withBase('/api/wall')`, **and** `fetch(withBase(manifestUrl))` at both fetch sites, so caller-supplied URLs (e.g. the future `/api/admin/wall-preview`) are covered. Idempotence makes double-wrapping safe. |
| `src/components/wall/SoundtrackPlaque.tsx` | `L102` | Thumb `src={withBase(\`/api/youtube/thumb/${…}\`)}`. Leave the `youtube-nocookie` iframe `src` (L117) alone. |
| `src/components/wall/PlaygroundPbrWall.tsx` | `L33-L36` | Wrap the four `TEXTURES` paths in `withBase`. |
| `src/components/admin/FolderDropzone.tsx` | `L80`, `L158`, `L207`, `L351`, `L464` | Wrap the 4 fetch URLs and the upload `xhr.open` URL. Do **not** touch `captureDuration` / `loadYouTubeIframeApi` (L492+). The CSP blocking it is intended (D4). |
| `src/components/admin/AdminDrawer.tsx` | `L59`, `L105`, `L126`, `L136` | Wrap the 4 fetch URLs. |
| `src/app/globals.css` | `L11`, `L19`, `L27`, `L35` | `url('/fonts/x.woff2')` → `url('./fonts/x.woff2')`. No other edits to the `@font-face` rules or to `--font-family-base`. |
| `public/fonts/*` → `src/app/fonts/*` | `[MOVE]` | `git mv` all 8 files (4 `.woff2` + 4 unreferenced `.otf`), then remove the empty `public/fonts/`. |
| `.env.example` | append | Add a commented `TRUSTED_ORIGIN_HOSTS=` (example `gregory-lazatin.com,www.gregory-lazatin.com`), a commented `DATABASE_AUTH_TOKEN=`, a note that `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are read as fallbacks (the Vercel Turso integration sets them), and a note that `CDN_BASE_URL` now takes precedence over `BUNNY_PULL_ZONE_URL` for public URLs. Placeholder values only. |
| `README.md` | append section | Add a "Deploying under /photos" section covering: the D9 portfolio `vercel.json` snippet, the D8 `TRUSTED_PROXY_HOPS` calibration, that the CSP is evaluated at build time (a CDN host change requires a redeploy), the rollback order (portfolio PR first), that local dev is now `localhost:3000/photos`, the env inventory table from the architecture Migration plan (names and who sets them, never values), and the Deployment Protection check on `photo-wall-phi.vercel.app`. |
| `src/lib/__tests__/basePath.test.ts` | `[NEW]` | Task 1.1. |
| `src/lib/security/__tests__/csp.test.ts` | `[NEW]` | Task 1.2. |
| `src/lib/__tests__/auth.test.ts` | extend | Task 1.3. Update any existing assertion on `pw_admin_session` / `Path=/`. |
| `src/lib/storage/__tests__/cdnBase.test.ts` | `[NEW]` | Task 1.4. Stub env per test and reset the adapter with `resetStorageAdapterForTesting()`. |
| `src/lib/storage/__tests__/bunny.test.ts` | extend | Task 1.4: purge URL stays on the pull zone when `CDN_BASE_URL` differs. |
| `src/lib/dev/__tests__/fakeManifest.test.ts` | update | Expect `cdnBase: '/photos/demo'`. |
| `src/lib/__tests__/rawUrlAudit.test.ts` | `[NEW]` | Task 1.5. Strip `//` and `/* */` comments first (JSDoc mentions `/api/wall`). Exclude `__tests__` and `src/app/api/**`. Match `'`, `"` and `` ` `` literals. |
| Any other test asserting `cdnBase: '/api/local-uploads'`, `'/demo'` or the old cookie name | update | Run `grep -rn "api/local-uploads'\|cdnBase: '/demo'\|pw_admin_session" src` and update the expectations to the new values. |

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions** (from `architecture.md`):
  - **D1:** `BASE_PATH` is a hard-coded constant, not env. The literal `'/photos'` appears nowhere else in `src/` except tests.
  - **D2:** `withBase` wraps defaults *and* the `useWallManifest` fetch site. It never wraps absolute CDN URLs.
  - **D3:** fonts become bundler-relative. Don't use `next/font/local`.
  - **D4:** static CSP via `headers()`, no nonces and no `proxy.ts`. `frame-ancestors 'none'` plus `X-Frame-Options: DENY`. The curator's YouTube IFrame API duration probe is **intentionally blocked**: it degrades to `durationSec` unset, and you must not "fix" it by allowing `www.youtube.com`.
  - **D5:** the public CDN base prefers `CDN_BASE_URL`, while purges stay on `BUNNY_PULL_ZONE_URL`.
  - **D6:** cookie `photowall_session`, `Path=/photos`, on both set and clear. No migration shim.
  - **D7:** the `TRUSTED_ORIGIN_HOSTS` allow-list. Behaviour with it unset must be byte-for-byte the current one.
  - **D8–D9:** documentation only.
  - **D10:** don't edit `admin-route-isolation` artifacts or create `src/proxy.ts`.
  - **D11–D13:** the DB resolves `DATABASE_*` → `TURSO_*` → file, passes `authToken`, bundles `drizzle/` and retries a failed init. Don't move migrations to build time.
  - **D14:** the Vercel project `photo-wall` exists and is Git-connected, so your PR gets a preview deployment automatically. The preview **shares the production Turso DB**, and it sits behind Vercel Deployment Protection.
- **Hard Exclusions / No-Go**:
  - Do NOT modify `.env`, `.env.*` (except appending placeholder lines to `.env.example`), or credential files. Never print env values.
  - Do NOT introduce unapproved external dependencies. This change needs none.
  - Do NOT perform code modifications outside the Target Context Map without prior task coverage.
  - Do NOT add `serverActions.allowedOrigins`, since the app has no Server Actions.
  - Do NOT change `getClientKey`, rate-limit constants, `lodUrl.ts`, the WebGL shader, `playground-wall.css`, or any typography tokens.
  - Do NOT edit the portfolio repo, `playgrounds/photo_wall_playground.html`, or `openspec/changes/admin-route-isolation/`.
  - **Do NOT touch Vercel or Turso.** That means no `vercel` CLI (`env`, `deploy`, `link`, `pull`), no `turso` CLI, no requests to `*.vercel.app` or `*.turso.io`, and no `drizzle-kit push` against anything but the local file. The preview and production checks are `PENDING (infra)` rows that the maintainer session completes with the Vercel MCP after you open the PR.

## 4. Visual & UI Design Specifications & Vision Verification
- **Status: Non-visual / Backend change.** No user-facing components, layout, or styling affected. Do NOT generate UI components or CSS rules.
- The one visual guard: after the font move, the placard and HUD typography must render identically. Task 4.2 captures `/photos?demo=4` on the production build and compares it against a pre-change `/?demo=4` capture taken from `main` **before** you start (save it under `openspec/changes/portfolio-subpath-deploy/parity/`). `deepseek-flash` supports vision, so inspect both PNGs directly. `pixelmatch` is already a dev dependency if you want a numeric diff.
- **Playwright setup in this sandbox:**
  - Launch Chromium with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, or the WebGL wall renders blank.
  - Use `http://localhost:<port>`, not `127.0.0.1`. Next 16 dev blocks `/_next` resources cross-origin for `127.0.0.1`, so the page never hydrates.

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: `npx vitest run <file>` per task, `npm test` (= `vitest run`) for the full suite, plus `npm run typecheck`, `npm run lint` and `npm run build`.
- **TDD Requirement**: Task group ## 1 MUST scaffold failing unit and integration tests before touching implementation code. Verify they fail initially, and for the expected reason: a missing module or a wrong value, not a syntax error.
- **Resource & Concurrency Rules**:
  - During task implementation, run ONLY the narrowest test file corresponding to the modified code. Do NOT run full test discovery or headless browser E2E suites on every task checkbox.
  - When running test verification, wrap commands with `safe-test` (e.g. `safe-test npx vitest run src/lib/__tests__/basePath.test.ts`) or run with a single worker (`--poolOptions.threads.singleThread` / `--workers=1`), to serialize execution through the kernel queue and prevent memory thrashing.
- **Integration checks (task group 4 only):**
  - Run `npm run build && npx next start -p 3111`, then drive Playwright against `http://localhost:3111/photos?demo=4`.
  - The curl `Origin` checks need `ADMIN_PASSWORD` (≥16 chars) and `AUTH_SECRET` in the shell env for `next start`. Export throwaway values inline in the command and never write them to a file.

## 6. Implementation Task Checklist
- [ ] 1.1 Scaffold failing `src/lib/__tests__/basePath.test.ts` for `BASE_PATH` and `withBase`: prefixing, absolute, protocol-relative, `data:`, `blob:` and relative pass-through, and idempotence on `/photos`, `/photos/…` and `/photos?…`.
- [ ] 1.2 Scaffold failing `src/lib/security/__tests__/csp.test.ts` for `cdnOriginFrom` and `buildContentSecurityPolicy` (prod vs dev directives, null CDN origin, path stripping).
- [ ] 1.3 Extend `src/lib/__tests__/auth.test.ts` with failing cases: `photowall_session` + `Path=/photos` on both set and clear cookies, and `TRUSTED_ORIGIN_HOSTS` accept, reject and unset behaviour (whitespace and case normalisation included).
- [ ] 1.4 Add a failing `getCdnBase` precedence test (new `src/lib/storage/__tests__/cdnBase.test.ts`): `CDN_BASE_URL` wins, empty or unset falls back, neither throws, local returns `/photos/api/local-uploads`. Extend `bunny.test.ts` to assert the purge URL stays on the pull zone. Update `src/lib/dev/__tests__/fakeManifest.test.ts` to expect `cdnBase: '/photos/demo'`.
- [ ] 1.5 Scaffold failing `src/lib/__tests__/rawUrlAudit.test.ts`. After stripping comments, it scans `src/app` (excluding `src/app/api/**`), `src/components`, `src/store` and `src/lib/dev` for unwrapped single-quoted, double-quoted or template `/api/`, `/textures/`, `/demo` and `/fonts/` literals, scans the repo `src/` for `'/photos'`/`"/photos"` outside `basePath.ts`, and scans `globals.css` for absolute `/fonts/` URLs. Run `npx vitest run` and confirm the new tests fail for the expected reasons.
- [ ] 1.6 Scaffold failing `src/db/__tests__/connection.test.ts`. Mock `@libsql/client`'s `createClient`. Cover `resolveDatabaseConfig` precedence (`DATABASE_*` over `TURSO_*` over the file default, empty strings as unset, undefined token when none), `createClient` receiving `{ url, authToken }`, `getDb()` retrying after a rejected init, and three concurrent `getDb()` calls sharing one attempt.


- [ ] 2.1 Create `src/lib/basePath.ts` (dependency-free `BASE_PATH` + `withBase` per architecture D2), and set `basePath: BASE_PATH` in `next.config.ts` via a relative import, until `basePath.test.ts` passes.
- [ ] 2.2 Re-grep for root-relative client URLs. Wrap every hit in `withBase`: `useWallStore.ts`, the `PhotoWallApp.tsx` default `manifestUrl`, `useWallManifest.ts` (wrap at the `fetch` site so passed-in URLs are covered too), the `SoundtrackPlaque.tsx` thumb `src`, the `PlaygroundPbrWall.tsx` `TEXTURES`, `FolderDropzone.tsx` (4 fetches + the XHR) and `AdminDrawer.tsx` (4 fetches). Do the same for any new fetch sites that `admin-route-isolation` has landed by then.
- [ ] 2.3 Set `LOCAL_CDN_BASE = withBase('/api/local-uploads')` and the fake manifest `cdnBase = withBase('/demo')`. Flip `getCdnBase()` to `CDN_BASE_URL || BUNNY_PULL_ZONE_URL`. Leave `BunnyStorageAdapter` purge on `pullZoneUrl`. Iterate until the storage and fakeManifest tests pass.
- [ ] 2.4 Move every file in `public/fonts/` (the four `.woff2` plus the unreferenced `.otf` sources, kept for licence provenance) to `src/app/fonts/`, switch the four `@font-face` `src` values in `globals.css` to `url('./fonts/…')` with no other edits to those rules, and delete `public/fonts/`. Iterate until `rawUrlAudit.test.ts` passes.
- [ ] 2.5 In `src/db/index.ts`:
  - add the exported pure `resolveDatabaseConfig(env)` (architecture D11);
  - change `createDatabase` to accept `{ url, authToken }` and pass both to `createClient`;
  - make `getDb()` clear `cachedDatabase` when the init rejects (D13).

  Update every `createDatabase(` caller and test to the new signature. Mirror the precedence in `drizzle.config.ts`, using the `turso` dialect for `libsql:` URLs and `sqlite` otherwise. Iterate until `connection.test.ts` and the existing DB-backed route tests pass.


- [ ] 3.1 Implement `src/lib/security/csp.ts` (`cdnOriginFrom`, `buildContentSecurityPolicy`) and add a `headers()` entry in `next.config.ts` for `source: '/:path*'` with `Content-Security-Policy` (including `frame-ancestors 'none'`, with no `https://www.youtube.com`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. Derive `cdnOrigin` from `CDN_BASE_URL || BUNNY_PULL_ZONE_URL`, and `isDev` from `NODE_ENV !== 'production'`. In the same `next.config.ts` edit, add `outputFileTracingIncludes: { '/**': ['./drizzle/**/*'] }` (D12). Iterate until `csp.test.ts` passes.
- [ ] 3.2 In `src/lib/auth.ts`, rename `SESSION_COOKIE_NAME` to `photowall_session`, build `Path=${BASE_PATH}` in both `sessionCookie` and `clearedSessionCookie`, and append parsed `TRUSTED_ORIGIN_HOSTS` entries in `allowedHosts()`. Iterate until the `auth.test.ts` cases pass.
- [ ] 3.3 Add `TRUSTED_ORIGIN_HOSTS` and `DATABASE_AUTH_TOKEN` (and notes on the new `CDN_BASE_URL` precedence and the `TURSO_*` fallbacks) to `.env.example`, with placeholder values only. Add a README "Deploying under /photos" section covering the D9 portfolio snippet, the D8 `TRUSTED_PROXY_HOPS` calibration procedure, the fact that the CSP is evaluated at build time (a CDN host change requires a redeploy), the env inventory and who sets each var, the Deployment Protection check on `photo-wall-phi.vercel.app`, and the rollback order.


- [ ] 4.1 Run `npm run typecheck && npm run lint && npm test && npm run build`, and record file and test counts. Confirm the build emits the fonts under `.next/static/media/`, and that the `.nft.json` traces for `app/api/wall/route` and `app/page` list `drizzle/meta/_journal.json` and `drizzle/0000_init.sql`.
- [ ] 4.2 On `next start`, run the Playwright subpath check. Load `/photos?demo=4` and assert:
  - zero app-origin requests outside `/photos/` and zero CSP console violations through load, print focus and soundtrack play;
  - all `.woff2` responses come from `/photos/_next/static/media/` with status 200;
  - the CSP, X-Frame-Options, nosniff and Referrer-Policy headers are present on `/photos` and `/photos/api/wall`;
  - `/` returns 404.

  Take a placard/HUD screenshot and compare it against pre-change `/?demo=4`, which should be pixel-identical apart from the URL.
- [ ] 4.3 Run the curator YouTube inspect check from `tests.md` (artist and title filled, duration empty, only the `iframe_api` violation). Then run the curl `Origin` checks from `tests.md` (trusted host gets 401, untrusted gets 403) and the login/logout cookie inspection.
- [ ] 4.4 Populate `verification.md` with the Requirement Adherence Audit Matrix (every scenario in `specs/`), resolved and unresolved assumptions from `research.md` (proxy `x-forwarded-host`, XFF depth, purge on custom hostname, Turso auth token), and verbatim execution logs. Add `PENDING (infra)` rows for the PR-preview, production-after-merge, Deployment Protection and portfolio-preview checks in `tests.md`. The maintainer session fills those in with the Vercel MCP. Do not attempt them, and do not tick them.

**Notes for 4.3:**
- The YouTube inspect step hits the real oEmbed endpoint. If the sandbox has no outbound network, record it as `BLOCKED (network)` and do not tick it as passed.
- The Bunny-images-under-CSP manual check in `tests.md` needs real Bunny credentials, which you don't have. Record it as `PENDING (maintainer)` in `verification.md`.

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify all checkboxes in `tasks.md` are marked `- [x]`. Only tick boxes that genuinely ran and passed. Rows marked `PENDING (infra)`, `PENDING (maintainer)` or `BLOCKED (network)` stay unticked and must be explained in `verification.md`.
2. Check data preservation: this change touches no data models. Confirm `npm test` file and test counts are ≥ the pre-change baseline (record the baseline before task 1.1).
3. Ensure `openspec/changes/portfolio-subpath-deploy/verification.md` is populated (with the `PENDING (infra)` rows from task 4.4 left open for the maintainer session) with:
   - Executive Summary & Environment
   - Requirement Adherence Audit Matrix (mapping every spec scenario to its verifying test)
   - Resolved Assumptions & Empirical Proof
   - Nomenclature & Code Symbol Audit (`BASE_PATH`, `withBase`, `cdnOriginFrom`, `buildContentSecurityPolicy`, `photowall_session`, `TRUSTED_ORIGIN_HOSTS`, `resolveDatabaseConfig`, `DATABASE_AUTH_TOKEN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`)
   - Verbatim Execution Logs
4. Automatically run verification via `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues**:
  1. Sync specs: `openspec specs apply --change "portfolio-subpath-deploy"`.
  2. **Open a Pull Request**:
     - Ensure your work is on a dedicated feature branch (create/switch to `feat/portfolio-subpath-deploy` if currently on `main`/`master`).
     - Stage and commit all implementation code and every artifact within the change directory (`git add openspec/changes/portfolio-subpath-deploy openspec/specs <implementation-files>`), then push the branch (`git push -u origin HEAD`).
     - Open a Pull Request using `gh pr create --fill` (or with a concise title and a body summarizing `proposal.md` and `verification.md`) and report the PR URL.
- **If CRITICAL issues or failed test verification errors are detected on initial pass**:
  1. Announce: "Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."
  2. Delegate a single-pass repair task to `spec-coder-sub` with the verification failure context:
     > "Fix the specific verification failures and test errors reported for change 'portfolio-subpath-deploy'. Refer to the error log, make minimal targeted patches to resolve the failures, run verification commands, and update tasks.md."
  3. Re-run verification via `openspec-verify-change`.
  4. **If verification passes after repair**:
     - Sync specs: `openspec specs apply --change "portfolio-subpath-deploy"`.
     - Stage, commit, push branch, and open PR via `gh pr create --fill`.
  5. **If verification STILL fails after the single repair pass**:
     - **HALT**: Do NOT loop or re-run again. Present the Verification Report and remaining blockers to the user for manual guidance.
