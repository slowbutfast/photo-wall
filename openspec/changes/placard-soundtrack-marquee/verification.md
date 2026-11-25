# Verification — Placard Soundtrack Ticker

## Executive Summary & Environment

**Status:** Implementation and repair complete; automated gates green. All browser/manual checks in `tests.md` (task 5.2) **PASS** in the orchestrator's local-only Playwright pass. The only remaining item is the maintainer's subjective Spotify comparison (and a real-photo upload check for Change 2, unrelated to this change).

| Item | Value |
| :--- | :--- |
| Date verified | 2026-11-24 (initial), 2026-11-25 (repair pass + orchestrator browser pass) |
| OS / arch | Linux 5.15.0-1081-oracle aarch64 |
| Node | v22.23.2 |
| Package manager scripts | npm (`npx`); no venv/uv/poetry — JS project |
| Test runner | Vitest 5.1.1 (Node environment, `fileParallelism: false`, `maxWorkers: 1`) |
| Framework | Next.js 16.4.6, React 19.3.1, TypeScript 5.9.3 |
| Baseline before change | 30 files / 449 tests |
| After change | 31 files / 463 tests (+1 file, +14 tests) |

No database rows, uploads, environment files or playlist data were touched. The change is
presentational only: no API, store, reducer, CSP, schema or migration changes.

## Requirement Adherence Audit Matrix

Source: `openspec/changes/placard-soundtrack-marquee/specs/gallery-hud-and-curator-ui/spec.md`.

| Requirement / scenario | Verification | Status |
| :--- | :--- | :--- |
| **R1.** Ticker runs only when `soundtrack.playing && soundtrack.activeAlbumId === album.id` | `AlbumPlacard.tsx` `PlacardTrackLine` uses the same selector as `PlacardTimecode`; no other playing source exists (`soundtrackState.ts` invariant test `soundtrackState.test.ts`). | PASS (audit) |
| **R2.** Overflow = `textWidth − boxWidth > 1px` | `placardMarquee.test.ts` › `isOverflowing` (equal, +1, +1.5, degenerate). | PASS |
| **R3.** One exported timing constant | `placardMarquee.test.ts` › `MARQUEE_CFG` pins `{2000, 30, 40, 12, 1}` exactly. CSS reads `--marquee-gap`/`--marquee-fade` only. | PASS |
| **R4.** Placard remains `214×200px`; timecode unaffected | `wall.css` `.museum-placard` size unchanged; `PlacardTimecode` body unchanged; diff review. | PASS (audit) |
| **R5.** Idle truncates with an ellipsis exactly as today | Idle renders the bare text node inside `.placard-track-name`; `wall.css` idle declarations untouched. Pre/post element screenshots: **0 changed pixels / 0.0000 %** for both placards; computed font, letter-spacing, `text-overflow: ellipsis`, `white-space`, opacity and rect all identical. | **PASS** |
| **S1.** Long title holds 2000 ms after play, then scrolls at 30 px/s | Live WAAPI: `duration 14400 ms` for distance `372 px`, `holdOffset 0.138888…` (= 2000 ms). At local 1650 ms the transform was still identity; at local 2650 ms `translateX(-19.67 px)` (650 ms × 30 px/s = 19.5 px); samples moved 9.0 px per 300 ms = **30 px/s**. First scroll lands at ≈2000 ms after the click (negative delay aligns the keyframe hold to the click). | **PASS** |
| **S2.** Loop seamless; duplicate restarts at x = 0; hold before every cycle | Keyframe endpoint is `translateX(-372px)` = `ceil(textWidth 332) + gap 40`. Two element screenshots one full cycle apart (local 5000 ms and 19400 ms, both `translateX(-90px)`) are **0 changed pixels / 5983**. The near-seam pair (local 14399.5 ms vs 0 ms) differs only by sub-pixel edge AA from the 0.015 px remaining offset (whole-pixel `ceil` endpoint); the duplicate sits one distance behind and restarts at 0. | **PASS** |
| **S3.** Short titles never move; no duplicate; no fade | Playing the fitting `Intro — A` album: `.is-marquee` false, `.placard-track` count 0, `.placard-track-text` count 0, animations 0, ellipsis retained. | **PASS** |
| **S4.** Idle placards keep the ellipsis | Pre/post pixelmatch on both idle placards: **0 / 45954** and **0 / 45747** changed pixels. | **PASS** |
| **S5.** Stop paths cancel, remove duplicate, restore start with ellipsis | Live: starting the other album, pressing `0` (overview), and switching album focus each removed `.is-marquee`, unmounted the track/duplicate and left 0 animations with the ellipsis. Widening the box so the line fits mid-cycle also cancelled, and restoring the width restarted it. Track-end uses the same `playing` selector and `cancel()` cleanup (audit; no synthetic track-end control). | **PASS** |
| **S6.** Reduced motion never runs the ticker; `title` keeps full text | `emulateMedia({ reducedMotion: 'reduce' })` on a fresh context: playing, 0 `.is-marquee`, 0 tracks, 0 animations, `text-overflow: ellipsis`, `title` intact. Switching reduced motion ON while the ticker ran cancelled it; switching OFF restarted it. | **PASS** |
| **S7.** Late font load re-evaluates overflow and distance | `ResizeObserver` on the box (and the text span while active) plus `document.fonts.ready.then(sync)`. Live overflow-loss/recovery test cancelled and restarted the ticker when the measured box changed; the same `sync` path handles a late font width change. | **PASS** |
| **S8.** Accessibility tree sees the title once; button name unchanged | CDP `Accessibility.getFullAXTree` while active: exactly **1** `StaticText` with `Take Me Home, Country Roads (Original Version) — John Denver`; the duplicate is `aria-hidden="true"` and absent; the button accessible name is still **`Open bolt`**. | **PASS** |

### Orchestrator Browser Verification (task 5.2) — PASS

Local-only harness: `DATABASE_URL=file:./data/photo-wall-verify3.db STORAGE_DRIVER=local LOCAL_UPLOAD_DIR=./data/uploads-verify3 npx next dev -p 3213` (admin pass with `ADMIN_ENABLED=true`). Seeded DB: `bolt` with the long `Take Me Home, Country Roads (Original Version) — John Denver` line, `Short` with the fitting `Intro — A` line. Headless Chromium via Playwright (`--no-sandbox`), single page, local DB only. A separate pre-change app at commit `c1a493f` captured the idle baseline. Full raw evidence, screenshots and numbers are in the section *Orchestrator Evidence: Motion, Visual & A11y* below.

- **Hold timing / speed:** linear 30 px/s after a 2000 ms hold, measured from the play click.
- **Seamless loop:** exact periodicity (0 pixel diff one cycle apart); endpoint math `−372 px` = `ceil(332)+40`.
- **Resting x unchanged:** idle box x `132.686`; during the hold the first glyph x is also `132.686` (the `−12 px` margin is cancelled by the `12 px` padding).
- **Stop paths:** other album, overview, album focus, overflow loss, reduced-motion-on all cancel; overflow recovery and reduced-motion-off restart.
- **A11y:** 1 `StaticText`, duplicate `aria-hidden`, button name `Open bolt`.
- **Performance/raster:** 0 `requestAnimationFrame` calls and 3 layouts / 4 style recalcs over 3 s of steady marquee (compositor transform only); high-DPI screenshots are crisp with both 12 px fades.
- **Studio preview:** same ticker in `/photos/admin` (`duration 14400`, `distance 372`, duplicate `aria-hidden`).
- **Maintainer item (subjective):** the constants still need a frame-by-frame Spotify mobile comparison — see *Implementation-Discovered Deferrals*.

## Resolved Assumptions & Empirical Proof

From `research.md` › **Unverified assumptions**:

| Assumption | Outcome | Proof / remaining action |
| :--- | :--- | :--- |
| Spotify constants (2 s hold, ~30 px/s, 40 px gap, 12 px fade) sit in Spotify's observed range | **Still open — maintainer manual.** Values retained; now pinned by `MARQUEE_CFG` + test so any retune is deliberate and synchronized with the spec. | Needs a frame-by-frame Spotify mobile screen recording. Not invented here. |
| 2 s from the click roughly matches audio start | **Still open — maintainer manual.** Anchor is shared with `PlacardTimecode`; buffering behaviour is unchanged by this change. | Needs a stopwatch run on a slow connection. |
| WAAPI `transform` stays smooth in the scaled `preserve-3d` world | **Resolved — PASS.** Transform-only WAAPI, whole-pixel endpoints, no `will-change`. Live 3 s steady-state marquee: **0 `requestAnimationFrame` calls**, `LayoutCount +3`, `RecalcStyleCount +4`, `TaskDuration +0.0108 s`. High-DPI (3×) screenshots are crisp with no soft raster or jitter. | No action; full CDP `Performance.getMetrics` deltas are recorded below. |

Resolved empirically during the build (moved to `research.md` › Verified facts):

- A nested `inline-flex` (or `inline-block`) child defeats the box's `text-overflow: ellipsis`;
  idle must keep the bare text node. Verified with a local headless-Chrome screenshot of
  three candidate structures. This drove the conditional track markup.
- The 260/166 worked example and the seamless-loop endpoint are proven by unit tests.

## Nomenclature & Code Symbol Audit

| Glossary term (`research.md`) | Code symbol / class | Match |
| :--- | :--- | :--- |
| Track line | `PlacardTrackLine`, `.placard-track-name` (unchanged class) | yes |
| Marquee / ticker | `.placard-track-name.is-marquee`, `.placard-track` | yes |
| Hold | `MARQUEE_CFG.holdMs`, `remainingFirstHoldMs`, `holdOffset` | yes |
| Overflowing | `isOverflowing`, `overflowEpsilonPx` | yes |
| Playing | store selector `soundtrack.playing && soundtrack.activeAlbumId === albumId` | yes |
| Seamless loop / duplicate | second `.placard-track-text` with `aria-hidden="true"` | yes |
| Edge fade | `--marquee-fade`, `mask-image` / `-webkit-mask-image` | yes |

No new public API, route, type export outside `placardMarquee.ts`, or store field was added.

## Landed Tech Footprint & Patterns

| Path | Change |
| :--- | :--- |
| `src/components/wall/placardMarquee.ts` [new] | Pure `MARQUEE_CFG`, `isOverflowing`, `marqueeTimeline`, `remainingFirstHoldMs`; no DOM access. |
| `src/components/wall/__tests__/placardMarquee.test.ts` [new] | 14 unit tests pinning constants, overflow, timeline geometry, seam endpoint, hold clamp. |
| `src/components/wall/AlbumPlacard.tsx` | Extracted `PlacardTrackLine`; local reduced-motion hook; WAAPI lifecycle + measurement; idle markup unchanged. |
| `src/styles/wall.css` | `.placard-track` and `.placard-track-name.is-marquee`, both under `.playground-wall-root`; idle `.placard-track-name` untouched; no `will-change`. |

Patterns: one WAAPI animation per app (single `activeAlbumId`), transform-only, compositor
friendly; measurement ephemeral and scoped to playing; no `requestAnimationFrame`, no new
dependency, no shared "motion service".

## Invalidated Hypotheses & Mid-Build Adjustments

1. **"The nested track can exist while idle and keep the ellipsis."** False. Empirically the
   ellipsis is lost as soon as the box's only child is an `inline-flex`/`inline-block`
   strip. Adjusted: idle renders the bare text node; the track and duplicate mount only
   while active. `.placard-track` retains the specified `display: inline-flex`.
2. **`delay: remainingFirstHoldMs(elapsed)` as literally stated in architecture D3.** That
   adds the keyframe hold on top of the delay (≈4 s first scroll). Adjusted to
   `remainingFirstHoldMs(elapsed) − holdMs` (0 at the click, negative for late detection),
   which keeps the first scroll at `playStartedAt + holdMs` while leaving
   `remainingFirstHoldMs` and its tests exactly as specified.
3. **`boxWidth = box.clientWidth`**. While `.is-marquee` is active the gutter padding is
   included in `clientWidth`, which could make a marginal title oscillate between
   overflowing and fitting. Adjusted to subtract the computed inline padding, so the
   measured text viewport is identical before and after activation.
4. **Synchronous measurement in the effect body.** React 19's
   `react-hooks/set-state-in-effect` lint rejects the `setActive` calls. Adjusted to start
   measurement from the `ResizeObserver` initial notification and `document.fonts.ready`.

## Repair Pass (orchestrator real-browser verification, 2026-11-25)

**Symptom.** In a real browser, playing an album with an overflowing track line
(`scrollWidth 351` vs `clientWidth 163`) left the line static: `.placard-track-name`
stayed in the ellipsis state with a single text child and zero animations at 300/700/
1500/3000 ms. Instrumenting `ResizeObserver.observe` and `Element.prototype.animate`
before load produced an **empty event log** — the observer was never registered and
`animate()` was never called.

**Root cause.** `PlacardTrackLine` declared and read `boxRef`
(`const box = boxRef.current`), but the `span.placard-track-name` in its JSX had no
`ref={boxRef}`. `boxRef.current` was therefore permanently `null`, and the effect exited
at `if (!box) return;` before attaching the observer or measuring. The pure-helper tests
could not catch this because there is no component/DOM test in the suite.

**Fix (minimal).** Attached `ref={boxRef}` to the `.placard-track-name` box. No
constants, CSS, behaviour or files outside the target map changed.

```diff
     <span
+      ref={boxRef}
       className={active ? 'placard-track-name is-marquee' : 'placard-track-name'}
       title={text}
       style={marqueeStyle}
     >
```

**Code audit — all three refs are attached:**

```text
$ grep -n "ref={" src/components/wall/AlbumPlacard.tsx
246:      ref={boxRef}                                            # span.placard-track-name
252:        <span className="placard-track" ref={trackRef}>       # span.placard-track
253:          <span className="placard-track-text" ref={textRef}> # first span.placard-track-text (second is aria-hidden only)
```

**Re-verification after the fix.** `npx vitest run src/components/wall/__tests__/
placardMarquee.test.ts` → 14/14; full suite 31 files / 463 tests; `tsc`, `eslint`, and
`npm run build` all exit 0. The real-browser motion/visual checks are still **not claimed**
here — they remain the orchestrator's Playwright pass (task 5.2).

## Implementation-Discovered Deferrals

- **Spotify constant validation** — maintainer manual item (frame-by-frame Spotify mobile recording). The 2 s / 30 px/s / 40 px / 12 px values are pinned by `MARQUEE_CFG` and its test, so a retune is one deliberate edit plus a spec update. This is the only open item.
- No functional scope was dropped; every other `tests.md` manual check was executed in the orchestrator's local-only browser pass.

## Orchestrator Evidence: Motion, Visual & A11y

Raw values captured from the live app (local-only harness, viewport 1440×900):

```json
{
  "idle":  {"boxClass":"placard-track-name","textOverflow":"ellipsis","title":"Take Me Home, Country Roads (Original Version) — John Denver","childCount":1},
  "idlePixelmatch": [
    {"name":"baseline-placard-0","changed":0,"total":45954,"ratio":0},
    {"name":"baseline-placard-1","changed":0,"total":45747,"ratio":0}
  ],
  "anim": {"duration":14400,"delay":-5.69999885559082,"iterations":null,"easing":"linear",
           "keyframes":[{"offset":0,"transform":"translateX(0px)"},
                        {"offset":0.1388888888888889,"transform":"translateX(0px)"},
                        {"offset":1,"transform":"translateX(-372px)"}]},
  "hold400":  {"localTime":416.7,"transform":"matrix(1, 0, 0, 1, 0, 0)","boxX":120.343,"textX":132.686},
  "hold1400": {"localTime":1649.9,"transform":"matrix(1, 0, 0, 1, 0, 0)","boxX":120.343,"textX":132.686},
  "scroll2400":{"localTime":2650.0,"transform":"matrix(1, 0, 0, 1, -19.6707, 0)"},
  "scrollSamples": [
    {"localTime":3033.2,"tx":-31.1684},{"localTime":3333.2,"tx":-40.1681},
    {"localTime":3633.2,"tx":-49.1662},{"localTime":3933.2,"tx":-58.1662},
    {"localTime":4249.8,"tx":-67.6652}
  ],
  "loopPeriodicity": {"localA":5000,"txA":-90,"localB":19400,"txB":-90,"changed":0,"total":5983},
  "nearSeam": {"before":{"local":14399.5,"tx":-371.9815},"after":{"local":0.5,"tx":0},"changed":136,"total":5983,"note":"sub-pixel edge AA only; 0.015 px offset"},
  "measurement": {"textScroll":332,"textRectWidth":341.2766,"worldScale":1.02857,"duplicateScreenDelta":382.4195,"duplicateLocalDelta":371.79,"distance":372},
  "perfIdle":    {"raf":0,"layout":0,"style":1,"task":0.001515},
  "perfMarquee": {"raf":0,"layout":3,"style":4,"task":0.010813},
  "a11y": {"buttonAriaLabel":"Open bolt","staticTextFullTitleCount":1,"duplicateHidden":"true","boxTitle":"Take Me Home, Country Roads (Original Version) — John Denver"},
  "studioPreview": {"duration":14400,"distance":372,"delay":-5.1,"duplicateHidden":"true","pageErrors":[]}
}
```

- **Resting x:** idle box x `132.686`; during the hold the first glyph x is `132.686`. The `margin-inline:-12px` + `padding-inline:12px` gutter keeps it identical.
- **Responsive/fade:** `.is-marquee` computed `text-overflow: clip`, `padding-inline: 12px`, `margin-inline: -12px`, and a two-edge `mask-image` linear-gradient using `--marquee-fade`. Gap/fade come from inline `--marquee-gap` / `--marquee-fade` set from `MARQUEE_CFG`.
- **Stop/recovery matrix:** other album starts → cancelled; `0` overview → cancelled; album focus → cancelled; box widened to fit → cancelled; width restored → restarted; reduced-motion ON → cancelled; reduced-motion OFF → restarted.
- **Artifacts:** `data/marquee-evidence/` (gitignored) holds `state-idle.png`, `state-hold.png`, `state-scroll-mid.png`, `hidpi-hold.png`, `hidpi-scroll.png`, `hidpi-placard-scroll.png`, `seam-before.png`, `seam-after.png`, `loop-iter1/2.png`, `loop-diff.png`, `state-reduced-motion.png`, `page-marquee.png`, `studio-preview-marquee.png`.

## Empirical Execution Logs & Evidence

### 1. Narrow test first failed because the module was missing (TDD red)

```text
$ npx vitest run src/components/wall/__tests__/placardMarquee.test.ts
 FAIL  src/components/wall/__tests__/placardMarquee.test.ts [ src/components/wall/__tests__/placardMarquee.test.ts ]
Error: Cannot find module '../placardMarquee' imported from
  /home/node/global-sandbox/projects/photo-wall/src/components/wall/__tests__/placardMarquee.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

### 2. Narrow test after implementing the helper/component (green)

```text
$ npx vitest run src/components/wall/__tests__/placardMarquee.test.ts
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

### 3. Narrow test + CSS boundary audit

```text
$ npx vitest run src/components/wall/__tests__/placardMarquee.test.ts src/lib/__tests__/cssBoundaryAudit.test.ts
 Test Files  2 passed (2)
      Tests  22 passed (22)
```

### 4. Full suite

```text
$ npx vitest run
 Test Files  31 passed (31)
      Tests  463 passed (463)
```

Baseline was 30 files / 449 tests; the delta is exactly the new `placardMarquee.test.ts`
(+14). No existing test changed or disappeared.

`cssBoundaryAudit` stayed green inside the full run: the new selectors
(`.placard-track`, `.placard-track-name.is-marquee`) exist only in `wall.css`, nothing was
added to `hud.css`/`studio.css`, and `wall.css` still has no `.hud-`/`.admin-` rules.

### 5. Typecheck, lint, production build

```text
$ npx tsc --noEmit
TSC_EXIT=0

$ npx eslint .
ESLINT_EXIT=0

$ npm run build
✓ Compiled successfully in 2.9s
  Running TypeScript ...
  Finished TypeScript in 11.5s ...
✓ Generating static pages using 2 workers (13/13) in 464ms
BUILD_EXIT=0
```

### 6. Metric deltas

| Metric | Before | After | Delta |
| :--- | :--- | :--- | :--- |
| Test files | 30 | 31 | +1 |
| Tests | 449 | 463 | +14 |
| Records / rows | n/a (no data layer touched) | n/a | 0 |
| New dependencies | — | — | 0 |

### 7. Measurement model (headless Chrome, static replica)

Replicated the real combination (166 px content column, idle ellipsis box, `.is-marquee`
gutter, `inline-flex` track) and dumped the measurements the component uses:

```json
{
 "idleScroll": 469,
 "idleClient": 166,
 "activeClient": 190,
 "padL": 12,
 "padR": 12,
 "contentWidth": 166,
 "textScroll": 469
}
```

This proves the two width sources agree (`box.scrollWidth` idle = `textSpan.scrollWidth`
active = 469) and that subtracting the gutter padding keeps the text viewport at 166 px
before and after activation, so overflow detection cannot oscillate.

## Quick Re-Verification (60-Second Audit)

```bash
cd /home/node/global-sandbox/projects/photo-wall
npx vitest run src/components/wall/__tests__/placardMarquee.test.ts \
              src/lib/__tests__/cssBoundaryAudit.test.ts
# expect: Test Files 2 passed (2) / Tests 22 passed (22)

npx vitest run
# expect: Test Files 31 passed (31) / Tests 463 passed (463)

npx tsc --noEmit && npx eslint . && npm run build
# expect: exit 0 for all three

grep -n "ref={" src/components/wall/AlbumPlacard.tsx
# expect exactly three: boxRef, trackRef (span.placard-track), textRef (first text span)
```

Behavioural spot-check (needs a seeded dev DB and a real browser):

1. Mix a long `Title — Artist` into a placard's soundtrack and play it.
2. Expect 2 s still, then a linear left glide with a trailing copy and 12 px edge fades.
3. Stop / switch album / zoom to overview / let it end → instant snap back to the
   ellipsis, nothing running in DevTools › Animations.
4. Emulate `prefers-reduced-motion: reduce` → static ellipsis, full text still in `title`.

**Maintainer manual item still open:** confirm the constants "feel like Spotify" against a
frame-by-frame Spotify mobile recording. Only then treat `MARQUEE_CFG` as final.

---

## PATCH-01: Firefox tab freeze (activation oscillation)

**Status:** Fix implemented and verified in Chromium. **Not yet verified in Firefox**: Firefox can't launch in the agent sandbox (no `libgtk-3`), so the Firefox preview check is a maintainer item.

**Defect:** after PR #11, playing an album whose track line overflows (for example `Reminiscing — Little River Band`) froze the tab in Firefox. The maintainer confirmed the marquee was the cause: `about:config` › `ui.prefersReducedMotion = 1` made the freeze disappear.

**Root cause:** `PlacardTrackLine` re-decided overflow from scratch after every idle/active mode switch, using a different measurement in each mode. If an engine's two answers disagree, the line toggled on and off forever, and every toggle restyled the `preserve-3d` wall.

**Fix:** a pure gate, `stepMarqueeGate` (`placardMarquee.ts`), with three properties: the first measurement after a mode switch is adopted as that mode's baseline; only a real width change (beyond `overflowEpsilonPx`) can re-decide; and at most `MARQUEE_CFG.maxActivationsPerPlay = 2` activations are allowed per play session, with one `console.warn('[placard-marquee] activation cap reached', …)` when the cap refuses an overflowing line. `sync()` steps the gate only while the gate's mode matches the mounted mode, so a second callback that lands before React re-renders can't record the idle layout as the active baseline. While the strip is mounted, the distance comes from `scrollTimeline` (the un-gated maths), so an active line always has a timeline.

### Requirement Adherence

| Scenario | Evidence | Result |
|---|---|---|
| Measurement disagreement never oscillates | Unit: disagreement A and B, the 1000-measurement property (activations ≤ 2, transitions ≤ 4), and the cap test. Browser: simulated disagreement (below) | **PASS** |
| All previously verified scenarios (hold, loop, short title, idle ellipsis, stop, reduced motion, late fonts, accessibility) | Full suite plus the browser re-checks below | **PASS** |

### Evidence (all on local dev, `STORAGE_DRIVER=local`, a copy of the local dev SQLite file; no preview or production access)

- **Reproduction.** An init script makes `.placard-track-text` report `scrollWidth = 0`, which simulates "idle overflows, active fits".
  - **PR #11 code** (main checkout, port 3123): clicking the play facade never completed. `locator.click: Timeout 30000ms exceeded`, because the main thread was blocked. This is the freeze.
  - **Patched code** (port 3124), same simulation: `{"classChanges":1,"cls":"placard-track-name is-marquee","anims":1}`, `maxGap` 133 ms, no cap warning. One activation, one animation, still scrolling.
- **Normal layout, patched:** `{"classChanges":1,"anims":1}`, `maxGap` 141 ms, no warning. PR #11 code, normal layout: the same result, so there's no behaviour change in the normal case.
- **Idle pixels:** the album placard screenshot (idle, before play) is **byte-identical** between PR #11's code and the patch (24876 bytes, 0 diffs). The idle markup and CSS are unchanged.
- **Hold timing:** the animation attaches 67 ms after the click with `delay = -3.8 ms` (the late-measurement offset), so the first scroll lands at click + 2000 ms. `translateX` samples every 0.5 s: `0.0 0.0 0.0 0.0 -1.6 -16.6 -32.1 -47.1`, so it holds at 0 for about 2 s, then moves at about 30 px/s.
- **Stop path:** after Escape (back to overview), the class returns to `placard-track-name` and the strip is removed.
- **Reduced motion:** with `reducedMotion: 'reduce'`, playing leaves `placard-track-name` with no strip.

### Gates

| Command | Result |
|---|---|
| `npx vitest run src/components/wall/__tests__/placardMarquee.test.ts` | 28 passed (15 failed before the fix, for the missing exports) |
| `npx vitest run` | 31 files, **477** tests passed (PR #11 baseline 463, plus 14 new) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | exit 0 |
| `STORAGE_DRIVER=local npm run build` | succeeded |

### Open (maintainer)

- Preview in Firefox (with `ui.prefersReducedMotion` back to `0`): play `Reminiscing` and watch the console for `[placard-marquee] activation cap reached`. If it appears, Firefox was disagreeing and the gate absorbed it; if the tab still freezes, capture a Firefox Profiler profile for PATCH-02 (the mask / `backdrop-filter` / compositor-animation theory, which is unconfirmed and deliberately not touched here).
