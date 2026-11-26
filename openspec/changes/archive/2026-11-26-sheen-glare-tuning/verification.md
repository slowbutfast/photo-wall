# Verification — Sheen Glare Tuning (`sheen-glare-tuning`)

## 1. Executive Summary & Environment

| Field | Value |
| :--- | :--- |
| Change | `sheen-glare-tuning` |
| Status | **IMPLEMENTED — automated gates and emulated browser checks PASS; real-device judgement is `PENDING MANUAL DEVICE VERIFICATION`** |
| Date | 2026-11-26 |
| Branch | `feat/sheen-glare-tuning` (from `main` @ `04f7f1e`) |
| Source change | `src/styles/wall.css` only (three hunks) plus the new `src/lib/__tests__/sheenGlareAudit.test.ts`. No TSX, gyro, overlay or `touchAudit` edits. |
| OS / Node | Linux aarch64 container, Node `v22.23.2` |
| Runner | Vitest `5.1.1`, `tsc`, ESLint, `next build` (Next.js `16.4.6`, Turbopack) |
| Browser | Playwright `1.65.1` (run from the npx cache, not a repo dependency), headless Chromium, single worker |
| Data safety | Local only: `STORAGE_DRIVER=local`, demo mode (`?demo=4`), ports `3121` (baseline) and `3122` (head). No `.env` copied or read; no Turso or Bunny access. Both servers stopped. |
| Devices | Real iPhone / Android **not available**. Task 3.4 is `PENDING MANUAL DEVICE VERIFICATION`. |

Result: the glare is halved on every pointer through one `--sheen-strength: 0.5` multiplier, and on `(pointer: coarse)` the focused and overlay sheens rest at `--sheen-anchor: 65% 35%`. With `--sheen-strength: 1` injected the desktop render is pixel-identical to the pre-change build, so the multiplier is the only behavioural change on desktop.

## 2. Requirement Adherence Audit Matrix

Delta spec: `specs/instanced-photo-renderer/spec.md` (2 requirements, 6 scenarios).

| # | Requirement / Scenario | Verifying artefact | Status |
| :--- | :--- | :--- | :--- |
| 1 | Sheen gradient alpha stops use the strength multiplier (`--sheen-strength: 0.5` declared once; stops `calc(0.38 * var(--sheen-strength))`, `calc(0.14 * var(--sheen-strength))`, outer `0`) | `sheenGlareAudit.test.ts` — `declares --sheen-strength: 0.5 exactly once…`, `scales both non-zero gradient alpha stops…`, `keeps the ellipse size and the rest opacity unchanged`. Browser: computed alpha `0.38 → 0.19`, `0.14 → 0.07` on all three moods. | **PASS** |
| 2 | Desktop hover glare is half as strong but moves the same way | Playwright `print-hover` (fine pointer, mouse at 72% / 30% of the focused frame): focused sheen computed `transform: matrix(1, 0, 0, 1, -25.0063, 23.4222)` and `opacity: 0.92` identical on baseline and head; the gradient centre stays the `50% 50%` default (no `at` in the serialised value); peak alpha `0.38 → 0.19`. | **PASS** (emulated mouse) |
| 3 | Only sheen pixels differ on desktop | Playwright desktop parity, §3: computed-style diffs are `.photo-sheen` `background-image` only; `--sheen-strength: 1` override gives 0 px. | **PASS** (Studio not run, see §3) |
| 4 | Coarse focused and overlay sheens declare the top-right anchor (`--sheen-anchor: 65% 35%` in one `(pointer: coarse)` rule, none outside, base gradient `at var(--sheen-anchor, 50% 50%)`) | `sheenGlareAudit.test.ts` — `positions the base gradient at var(--sheen-anchor, 50% 50%)`, `sets --sheen-anchor: 65% 35% on the coarse rule shared…`, `never declares --sheen-anchor outside a (pointer: coarse) block`. `touchAudit.test.ts` unchanged and green. | **PASS** |
| 5 | Static glare rests top-right without gyroscope input | Coarse emulation (`390×844`, DPR 3, `hasTouch`, `isMobile`, no sensor so the static path), Print Focus at rest: focused and overlay computed `background-image` both `radial-gradient(46% 42% at 65% 35%, …)`, opacity `0.44`, blend `normal`. Screenshots viewed, §4. Reduce Motion / denied-permission were not separately emulated: with no sensor present the static path is the same code path. | **PASS** (emulated); real-device look `PENDING MANUAL DEVICE VERIFICATION` |
| 6 | Gyroscope sweeps the glare from the top-right anchor, overlay stays aligned | Static: `FramedPrint.tsx` / `useGyroTilt.ts` / `gyroTilt.ts` untouched (`git diff`), `useGyroTilt.test.ts` and `printSharpOverlaySync.test.ts` green unchanged; the inline `translate3d(-nx*38%, -ny*38%, 0)` composes with the anchor by construction. Overlay vs frame sheen rect alignment at rest: max `0.0099 px` (≤ 0.1 px) in all three moods. A live gyro sweep needs a sensor. | **PASS** (static + alignment); live sweep `PENDING MANUAL DEVICE VERIFICATION` |

## 3. Desktop fine-pointer parity

Method: production builds (`STORAGE_DRIVER=local next start`) of the pre-change commit `04f7f1e` (separate worktree, port `3121`) and head (port `3122`); Chromium `1440×900`, DPR 1, fine pointer, `?demo=4&mood=<mood>`; CSS transitions and animations frozen before every capture; one computed-style dump (every property) of 11 selectors plus rects per state; `pixelmatch` at threshold `0` (stricter than the `0.1` used by earlier changes) with the sheen region defined as the union of `.photo-window` and `.print-sharp-overlay` rects (+2 px). States: `idle`, `album`, `placard-hover`, `print` (pointer parked), `print-hover`. **Studio was skipped** (needs admin auth and a DB).

Head (`--sheen-strength: 0.5`) vs baseline, chiaroscuro (concrete and alabaster are within the same range, see logs):

| State | Differing px (threshold 0) | Of which in sheen regions | Computed-style diffs (excluding the new `--sheen-strength` custom property itself) |
| :--- | ---: | ---: | :--- |
| `idle` | 167228 | 167228 | `.photo-sheen` `background-image` |
| `album` | 203258 | 203258 | `.photo-sheen` `background-image` |
| `placard-hover` | 203258 | 203258 | `.photo-sheen` `background-image` |
| `print` | 398340 | 397424 (916 outside) | `background-image` on `.photo-sheen`, `.photo-frame.focused .photo-sheen`, `.print-sharp-overlay .photo-sheen` |
| `print-hover` | 383307 | 382391 (916 outside) | same three |

The 916 (chiaroscuro), 737 (concrete) and 1092 (alabaster) pixels outside the window rects in the `print` states sit in a single box, `x 485–941, y 843–899`, which is the bottom HUD bar. It has a `backdrop-filter` blur and the next print's sheen sits right behind it, so this is the sheen showing through the blur, not a separate change. It is a deviation from a literal reading of "confined to sheen regions", noted for the reviewer. At the default `pixelmatch` threshold of `0.1` only `print-hover` exceeds it (4738 px, all inside sheen regions, 0 outside) in every mood; the resting states fall under the perceptual threshold because the rest veil is faint (peak about `0.08`).

Head with a temporary injected `.playground-wall-root { --sheen-strength: 1 !important }` (via Playwright `addStyleTag`, never committed) vs baseline:

| State | Chiaroscuro | Concrete | Alabaster | Computed-style diffs |
| :--- | ---: | ---: | ---: | :--- |
| `idle` | 2 | 2 | 2 | none |
| `album` | 0 | 0 | 0 | none |
| `placard-hover` | 0 | 0 | 0 | none |
| `print` | 0 | 0 | 0 | none |
| `print-hover` | 0 | 0 | 0 | none |

The 2 px in `idle` (row `y = 389`, `x 740–846`, outside every sheen rect) is a harness artefact. Injecting a no-op style tag (`--noop: 1`) into the **baseline** produces the same 2 px, while baseline vs baseline is 0 and `head+strength:1` vs the no-op-injected baseline is 0 in all five states. So `--sheen-strength: 1` reproduces the old render exactly, which proves the multiplier is the only behavioural change.

Notes:
- With the multiplier at its shipped `0.5` the `--sheen-strength` custom property appears on every element's computed style because it is inherited from `.playground-wall-root`. That is the new variable itself and is filtered from the table above.
- The inline sheen `transform` and `opacity` are unchanged (see scenario 2).
- One `502` demo-asset console error appears in every baseline and head run, as in earlier changes.

## 4. Coarse-pointer emulation (`390×844`, DPR 3, `hasTouch`, `isMobile`), Print Focus at rest

| Check | Baseline `04f7f1e` | Head |
| :--- | :--- | :--- |
| `(pointer: coarse)` / `(pointer: fine)` | true / false | true / false |
| Focused `.photo-sheen` `background-image` | `radial-gradient(46% 42%, rgba(255,255,255,0.38) 0%, rgba(255,253,246,0.14) 44%, rgba(255,253,246,0) 74%)` | `radial-gradient(46% 42% at 65% 35%, rgba(255,255,255,0.19) 0%, rgba(255,253,246,0.07) 44%, rgba(255,253,246,0) 74%)` |
| Overlay `.print-sharp-overlay .photo-sheen` `background-image` | same as focused | same as focused (`at 65% 35%`) |
| Blend / rest opacity | `normal` / `0.44` | `normal` / `0.44` |
| Overlay vs frame sheen rect, max abs delta | `0.0099 px` | `0.0099 px` (chiaroscuro, concrete, alabaster) |

Screenshots (not committed; saved outside the repo):
- Baseline: `/tmp/claude-1001/-home-node-global-sandbox-projects-photo-wall/ffc23947-4349-4d16-8e70-726975b87de1/scratchpad/sheen/shots/base-c-{chiaroscuro,concrete,alabaster}/print-focus-rest.png`
- After: `/tmp/claude-1001/-home-node-global-sandbox-projects-photo-wall/ffc23947-4349-4d16-8e70-726975b87de1/scratchpad/sheen/shots/head-c-{chiaroscuro,concrete,alabaster}/print-focus-rest.png`
- Desktop baseline / head / override: `…/shots/{base,head,head1}-d-<mood>/<state>.png`

Visual read (chiaroscuro and alabaster after-screenshots inspected): the glare is now a faint lightening in the upper-right of the photo, around the right edge above the mountain, and the centre of the photo, including the moon and the ridge line, is no longer veiled. It is subtle on this demo artwork: the peak veil is about `0.08`, so expect to judge it on real photos on a device. In the baseline screenshot the veil sat over the middle of the sky and the ridge.

## 5. Automated gates

| Gate | Result |
| :--- | :--- |
| `npx vitest run src/lib/__tests__/sheenGlareAudit.test.ts` before the CSS edit (TDD red) | 6 tests, **4 failed** for the missing variables (`--sheen-strength` not declared, stops not scaled, no `at var(--sheen-anchor, …)`, no coarse `--sheen-anchor` rule); the 2 unaffected cases passed |
| Same file after the CSS edit | 6 / 6 pass |
| `touchAudit.test.ts`, `useGyroTilt.test.ts`, `printSharpOverlaySync.test.ts` (unchanged) | pass (4 files, 53 tests with the new audit) |
| Full suite `npx vitest run --no-file-parallelism` | **40 files, 575 tests pass**; baseline `04f7f1e` is 39 files, 569 tests, so the delta is exactly the new file's 6 tests |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | exit 0 |
| `STORAGE_DRIVER=local npm run build` | exit 0, `Compiled successfully`, TypeScript finished |
| `openspec validate sheen-glare-tuning --strict` | valid |
| `openspec validate --specs --strict` | 9 passed, 0 failed |

Spec sync: there is no `openspec specs apply` command in CLI `1.7.0`, so the two ADDED requirements were appended to `openspec/specs/instanced-photo-renderer/spec.md` by hand (verbatim, without the `## ADDED Requirements` header). The new "halved intensity" requirement states it supersedes the "byte-identical desktop" wording of the mobile render profile for `.photo-sheen` only.

## 6. Resolved and carried assumptions

| Assumption | Outcome |
| :--- | :--- |
| `50%` is the right strength on both devices | **Carried.** Implemented as `0.5`; real-device judgement `PENDING MANUAL DEVICE VERIFICATION`. Desktop render at `1` is identical to the old one, so retuning is a one-value change. |
| `65% 35%` reads as top-right, not obscuring | **Partially resolved.** Emulated screenshots show the glare in the upper-right and the centre unveiled; real-device look pending. `--sheen-size` was not added and remains the deferred follow-up. |
| No measurable perf change | **Carried.** Not measured; the gradient is still one layer and `calc()` in colour stops resolves at style time. |

No claim was disproved, so `research.md` "Superseded claims" stays empty. The strength/anchor comparison (`0.4`/`0.6`, `--sheen-size: 34% 30%`) from `tests.md` was not run (needs devices).

## 7. Nomenclature audit

| Term | Usage in code and docs | Consistent |
| :--- | :--- | :--- |
| Glare / sheen | The `.photo-sheen` element; `glare` in prose and spec titles, `sheen` in CSS and tests | Yes |
| Sheen strength vs sheen intensity | `--sheen-strength` (new, `0.5`, scales gradient alpha) vs `--sheen-intensity` (unchanged, `0.44`, element rest opacity). Each declared exactly once; the audit asserts both values. | Yes |
| Sheen anchor | `--sheen-anchor`, gradient centre inside the sheen box; only set in the coarse rule; fallback `50% 50%` in the base gradient | Yes |
| Resting position | Zero tilt: fine pointer centred, coarse `65% 35%` of the sheen box (about 84% across, 16% down the photo) | Yes |
| Coarse / fine pointer | `@media (pointer: coarse)` capability gate only; no width gating | Yes |

## 8. Deviations and open items

- Studio parity state skipped (admin auth / DB); not checked.
- Pixel confinement: the `print` states show 737 to 1092 pixels in the HUD backdrop-blur band outside the raw window rects, explained in §3.
- Real iPhone / Android checks, live gyro sweep, and the strength/anchor judgement are `PENDING MANUAL DEVICE VERIFICATION` (task 3.4).
- `pkill -f next-server` was run once to stop the temporary servers; it may have matched unrelated `next-server` processes of other sessions.

## 9. Verbatim logs

TDD red run (`npx vitest run src/lib/__tests__/sheenGlareAudit.test.ts`, trimmed):

```
 ❯ src/lib/__tests__/sheenGlareAudit.test.ts (6 tests | 4 failed)
   ❯ Glare intensity is halved on every pointer through a single strength multiplier (3)
     × declares --sheen-strength: 0.5 exactly once, on .playground-wall-root
     × scales both non-zero gradient alpha stops by --sheen-strength and keeps the outer stop at 0
   ❯ Coarse-pointer glare rests in the top-right corner of the photo (3)
     × positions the base gradient at var(--sheen-anchor, 50% 50%)
     × sets --sheen-anchor: 65% 35% on the coarse rule shared by the focused and overlay sheens
AssertionError: expected [] to have a length of 1 but got +0
AssertionError: expected 'radial-gradient( ellipse 46% 42% at 5…' to contain 'rgba(255, 255, 255, calc(0.38 * var(-…'
```

Full suite and gates:

```
 Test Files  40 passed (40)
      Tests  575 passed (575)
tsc=0
eslint=0
build=0   ✓ Compiled successfully in 7.6s
$ openspec validate sheen-glare-tuning --strict
Change 'sheen-glare-tuning' is valid
$ openspec validate --specs --strict
Totals: 9 passed, 0 failed (9 items)
```

Desktop parity at threshold 0, chiaroscuro (full output for the other moods is the same shape):

```
== head (strength 0.5) vs baseline (chiaroscuro)
idle           px=167228 (in sheen regions=167228, outside=0) computedDiffs=[".photo-sheen :: background-image"]
album          px=203258 (in sheen regions=203258, outside=0) computedDiffs=[".photo-sheen :: background-image"]
placard-hover  px=203258 (in sheen regions=203258, outside=0) computedDiffs=[".photo-sheen :: background-image"]
print          px=398340 (in sheen regions=397424, outside=916) computedDiffs=[".photo-sheen :: background-image",".print-sharp-overlay .photo-sheen :: background-image",".photo-frame.focused .photo-sheen :: background-image"]
print-hover    px=383307 (in sheen regions=382391, outside=916) computedDiffs=[same three]

== head + --sheen-strength:1 override vs baseline (chiaroscuro)
idle           px=2 (in sheen regions=0, outside=2) computedDiffs=[]
album          px=0   placard-hover px=0   print px=0   print-hover px=0   computedDiffs=[]

baseline-vs-baseline idle/album/print/print-hover: 0 / 0 / 0 / 0
baseline(no-op style injected) vs baseline idle: 2    head+strength:1 vs baseline(no-op injected): 0 / 0 / 0 / 0 / 0
```

Coarse head (all three moods identical):

```
pointerCoarse true, pointerFine false, focusedBlend normal, overlayBlend normal, opacity 0.44, delta 0.0098876953125
focusedBg/overlayBg: radial-gradient(46% 42% at 65% 35%, rgba(255, 255, 255, 0.19) 0%, rgba(255, 253, 246, 0.07) 44%, rgba(255, 253, 246, 0) 74%)
```

## PATCH-01 — strength raised to 0.8 (2026-11-26)

After reviewing the preview, the maintainer asked for about 80% of the original glare strength instead of 50%. `--sheen-strength` changed from `0.5` to `0.8`, and the anchor is unchanged. See `patch.md`.

| Check | Result |
| :--- | :--- |
| `npx vitest run src/lib/__tests__/sheenGlareAudit.test.ts src/lib/__tests__/touchAudit.test.ts` | 2 files, 24 tests pass (audit now expects `--sheen-strength: 0.8`) |
| `npx vitest run --no-file-parallelism` (full) | 40 files, 575 tests pass |
| `npx eslint src/lib/__tests__/sheenGlareAudit.test.ts` | clean |
| `openspec validate sheen-glare-tuning --strict` / `openspec validate --specs --strict` | valid / 9 of 9 pass |

The earlier desktop parity numbers above were measured at `0.5`. They still bound the result:
- pixel differences remain confined to the same sheen regions (plus the HUD backdrop band);
- the `--sheen-strength: 1` 0 px proof still holds, because only the multiplier's value changed.

They weren't re-captured at `0.8`. Effective alpha:
- peak when active ≈ `0.92 × 0.304 ≈ 0.28`, against `0.35` originally;
- rest on coarse pointers ≈ `0.44 × 0.304 ≈ 0.13`.

Device judgement (task 3.4) is still `PENDING MANUAL DEVICE VERIFICATION`.
