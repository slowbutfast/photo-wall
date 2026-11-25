## Why

Most real song titles with an artist don't fit the placard. The **track line** has about 166 px to work with, at 11.5 px bold, so anything over roughly 28 characters gets cut off with an ellipsis (research: Verified facts). While a song is actually playing, the visitor can't read what it is. Spotify solves exactly this with a now-playing ticker that waits, then scrolls the full title in a seamless loop. Matching that pattern makes the playing state legible without changing the fixed placard size.

## What Changes

- While an album's soundtrack is **playing** and its track line is **overflowing**, the line becomes a Spotify-style **marquee**:
  - It **holds** at the start for 2 s from the play click.
  - It then scrolls left at a constant 30 px/s, followed by a duplicate 40 px behind, until the duplicate reaches the start position.
  - The cycle repeats seamlessly, with the same 2 s hold before each cycle.
  - While the marquee is active, both edges fade over 12 px.
- When playback stops (stop, track end, leaving to overview, or another album starting), the line snaps back to its start position and the ellipsis returns.
- Track lines that fit never move. Idle placards are unchanged.
- `prefers-reduced-motion: reduce` disables the scroll. The line keeps the ellipsis, and the full text stays available via `title`.
- If the font loads late or the text changes, the overflow is re-measured, so the ticker starts or stops correctly.
- This applies wherever `AlbumPlacard` renders: on `/photos` and in the Studio preview.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gallery-hud-and-curator-ui`: adds a requirement for the playing-state soundtrack ticker on the fixed-height placard. The existing anatomy and timecode requirement is unchanged.

## Impact

- **Code:**
  - `src/components/wall/placardMarquee.ts` (new). Pure timeline math and constants.
  - `src/components/wall/AlbumPlacard.tsx`. A `PlacardTrackLine` subcomponent with measurement, WAAPI and reduced-motion handling.
  - `src/styles/wall.css`. Marquee track, gap and edge-fade rules, scoped under `.playground-wall-root`.
  - `src/components/wall/__tests__/placardMarquee.test.ts` (new).
- **APIs, DB, dependencies:** none.
- **Performance:** at most one animation at a time, since only one album can be playing. It's a `transform`-only animation on the compositor, with no per-frame React work.
- **Accessibility:** the duplicate copy is `aria-hidden`, the accessible name doesn't change, and reduced motion is honoured. This is the first place the app checks `prefers-reduced-motion`.
