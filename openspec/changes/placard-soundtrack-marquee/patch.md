# Patch Log: `placard-soundtrack-marquee`

### [PATCH-01] Firefox tab freezes while the marquee runs
- **Date**: 2026-11-25 05:51:00 UTC
- **Feedback Source**: Manual Playtest (maintainer, Firefox, production build after PR #11)
- **Feedback Summary**:
  - **What happens:** clicking the soundtrack plaque on the third album (track line `Reminiscing — Little River Band`, about 190px of text in the 166px box) freezes the tab. The UI stops painting and stops taking input, while the YouTube iframe keeps playing audio because it runs in its own process. Firefox shows its "this page is slowing down Firefox" banner, which wrongly blames extensions.
  - **Confirmed cause:** with `about:config` › `ui.prefersReducedMotion = 1`, which makes `PlacardTrackLine` skip the marquee entirely, the freeze is gone. The fault is inside the marquee path.
  - **Not reproduced in Chromium:** against local dev with an overflowing title ("Take Me Home, Country Roads (Original Version)"), the line activated once and ran one animation, the DOM didn't change again over 8 seconds, and the main thread stayed responsive. Firefox can't launch in the agent sandbox (no `libgtk-3`).
  - **Category / Severity:** Logic bug (unbounded state oscillation) on a browser-dependent measurement. **Critical**: it hangs the public gallery.
- **Reported Issue / Raw Trace**:
  > "when I click on this third YouTube video which is reminiscing by Little River Band, the audio continues to play but the whole website is frozen, and then Firefox throws me a bunch of performance warnings and saying that my extensions are slowing the website … the tab is non-functioning." Then: "yeah that fixed it" (after `ui.prefersReducedMotion = 1`).
- **Root Cause**:
  - `PlacardTrackLine` decides whether the line overflows **separately in each DOM mode**, using different measurements in each:
    - **idle:** `box.scrollWidth` against `box.clientWidth`;
    - **active:** `textEl.scrollWidth` against `box.clientWidth − fade padding`, where `textEl` is a flex item inside `.placard-track`.
  - Whenever the two measurements disagree (idle says "overflows", active says "fits", or the reverse), nothing breaks the cycle. Overflow `setActive(true)` mounts the strip and re-runs the effect. The active measurement says "fits", `deactivate()` unmounts the strip and re-runs the effect, the idle measurement says "overflows", and so on forever.
  - Each lap toggles `.is-marquee`, which turns `mask-image` and the negative-margin gutter on and off. That forces a restyle and relayout of a `preserve-3d` world full of `backdrop-filter` placards and large prints, plus a React render, plus a fresh `ResizeObserver` and `document.fonts.ready` callback. In Gecko one lap is expensive enough that a continuous cycle pins the content process's main thread.
  - The code has no hysteresis and no cap on activations, so one measurement disagreement turns into a hang.
  - **Secondary, unconfirmed:** Gecko might also run the animation on the main thread inside the masked, `backdrop-filter`, `preserve-3d` context. That would be costly, but on its own it shouldn't hang the tab. It's deferred to a PATCH-02, which happens only if the preview still freezes.
- **Target Files**: `src/components/wall/placardMarquee.ts`, `src/components/wall/__tests__/placardMarquee.test.ts`, `src/components/wall/AlbumPlacard.tsx`, `openspec/changes/placard-soundtrack-marquee/specs/gallery-hud-and-curator-ui/spec.md`, `openspec/specs/gallery-hud-and-curator-ui/spec.md`
- **Resolution Strategy**:
  - **Pure gate:** move the activate/deactivate decision into a pure, unit-tested reducer `stepMarqueeGate(gate, measure, cfg)` in `placardMarquee.ts`. It has three properties:
    1. **Mode hand-off is trusted.** The first measurement after activating is adopted as the active baseline and never re-decides overflow. That alone breaks the idle/active disagreement loop.
    2. **Only real changes re-decide.** While active, the line deactivates only if the text or box width differs from the active baseline by more than `overflowEpsilonPx`, for example a late font load or a resize, and the new measurement fits.
    3. **Hard cap.** At most `MARQUEE_CFG.maxActivationsPerPlay = 2` activations per play session. Past the cap, the line stays idle with an ellipsis for the rest of that play.
  - **Scroll distance:** the animation's distance comes from an un-gated `scrollTimeline(textWidth)`, so an active line always has a timeline even when the active measurement claims it fits.
  - **Diagnostic warning:** when the cap trips, emit one `console.warn('[placard-marquee] activation cap reached', { idle, active })`. The preview then tells us directly whether Firefox was disagreeing.
  - **Unchanged:** no CSS change, and idle markup and pixels stay identical.
- **Status**: PENDING
