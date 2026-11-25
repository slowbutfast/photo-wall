> [!NOTE]
> This document specifies **technical system architecture only** (data flow, storage, APIs, concurrency, state synchronization, and security).
> All visual, aesthetic, and UI design decisions (colors, typography, component styling, responsive layout) must be defined in `design.md`.

## Context

`AlbumPlacard.tsx` renders the track line as a single `<span class="placard-track-name">`, truncated with an ellipsis. A sibling, `PlacardTimecode`, already derives **playing** from `useWallStore` and anchors a local clock to the click. The public CSP deliberately has no YouTube IFrame API, so the click is the only playback signal. The placard lives inside `.wall-world`, which is CSS `scale()`d and uses `translateZ`/`preserve-3d`. Layout widths (`scrollWidth`/`clientWidth`) aren't affected by those transforms. Only one album can be playing at a time.

## System Architecture Diagram

```mermaid
flowchart LR
  S[useWallStore.soundtrack<br/>playing && activeAlbumId===id] --> P[PlacardTrackLine]
  M[matchMedia prefers-reduced-motion] --> P
  RO[ResizeObserver on box + text<br/>+ document.fonts.ready] --> P
  P -->|textWidth, boxWidth| T[placardMarquee.marqueeTimeline]
  T -->|null → static ellipsis| P
  T -->|keyframes, durationMs| W[track.animate(..., iterations: Infinity)]
  P -->|playing false / unmount / overflow lost| C[animation.cancel()]
```

## Goals / Non-Goals

**Goals:**
- A ticker that is deterministic, compositor-only, and starts 2 s after the click. It runs only while the line is both playing and overflowing.
- Timing and geometry are pure functions, unit-tested in the Node Vitest environment.
- No change to the placard's size, the timecode, the store, the soundtrack reducer, or the CSP.

**Non-Goals:**
- Syncing to real audio start, scrolling other lines, scrolling while idle, or any change to the Soundtrack Plaque.

## Technical Decisions

**D1: A pure helper, `src/components/wall/placardMarquee.ts`.**
- **Constants:**
  - `MARQUEE_CFG = { holdMs: 2000, speedPxPerSec: 30, gapPx: 40, fadePx: 12, overflowEpsilonPx: 1 } as const`
- **Functions:**
  - `isOverflowing(textWidth, boxWidth)` is true when `textWidth - boxWidth > overflowEpsilonPx`.
  - `marqueeTimeline(textWidth, boxWidth, cfg = MARQUEE_CFG)` returns `null` when the line isn't overflowing. Otherwise it returns `{ distancePx, scrollMs, durationMs, holdOffset, keyframes }`:
    - `distancePx = textWidth + gapPx`
    - `scrollMs = distancePx / speedPxPerSec * 1000`
    - `durationMs = holdMs + scrollMs`
    - `holdOffset = holdMs / durationMs`
    - `keyframes = [{ transform: 'translateX(0px)', offset: 0 }, { transform: 'translateX(0px)', offset: holdOffset }, { transform: 'translateX(-distancePx px)', offset: 1 }]`, with `easing: 'linear'`
  - `remainingFirstHoldMs(elapsedSincePlayMs, cfg)` returns `max(0, holdMs - elapsed)`.
- **Why:** the hold is a fixed duration while the scroll length depends on the text. Per-title keyframe offsets are trivial in WAAPI and awkward in static CSS (research: Candidate tech).

**D2: Build the hold into each iteration.** One `animate(keyframes, { duration: durationMs, iterations: Infinity })` gives "hold 2 s → scroll" on every cycle, including the first. At the end of a cycle the duplicate sits exactly at `x = 0`, so iteration *n + 1* starting at `translateX(0)` is visually identical. That's what makes the loop seamless.

**D3: Anchor the first hold to the play click, not to the measurement.**
- `PlacardTrackLine` records `playStartedAt = performance.now()` when playing turns true. That's the same moment `PlacardTimecode` anchors to.
- If overflow is first detected later (fonts or layout), the animation starts with `delay: remainingFirstHoldMs(now - playStartedAt)`, and `iterationStart` is left at 0. Either way the first scroll begins 2 s after the click, never later.
- A re-measure while running (distance changed) cancels and recreates the animation at the start, with zero delay. Each cycle's hold still applies.

**D4: Measurement.**
- **Markup:** a box `span.placard-track-name` wraps a track `span.placard-track`. The track holds `span.placard-track-text`, plus `span.placard-track-text[aria-hidden]` while active.
- **Widths:** `textWidth` is the first text span's `scrollWidth` (with `white-space: nowrap`), and `boxWidth` is the box's `clientWidth`.
- **Re-measuring:** a `ResizeObserver` on both, plus `document.fonts.ready.then(remeasure)`, plus re-measuring whenever `trackLine` changes. All of this runs only while playing, so idle placards attach no observers.
- **Cleanup:** observers disconnect when playing turns false or the component unmounts.

**D5: Reduced motion.** `window.matchMedia('(prefers-reduced-motion: reduce)')` is read via a small `useSyncExternalStore` subscription (SSR snapshot `false`). When it's true, `marqueeTimeline` isn't consulted and no animation is created. Nothing in the app does this today, so the hook stays local to `AlbumPlacard.tsx` and doesn't become a shared utility.

**D6: Stopping.**
- **When:** playing turns false, overflow is lost, reduced motion switches on, or the component unmounts.
- **What happens:** `animation.cancel()` runs, which restores the start transform. The duplicate span unmounts and the `.is-marquee` class is removed, which brings the ellipsis back.
- **Not paused:** the animation is never left in a paused state, so there's nothing to resume or leak.

**D7: Compositor-only.** The animation touches `transform` alone, and the edge fade is a static `mask-image` on the box while `.is-marquee` is set (see `design.md`). There's no `requestAnimationFrame`, and React doesn't re-render per frame. At most one animation exists app-wide, because only one album can be playing.

## Risks / Trade-offs

- **[Risk]** YouTube buffers longer than 2 s, so the ticker starts before the audio. → This is accepted, and documented in research. It's the same anchor the timecode already uses, so the two stay consistent with each other.
- **[Risk]** The text renders soft or jitters inside the scaled 3D world. → Translate by whole-pixel keyframe endpoints. Verify with a Performance trace and a visual check at album tier (research: Unverified assumptions). If it jitters, fall back to `will-change: transform` on the track **only while active**. Never set it permanently: PR #9 showed what a permanent `will-change` does to raster quality.
- **[Risk]** Spotify's exact constants differ from ours. → They live in one place (`MARQUEE_CFG`), and a unit test pins them so any change is deliberate.
- **[Trade-off]** The marquee uses the edge-fade mask instead of the ellipsis while active. That's the Spotify look. An ellipsis can't coexist with a moving line.

## Migration & Rollback Plan

- There's no data, API or env impact. Rollback means reverting the commit.
- The screenshot comparison from `gallery-style-and-canvas-refactor` must show **no diffs on idle states**. Only the playing-and-overflowing state is expected to change.
