## 1. Test Scaffolding (TDD)

- [ ] 1.1 Scaffold failing `src/lib/__tests__/basePath.test.ts` for `BASE_PATH` and `withBase`: prefixing, absolute, protocol-relative, `data:`, `blob:` and relative pass-through, and idempotence on `/photos`, `/photos/…` and `/photos?…`.
- [ ] 1.2 Scaffold failing `src/lib/security/__tests__/csp.test.ts` for `cdnOriginFrom` and `buildContentSecurityPolicy` (prod vs dev directives, null CDN origin, path stripping).
- [ ] 1.3 Extend `src/lib/__tests__/auth.test.ts` with failing cases: `photowall_session` + `Path=/photos` on both set and clear cookies, and `TRUSTED_ORIGIN_HOSTS` accept, reject and unset behaviour (whitespace and case normalisation included).
- [ ] 1.4 Add a failing `getCdnBase` precedence test (new `src/lib/storage/__tests__/cdnBase.test.ts`): `CDN_BASE_URL` wins, empty or unset falls back, neither throws, local returns `/photos/api/local-uploads`. Extend `bunny.test.ts` to assert the purge URL stays on the pull zone. Update `src/lib/dev/__tests__/fakeManifest.test.ts` to expect `cdnBase: '/photos/demo'`.
- [ ] 1.5 Scaffold failing `src/lib/__tests__/rawUrlAudit.test.ts`. After stripping comments, it scans `src/app` (excluding `src/app/api/**`), `src/components`, `src/store` and `src/lib/dev` for unwrapped single-quoted, double-quoted or template `/api/`, `/textures/`, `/demo` and `/fonts/` literals, scans the repo `src/` for `'/photos'`/`"/photos"` outside `basePath.ts`, and scans `globals.css` for absolute `/fonts/` URLs. Run `npx vitest run` and confirm the new tests fail for the expected reasons.
- [ ] 1.6 Scaffold failing `src/db/__tests__/connection.test.ts`. Mock `@libsql/client`'s `createClient`. Cover `resolveDatabaseConfig` precedence (`DATABASE_*` over `TURSO_*` over the file default, empty strings as unset, undefined token when none), `createClient` receiving `{ url, authToken }`, `getDb()` retrying after a rejected init, and three concurrent `getDb()` calls sharing one attempt.

## 2. Base Path & URL Routing

- [ ] 2.1 Create `src/lib/basePath.ts` (dependency-free `BASE_PATH` + `withBase` per architecture D2), and set `basePath: BASE_PATH` in `next.config.ts` via a relative import, until `basePath.test.ts` passes.
- [ ] 2.2 Re-grep for root-relative client URLs. Wrap every hit in `withBase`: `useWallStore.ts`, the `PhotoWallApp.tsx` default `manifestUrl`, `useWallManifest.ts` (wrap at the `fetch` site so passed-in URLs are covered too), the `SoundtrackPlaque.tsx` thumb `src`, the `PlaygroundPbrWall.tsx` `TEXTURES`, `FolderDropzone.tsx` (4 fetches + the XHR) and `AdminDrawer.tsx` (4 fetches). Do the same for any new fetch sites that `admin-route-isolation` has landed by then.
- [ ] 2.3 Set `LOCAL_CDN_BASE = withBase('/api/local-uploads')` and the fake manifest `cdnBase = withBase('/demo')`. Flip `getCdnBase()` to `CDN_BASE_URL || BUNNY_PULL_ZONE_URL`. Leave `BunnyStorageAdapter` purge on `pullZoneUrl`. Iterate until the storage and fakeManifest tests pass.
- [ ] 2.4 Move every file in `public/fonts/` (the four `.woff2` plus the unreferenced `.otf` sources, kept for licence provenance) to `src/app/fonts/`, switch the four `@font-face` `src` values in `globals.css` to `url('./fonts/…')` with no other edits to those rules, and delete `public/fonts/`. Iterate until `rawUrlAudit.test.ts` passes.
- [ ] 2.5 In `src/db/index.ts`:
  - add the exported pure `resolveDatabaseConfig(env)` (architecture D11);
  - change `createDatabase` to accept `{ url, authToken }` and pass both to `createClient`;
  - make `getDb()` clear `cachedDatabase` when the init rejects (D13).

  Update every `createDatabase(` caller and test to the new signature. Mirror the precedence in `drizzle.config.ts`, using the `turso` dialect for `libsql:` URLs and `sqlite` otherwise. Iterate until `connection.test.ts` and the existing DB-backed route tests pass.

## 3. Security Headers & Auth

- [ ] 3.1 Implement `src/lib/security/csp.ts` (`cdnOriginFrom`, `buildContentSecurityPolicy`) and add a `headers()` entry in `next.config.ts` for `source: '/:path*'` with `Content-Security-Policy` (including `frame-ancestors 'none'`, with no `https://www.youtube.com`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. Derive `cdnOrigin` from `CDN_BASE_URL || BUNNY_PULL_ZONE_URL`, and `isDev` from `NODE_ENV !== 'production'`. In the same `next.config.ts` edit, add `outputFileTracingIncludes: { '/**': ['./drizzle/**/*'] }` (D12). Iterate until `csp.test.ts` passes.
- [ ] 3.2 In `src/lib/auth.ts`, rename `SESSION_COOKIE_NAME` to `photowall_session`, build `Path=${BASE_PATH}` in both `sessionCookie` and `clearedSessionCookie`, and append parsed `TRUSTED_ORIGIN_HOSTS` entries in `allowedHosts()`. Iterate until the `auth.test.ts` cases pass.
- [ ] 3.3 Add `TRUSTED_ORIGIN_HOSTS` and `DATABASE_AUTH_TOKEN` (and notes on the new `CDN_BASE_URL` precedence and the `TURSO_*` fallbacks) to `.env.example`, with placeholder values only. Add a README "Deploying under /photos" section covering the D9 portfolio snippet, the D8 `TRUSTED_PROXY_HOPS` calibration procedure, the fact that the CSP is evaluated at build time (a CDN host change requires a redeploy), the env inventory and who sets each var, the Deployment Protection check on `photo-wall-phi.vercel.app`, and the rollback order.

## 4. Verification & Empirical Audit

- [ ] 4.1 Run `npm run typecheck && npm run lint && npm test && npm run build`, and record file and test counts. Confirm the build emits the fonts under `.next/static/media/`, and that the `.nft.json` traces for `app/api/wall/route` and `app/page` list `drizzle/meta/_journal.json` and `drizzle/0000_init.sql`.
- [ ] 4.2 On `next start`, run the Playwright subpath check. Load `/photos?demo=4` and assert:
  - zero app-origin requests outside `/photos/` and zero CSP console violations through load, print focus and soundtrack play;
  - all `.woff2` responses come from `/photos/_next/static/media/` with status 200;
  - the CSP, X-Frame-Options, nosniff and Referrer-Policy headers are present on `/photos` and `/photos/api/wall`;
  - `/` returns 404.

  Take a placard/HUD screenshot and compare it against pre-change `/?demo=4`, which should be pixel-identical apart from the URL.
- [ ] 4.3 Run the curator YouTube inspect check from `tests.md` (artist and title filled, duration empty, only the `iframe_api` violation). Then run the curl `Origin` checks from `tests.md` (trusted host gets 401, untrusted gets 403) and the login/logout cookie inspection.
- [ ] 4.4 Populate `verification.md` with the Requirement Adherence Audit Matrix (every scenario in `specs/`), resolved and unresolved assumptions from `research.md` (proxy `x-forwarded-host`, XFF depth, purge on custom hostname, Turso auth token), and verbatim execution logs. Add `PENDING (infra)` rows for the PR-preview, production-after-merge, Deployment Protection and portfolio-preview checks in `tests.md`. The maintainer session fills those in with the Vercel MCP. Do not attempt them, and do not tick them.
