# Surgical Patch Handoff: OpenSpec Change 'placard-soundtrack-marquee' [PATCH-01]

## 0. Branch & Delivery

- Work on the existing branch **`fix/placard-marquee-firefox-freeze`**. It already contains the commit that moves this change out of the archive. Do NOT create another branch, and do NOT work on `main`.
- Delegate the implementation to `spec-coder-sub`. `spec-coder-sub` does not commit. Once verification passes, the orchestrator commits with explicit paths only (never `git add -A` or `git add .`). The working tree has unrelated, uncommitted deletions under `openspec/changes/{client-upload-compression,dom-wall-engine}/` and a modified `next-env.d.ts`; leave them alone.
- Commit message: `fix(placard-soundtrack-marquee): PATCH-01 gate marquee activation to stop Firefox freeze`
- Then run `git push -u origin HEAD` and `gh pr create --base main`. In the PR body, summarise PATCH-01, link `openspec/changes/placard-soundtrack-marquee/patch.md` and `verification.md`, and state that **Firefox verification on the Vercel preview is the maintainer's job** (Firefox can't launch in this sandbox). **Do NOT merge.**
- **Do NOT re-archive this change.** The maintainer re-archives after previewing, using `openspec archive placard-soundtrack-marquee --skip-specs`. The main spec already holds the ADDED requirement, so a normal archive would apply it twice.

## 1. Executive Objective & Diagnostic Feedback

- **Change Name**: `placard-soundtrack-marquee`
- **Patch ID**: PATCH-01
- **Objective**: make the marquee's activate/deactivate decision bounded and immune to measurement disagreement between DOM modes, so that no browser can hang in an activation loop.
- **Feedback & Diagnostic Trace**:
  ```
  Firefox, production build (post PR #11). Clicking the "Reminiscing — Little River Band"
  soundtrack plaque freezes the tab: no painting, no input, YouTube audio keeps playing,
  Firefox shows "this page is slowing down Firefox" (blaming extensions).
  about:config ui.prefersReducedMotion = 1  →  freeze gone  (PlacardTrackLine skips the marquee).
  Chromium, local dev, overflowing title: one activation, one animation,
  no further DOM mutations over 8 s, main thread healthy.
  ```
- **Root Cause Analysis**:
  - `PlacardTrackLine`'s effect (`src/components/wall/AlbumPlacard.tsx` L122-L265) re-decides overflow from scratch after every mode switch. It uses a **different measurement in each mode**:
    - **idle:** `box.scrollWidth` against `box.clientWidth`;
    - **active:** `textEl.scrollWidth` against `trackContentWidth(box)`.
  - If the engine's two answers disagree, the effect flips forever. `setActive(true)` leads to the active measurement saying "fits", then `deactivate()`, then the idle measurement saying "overflows", then `setActive(true)` again.
  - Every lap toggles `.is-marquee`, which switches `mask-image` and the negative-margin gutter on and off. That restyles and relayouts the `preserve-3d` world, with its `backdrop-filter` placards and large prints, and also triggers a React render plus new `ResizeObserver` and `document.fonts.ready` callbacks.
  - In Gecko, laps that cost that much and run back to back pin the main thread. Nothing in the code limits the number of laps: there's no hysteresis and no cap.

## 2. Strict Target Context Map

| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/components/wall/placardMarquee.ts` | `L14-L28` (`MarqueeConfig`, `MARQUEE_CFG`); append after `L119` | Add `maxActivationsPerPlay: 2` to `MarqueeConfig` and `MARQUEE_CFG`. Add a pure `scrollTimeline(textWidth, cfg)` that has the same math as `marqueeTimeline` but no overflow gate, and have `marqueeTimeline` call it so the math lives in one place. Add the pure gate reducer described in §2a. |
| `src/components/wall/__tests__/placardMarquee.test.ts` | the `MARQUEE_CFG` pin (`L28-L40`); new `describe` blocks at the end | Update the config pin to add `maxActivationsPerPlay: 2`; that is the only edit to an existing assertion. Add the gate and `scrollTimeline` tests from §5. |
| `src/components/wall/AlbumPlacard.tsx` | import `L19`; `PlacardTrackLine` `L122-L265` (the effect body around `L145-L240`) | Route every measurement through the gate (§2b). Keep the markup, the playing selector, the reduced-motion hook, `trackContentWidth`, the hold and delay maths, and the CSS variables unchanged. |
| `openspec/changes/placard-soundtrack-marquee/specs/gallery-hud-and-curator-ui/spec.md` **and** `openspec/specs/gallery-hud-and-curator-ui/spec.md` | the marquee requirement's scenario list (the main spec's marquee block is around `L126-L173`) | Add the same scenario to both files, verbatim (§4). Don't change any existing text. |
| `openspec/changes/placard-soundtrack-marquee/{tasks.md,patch.md,verification.md}` | — | Tick P01.x, set PATCH-01 to RESOLVED, and add a PATCH-01 section to `verification.md`. |

### 2a. Gate contract (pure, in `placardMarquee.ts`)

```ts
export interface MarqueeMeasure { textWidth: number; boxWidth: number }
export interface MarqueeGate {
  active: boolean;
  activations: number;                 // within the current play session
  baseline: MarqueeMeasure | null;     // first measurement taken in the CURRENT mode
  capped: boolean;                     // true once the cap tripped this session
}
export const INITIAL_MARQUEE_GATE: MarqueeGate; // {active:false, activations:0, baseline:null, capped:false}
export function stepMarqueeGate(gate: MarqueeGate, m: MarqueeMeasure, cfg?: MarqueeConfig): MarqueeGate;
```

**Rules**, where "changed" means `|Δtext| > ε` or `|Δbox| > ε` against `baseline`, with `ε = cfg.overflowEpsilonPx`:

1. **Unusable measurement** (non-finite or negative): return the gate unchanged.
2. **Idle, with no baseline yet:**
   - If `isOverflowing(m)` and `activations < cap`: activate, with `activations + 1` and `baseline = null` (the next measurement comes from the active DOM).
   - If it overflows but the cap is already reached: stay idle, set `capped = true`, and set the baseline to `m`.
   - Otherwise stay idle, with the baseline set to `m`.
3. **Idle, with a baseline:** re-decide only if the new measurement **changed**; when it has, apply rule 2. If it hasn't changed, return the gate unchanged.
4. **Active, with no baseline yet** (the first measurement after mounting the strip): adopt `m` as the baseline and **stay active, whatever the overflow verdict**. This is the loop breaker.
5. **Active, with a baseline:**
   - If `m` **changed** and `!isOverflowing(m)`: deactivate and set the baseline to `null`.
   - If `m` changed and still overflows: stay active and set the baseline to `m`. The component re-derives the distance.
   - If `m` didn't change: return the gate unchanged.
6. **New play session:** the component resets to `INITIAL_MARQUEE_GATE` whenever `playing` turns true.

### 2b. Component wiring (`PlacardTrackLine`)

- Hold the gate in `useRef<MarqueeGate>(INITIAL_MARQUEE_GATE)`, and reset it in the existing `[playing]` effect next to `playStartedAtRef`.
- In `sync()`:
  - Build `m` exactly as today: `textEl ? textEl.scrollWidth : box.scrollWidth`, and `trackContentWidth(box)`.
  - Then `next = stepMarqueeGate(gateRef.current, m)`.
  - Call `setActive(next.active)` only when `next.active !== active`. Activation stays synchronous as today, and deactivation still goes through the existing microtask `deactivate()`.
- **While active**, the animation uses `scrollTimeline(gate.baseline?.textWidth ?? m.textWidth)`, never the gated `marqueeTimeline`. The animation is recreated only when `distancePx` changes, which keeps the existing `runningDistance` guard.
- **Cap warning:** when `next.capped` flips from false to true, call `console.warn('[placard-marquee] activation cap reached', { albumId, measure: m })` exactly once per session.
- **Unchanged:**
  - The stop, reduced-motion and unmount paths tear down exactly as today.
  - The `!playing || reducedMotion` early return stays as it is.
  - No new `requestAnimationFrame`, no `will-change`, no CSS edits.

## 3. Blast Radius & Invariant Guardrails

- **STRICT BLAST RADIUS:** modify ONLY the files and regions in the Target Context Map.
- **FORBIDDEN:**
  - Do NOT touch `src/styles/wall.css` in this patch. The mask and fade rendering question is PATCH-02, which happens only if the preview still freezes.
  - Do NOT change the idle markup (a bare text node inside `.placard-track-name`), the timecode, or `MARQUEE_CFG`'s existing five values.
  - Do NOT refactor the surrounding code, add dependencies, or edit `.env` or credentials.
  - Do NOT modify existing passing tests, apart from the `MARQUEE_CFG` pin.
  - Do NOT touch `playgrounds/`, `.playwright-mcp/`, `openspec/changes/mobile-*`, or the unrelated working-tree changes.
- **Shared-data safety:** the preview shares the production Turso and Bunny instances. Browser checks run on local dev only (`STORAGE_DRIVER=local` with a local DB). Never write against a preview or production URL.
- **INVARIANTS TO PRESERVE:**
  - The full Vitest suite (463 tests at the time of PR #11) stays green.
  - `cssBoundaryAudit` stays green.
  - The idle-state pixelmatch shows 0 diffs.
  - The first scroll still starts at `playStartedAt + 2000ms`.
  - The loop is still exactly periodic.

## 4. Visual & UI Impact

- **Non-visual patch.** No styling or layout changes. Rendered output in Chromium must be pixel-identical to PR #11, idle and active.
- **Spec scenario** to add verbatim to both spec files, under the marquee requirement:

  ```markdown
  #### Scenario: Measurement disagreement never oscillates
  - **WHEN** the browser reports the playing track line as overflowing in its idle layout but fitting once the marquee strip is mounted (or the reverse)
  - **THEN** the marquee SHALL activate at most `2` times for that play session, SHALL NOT toggle on every measurement, and the page SHALL stay responsive
  ```

## 5. Reproduction & Verification Protocol

1. **Reproduce first (unit):** add these to `placardMarquee.test.ts`, then run `npx vitest run src/components/wall/__tests__/placardMarquee.test.ts` and confirm they fail because the exports are missing:
   - **Disagreement A:** idle `{260,166}`, then active `{160,166}`, then repeated active `{160,166}` measurements. The gate stays `active: true` with `activations === 1`.
   - **Disagreement B:** idle `{170,166}` activates. Active `{150,166}` is adopted as the baseline. Ten more identical measurements leave it unchanged.
   - **Real change:** active baseline `{260,166}`. A late font load gives `{150,166}`, which deactivates. A further `{150,166}` stays idle.
   - **Cap:** drive activate, real-change deactivate, activate, real-change deactivate. The next overflowing measurement stays idle with `capped: true` and `activations === 2`.
   - **Session reset:** `INITIAL_MARQUEE_GATE` activates again.
   - **Unusable input** (`NaN` / `-1` / `Infinity`): the gate comes back unchanged.
   - **Loop property:** feed 1,000 alternating idle and active disagreeing measurements through the gate, toggling the measurement mode the way the component would. Assert `activations ≤ 2` and fewer than or equal to 4 `active` transitions in total.
   - **`scrollTimeline(150)`** gives the same distance and duration maths as `marqueeTimeline` (`distancePx = 190`). `marqueeTimeline` returns results identical to before for every existing case.
2. **Apply the minimal fix** per §2a and §2b.
3. **Verify the fix** by re-running the narrow test, and confirm it passes.
4. **Browser reproduction (Chromium, local dev, `--workers=1`):**
   - Before navigating, simulate Firefox's disagreement with an init script. It overrides `HTMLElement.prototype.scrollWidth` so that `.placard-track-text` elements report `0`.
   - Play the overflowing album. Over 5 s, assert that:
     - `.placard-track-name` changes class at most twice;
     - a 50 ms `setInterval` probe never sees a gap over 250 ms;
     - the line stays `.is-marquee` with one running animation.
   - On PR #11's code this simulation should loop. If it's practical, record the before and after in `verification.md`.
   - Then remove the override and rerun the normal `tests.md` checks: the hold, the seamless loop, the stop paths, reduced motion, and the idle pixelmatch (0 diffs).
5. **Full regression suite:** `npx vitest run && npx tsc --noEmit && npx eslint . && npm run build`. Run Vitest directly, not under `safe-test`, which runs out of memory on this repo. Confirm everything is clean.

## 6. Surgical Patch Checklist

- [ ] P01.1 Add the failing gate and `scrollTimeline` tests, run `npx vitest run src/components/wall/__tests__/placardMarquee.test.ts`, and confirm they fail.
- [ ] P01.2 Implement `stepMarqueeGate`, `INITIAL_MARQUEE_GATE`, `scrollTimeline` and `maxActivationsPerPlay` in `placardMarquee.ts`, and update the `MARQUEE_CFG` pin.
- [ ] P01.3 Rewire the `PlacardTrackLine` effect in `AlbumPlacard.tsx` (L122-L265) through the gate, with the per-play reset and the one-shot cap warning.
- [ ] P01.4 Narrow test PASS. Full suite, `tsc`, `eslint` and `build` clean. Chromium browser checks done, including the simulated-disagreement run and an idle pixelmatch with 0 diffs.
- [ ] P01.5 Add the spec scenario to both spec files. Update `verification.md`, mark PATCH-01 RESOLVED in `patch.md`, and tick P01.x in `tasks.md`.
- [ ] P01.6 Commit with explicit paths, push `fix/placard-marquee-firefox-freeze`, and open the PR. Leave it unmerged.
