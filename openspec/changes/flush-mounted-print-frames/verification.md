# Verification Report: `flush-mounted-print-frames`

## 1. Executive Summary & Environment
- **Change:** `flush-mounted-print-frames` (`tdd-rnd` schema)
- **Branch:** `feat/flush-mounted-print-frames` (branched from `origin/main` `c626136`)
- **Worktree:** `/home/node/global-sandbox/projects/photo-wall/.claude/worktrees/flush-mounted-print-frames`
- **Node / Runner:** Vitest v5.1.1, TypeScript (`tsc --noEmit`), ESLint, Next.js 16.4.6 (Turbopack), Playwright Chromium (`1440×900` fine pointer & `390×844` coarse pointer)
- **Overall Result:** **PASSED** — all 47 unit/audit test files (708 tests), `tsc --noEmit`, `eslint src`, `npm run build`, and Playwright desktop/mobile visual & computed-style checks across `chiaroscuro`, `concrete`, and `alabaster` passed.

---

## 2. Requirement Adherence Audit Matrix

| Spec Requirement / Scenario | Verifying Artifact / Test | Outcome |
|---|---|---|
| `Physical single-photo inspection...` — `.photo-frame` uses `2.5px` `#161616`/`#121212` right/bottom backing edge, `border-top/left: 0`, `border-radius: 0px`, zero `#d5d1c8`/`#c6c1b7` bevels | `src/lib/__tests__/flushFrameAudit.test.ts` + Playwright `desktop` & `mobile` computed styles | **PASS** |
| `Physical single-photo inspection...` — `.photo-window` uses `box-shadow: none` on both desktop and coarse pointers | `src/lib/__tests__/flushFrameAudit.test.ts` + Playwright `windowBoxShadow: "none"` across all 3 moods | **PASS** |
| `Scenario: Tilting a focused frame shifts 2D specular glare and cast shadow in both X and Y` | `src/lib/__tests__/flushFrameAudit.test.ts` + `src/lib/__tests__/touchAudit.test.ts` + Playwright desktop hover (`matrix3d` + `--tilt-sx`/`--tilt-sy` shadow shift) + mobile `--tilt-sx: 12px` (`-0.06px` -> `11.94px`) | **PASS** |
| `Scenario: Flush-mounted print renders flat front plane with matte-black rigid backing edge and floating shadow` | Playwright computed styles + screenshot inspection (`desktop-chiaroscuro-hover.png`, `desktop-chiaroscuro-focus.png`, `mobile-*-focus.png`) | **PASS** |
| `PrintSharpOverlay` alignment & geometry invariance (`--frame-padding: 11px`) | Playwright desktop Print Focus `overlayDelta: 0.78px` (< 1px subpixel) + `hasSheen: true` | **PASS** |

---

## 3. Empirical Proof (Playwright Computed Styles & Visual Inspection)

- **Desktop (`1440×900`, `hasTouch: false`) across `chiaroscuro`, `concrete`, `alabaster`:**
  - Rest: `borderTopWidth: "0px"`, `borderLeftWidth: "0px"`, `borderRightWidth: "2px"` (`rgb(22, 22, 22)`), `borderBottomWidth: "2px"` (`rgb(18, 18, 18)`), `borderRadius: "0px"`, `windowBoxShadow: "none"`, `transform: matrix3d(..., 22, 1)`.
  - Hover: lifts to `translateZ(36px)` with 3D `rotateX`/`rotateY` tilt (`matrix3d(0.999048, 0, -0.0436194, ...)`), shifts floating cleat shadow (`-3.66px 3.38px`, `-8.232px 7.418px`).
  - Focus: `.photo-sheen` present (`hasSheen: true`), `PrintSharpOverlay` aligned (`overlayDelta: 0.78px`).
- **Mobile (`390×844`, `hasTouch: true, isMobile: true`) across `chiaroscuro`, `concrete`, `alabaster`:**
  - Rest: `borderTopWidth: "0px"`, `borderLeftWidth: "0px"`, `borderRightColor: "rgb(22, 22, 22)"`, `borderBottomColor: "rgb(18, 18, 18)"`, `borderRadius: "0px"`, `windowBoxShadow: "none"`, `transform: matrix(1.0195, 0, 0, 1.0195, 0, 0)`.
  - Print Focus + `--tilt-sx: 12px`: computed `boxShadow` X-offset shifted from `-0.06px` to `11.94px` (`tiltChangedShadow: true`).
- **Visual Inspection Notes:** Screenshots confirm a flat archival `#f6f4ef` front plane with zero recessed window shadow, zero mitered gray corner seams, crisp `2.5px` matte-black right/bottom backing edge, and clean floating cleat wall shadows in all three moods.
- **Manual Hardware Check (Optional):** Physical iPhone hardware display calibration / gyroscope feel remains for maintainer verification if desired.

---

## 4. Verbatim Execution Logs (Summary)

```text
> npx vitest run src/lib/__tests__/flushFrameAudit.test.ts src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts
Test Files  3 passed (3)
     Tests  30 passed (30)

> npx vitest run
Test Files  47 passed (47)
     Tests  708 passed (708)

> npx tsc --noEmit && npx eslint src && npm run build
(all exited 0; 13/13 static/dynamic routes compiled cleanly)
```
