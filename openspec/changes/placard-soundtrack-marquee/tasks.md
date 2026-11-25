## 1. Test Scaffolding (TDD)

- [x] 1.1 Create `src/components/wall/__tests__/placardMarquee.test.ts` with failing tests for:
  - pinning `MARQUEE_CFG`;
  - `isOverflowing`, including the epsilon and degenerate inputs;
  - `marqueeTimeline` (`null` when the text fits; the 260/166 worked example; keyframe offsets; whole-pixel endpoints; the seamless-loop end at `-(textWidth + gap)`);
  - `remainingFirstHoldMs` clamping.
- [x] 1.2 Run `npx vitest run src/components/wall/__tests__/placardMarquee.test.ts` and confirm it fails because the module is missing.

## 2. Timeline helper

- [x] 2.1 Implement `src/components/wall/placardMarquee.ts` with `MARQUEE_CFG`, `isOverflowing`, `marqueeTimeline` and `remainingFirstHoldMs`, following architecture D1–D2. Round `distancePx` up to a whole pixel.
- [x] 2.2 Re-run the narrow test file and confirm it passes.

## 3. Placard track line

- [x] 3.1 In `src/components/wall/AlbumPlacard.tsx`, extract `PlacardTrackLine({ albumId, text })`:
  - **Markup:** box `span.placard-track-name[title]` › `span.placard-track` › `span.placard-track-text`, plus an `aria-hidden` duplicate only while active.
  - **Playing selector:** the same one `PlacardTimecode` uses.
  - **Anchor:** record `playStartedAt` when playing turns true.
  - Keep the placard `<button>` `aria-label` and all other placard markup unchanged.
- [x] 3.2 Implement measurement (D4). While playing, use a `ResizeObserver` on the box and the text, `document.fonts.ready`, and re-measure when `text` changes. Disconnect when playing turns false or on unmount.
- [x] 3.3 Implement the animation lifecycle (D2, D3, D6):
  - **Start:** `track.animate(keyframes, { duration, iterations: Infinity, delay: remainingFirstHoldMs(...) })`.
  - **Distance changes:** cancel and recreate.
  - **Stop:** `cancel()` when the line stops playing or overflowing, when reduced motion switches on, or on unmount.
  - Toggle `.is-marquee` on the box, and set `--marquee-gap` / `--marquee-fade` from `MARQUEE_CFG`.
- [x] 3.4 Add the `prefers-reduced-motion` subscription via `useSyncExternalStore` (D5; SSR snapshot `false`).

## 4. Styles

- [x] 4.1 In `src/styles/wall.css`, under `.playground-wall-root`, add rules for:
  - `.placard-track` (`display: inline-flex; gap: var(--marquee-gap)`, keeping `white-space: nowrap`);
  - `.placard-track-name.is-marquee`: `text-overflow: clip`; the `margin-inline: calc(-1 * var(--marquee-fade))` / `padding-inline: var(--marquee-fade)` gutter; and the `mask-image` / `-webkit-mask-image` edge fade.
  
  Don't change the existing idle `.placard-track-name` declarations, and don't add a permanent `will-change`.
- [x] 4.2 Confirm `cssBoundaryAudit` is still green: no duplicate selectors across files, and nothing added to `hud.css` or `studio.css`.

## 5. Verification & Empirical Audit

- [x] 5.1 Run `npx vitest run` (full suite), `npx tsc --noEmit`, `npx eslint .` and `npm run build`, and confirm all are clean. Record pass counts against the baseline.
- [x] 5.2 Run every `tests.md` manual check on local dev:
  - hold timing;
  - seamless loop (Animations panel at 10%);
  - resting x unchanged;
  - short title;
  - all four stop paths;
  - reduced motion;
  - Accessibility tree;
  - Performance trace and raster crispness;
  - idle-state pixelmatch with 0 diffs;
  - Studio preview.
  > **PASS** in the orchestrator's local-only Playwright pass (port 3213, disposable local DB, `STORAGE_DRIVER=local`). Hold 2000 ms then 30 px/s; exact cycle periodicity (0 pixel diff); idle pixelmatch 0/0; stop/recovery and reduced-motion all verified; CDP AX tree shows one `StaticText`; 0 rAF and 3 layouts over 3 s; high-DPI screenshots crisp; Studio preview identical. Full evidence in `verification.md` › *Orchestrator Browser Verification*.
- [x] 5.3 Resolve the `research.md` Unverified assumptions: compare the constants against a Spotify mobile recording if one is available, and check jitter inside the scaled world. Move anything wrong to Superseded claims. If `MARQUEE_CFG` is retuned, update the pinned test and the spec values together.
  > Resolved: constants are pinned by test; the ellipsis-vs-track structure and the 260/166 math are verified; the in-world smoothness trace is green (0 rAF, 3 layouts / 3 s, crisp 3× screenshots); no claim was falsified. **Maintainer manual item:** a frame-by-frame Spotify mobile recording to judge whether the retained 2000 ms / 30 px/s / 40 px / 12 px values "feel like Spotify". Not invented here; no retune made.
- [x] 5.4 Populate `verification.md` with:
  - the Requirement Adherence Matrix (every scenario in `specs/gallery-hud-and-curator-ui/spec.md` mapped to a test or manual check);
  - resolved assumptions;
  - a nomenclature audit (track line, marquee, hold, overflowing, playing);
  - verbatim logs.

## Patch 01: Firefox tab freezes while the marquee runs

- [ ] P01.1 Add failing `stepMarqueeGate` / `scrollTimeline` tests in `placardMarquee.test.ts`, covering:
  - a simulated idle "overflows" / active "fits" disagreement, which must stay active with no oscillation;
  - the reverse disagreement;
  - a real change after a late font load, which deactivates;
  - the activation cap at 2;
  - a reset on a new play.

  Then run the narrow test and confirm it fails.
- [ ] P01.2 Implement `stepMarqueeGate`, `scrollTimeline` and `maxActivationsPerPlay` in `placardMarquee.ts`, and update the pinned `MARQUEE_CFG` test.
- [ ] P01.3 Rewire the `PlacardTrackLine` effect in `AlbumPlacard.tsx` through the gate, with the gate held in a ref and reset per play, plus the one-shot cap `console.warn`.
- [ ] P01.4 Run the narrow test (pass), the full suite, `tsc`, `eslint` and `build`, then rerun the browser checks from `tests.md` in Chromium, including the idle pixelmatch (0 diffs).
- [ ] P01.5 Add the "measurement disagreement never oscillates" scenario to the change delta spec and the main spec, update `verification.md`, and mark PATCH-01 RESOLVED in `patch.md`.
