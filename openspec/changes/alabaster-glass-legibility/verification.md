# Verification — alabaster-glass-legibility

## 1. Executive Summary & Environment

**Status:** Implementation, automated gates and desktop/coarse parity complete. The change passes `openspec validate --strict` and `openspec validate --specs --strict` (9/9 specs). Every automated gate passes: 11/11 new tests, 45/45 guard tests, 621/621 full-suite tests, `tsc --noEmit`, `eslint .` and `next build`. Desktop parity is 0 differing pixels with 0 computed-style differences for all 12 non-target mood × material combinations; the single target combination differs only inside placard boxes. The measured plate pixel next to the timecode gives **5.60:1**, above the 4.5:1 floor.

The real-iPhone Safari check and the subjective footer-crowding judgement stay **PENDING MANUAL DEVICE VERIFICATION** (§6). No data, schema, storage, API or dependency changes are involved.

**What shipped (5 files + artifacts):**

- `src/lib/lighting/playgroundTheme.ts` — Alabaster `glassInk`, `glassCap`, `glassShadow` (D1).
- `src/styles/wall.css` — one unconditional shared Alabaster `.mat-acrylic` plate; coarse Alabaster rule deleted; dead `[data-material=…]` block deleted (D2, D3).
- `src/lib/__tests__/placardGlassLegibility.test.ts` — new source-text contrast/selector audit (D4).
- `openspec/specs/3d-pbr-wall-and-lighting/spec.md` — MODIFIED solar-mood requirement and ADDED legibility requirement synced.
- `openspec/changes/alabaster-glass-legibility/` — verification, tasks, logs, parity script/report/crops.

| Item | Value |
| :--- | :--- |
| Date | 2026-11-26 |
| OS | Linux (`overlay`, x86_64 container) |
| Node | `v22.23.2` |
| Vitest | `5.1.1` |
| Next.js | `16.4.6` |
| TypeScript | `5.9.3` |
| Branch | `feat/alabaster-glass-legibility` |
| Base commit | `b3cceff` (`main`, merge of PR #16) |
| Planning commits | `679af2b` (artifacts), `804835b` (handoff) |
| Head | `81a5b36` on `feat/alabaster-glass-legibility` — implementation commit carrying `wall.css`, `playgroundTheme.ts`, `placardGlassLegibility.test.ts`, parity and verification |
| Runner config | `vitest.config.ts`: `fileParallelism: false`, `maxWorkers: 1`, `environment: 'node'` |
| Test env (from config) | `DATABASE_URL=file::memory:`, `ADMIN_PASSWORD=test-password-1234`, `STORAGE_DRIVER=local`, `LOCAL_UPLOAD_DIR=./data/test-uploads` |
| Parity build env | `STORAGE_DRIVER=local`, `DATABASE_URL=file:./data/photo-wall.db`, local DB copies; no network writes |
| Browser | Chromium via `playwright-core` (npx cache), production `next start` builds |

## 2. Requirement Adherence Audit Matrix

Source: `openspec/changes/alabaster-glass-legibility/specs/3d-pbr-wall-and-lighting/spec.md`; synced into `openspec/specs/3d-pbr-wall-and-lighting/spec.md`.

Legend: **PASS** = exercised and passed in this run; **PASS (audit)** = path unchanged and its pre-existing test still passes; **PENDING MANUAL DEVICE VERIFICATION** = needs real hardware.

### 2.1 MODIFIED — "Offline suncalc NYC solar circadian gallery lighting with per-mood tokens"

| # | Scenario | Verifying test(s) / evidence | Status |
| :--- | :--- | :--- | :--- |
| M1 | Public visitor sees NYC solar mood without network requests or manual override | `src/lib/lighting/__tests__/nyTimeMood.test.ts` (unchanged, 45/45 guard group). `MOOD_TOKENS.alabaster.placardInk` remains `#1D1E1C`; the change touches only `PLAYGROUND_THEMES.alabaster.glass*`, a separate token set. Spec text now says the `placardInk` token does **not** determine Beveled Glass text colour. | PASS (audit) |
| M2 | March and November DST transitions select the correct solar mood | `nyTimeMood.test.ts` DST boundary cases (unchanged). No solar, timer or crossfade code was edited. | PASS (audit) |

### 2.2 ADDED — "Beveled Glass placard text is legible in every lighting mood"

| # | Scenario | Verifying test(s) / evidence | Status |
| :--- | :--- | :--- | :--- |
| A1 | Alabaster Beveled Glass title is light with no halo | `placardGlassLegibility.test.ts` › "sets the Alabaster glass ink, cap and shadow in the theme data"; › "keeps the acrylic text rules reading the theme glass variables". Parity (`alabaster/acrylic`) computed base→head: title `rgb(29,30,28)` → `rgb(244,246,244)`; text-shadow `rgba(255,255,255,0.45) 0px 1px 1px` → `none`; meta/track/timecode `rgba(29,30,28,0.84)` → `rgb(240,244,241)` with `none` shadow. | PASS |
| A2 | Every Beveled Glass text line clears 4.5:1 in every mood | `placardGlassLegibility.test.ts` › "measures title, caption, track name, meta and timecode against every plate stop" (3 moods × every plate stop × 5 lines; opacities parsed from `wall.css`). Measured real-pixel check: timecode `5.60:1` (§5). | PASS |
| A3 | Desktop and phone share the Alabaster plate tint | `placardGlassLegibility.test.ts` › "has exactly one unconditional Alabaster acrylic background rule…"; › "never redefines the Alabaster plate inside @media (pointer: coarse)"; › "keeps the coarse generic acrylic rule static". Parity coarse emulation: identical `background-image`; desktop `backdrop-filter: blur(2.5px)`, coarse `none`. | PASS (automated coarse emulation); *device feel* PENDING MANUAL DEVICE VERIFICATION |
| A4 | Other moods and materials are pixel-identical | Parity matrix: 12/12 non-target combinations at **0 differing pixels** and **0 computed-style diffs** (§4). | PASS |
| A5 | Soundtrack footer is kept | `placardGlassLegibility.test.ts` › "keeps the soundtrack divider, track line and timecode"; parity crops show title, meta, divider, track name and `0:00 / 3:25`. Placard rects unchanged (no `rect.*` diffs). | PASS |

### 2.3 Requirement clauses without their own scenario

| Clause | Verifying test(s) / evidence | Status |
| :--- | :--- | :--- |
| Alabaster `glassInk/glassCap/glassShadow` exact values | Theme assertion in `placardGlassLegibility.test.ts`; parity computed styles | PASS |
| Single unconditional Alabaster plate with stops `0.78 / 0.74 / 0.78` and RGB `30,36,33 / 22,27,24 / 34,40,36` | Plate rule assertion parses the `background` declaration; it also asserts the dual selector is one rule (one unique body) and that it declares `background` only | PASS |
| No coarse Alabaster plate redefinition | Coarse-block assertion (`[]` Alabaster `.mat-acrylic` rules inside `@media (pointer: coarse)`) | PASS |
| Desktop keeps `blur(2.5px)`, coarse keeps `none` | Coarse generic rule assertion; parity computed styles on both profiles | PASS |
| No dead `[data-material…]` selectors in `wall.css` | `expect(WALL_CSS).not.toContain('[data-material')` | PASS |
| Chiaroscuro/Concrete ink, shadow, plate; aluminum and foamcore unchanged | Theme literal guards; parity 0 px / 0 style diffs for all 12 combinations | PASS |
| Geometry unchanged | Parity style comparison includes every line/placard `rect`; no rect diffs | PASS |
| `placardInk` mood token unchanged | `nyTimeMood.test.ts` passes unchanged; `nyTimeMood.ts` untouched | PASS (audit) |

## 3. Test & Gate Results

| Gate | Command | Result |
| :--- | :--- | :--- |
| TDD red (pre-implementation) | `npx vitest run src/lib/__tests__/placardGlassLegibility.test.ts` | **5 failed / 6 passed** — the Alabaster-ink, unconditional-plate, no-coarse-Alabaster, contrast and dead-selector cases failed for the expected reasons; the unchanged / footer / can-fail guard cases passed. Log: `logs/1.3-tdd-red.log` |
| New audit (green) | `npx vitest run src/lib/__tests__/placardGlassLegibility.test.ts` | **11/11 passed** |
| Guard files (unchanged) | `npx vitest run src/lib/__tests__/touchAudit.test.ts src/lib/lighting/__tests__/nyTimeMood.test.ts src/lib/lighting/__tests__/playgroundLighting.test.ts` | **45/45 passed** across 3 files |
| Full suite | `npx vitest run` | **41 files, 621/621 tests passed** in 12.9 s. Log: `logs/3.1-vitest-full.log` |
| Typecheck | `npx tsc --noEmit` | exit 0, no output (`logs/3.1-tsc.log`) |
| Lint | `npx eslint .` | exit 0, no output (`logs/3.1-eslint.log`) |
| Production build | `npm run build` | exit 0; 13/13 static pages, routes emitted (`logs/3.1-build.log`) |
| Change validation | `openspec validate alabaster-glass-legibility --strict` | valid |
| Spec validation | `openspec validate --specs --strict` | 9 passed, 0 failed |

**`safe-test` wrapper note:** `safe-test npx vitest run` aborts before discovery with `RangeError: WebAssembly.instantiate(): Out of memory` because the wrapper applies `ulimit -v`; the failure reproduces at 4 GB, 8 GB and 16 GB caps (`logs/3.1-safe-test-wrapper-failure.log`). The same command without the wrapper passes 621/621, so the recorded full-suite gate is the direct run. This is a harness/`ulimit` limitation, not a test failure.

**Contrast can-fail guard:** feeding the contrast function the pre-change Alabaster ink `#1D1E1C` and the old coarse plate (`0.78 / 0.70 / 0.78`) returns < 4.5 for every stop, so the audit is capable of failing on the original defect.

## 4. Desktop & Coarse Parity

Harness: `openspec/changes/alabaster-glass-legibility/parity/placard-parity.mjs` (adapted from `gyro-relative-recenter/parity/desktop-parity.mjs`). Base `b3cceff` and head were built separately and served with `next start` on ports 3131/3132. Fine pointer: 1440×900, `hasTouch: false`. Coarse: 393×852, `hasTouch: true`, `isMobile: true`. Material was set through `localStorage['photo-wall:placard-material']`. Only the servers started for this run were stopped, by PID.

| Mood / material | Differing pixels | Computed-style diffs | Confined to placards | Expected | Result |
| :--- | ---: | ---: | :---: | :---: | :--- |
| chiaroscuro / acrylic | 0 | 0 | — | no diff | PASS |
| chiaroscuro / aluminum | 0 | 0 | — | no diff | PASS |
| chiaroscuro / foamcore | 0 | 0 | — | no diff | PASS |
| concrete / acrylic | 0 | 0 | — | no diff | PASS |
| concrete / aluminum | 0 | 0 | — | no diff | PASS |
| concrete / foamcore | 0 | 0 | — | no diff | PASS |
| **alabaster / acrylic** | **43,152** | **9** | **yes** | change only | **PASS** |
| alabaster / aluminum | 0 | 0 | — | no diff | PASS |
| alabaster / foamcore | 0 | 0 | — | no diff | PASS |

The nine target style diffs are exactly the intended ones: the plate `background-image`, and `color` + `text-shadow` for title, meta, track name and timecode. The `.placard-caption` element is not rendered by the `?demo=4` fixture, so its computed colour is not captured by parity; it shares the same `.mat-acrylic` cap rule and is covered by the source audit. No `rect` changed.

**Coarse emulation (head, Alabaster × acrylic):**

| Property | Desktop | Coarse |
| :--- | :--- | :--- |
| `background-image` | `linear-gradient(138deg, rgba(30,36,33,0.78) 0%, rgba(22,27,24,0.74) 55%, rgba(34,40,36,0.78) 100%)` | identical |
| `backdrop-filter` | `blur(2.5px)` | `none` |
| Line colours | light ink | identical for every rendered line |

Crops kept in git: `parity/base/` and `parity/head/` (one 238×224 placard crop per mood × material, plus `head/alabaster-acrylic-coarse-placard.png`). Full-page images and the report are in `parity/report.json`; full-page screenshots stayed outside git.

**Diagnostics:** both sides request the demo's YouTube thumbnail and receive `502` because the sandbox has no outbound network. The failure is identical on both builds and the poster falls back to its gradient, so it does not affect the diff. No page errors or layout errors were recorded.

## 5. Measured Contrast and Resolved Assumptions

Expected values are the pre-implementation maths over `wallBase`; measured values come from the real head screenshot.

| Line | Ink / opacity | Expected worst over `wallBase` | Measured |
| :--- | :--- | ---: | :--- |
| Title | `#F4F6F4` / 1.0 | 8.21 | not separately sampled; computed light |
| Caption | `rgba(240,244,241,1)` / 1.0 (spec list) | 8.03 | element not rendered by the fixture |
| Track name | cap / 0.92 | 7.10 | computed light; crop legible |
| Meta | cap / 0.72 | 5.09 | computed light |
| Timecode | cap / 0.72 | 5.09 | **5.60** on the sampled plate |

**Pixel sample (task 3.3):** sampled a 5×5 median patch in the head Alabaster desktop screenshot beside the timecode.

| Measurement | Value |
| :--- | :--- |
| Plate pixel next to timecode | `#40433e` |
| Wall pixel just left of the placard | `#b3ada6` |
| Timecode glyph colour / opacity | `rgb(240, 244, 241)` / `0.72` |
| Composited glyph colour | `#bfc2bf` |
| Contrast ratio | **5.604:1** (floor 4.5) |
| Desktop `backdrop-filter` | `blur(2.5px)` |

**Resolved assumptions:**

- **Spot-lit wall:** the wall actually behind the placard sampled **darker** than `wallBase` (`#b3ada6` vs `#CBC6BC`), so the spot-lit-brighter proxy was conservative in this capture. The composited plate (`#40433e`) is darker than the flat-maths middle stop (`#454743`), and the real timecode ratio (5.60) is **above** the 5.09 flat-maths worst case.
- **`backdrop-filter: blur(2.5px)`:** it is active on desktop, and the sampled pixel is the post-blur composite. It did not reduce contrast; the measured ratio clears the floor with margin.
- **Coarse:** the computed gradient is identical to desktop and `backdrop-filter` is `none`; the device look remains a hardware check.

**Residual observations (pre-existing, unchanged):**

- `.museum-placard .placard-caption` also declares `opacity: 0.86`. The spec's test list measures caption at 1.0; if a caption renders at 0.86, the worst stop is still **6.45:1**.
- During an active marquee, the inner `.placard-track` adds `opacity: 0.78` under `.placard-track-name`'s 0.92 (effective 0.7176). The worst stop is still **5.06:1**. Static track names use 0.92 directly.
- Neither rule was changed: both are existing truth and remain above the floor.

## 6. Manual Checks

Executed against the head production build at 1440×900 in Chromium (the parity capture): `?demo=4&mood=<mood>`, material via `localStorage`.

| Check | Result |
| :--- | :--- |
| Alabaster title, meta, track name and `0:00 / 3:25` read crisply in light ink, no halo/vibration | **PASS** — before/after crops at `parity/{base,head}/alabaster-acrylic-placard.png`; base shows dark ink with a white halo, head shows light ink with no shadow |
| Soundtrack divider, track name and timecode still present at the same geometry | **PASS** — visible in the crop; no rect diffs |
| Other moods (`concrete`, `chiaroscuro`) look exactly as production | **PASS** — 0 px difference |
| Brushed Aluminum and Archival Foamcore in Alabaster look exactly as production | **PASS** — 0 px difference (classes were set via the same localStorage key the Curator Settings control writes) |
| Marquee ticker scrolls with edge fades intact, in light ink | **PENDING MANUAL DEVICE VERIFICATION** — static ink and mask rules are unchanged and audited; the scrolling state needs a real run |
| Real iPhone (Safari) Alabaster legibility | **PENDING MANUAL DEVICE VERIFICATION** — no hardware in this environment |
| Footer crowding above the standoff pins | **Observation:** the timecode still sits close to the standoffs, as before. Not changed in this change. If it reads as crowded on device, the follow-up is more bottom padding; recorded as a follow-up only. |

## 7. Nomenclature & Code Symbol Audit

| Term | Used consistently as | Evidence |
| :--- | :--- | :--- |
| Beveled Glass | Visitor name for material `acrylic`, class `.museum-placard.mat-acrylic` | Spec, test names, parity keys |
| Glass ink | `glassInk`, `glassCap`, `glassShadow` → `--glass-ink`, `--glass-cap`, `--glass-text-shadow` | Theme assertion, CSS var assertion |
| Alabaster plate | The `.mat-acrylic` `background` gradient under `data-mood='alabaster'` | One unconditional dual-selector rule; parity computed style |
| Coarse profile | Rules inside `@media (pointer: coarse)` | Coarse assertions, coarse emulation |
| Composited plate colour | Gradient stop alpha-composited over `wallBase` | Contrast helper, `#40433e` sample |
| Dead `[data-material]` rules | Legacy selectors no rendered element matches | Removed from `wall.css`; audit asserts absence |
| `placardInk` | Mood token `#1D1E1C`; **not** Beveled Glass text colour | Spec MODIFIED text; `nyTimeMood.ts` untouched |

No new dependencies, shared helpers or exported symbols were added. The only new symbol surface is inside the test file.

## 8. Data Preservation

Not applicable. No database, schema, storage, API, auth or env file was modified. Parity servers used local `file:` DB copies and `STORAGE_DRIVER=local`; no preview/production write occurred. No `.env` or credential file was read or changed.

## 9. Verbatim Logs

| Log | Contents |
| :--- | :--- |
| `logs/1.3-tdd-red.log` | TDD red run: 5 expected failures, 6 guard passes |
| `logs/3.1-vitest-full.log` | Full suite: 41 files / 621 tests passed |
| `logs/3.1-tsc.log` | `tsc --noEmit`, empty output |
| `logs/3.1-eslint.log` | `eslint .`, empty output |
| `logs/3.1-build.log` | `next build` route table |
| `logs/3.1-safe-test-wrapper-failure.log` | `safe-test` + `ulimit -v` WebAssembly OOM |
| `logs/3.2-parity.log` | Parity matrix, coarse comparison and pixel sample |
