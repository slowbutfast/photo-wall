## 1. Test Scaffolding (TDD)

- [x] 1.1 Scaffold failing `src/lib/__tests__/publicBoundaryAudit.test.ts` walking the static import graph from `src/app/(gallery)` and asserting zero transitive imports of `@/components/admin/*` and zero `/api/admin` literals.
- [x] 1.2 Extend `src/lib/security/__tests__/csp.test.ts` with failing tests for `allowYoutubeApi: true` vs `false` (studio-only `https://www.youtube.com` in `script-src` and `frame-src`).
- [x] 1.3 Extend `src/lib/layout/__tests__/islandLayout.test.ts` (`computeWallGridPositions` `includeStatuses` option) and `src/app/api/__tests__/routes.test.ts` (`GET /api/admin/wall-preview` returning `401` unauthenticated and `200` + `Cache-Control: private, no-store` + `X-Robots-Tag: noindex` + published & draft albums when authenticated).
- [x] 1.4 Run `npx vitest run` and confirm the new tests fail before implementation.

## 2. Pure `<GalleryCanvas>`, Public Route Isolation & Proxy Gate

- [x] 2.1 Extract pure `<GalleryCanvas albums lodUrl theme mode="public" | "preview" selectedAlbumId? onSelectAlbum? />` from `src/components/wall/PlaygroundGallery.tsx` (with dashed-mat + `"Draft"` badge styling in `preview` mode).
- [x] 2.2 Move public gallery page to `src/app/(gallery)/page.tsx`; strip `AdminDrawer`, lock/`Curate` button, `curatorOpen`, and `refreshAuth()` from `src/components/PhotoWallApp.tsx` and `src/components/hud/GalleryHud.tsx` until `publicBoundaryAudit.test.ts` passes.
- [x] 2.3 Implement `src/proxy.ts` (`matcher: ['/admin/:path*', '/api/admin/:path*']`, fail-closed `ADMIN_ENABLED === 'true'` `404`, `jose` `photowall_session` verification, `/admin` → `/photos/admin/login` redirect, `/api/admin/*` `401`, `X-Robots-Tag: noindex`) while keeping route-handler guards intact.
- [x] 2.4 Update `src/lib/security/csp.ts` and `next.config.ts` `headers()` with negative-lookahead public CSP and studio-only `/admin` + `/admin/:path*` CSP allowing `https://www.youtube.com`. Iterate until `csp.test.ts` passes.

## 3. Draft-Aware Preview API & Persistent Split Curator Studio

- [x] 3.1 Add `includeStatuses` to `computeWallGridPositions` in `src/lib/layout/islandLayout.ts` and implement `src/app/api/admin/wall-preview/route.ts` (`requireAdmin`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`).
- [x] 3.2 Implement `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/login/page.tsx` (using `<Suspense>` + `await connection()` / `await cookies()`, `robots: { index: false, follow: false }`), `src/components/admin/AdminLoginForm.tsx`, and `src/components/admin/CuratorStudio.tsx` (desktop split `<GalleryCanvas mode="preview" />` + `440px` sidebar with **Exhibitions | Upload | Settings** tabs folding in `FolderDropzone`, Lighting Preview, Placard Material, Pending Deletions, and Sign Out; mobile **Preview / Manage** tabs preserving state; all fetches wrapped in `withBase()`). Remove obsolete floating `AdminDrawer.tsx`.
- [x] 3.3 Document `ADMIN_ENABLED=true` in `.env.example` and README.

## 4. Verification & Empirical Audit

- [x] 4.1 Run `npm run typecheck && npm run lint && npm test && npm run build` and confirm 100% pass (including `publicBoundaryAudit.test.ts` and `rawUrlAudit.test.ts`). Note: `safe-test`'s `ulimit -v` cannot host @libsql WASM on Node 22 (fails at any cap up to 32 GB); the same commands pass when run directly.
- [x] 4.2 Run Playwright against `next start` verifying: `/photos` loads 0 admin chunks, makes 0 `/api/admin/*` requests, and emits strict public CSP; `ADMIN_ENABLED=false` returns `404` on `/photos/admin*`; `ADMIN_ENABLED=true` redirects unauthenticated `/photos/admin` to `/photos/admin/login`, loads the split Studio after login with studio CSP, and preserves state across mobile **Preview / Manage** tab switches.
- [x] 4.3 Populate `openspec/changes/admin-route-isolation/verification.md` with the Requirement Adherence Audit Matrix and verbatim execution logs.
