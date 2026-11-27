# Verification — macro-lod-continuity

## 1. Executive Summary & Environment

**Status:** Implementation and every automated gate pass. The change is verified on desktop Chromium and coarse-pointer emulation; the real-iPhone checks remain **PENDING MANUAL DEVICE VERIFICATION** (§6). `openspec validate macro-lod-continuity --strict` and `openspec validate --specs --strict` pass.

**What shipped (two independently revertible slices):**

- **Slice 1 — tier hysteresis** (`07a2995`): `MACRO_PROMOTE_SCALE = 0.25`, `MACRO_DEMOTE_SCALE = 0.22`, `resolveZoomTier(scale, printFocused, previous?)`, and a single-writer `committedTierRef` in `GalleryCanvas` (written only by the camera rAF loop through `commitZoomTier`, read by the render path).
- **Slice 2 — macro mosaic footprint parity** (`69dd03e`): `MosaicPlan.soundtrack` + `placardLines`, the pure `resolveMacroMosaicPalette`, `PlaygroundTheme.macroPlate` per mood/pointer, the new `paintPlaceholder` (plate, edges, greeked bars, soundtrack slot), and the `palette` prop/signature.
- **Parity harness** (`be13623` plus the verification pass): `openspec/changes/macro-lod-continuity/parity/macro-parity.mjs`, `report.json` and five crops.

| Item | Value |
| :--- | :--- |
| Date | 2026-11-27 |
| OS | Linux (`overlay`, x86_64 container) |
| Node / npm | `v22.23.2` / `10.9.8` |
| Vitest | `5.1.1` (`fileParallelism: false`, `maxWorkers: 1`, `environment: node`) |
| Next.js / React / TypeScript | `16.4.6` / `19.3.1` / `5.9.3` |
| Branch | `feat/macro-lod-continuity` |
| Base | `b616dbc` (`origin/main`) |
| Planning commits | `2f0de28` (artifacts), `93c05c2` (handoff) |
| Implementation commits | `07a2995` (slice 1), `69dd03e` (slice 2), `be13623` (harness click fix) |
| Browser | Chromium `159.0.8154.6` via cached `playwright-core`; no WebKit |
| Test env (from `vitest.config.ts`) | `DATABASE_URL=file::memory:`, `ADMIN_PASSWORD=test-password-1234`, `AUTH_SECRET=test-secret-…`, `STORAGE_DRIVER=local`, `LOCAL_UPLOAD_DIR=./data/test-uploads` |
| Parity env | Two local production builds (`next start`) on ports 3131 (base `b616dbc`) and 3132 (head), `STORAGE_DRIVER=local`, `DATABASE_URL=file:./data/photo-wall.db`; demo fixtures only, no preview/production writes |

No data, schema, API, storage, auth, dependency, CSS or `.env` change is involved.

## 2. Requirement Adherence Audit Matrix

Source: `openspec/changes/macro-lod-continuity/specs/instanced-photo-renderer/spec.md`, synced into `openspec/specs/instanced-photo-renderer/spec.md`. Legend: **PASS** = exercised and passed; **PASS (audit)** = untouched path whose existing test still passes; **PENDING MANUAL DEVICE VERIFICATION** = needs real hardware.

### 2.1 MODIFIED — "Viewport-culled verbatim playground DOM islands with macro mosaic tier and projected-size LOD"

| # | Scenario | Verifying test(s) / evidence | Status |
| :--- | :--- | :--- | :--- |
| M1 | Four-album exhibition arranges in balanced 2×2 rows … | `islandLayout.test.ts` (guard group, 100/100) unchanged; parity base/head Album Focus at the same scale (`0.933549`). | PASS (audit) |
| M2 | Off-screen islands render zero DOM nodes | `visibleIslands` untouched; full suite 704/704; parity counts only mounted `.album-island` nodes. | PASS (audit) |
| M3 | Projected-size LOD snaps an 800px cell at DPR 2 to 2048 | `zoomTier.test.ts` LOD cases unchanged, 29/29 in that file. | PASS (audit) |
| M4 | Focused print requests 2048 and settles with `will-change: auto` | `zoomTier.test.ts` print-focus cases; parity Print Focus 0 px / 0 style diffs at `4.87554`. | PASS (audit) |
| M5 | Macro zoom uses pre-baked mosaics with no blur or iframes | `MacroIsland.test.tsx` (zero `fillText`, no extra `Image.src`, no extra DOM); parity at `0.21` renders 12 mosaic islands; `?demo=4` coarse at `0.219219` renders 4. | PASS |
| M6 | Real desktop clicks open albums and prints reliably | The parity harness enters Album Focus and Print Focus by real `page.mouse.click`; both reaches the expected tier on both builds. | PASS |
| M7 | Pinch jitter inside the hysteresis band does not toggle the tier | `zoomTier.test.ts` jitter fold (exactly 1 change; can-fail guard ≥ 4 without `previous`); `galleryTierCommit.test.ts`; browser probe: head **1** wave vs base **4**. | PASS |
| M8 | Zooming out demotes below 0.22, not at 0.25 | `zoomTier.test.ts` `previous = 'album'` table (`0.24`/`0.221` detail, `0.2199` macro); browser probe reaches `0.235`, `0.225`, `0.23` without a head wave. | PASS |
| M9 | Zooming in from macro promotes at 0.25, not at 0.22 | `zoomTier.test.ts` `previous = 'macro'` table (`0.23`/`0.249` macro, `0.25` album); browser probe's only head wave is at `0.251`. | PASS |
| M10 | Render path and camera loop agree on the tier | `galleryTierCommit.test.ts` helper write/read tests and source audit (three-argument calls; the only read-write path is the rAF loop); non-camera parity renders retain the committed tier. | PASS |

### 2.2 ADDED — "Macro mosaic reserves the album tier's placard and soundtrack footprint"

| # | Scenario | Verifying test(s) / evidence | Status |
| :--- | :--- | :--- | :--- |
| A1 | Album with a soundtrack reserves both slots at macro | `macroMosaic.test.ts` (slot equals `grid.soundtrack` within 1 buffer px; 3 bars with a description); `MacroIsland.test.tsx` (plate stops, three bars, `#161616` slot); parity Overview slots = 1 (`demo-album-03`) on `?demo=1000` and 3 on coarse `?demo=4`, each inside its allowed rect with 0 out-of-rect pixels. | PASS |
| A2 | Album without a soundtrack or description paints only the plate and title bar | `macroMosaic.test.ts` (`soundtrack === null`, one bar for `null`/`''`/whitespace); `MacroIsland.test.tsx` (nothing below the placard). | PASS |
| A3 | Alabaster and chiaroscuro plates differ, and both match `wall.css` | `macroPaletteAudit.test.ts` parses the base `.mat-acrylic` and `[data-mood='alabaster']` rules; keys differ; parity Overview crops show the denser alabaster plate. | PASS |
| A4 | Coarse pointers use the coarse plate | `macroPaletteAudit.test.ts` coarse rules for chiaroscuro and concrete; alabaster keeps its stops; coarse crops captured for alabaster and chiaroscuro. | PASS (automated emulation); device feel PENDING MANUAL DEVICE VERIFICATION |
| A5 | Switching mood repaints mosaics without blanking a visible island | `MacroIsland.test.tsx` palette-signature replacement reuses the deferred-disposal assertions (connected old canvas kept until detached; detached zeroed immediately). | PASS |

### 2.3 Requirement clauses without their own scenario

| Clause | Verifying test / evidence | Status |
| :--- | :--- | :--- |
| No `fillText`, `measureText` or font API | `MacroIsland.test.tsx` fake `fillText` records zero calls. | PASS |
| No soundtrack thumbnail or iframe request | `MacroIsland.test.tsx` asserts no extra `Image.src`; parity diagnostics show only the pre-existing YouTube facade `502` on the detail tier, never at macro. | PASS |
| No new DOM inside `MacroIsland` | `MacroIsland.tsx` renders one button + one span host; no markup change in the diff. | PASS |
| No pale `rgba(226, 242, 234, 0.18)` fill / `rgba(240, 245, 242, 0.22)` stroke | `MacroIsland.test.tsx` asserts neither `fillStyle` appears. | PASS |
| Palette key is in `mosaicSignature` | `MacroIsland.tsx` signature includes `palette.key` and description presence; `MacroIsland.test.tsx` replacement tests. | PASS |
| Plate colours come from `macroPlate` (acrylic) or fixed aluminum/foamcore fills | `macroPaletteAudit.test.ts` 13/13; `playgroundTheme.ts` values match `wall.css`. | PASS |
| Incremental paint contract (`N` `drawImage`, one `clearRect`) | `MacroIsland.test.tsx` O(N) regression assertions. | PASS |
| Album and Print rest pixel-identical | Parity: 6/6 mood × state captures at **0 differing pixels** and **0 computed-style diffs**. | PASS |

## 3. Test & Gate Results

| Gate | Command | Result |
| :--- | :--- | :--- |
| TDD red | six new/extended files | **47 failed / 44 passed**; every new test failed for its intended reason (`resolveZoomTier` 2-arg, missing `commitZoomTier`, missing `plan.soundtrack`/`placardLines`, missing `resolveMacroMosaicPalette`). `logs/1.7-tdd-red.log` |
| Slice 1 green | `zoomTier` + `galleryTierCommit` + `snapshotKey` + `wallCanvasDpr` | **46/46** (`29 + 9 + 4 + 4`). `logs/2.3-slice1-green.log` |
| Slice 2 green | `macroMosaic` + `MacroIsland` + `macroPaletteAudit` + slice-1 files | **91/91** across 6 files. `logs/3.5-slice2-green.log` |
| Guard group | `wallCanvasDpr` `touchAudit` `cssBoundaryAudit` `sheenGlareAudit` `cameraMath` `islandLayout` | **100/100, 6 files**. `logs/4.1-guard-group.log` |
| Full suite | `npx vitest run` | **704/704, 46 files**, exit 0. `logs/4.1-vitest-full.log` |
| Typecheck | `npx tsc --noEmit` | exit 0, no output. `logs/4.1-tsc.log` |
| Lint | `npx eslint .` | exit 0, no output. `logs/4.1-eslint.log` |
| Production build | `npm run build` | exit 0; 13/13 static pages emitted. `logs/4.1-build.log` |
| Change validation | `openspec validate macro-lod-continuity --strict` | valid |
| Spec validation | `openspec validate --specs --strict` | 9 passed, 0 failed |
| `safe-test` wrapper | `safe-test npx vitest run` | Aborts with `RangeError: WebAssembly.instantiate(): Out of memory` under the wrapper's `ulimit -v`; the direct serialized run above passes 704/704. `logs/4.1-safe-test-wrapper.log` |

**Existing assertions:** `zoomTier.test.ts:152-166` are unchanged. `MacroIsland.test.tsx` lifetime tests now pass a `palette` argument (the component requires one) and one typing helper narrows `plate.stops`; no assertion semantics changed.

## 4. Desktop & Coarse Parity

Harness: `openspec/changes/macro-lod-continuity/parity/macro-parity.mjs`. Base `b616dbc` and head were built separately and served with `next start` on 3131/3132. Chromium, `deviceScaleFactor: 1`. Fine = 1440×900 `hasTouch: false`; coarse = 393×852 `hasTouch: true`, `isMobile: true`. Only the two servers started for this run were stopped.

**Resolved framing fact:** a four-album wall at 1440×900 cannot zoom out past the containment clamp (~`0.402`), so it never reaches macro; its Overview rests in `album`. Desktop macro parity therefore uses `?demo=1000` zoomed to `0.21`, while `?demo=4` at 393×852 rests at `0.219219` and is captured at rest. This is a harness adaptation forced by real geometry, not a product change.

| Capture | Differing pixels | Out-of-rect pixels | Computed-style diffs | Result |
| :--- | ---: | ---: | ---: | :--- |
| chiaroscuro / Album rest | 0 | — | 0 | PASS |
| chiaroscuro / Print rest | 0 | — | 0 | PASS |
| concrete / Album rest | 0 | — | 0 | PASS |
| concrete / Print rest | 0 | — | 0 | PASS |
| alabaster / Album rest | 0 | — | 0 | PASS |
| alabaster / Print rest | 0 | — | 0 | PASS |
| chiaroscuro / macro Overview | 18,406 | **0** | — | PASS |
| concrete / macro Overview | 18,616 | **0** | — | PASS |
| alabaster / macro Overview | 18,312 | **0** | — | PASS |

- Macro Overview: 12 islands, 12 plates, **1 soundtrack slot** (`demo-album-03`), diff bbox `(347, 355, 657×449)`, every differing pixel inside a plate or slot rect (±2 px).
- Coarse crops: 4 islands, **3 slots** (`demo-tokyo`, `demo-coast`, `demo-alpine`), at scale `0.219219`.
- Crops: `parity/crops/overview-{chiaroscuro,concrete,alabaster}-fine.png` and `parity/crops/overview-{alabaster,chiaroscuro}-coarse.png`. `parity/report.json` carries the full matrix.
- Visual review (Chromium images inspected directly): each macro plate is a dark smoked rectangle with faint bars, the soundtrack album has a dark `#161616` slot under its plate, and there is no pale square. The plate tone reads as the same family as the live smoked-glass placard in the Album Focus captures (`chiaroscuro` medium dark, `alabaster` denser/olive).
- Diagnostics: only the pre-existing YouTube facade `502` on detail-tier pages (no outbound network); identical on both builds and never at macro.

**Hysteresis probe** (`?demo=1000`, pre-positioned at `0.20`, then `0.251 → 0.235 → 0.26 → 0.225 → 0.249 → 0.23`):

| Side | Waves | What happened |
| :--- | ---: | :--- |
| head | **1** | one promote at `0.251`; every later scale keeps `album` |
| base | **4** | promote `0.251`, demote `0.235`, promote `0.26`, demote `0.225` (9 mosaics mounted) |

**Island count at the demote boundary** (`?demo=1000`, 1440×900):

| Scale | Side | Detail islands | Macro islands |
| :--- | :--- | ---: | ---: |
| `0.221` | head | **9** | 0 |
| `0.2505` | base | **9** | 0 |
| `0.210` | head | 0 | 12 |
| `0.210` | base | 0 | 12 |

Ratio at the boundary: **1.0**, not the 1.29 continuous-area estimate. Visibility is discrete: the 4th row enters the frustum only at ~`0.21`, after head has already demoted, so no extra detail island mounts at the demote point. The 1.29× area estimate does materialise as 12/9 = **1.333** at `0.21`, where all 12 are cheap macro canvases. This lowers the risk rather than raising it.

## 5. Resolved Assumptions & Empirical Proof

| Assumption | Result |
| :--- | :--- |
| Overview rests outside `[0.22, 0.25)` | `?demo=4` 1440×900 fine **`0.417997`**; `?demo=4` 393×852 coarse **`0.219219`**; `?demo=1000` 1440×900 fine **`0.271815`**. None in the band. **Flag:** the coarse value is only `0.0008` (0.4%) below the demote edge; it is macro today and stays macro, but a future entry-framing change could push it into the band. Recorded as decay-prone in `research.md`. |
| Pinch jitter is under the ~12% band | Not measurable without hardware; the automated fold and the browser jitter probe pass (1 vs 4 waves). **PENDING MANUAL DEVICE VERIFICATION.** |
| ~29% more islands at the demote point | Measured **1.0×** at `0.221` vs `0.2505`; 4th row appears at `0.21` (macro), giving `1.333×` visible. See §4. |
| Greeked bars read as text-like texture, not stripes | Chromium crops show faint bars inside a dark plate at both pointer profiles. Subjective on-device judgement **PENDING MANUAL DEVICE VERIFICATION**. |
| The cover still pops at the swap | Accepted and out of scope (slice 3). The slot footprint is present; its content still arrives with `AlbumTier`. |
| Desktop four-album Overview is macro | False: containment clamps it at ~`0.402` (album tier). Macro on desktop is a zoom-out state of large walls; on 393×852 coarse it is the resting state. Harness adapted, no framing change. |

## 6. Manual Checks (Real iPhone)

| Check | Result |
| :--- | :--- |
| Threshold oscillation feel (the maintainer's 3.25–6.5 s recording) | **PENDING MANUAL DEVICE VERIFICATION** — automated probe: head 1 wave vs base 4 |
| Footprint at the swap (plate + slot already present; left column height unchanged) | **PENDING MANUAL DEVICE VERIFICATION** — Chromium parity shows both rects present at `0.21` |
| Moods and materials on device | **PENDING MANUAL DEVICE VERIFICATION** — Chromium: 3 moods fine + alabaster/chiaroscuro coarse; aluminum/foamcore covered by unit tests, not captured |
| Demote-frame hitch on `?demo=1000` (Timelines, head vs base) | **PENDING MANUAL DEVICE VERIFICATION** — no hardware timeline in this environment |
| iOS compositing of the static change (no per-frame styles introduced) | **PENDING MANUAL DEVICE VERIFICATION** — the diff adds no CSS transition, animation or per-frame style write |

## 7. Nomenclature & Code Symbol Audit

| Term (research.md glossary) | Code symbol / evidence |
| :--- | :--- |
| CSS scale | `cameraToCssScale(...)`; harness reads the `.wall-world` `scale(...)` factor |
| Zoom tier | `ZoomTier`, `resolveZoomTier(scale, printFocused, previous?)` |
| Macro tier / detail tier | `MacroIsland` vs `AlbumTier` at `GalleryCanvas.tsx` |
| Promote / demote | `MACRO_PROMOTE_SCALE = 0.25` / `MACRO_DEMOTE_SCALE = 0.22` |
| Hysteresis band | `[0.22, 0.25)`, held by `previous`; no animation in the band |
| Committed tier | `committedTierRef`, `commitZoomTier(ref, scale, focused)`; the rAF loop is the only writer |
| Footprint parity | `MosaicPlan.soundtrack`, `plan.placardLines` |
| Placard plate | `MacroMosaicPlate`, `plateFill`, `plan.placard` |
| Greeked lines | `PLACARD_LINE_RECTS`, `plan.placardLines`; zero `fillText` |
| Soundtrack slot | `plan.soundtrack`, `SOUNDTRACK_SLOT` (`#161616` + `rgba(255,255,255,0.08)`) |
| Mosaic palette | `MacroMosaicPalette`, `resolveMacroMosaicPalette(theme, material, coarse)`, `PlaygroundTheme.macroPlate`, `palette.key` |

`MACRO_SCALE_THRESHOLD` remains exported as a `0.25` alias (marked `@deprecated`); no caller breaks.

## 8. Deviations, Fixes & Design Notes

1. **Test typing fix (verification commit).** `MacroIsland.test.tsx` now narrows `plate.stops` through a `plateStops()` helper and drops a dead `op !== 'image'` filter; `tsc --noEmit` was failing on union access. No assertion changed.
2. **Parity harness adaptations (verification pass).** Desktop macro parity uses `?demo=1000` at `0.21` (four-album desktop is clamped at ~`0.402`); soundtrack ids come from the detail tier before zooming (macro has no `.soundtrack-plaque` DOM); the hysteresis probe pre-positions at `0.20` and ignores the lagging viewport `data-tier` (otherwise every wave double-counts); the base island count targets `0.2505` to stay off the old threshold's float boundary.
3. **Third commit `be13623`** is harness-only: it clicks elements nearest the viewport centre and ensures Print Focus is entered above the `0.52` click-routing threshold. No product code.
4. **Flat materials have no painted edges.** `design.md` §2 defines plate edges only for acrylic; `MacroMosaicPalette.edges` is `null` for aluminum and foamcore. This matches the design, not a missing feature.
5. **Island-count ratio 1.0 vs 1.29** is a measured outcome of discrete culling, documented in §4/§5; the harness records both 1.0 and the 1.333 visible ratio at `0.21`.
6. **No per-frame styling.** The change adds no CSS transition, animation or per-frame style write, per the PR #18 postmortem.

## 9. Data Preservation

- `git diff --stat b616dbc -- src/lib/db src/app/api src/lib/layout` → **empty**.
- No data model, schema, storage, API, auth or `.env` change; no new dependency.
- Parity used only `?demo=` fixtures on local production builds with `STORAGE_DRIVER=local`; no preview/production request or write.
- Full-page screenshots stayed outside git (`/tmp/macro-parity-shots`); only crops and `report.json` are committed.

## 10. Verbatim Logs

| Log | Contents |
| :--- | :--- |
| `logs/1.1-overview-scale.log` | Task 1.1 base Overview scales + band check |
| `logs/1.7-tdd-red.log` | TDD red: 47 expected failures / 44 pre-existing passes |
| `logs/2.3-slice1-green.log` | Slice 1: 46/46 |
| `logs/3.5-slice2-green.log` | Slice 2 final tree: 91/91 |
| `logs/4.1-guard-group.log` | Guard group: 100/100 |
| `logs/4.1-vitest-full.log` | Full suite: 704/704, 46 files |
| `logs/4.1-tsc.log` | Empty output, exit 0 |
| `logs/4.1-eslint.log` | Empty output, exit 0 |
| `logs/4.1-build.log` | Next.js production route table |
| `logs/4.1-safe-test-wrapper.log` | `safe-test` WebAssembly OOM under `ulimit -v` |
| `logs/4.2-parity.log` | Rest parity, macro confinement, hysteresis, island counts |

Key parity output:

```text
chiaroscuro/album rest: pixels=0 styleDiffs=0 pass=true
chiaroscuro/print rest: pixels=0 styleDiffs=0 pass=true
concrete/album rest: pixels=0 styleDiffs=0 pass=true
concrete/print rest: pixels=0 styleDiffs=0 pass=true
alabaster/album rest: pixels=0 styleDiffs=0 pass=true
alabaster/print rest: pixels=0 styleDiffs=0 pass=true
chiaroscuro overview: pixels=18406 outsidePlates+Slots=0 islands=12 pass=true
concrete overview: pixels=18616 outsidePlates+Slots=0 islands=12 pass=true
alabaster overview: pixels=18312 outsidePlates+Slots=0 islands=12 pass=true
alabaster coarse overview: scale=0.219219 islands=4 slots=3
chiaroscuro coarse overview: scale=0.219219 islands=4 slots=3
hysteresis: head waves=1 (expect 1) base waves=4 (expect >=4) pass=true
island count: head@0.221=9 (scale 0.221) base@0.2505=9 (scale 0.2505) ratio=1 visible@0.21 head=12 base=12 visibleRatio=1.3333333333333333 pass=true
wrote .../parity/report.json pass=true
```
