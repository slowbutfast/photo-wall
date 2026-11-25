## 1. Test Scaffolding (TDD)

- [ ] 1.1 Create `src/components/wall/__tests__/placardMarquee.test.ts` with failing tests for:
  - pinning `MARQUEE_CFG`;
  - `isOverflowing`, including the epsilon and degenerate inputs;
  - `marqueeTimeline` (`null` when the text fits; the 260/166 worked example; keyframe offsets; whole-pixel endpoints; the seamless-loop end at `-(textWidth + gap)`);
  - `remainingFirstHoldMs` clamping.
- [ ] 1.2 Run `npx vitest run src/components/wall/__tests__/placardMarquee.test.ts` and confirm it fails because the module is missing.

## 2. Timeline helper

- [ ] 2.1 Implement `src/components/wall/placardMarquee.ts` with `MARQUEE_CFG`, `isOverflowing`, `marqueeTimeline` and `remainingFirstHoldMs`, following architecture D1–D2. Round `distancePx` up to a whole pixel.
- [ ] 2.2 Re-run the narrow test file and confirm it passes.

## 3. Placard track line

- [ ] 3.1 In `src/components/wall/AlbumPlacard.tsx`, extract `PlacardTrackLine({ albumId, text })`:
  - **Markup:** box `span.placard-track-name[title]` › `span.placard-track` › `span.placard-track-text`, plus an `aria-hidden` duplicate only while active.
  - **Playing selector:** the same one `PlacardTimecode` uses.
  - **Anchor:** record `playStartedAt` when playing turns true.
  - Keep the placard `<button>` `aria-label` and all other placard markup unchanged.
- [ ] 3.2 Implement measurement (D4). While playing, use a `ResizeObserver` on the box and the text, `document.fonts.ready`, and re-measure when `text` changes. Disconnect when playing turns false or on unmount.
- [ ] 3.3 Implement the animation lifecycle (D2, D3, D6):
  - **Start:** `track.animate(keyframes, { duration, iterations: Infinity, delay: remainingFirstHoldMs(...) })`.
  - **Distance changes:** cancel and recreate.
  - **Stop:** `cancel()` when the line stops playing or overflowing, when reduced motion switches on, or on unmount.
  - Toggle `.is-marquee` on the box, and set `--marquee-gap` / `--marquee-fade` from `MARQUEE_CFG`.
- [ ] 3.4 Add the `prefers-reduced-motion` subscription via `useSyncExternalStore` (D5; SSR snapshot `false`).

## 4. Styles

- [ ] 4.1 In `src/styles/wall.css`, under `.playground-wall-root`, add rules for:
  - `.placard-track` (`display: inline-flex; gap: var(--marquee-gap)`, keeping `white-space: nowrap`);
  - `.placard-track-name.is-marquee`: `text-overflow: clip`; the `margin-inline: calc(-1 * var(--marquee-fade))` / `padding-inline: var(--marquee-fade)` gutter; and the `mask-image` / `-webkit-mask-image` edge fade.
  
  Don't change the existing idle `.placard-track-name` declarations, and don't add a permanent `will-change`.
- [ ] 4.2 Confirm `cssBoundaryAudit` is still green: no duplicate selectors across files, and nothing added to `hud.css` or `studio.css`.

## 5. Verification & Empirical Audit

- [ ] 5.1 Run `npx vitest run` (full suite), `npx tsc --noEmit`, `npx eslint .` and `npm run build`, and confirm all are clean. Record pass counts against the baseline.
- [ ] 5.2 Run every `tests.md` manual check on local dev:
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
- [ ] 5.3 Resolve the `research.md` Unverified assumptions: compare the constants against a Spotify mobile recording if one is available, and check jitter inside the scaled world. Move anything wrong to Superseded claims. If `MARQUEE_CFG` is retuned, update the pinned test and the spec values together.
- [ ] 5.4 Populate `verification.md` with:
  - the Requirement Adherence Matrix (every scenario in `specs/gallery-hud-and-curator-ui/spec.md` mapped to a test or manual check);
  - resolved assumptions;
  - a nomenclature audit (track line, marquee, hold, overflowing, playing);
  - verbatim logs.
