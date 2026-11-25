# Verification: print-sharpness-and-lod-fix

## Executive Summary & Environment
- Branch `feat/print-sharpness-and-lod-fix` cut from `main` at `d436b03`. Node worktree, `npm ci`, Chromium 159 (Playwright 1.65.1 driven from outside the repo, no new project dependency).
- Result: **PASS**. 402/402 tests, typecheck, lint and production build clean. Browser check run against `next start`, `1440×900`, `DPR = 1`.
- One limitation, recorded under Resolved Assumptions: the `?demo=` wall serves inline SVG data URIs, so a network-level `2048` vs `800` request cannot be observed there. The bucket was proven at component level instead.

## Requirement Adherence Audit Matrix
| Requirement / scenario | Verified by | Result |
| :--- | :--- | :--- |
| `PRINT_FOCUS_LOD_WIDTH` is `2048` (largest bucket) | `zoomTier.test.ts` "pins the focused print to the largest backend bucket" | PASS |
| Focused print requests `2048`, sibling keeps projected `800` (`CELL_PX`, scale 3.5, DPR 1) | `zoomTier.test.ts` "requests 2048 for the focused print…" | PASS |
| Unfocused prints never load `2048` at overview scale | `zoomTier.test.ts` "never loads 2048 for unfocused prints…" | PASS |
| `FramedPrint` passes `2048` for `focused`, `lodWidth` otherwise | Throwaway `renderToStaticMarkup` test recording `lodUrl` widths: focused `[2048]`, sibling `[800]` (file deleted, outside Target Context Map) | PASS |
| No permanent `will-change` on `.wall-world`, `.photo-frame`, `.photo-sheen` | `grep will-change src/styles/wall.css` returns nothing; Playwright computed style `auto` for all three in overview, album and print focus | PASS |
| Dynamic `will-change` on `.wall-world` still managed by `markGesture` | `GalleryCanvas.tsx` untouched | PASS |
| CSS boundary rules intact | `cssBoundaryAudit.test.ts` inside the full suite | PASS |

## Resolved Assumptions & Empirical Proof
- Playwright, print focus on `/photos?demo=4&mood=chiaroscuro`: `worldWillChange`, `frameWillChange`, `sheenWillChange` all `"auto"`; 12 frames mounted with one focused.
- Screenshot of Print Focus inspected: frame, mat and HUD render correctly. Demo art is vector, so the screenshot cannot demonstrate raster sharpness.
- **Still to confirm by eye on a real photo wall (production):** open a print in Print Focus on the live site and compare against before. Network check there should show `?width=2048` (or `height=2048` for portrait) on the focused image only.

## Nomenclature & Code Symbol Audit
`PRINT_FOCUS_LOD_WIDTH`, `resolvePrintLodWidth` (`src/components/wall/zoomTier.ts`); consumer `FramedPrint.tsx`. Matches spec wording.

## Verbatim Execution Logs
```
npx vitest run src/components/wall/__tests__/zoomTier.test.ts   (before implementation)
 Tests  3 failed | 13 passed (16)    TypeError: resolvePrintLodWidth is not a function

npm run typecheck && npm run lint && npx vitest run && npm run build   (after)
 Test Files  27 passed (27)
      Tests  402 passed (402)
 exit=0
```

## Follow-up: Safari/Firefox soft focused print (commits after the initial fix)
Removing `will-change` did not fix the soft focused print in Firefox/Safari (confirmed by the maintainer on a Vercel preview). Cause: the focused frame is a 3D layer (`translateZ` + `perspective`) that those engines paint once at unzoomed size and stretch. Fix: `PrintSharpOverlay` draws a second `<img>` of the same 2048 file outside `.wall-world`, mirroring the frame's live transform and sheen. The file is requested the moment focus starts, revealed as soon as it loads (so it is sharp before landing), warmed on hover, and neighbours are prefetched during Print Focus (`printImagePrefetch.ts`, held set capped at 8).
- Chrome headless (`next start`, DPR 2): overlay within 0.78 px of the in-world window at rest, under hover tilt, after NEXT, and mid-flight (0.22 px); overlay exists only in Print Focus.
- Not verified here: Safari/Firefox rendering (sandbox lacks GTK/WebKit libs) and real-network load timing (demo images are inline SVG). Maintainer confirmed the overlay fix on Safari/Firefox preview before the prefetch change.
