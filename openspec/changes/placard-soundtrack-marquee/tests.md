## Automated Tests

Runner: `npx vitest run` (Node environment). For the narrow loop, run `npx vitest run src/components/wall/__tests__/placardMarquee.test.ts`. Don't use `safe-test`.

- `placardMarquee.test.ts` › `MARQUEE_CFG` pins `{ holdMs: 2000, speedPxPerSec: 30, gapPx: 40, fadePx: 12, overflowEpsilonPx: 1 }` exactly.
- `isOverflowing`:
  - `textWidth === boxWidth` → false;
  - `boxWidth + 1` → false (within the epsilon);
  - `boxWidth + 1.5` → true;
  - non-finite or negative inputs → false.
- `marqueeTimeline`:
  - returns `null` when the line fits;
  - for `textWidth 260`, `boxWidth 166`:
    - `distancePx === 300`
    - `scrollMs === 10000`
    - `durationMs === 12000`
    - `holdOffset === 2000/12000`
  - keyframes are `[0 @0, 0 @holdOffset, -300px @1]`, and the endpoints are whole pixels when `textWidth` is fractional (rounded up);
  - **seamless loop:** the final translate equals `-(textWidth + gap)`, so the duplicate starts at x = 0.
- `remainingFirstHoldMs`: `0 → 2000`, `500 → 1500`, `2500 → 0`, and it never goes negative.
- `cssBoundaryAudit.test.ts` (existing) stays green. The new rules live only in `wall.css`, under `.playground-wall-root`.
- Full suite: `npx vitest run`, plus `npx tsc --noEmit`, `npx eslint .` and `npm run build`, all clean.

## Manual Verification

Use local dev (`npm run dev`) with a seeded album whose soundtrack title and artist overflow, plus one album that fits. Don't write to the preview or production databases. Playback is read-only, so viewing the production `/photos` page is fine for a final look.

- **Hold, then scroll:**
  - **WHEN** you play the long-title album and start a stopwatch
  - **THEN** the line stays still for about 2 s, then glides left at a steady pace with a trailing copy, with soft edges on both sides
- **Seamless loop:**
  - **WHEN** you watch two full cycles (use the DevTools Animations panel at 10% speed)
  - **THEN** there's no jump at the seam, and each cycle holds for 2 s before moving
- **Resting position unchanged:**
  - **WHEN** you compare the first glyph's x position idle versus during the hold
  - **THEN** it's identical, because the fade sits in the padding gutter
- **Short title:**
  - **WHEN** you play the fitting album
  - **THEN** nothing moves, there's no fade, and no duplicate in the DOM
- **Stop paths:**
  - **WHEN** you stop playback, let the track end, return to overview, or start another album
  - **THEN** the line snaps back to the start with the ellipsis, and the Animations panel shows nothing running
- **Reduced motion:**
  - **WHEN** you enable DevTools Rendering › Emulate `prefers-reduced-motion: reduce` and play the long album
  - **THEN** the line stays static with the ellipsis
- **Accessibility:**
  - **WHEN** you inspect the Accessibility tree while the marquee is active
  - **THEN** the title appears once, and the placard button's name is unchanged
- **Performance and raster:**
  - **WHEN** you record a Performance trace at album tier while the marquee runs
  - **THEN** there are no main-thread per-frame tasks from the ticker and no layout thrash, and the text stays crisp (no soft raster)
- **Visual regression:**
  - **WHEN** you run the pixelmatch and computed-style harness from `gallery-style-and-canvas-refactor` on idle states
  - **THEN** there are 0 diffs. Only the playing-and-overflowing state changes.
- **Studio preview:**
  - **WHEN** you play the same album in `/photos/admin`'s preview canvas
  - **THEN** the ticker behaves identically
