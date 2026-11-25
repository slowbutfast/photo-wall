# Verification — Mobile Render Profile (`mobile-render-profile`)

## 1. Executive Summary & Environment

| Field | Value |
| :--- | :--- |
| Change | `mobile-render-profile` |
| Status | **IMPLEMENTED — automated gates PASS; Playwright parity + real-device profiling PENDING** |
| Date | 2026-11-25 |
| Branch | `feat/multi-20261125-2103` (batch branch; orchestrator commits) |
| Prerequisite | PR #13 merged as `1d923a2`; `render-loop-efficiency` committed at `cde7de9` |
| OS | Linux (container) |
| Runtime | Node.js `v22.23.2` |
| Runner | Vitest `5.1.1`, TypeScript + ESLint + `next build` |
| Browser | Playwright harness not executed in this coding pass (orchestrator-owned, Task 4.2) |
| Device | Real iPhone 16 Pro / Android Chrome **not available** in this environment (Tasks 1.0b / 4.4) |

Scope executed: `spec-coder` implementation pass only. No git writes, no dependency changes, no env/DB/preview/production changes. Every visual rule is gated on `@media (pointer: coarse)`; the `(pointer: fine)` path keeps the pre-existing code path (`maxDpr = Infinity`, `resolveWallCanvasDpr(dpr, false) === min(2, max(1, dpr))`).

## 2. Requirement Adherence Audit Matrix

### 2.1 Delta spec: `instanced-photo-renderer`

| Requirement / Scenario | Verifying artefact | Status |
| :--- | :--- | :--- |
| Print-only gyroscope scope: listeners only when `tier === 'print' && focusedPhotoId !== null`; zero in `macro`/`album` | `src/components/wall/__tests__/useGyroTilt.test.ts` — `capability gating` (zero in album, one in print focus, detach when focus clears), `tier and focus lifecycle`, `destroy` | **PASS** |
| Album View sheen off; Print Focus sheen `mix-blend-mode: normal` (never `screen`) | `src/lib/__tests__/touchAudit.test.ts` — `hides…`/`keeps the focused/overlay sheen normal-blended…` (parses all `@media (pointer: coarse)` blocks) | **PASS** |
| No SVG `feTurbulence` grain or mat noise: `.photo-paper-grain { display: none }`, `.photo-frame { background-image: none }` | `touchAudit.test.ts` — `hides .photo-paper-grain and clears the .photo-frame SVG…` | **PASS** |
| Flatten non-focused `.photo-cell:not(.is-focused-cell)` / `.photo-frame:not(.focused)` with `perspective: none; transform-style: flat;` + `transform: scale(1.0195)`; focused 3D retained | `touchAudit.test.ts` — `flattens non-focused cells/frames…` and `emits is-focused-cell…`; `FramedPrint.tsx` emits the class | **PASS** |
| Single-layer directional shadows; `.photo-frame.is-lit.focused` preserves `--tilt-sx`/`--tilt-sy` and beats `.photo-frame.is-lit` | `touchAudit.test.ts` — `collapses shadows…`; selector specificity is `0,4,0` vs `0,3,0` and declared later in the coarse block | **PASS** (CSS audit; computed-style Playwright = Task 4.2) |
| Hydration-safe thumbnail LOD cap: `useSyncExternalStore` server snapshot `false`, `maxDpr = 2`, focused stays `2048` | `zoomTier.test.ts` — `coarse-pointer thumbnail DPR cap`; `GalleryCanvas.tsx` uses `useSyncExternalStore(subscribe, getSnapshot, () => false)` and a ref inside `requestFrame` | **PASS** (unit) / **PASS (audit)** for the SSR snapshot wiring |
| Scenario: `macro → album → print → album` attaches listeners only in print focus | `useGyroTilt.test.ts` lifecycle tests | **PASS** |
| Scenario: DPR 3 non-focused caps at effective DPR 2 while focused stays 2048 | `zoomTier.test.ts`: `158 × 2 × 3 = 948 → 2048`; capped `158 × 2 × 2 = 632 → 800`; focused `→ 2048` | **PASS** |
| Scenario: desktop `(pointer: fine)` 0 computed-style / pixelmatch diffs | Not executable here | **DEFERRED** → orchestrator Task 4.2; code path preserves pre-change values |

### 2.2 Delta spec: `3d-pbr-wall-and-lighting`

| Requirement / Scenario | Verifying artefact | Status |
| :--- | :--- | :--- |
| Material-scoped static frosted placards: `backdrop-filter: none` + frosted gradients on `.museum-placard.mat-acrylic` only; `.mat-aluminum` / `.mat-foamcore` untouched | `touchAudit.test.ts` — `targets only .mat-acrylic…` (asserts no coarse `.mat-aluminum` / `.mat-foamcore` selector and every coarse `backdrop-filter` declaration is acrylic-scoped) | **PASS** (CSS audit) |
| Coarse WebGL wall DPR cap `MOBILE_WALL_MAX_DPR = 1.0`; fine desktop stays `2.0` | `src/components/wall/__tests__/wallCanvasDpr.test.ts` — `(3, true) === 1`, `(2, false) === 2`, degenerate inputs | **PASS** |
| Scenario: coarse placards disable backdrop-filter without altering brushed aluminum | `touchAudit.test.ts` structural assertions | **PASS (audit)**; computed-style Playwright = Task 4.2 |
| Scenario: coarse canvas DPR 1.0 vs fine 2.0 | `wallCanvasDpr.test.ts` | **PASS** |

### 2.3 Change-1 integration (coupled)

| Concern | Evidence | Status |
| :--- | :--- | :--- |
| `buildSnapshotKey` / settle gating still works | `snapshotKey.test.ts` + full suite green; `GalleryCanvas` only changed the LOD argument and added a post-mount coarse republish | **PASS** |
| Capped LOD bucket or coarse flip post-mount publishes a snapshot | `maxThumbDprRef` is read inside the rAF key; `useEffect` calls `requestFrame()` only when `coarsePointer` actually flips; rendered `lodWidth` also recomputes | **PASS (audit)** |

## 3. Resolved Assumptions & Empirical Proof

| Assumption (from `research.md`) | Resolution | Evidence |
| :--- | :--- | :--- |
| Live placard materials are `acrylic`, `aluminum`, `foamcore`, rendered as `.mat-*` | **Confirmed** | `placardMaterial.ts` `PlacardMaterial`; `AlbumPlacard.tsx` emits ``className={`museum-placard mat-${material} is-lit…`}``; no `data-material` is emitted anywhere in `src` |
| The only live placard `backdrop-filter` is acrylic's `blur(2.5px)` | **Confirmed** | `wall.css` `.playground-wall-root .museum-placard.mat-acrylic { backdrop-filter: blur(2.5px) }` |
| `[data-material='beveled-glass']` is dead CSS | **Confirmed** | Nothing sets `data-material`; the UI label "Beveled Glass" maps to `acrylic`. The dead block was **not modified or deleted** (separate cleanup, outside this change's 0-diff scope) |
| `.photo-frame` has an SVG `feTurbulence` mat background | **Confirmed** | `wall.css` `background-image: url("data:image/svg+xml,…feTurbulence…")` on `.photo-frame` |
| `.photo-frame.is-lit` outranks `.photo-frame.focused` by source order (equal specificity) | **Confirmed and fixed** | Focused coarse shadow targets `.photo-frame.is-lit.focused` (`0,4,0`) |
| `GalleryCanvas` measures DPR as `min(3, max(1, devicePixelRatio))` | **Confirmed** | Viewport measure effect unchanged; cap is applied separately at `zoomTier` |
| `PlaygroundPbrWall` previously capped DPR at `2` | **Confirmed** | Replaced by `resolveWallCanvasDpr` with identical fine-pointer behaviour |
| `scale(1.0195)` reduces composited layers | **Unverified by design** | Explicitly treated as an empirical Layers-tab acceptance measurement (Task 1.0b / 4.4), not assumed |
| Optimal mobile wall DPR (`1.0` vs `1.25` / `1.5`) | **Unverified** | Real-device visual + Energy Impact check pending (Task 4.4) |

## 4. Pending Hardware / Browser Checks

| Task | Check | Owner |
| :--- | :--- | :--- |
| 1.0b | Post-`render-loop-efficiency` iPhone 16 Pro baseline: Layers-tab counts, `S2` recalcs/composite ms, `S3` paint spikes, `S2`/`S4` Energy Impact | **PENDING MANUAL DEVICE VERIFICATION** |
| 4.2 | Playwright `1440×900` fine-pointer 0 pixelmatch / computed-style diffs vs `main`; coarse emulation: `--tilt-sx` shifts `.photo-frame.is-lit.focused` `box-shadow`, `.mat-aluminum` keeps metallic background | **PENDING ORCHESTRATOR PLAYWRIGHT HARNESS** |
| 4.4 | Real iPhone 16 Pro / Android Chrome after-run: Layers-tab `≥ 30%` reduction, `S3` spikes `< 8 ms`, composite `≥ 25%` lower, missed vsyncs `< 5%`, Energy Impact, wall DPR 1.0 visual/thermal, all 3 moods | **PENDING MANUAL DEVICE VERIFICATION** |

## 5. Nomenclature & Code Symbol Audit

| Glossary / spec term | Code symbol | Match |
| :--- | :--- | :--- |
| Print-only gyroscope scope | `createGyroController.setContext` guard `tier !== 'print' \|\| focusedPhotoId === null`; `FramedPrint` guard `tier !== 'print' \|\| !focused` | ✅ |
| Mobile render profile | `@media (pointer: coarse)` block in `src/styles/wall.css` | ✅ |
| Static frosted placard | `.playground-wall-root .museum-placard.mat-acrylic` + mood-scoped variants | ✅ |
| `maxThumbDpr` policy | `COARSE_MAX_THUMB_DPR = 2`; `maxDpr` parameter on `resolveProjectedLodWidth` / `resolvePrintLodWidth` | ✅ |
| Coarse WebGL DPR cap | `MOBILE_WALL_MAX_DPR = 1.0`, `resolveWallCanvasDpr(viewportDpr, coarsePointer)` | ✅ |
| Focused cell seam | `is-focused-cell` class emitted by `FramedPrint`; consumed by `.photo-cell.is-focused-cell` / `.photo-cell:not(.is-focused-cell)` | ✅ |
| `PRINT_FOCUS_LOD_WIDTH` | Unchanged at `2048`; focused prints bypass `maxDpr` | ✅ |

No new dependencies, no user-agent sniffing, no screen-width gating.

## 6. Empirical Execution Logs

### 6.1 TDD red (before implementation)

```
Test Files  4 failed (4)
     Tests  12 failed | 53 passed (65)
```

Failures were exactly the new expectations: album tier still attached a listener, `maxDpr` was ignored, `resolveWallCanvasDpr` was missing, and the coarse CSS profile rules were absent.

### 6.2 Targeted verification (after implementation)

Command:

```bash
npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts \
  src/components/wall/__tests__/zoomTier.test.ts \
  src/components/wall/__tests__/wallCanvasDpr.test.ts \
  src/lib/__tests__/touchAudit.test.ts \
  src/lib/__tests__/cssBoundaryAudit.test.ts
```

Verbatim summary:

```
 Test Files  5 passed (5)
      Tests  75 passed (75)
   Duration  946ms (import 40%, tests 36%, transform 15%, worker 9%)
```

### 6.3 Full suite

Command:

```bash
npx vitest run
```

Verbatim summary:

```
 Test Files  39 passed (39)
      Tests  569 passed (569)
   Duration  12.38s (tests 54%, import 22%, environment 18%, transform 3%, worker 3%)
```

Environment note: `safe-test npx vitest run` aborted with
`RangeError: WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance`
because `safe-test` applies a 4096 MB cap while Vitest spawns 39 per-file isolates. Running the same suite directly (10.9 GB free) completes cleanly in 12.44 s. The targeted 5-file run is also green under `safe-test`'s budget.

### 6.4 TypeScript

```bash
npx tsc --noEmit
# TSC_EXIT=0
```

### 6.5 ESLint

```bash
npx eslint src
# ESLINT_EXIT=0
```

### 6.6 Production build

```bash
npm run build
# BUILD_EXIT=0
```

Build output highlights:

```
✓ Compiled successfully in 2.4s
  Running TypeScript ...
  Finished TypeScript in 5.2s ...
✓ Generating static pages using 2 workers (13/13) in 413ms
```

No size/record-count metric is part of this change. The only "reduction" targets are composited layers / peak memory measured on real hardware (Task 4.4); this pass added no data-mutating path, so no records can disappear.

## 7. Selector Inventory for the Orchestrator's Coarse Assertions

All are inside the single extended `@media (pointer: coarse)` block in `src/styles/wall.css`:

1. `.playground-wall-root .photo-frame` — `transition: padding, background-color`; `background-image: none`
2. `.playground-wall-root .photo-sheen` — `transition: opacity`
3. `.playground-wall-root .photo-paper-grain` — `display: none`
4. `.playground-wall-root .photo-frame:not(.focused) .photo-sheen` — `display: none`
5. `.playground-wall-root .photo-frame.focused .photo-sheen`
6. `.playground-wall-root .print-sharp-overlay .photo-sheen`
   - 5 + 6 — `mix-blend-mode: normal`
7. `.playground-wall-root .photo-cell:not(.is-focused-cell)` — `perspective: none; transform-style: flat`
8. `.playground-wall-root .photo-frame:not(.focused)` — `perspective: none; transform-style: flat; transform: scale(1.0195)`
9. `.playground-wall-root .photo-cell.is-focused-cell` — `perspective: var(--perspective-px); transform-style: preserve-3d`
10. `.playground-wall-root .photo-frame.focused` — `transform-style: preserve-3d`
11. `.playground-wall-root .photo-frame.is-lit` — inset highlight + 1 `--sx`/`--sy` directional cast shadow
12. `.playground-wall-root .photo-frame.is-lit.focused`
13. `.playground-wall-root .photo-frame.is-lit.is-focused`
    - 12 + 13 — inset highlight + 1 soft directional cast shadow using `--tilt-sx`/`--tilt-sy` (specificity `0,4,0` beats `.is-lit` `0,3,0`)
14. `.playground-wall-root .photo-window` — 2-layer inset/outer hairline (down from 5)
15. `.playground-wall-root .museum-placard.mat-acrylic` — `backdrop-filter: none` + dark frosted gradient
16. `[data-mood='concrete'] .playground-wall-root .museum-placard.mat-acrylic`
17. `.playground-wall-root[data-mood='concrete'] .museum-placard.mat-acrylic`
18. `[data-mood='alabaster'] .playground-wall-root .museum-placard.mat-acrylic`
19. `.playground-wall-root[data-mood='alabaster'] .museum-placard.mat-acrylic`

For the coarse computed-style assertion: set `--tilt-sx: 12px` on a `.photo-frame.is-lit.focused` element and confirm the computed `box-shadow` offsets change (rule 12/13 wins); then confirm a `.museum-placard.mat-aluminum` element's computed `background-image` / `background` is byte-identical to fine pointer.

### Why the dead `[data-material='beveled-glass']` block was left untouched

`placardMaterial.ts` defines only `acrylic | aluminum | foamcore`, and `AlbumPlacard.tsx` emits `mat-${material}`. Nothing in `src` sets `data-material`, so `.museum-placard[data-material='beveled-glass']` (including its `blur(12px) saturate(120%)`) never matches. The UI label "Beveled Glass" maps to the **acrylic** material, whose only live blur is `blur(2.5px)`. The dead block was neither modified nor removed: editing it cannot affect runtime, and deleting it is a separate cleanup outside this change's desktop 0-diff scope. All frosted overrides therefore target `.museum-placard.mat-acrylic` only, and `.mat-aluminum` / `.mat-foamcore` are never mentioned inside any coarse block.

## 8. Orchestrator Playwright Evidence — Desktop 0-Diff + Coarse Assertions (Task 4.2) — **PASS**

Run by the orchestrator against production `next start` builds:

- **Desktop baseline:** pre-change branch tip `96108d4` (port `3111`), Chromium headless `1440×900`, DPR 1, fine pointer, `?demo=4&mood=chiaroscuro`; CSS transitions/animations frozen before each capture.
- **Desktop head:** this change (port `3112`), same harness and states.
- **Coarse baseline:** the `render-loop-efficiency` commit `cde7de9` build (port `3113`), Chromium `390×844`, DPR 3, `hasTouch`, `isMobile` (isolates this change from Change 1).
- **Coarse head:** this change (port `3112`), same coarse harness.

### Desktop fine-pointer parity (`pixelmatch` threshold `0.1`, no AA)

| State | Pixels differing | Computed styles + rects (47 props × 12 selectors) |
| :--- | :--- | :--- |
| `row0` (idle Row 0) | **0** | identical |
| `album` (album focus) | **0** | identical |
| `album-placard-hover` | **0** | identical |
| `album-frame-hover` | **0** | identical |
| `album-frame-leave` (mouse-leave end state) | **0** | identical |
| `print` (focused, pointer parked away) | **0** | identical |
| `print-hover` (focused frame hover) | **0** | identical |
| `print-leave` (focused frame mouse-leave end state) | **0** | identical |
| `macro` (`?demo=1000` zoomed out, 9 mosaic canvases) | **0** | canvases `512×309` on both |

- Overlay-to-frame alignment through hover + mouse-leave: max absolute delta `0.014 px` on **both**
  baseline and head; `is-live` stayed true. No ghosting.
- One pre-existing `502` demo-asset console response in every baseline and head run; no
  change-specific console errors.

### Coarse-pointer assertion matrix (`390×844`, DPR 3, coarse) — **28/28 PASS**

| Check | Change 1 baseline | Head (this change) |
| :--- | :--- | :--- |
| `(pointer: coarse)` / `(pointer: fine)` | true / false | true / false |
| Album non-focused `.photo-sheen` display | `block` | **`none`** |
| `.photo-paper-grain` display | `block` | **`none`** |
| `.photo-frame` `background-image` | SVG `feTurbulence` | **`none`** |
| Non-focused `.photo-cell` perspective / transform-style | `1150px` / `preserve-3d` | **`none` / `flat`** |
| Non-focused `.photo-frame` transform scale | `translateZ(22px)` | **`scale(1.0195)`** |
| `.photo-frame.is-lit` outer shadow layers | 3 | **1** |
| `.photo-window` inset shadow layers | 4 | **1** |
| Acrylic `.mat-acrylic` `backdrop-filter` | `blur(2.5px)` | **`none`** + frosted gradient |
| `.mat-aluminum` compared computed props | — | **all equal** (background, borders, shadow, transform, backdrop) |
| Album `deviceorientation` listeners | 1 | **0** |
| Print Focus `deviceorientation` listeners | 1 | **1** |
| Wall canvas backing DPR | 2.0 | **1.0** |
| Focused `.photo-cell.is-focused-cell` | absent | **present**, `perspective: 1150px`, `preserve-3d` |
| Focused print sheen | `screen`, display block | **`normal`**, visible |
| `--tilt-sx: -7px` / `--tilt-sy: -9px` | shadow shifts via base vars | **shadow shifts** (coarse focused rule wins; `0.21px -0.396px` → `-6.79px -9.396px`) |
| Frame overlaps in album view | 0 | **0** |

Harnesses: `.parity/capture.mjs` + `.parity/macro.mjs` (desktop/macro parity) and
`.parity/coarse.mjs` (coarse capture + 28 assertions); artifacts are not committed.

### Open item

Layer-count / Energy Impact / paint-spike acceptance for `scale(1.0195)` remains a real-device
measurement (Tasks `1.0b` and `4.4`), not a headless gate.

### Spec sync

Delta specs synced into `openspec/specs/instanced-photo-renderer/spec.md` (one requirement) and
`openspec/specs/3d-pbr-wall-and-lighting/spec.md` (one requirement). `openspec validate
mobile-render-profile --strict` and `openspec validate --specs --strict` pass.

## 8b. Verification Report (openspec-verify-change)

### Summary

| Dimension | Status |
| :--- | :--- |
| Completeness | **13/15** tasks checked; `1.0b` and `4.4` intentionally `PENDING MANUAL DEVICE VERIFICATION`; 2/2 requirements implemented |
| Correctness | **2/2** requirements mapped to code/tests; all 4 scenarios covered by tests or the coarse Playwright matrix |
| Coherence | **Followed** — architecture D1–D4 implemented as written; all visual changes gated to `(pointer: coarse)`; no new dependencies |

### Requirement → evidence

| Requirement | Evidence |
| :--- | :--- |
| Coarse-pointer mobile render profile (gyro scope, sheen/grain removal, flattening, single shadows, LOD cap) | `useGyroTilt.test.ts` (print-only lifecycle), `zoomTier.test.ts` (`maxDpr = 2`, focused `2048`), `touchAudit.test.ts` (all coarse blocks), coarse Playwright `28/28` |
| Coarse-pointer static frosted placards + WebGL DPR cap | `wallCanvasDpr.test.ts`, `touchAudit.test.ts` (`.mat-acrylic` only, `.mat-aluminum` untouched), coarse Playwright: acrylic `blur(2.5px) → none` + gradient, aluminium all compared props equal, wall DPR `2.0 → 1.0` |
| Desktop fine-pointer unaffected | Desktop Playwright: 8 states + macro at **0** pixels / identical computed styles; `is-focused-cell` addition has no fine-pointer CSS |

### Issues

- **CRITICAL:** none.
- **WARNING:** none.
- **SUGGESTION:** the dead `.museum-placard[data-material='beveled-glass']` block could be deleted in a separate cleanup change; it is correctly left untouched here because it is outside the 0-diff scope. Real-device Layers-tab / Energy Impact / paint-spike acceptance remains the only unmeasured item.

### Assessment

All automated gates, strict OpenSpec validation, desktop/macro 0-diff parity, and coarse-pointer assertions passed. **Ready to commit on `feat/multi-20261125-2103`.**

## 9. Quick Re-Verification (60-Second Audit)

```bash
npx vitest run \
  src/components/wall/__tests__/useGyroTilt.test.ts \
  src/components/wall/__tests__/zoomTier.test.ts \
  src/components/wall/__tests__/wallCanvasDpr.test.ts \
  src/lib/__tests__/touchAudit.test.ts \
  src/lib/__tests__/cssBoundaryAudit.test.ts
```

Expected:

```
 Test Files  5 passed (5)
      Tests  75 passed (75)
```

Then:

```bash
npx tsc --noEmit && npx eslint src
```

Expected: both exit `0`.

## 10. Deviations & Notes

- **`safe-test` full-suite OOM** (Section 6.3): environmental memory cap, not a test failure. Direct `npx vitest run` is green.
- **No `is-focused` emission**: `FramedPrint` only emits `focused`. The coarse focused shadow still includes `.is-focused` for parity with the pre-existing base selector, but it is inert with current markup.
- **Desktop DOM class change**: focused prints now also carry `is-focused-cell` on the wrapper. No non-coarse CSS matches it, so computed styles and pixels are unchanged.
- **Mood gradients**: acrylic keeps light ink in every mood, so alabaster uses a higher-opacity dark frost (`0.70–0.78`) to preserve contrast on the light wall; concrete uses `0.58–0.68`; chiaroscuro/default uses `0.52–0.62`.
