## ADDED Requirements

### Requirement: Placard timecode follows the player's reported playback position
`soundtrack.playing` SHALL mean that the mounted player has reported YouTube player state `1` (PLAYING) and hasn't since reported `-1`, `0`, `2`, `3` or `5`.

Clicking a soundtrack facade SHALL mount the player with `playing: false`. A `player-state` event carrying a state of `1` SHALL set `playing: true`, and any other state SHALL set it false. State `0` SHALL additionally apply the existing `track-ended` transition.

The reported position SHALL be held in a `soundtrackClock` store key, `{ albumId, positionSec, at }`, separate from the `soundtrack` slice. `positionSec` is the last reported `currentTime`; `at` is the `performance.now()` time the report arrived. Writes to `soundtrackClock` SHALL NOT change the identity of `useWallStore.getState().soundtrack`.

The placard timecode SHALL read:
- `0:00` while the player is mounted but not playing and no position has been reported;
- `positionSec + (now − at) / 1000`, clamped to `[0, durationSec]` and floored to whole seconds, while playing;
- the last reported `positionSec` while paused or buffering.

It SHALL keep its `M:SS / M:SS` format and `tabular-nums`. If the bridge is unavailable (no message from the iframe within `3000ms` of its `load` event), the timecode SHALL fall back to the pre-change wall clock, started at the fallback moment.

#### Scenario: Refused autoplay leaves the timecode at zero
- **WHEN** a visitor clicks an unplayed soundtrack facade and the player reports `-1` and then `5`, but never `1`
- **THEN** the placard timecode SHALL read `0:00 / <duration>` for as long as the player stays unstarted, and the track line marquee SHALL NOT start

#### Scenario: Timecode starts when the video starts
- **WHEN** the player reports `3` (buffering) for 2 s after the click, then `1` with `currentTime` `0.2`
- **THEN** the timecode SHALL read `0:00` throughout the buffering, then advance from the PLAYING report, staying within `1s` of the player's reported `currentTime` at every later report

#### Scenario: Pausing in the YouTube controls pauses the timecode
- **WHEN** a playing video reaches `0:42` and the visitor pauses it in the YouTube player (state `2`, `currentTime` `42.3`)
- **THEN** the timecode SHALL hold `0:42`, `soundtrack.playing` SHALL be false, and the marquee SHALL stop and return to its start position

#### Scenario: Track end stops the clock
- **WHEN** the player reports state `0`
- **THEN** `soundtrack.playing` SHALL be false through the `track-ended` transition, and the timecode SHALL stop at no more than `durationSec`

#### Scenario: Position reports do not re-render the wall
- **WHEN** the player sends ten consecutive `infoDelivery` messages that change only `currentTime`
- **THEN** `useWallStore.getState().soundtrack` SHALL keep the same object identity across all ten, and only `soundtrackClock` SHALL change

#### Scenario: Silent bridge falls back to the wall clock
- **WHEN** the iframe fires `load` and sends no message for `3000ms`
- **THEN** `soundtrack.playing` SHALL become true and the timecode SHALL tick as a wall clock from that moment, matching the pre-change behaviour

## MODIFIED Requirements

### Requirement: Playing soundtrack track line scrolls as a Spotify-style marquee when it overflows
`AlbumPlacard`'s **track line** (`Song Title — Artist`) SHALL become a seamless horizontal marquee only while both of these hold:
- that album's soundtrack is **playing** (`soundtrack.playing && soundtrack.activeAlbumId === album.id`), where `playing` means the player reported PLAYING, as defined by "Placard timecode follows the player's reported playback position";
- the line is **overflowing** (laid-out text width exceeds the line's box width by more than `1px`).

The marquee timeline SHALL repeat indefinitely with these phases:
1. A `2000ms` **hold** at the start position, measured from when playing became true (the first PLAYING report after the click, not the click itself).
2. A linear scroll left, at `30px/s`, by exactly `textWidth + 40px`. During the scroll an `aria-hidden` duplicate of the text, `40px` behind the original, arrives at the original's start position.
3. An instant restart that is visually seamless, followed by the next `2000ms` hold.

While the marquee is active, both edges of the line SHALL fade out over `12px`. When it's inactive, the line SHALL truncate with an ellipsis, exactly as it does today.

When playing becomes false, or the line stops overflowing, the marquee SHALL stop immediately and the line SHALL return to its start position. Under `prefers-reduced-motion: reduce`, the marquee SHALL never run.

The timing constants SHALL live in one exported constant. The placard SHALL remain a fixed `214×200px`, and the timecode SHALL be unaffected.

#### Scenario: Long title holds two seconds after play, then scrolls
- **WHEN** a visitor plays an album whose track line `A Very Long Song Title That Keeps Going — Some Artist Name` overflows the placard
- **THEN** the line SHALL stay at its start position for `2000ms` after the player first reports PLAYING, then scroll left at a constant `30px/s`

#### Scenario: The loop is seamless and holds before every cycle
- **WHEN** the marquee completes a scroll cycle
- **THEN** the duplicate text SHALL sit exactly where the original began, the restart SHALL produce no visible jump, and the line SHALL hold for `2000ms` before scrolling again

#### Scenario: Short titles never move
- **WHEN** an album whose track line fits within the placard is played
- **THEN** no animation SHALL run, no duplicate SHALL render, and no edge fade SHALL apply

#### Scenario: Idle placards keep the ellipsis
- **WHEN** an album with an overflowing track line is not playing (for example before play, or while another album is playing)
- **THEN** its track line SHALL be static and truncated with an ellipsis

#### Scenario: Stopping playback snaps the line back
- **WHEN** the soundtrack stops via stop, track end, returning to overview, or another album starting
- **THEN** the animation SHALL be cancelled, the duplicate SHALL be removed, and the line SHALL show its start with an ellipsis

#### Scenario: Reduced motion disables the ticker
- **WHEN** the visitor's OS requests `prefers-reduced-motion: reduce` and they play an album with an overflowing track line
- **THEN** the line SHALL remain static with an ellipsis, and its full text SHALL remain available via the `title` attribute

#### Scenario: Late font load re-evaluates overflow
- **WHEN** the line is measured before TeX Gyre Heros finishes loading and its width changes afterwards
- **THEN** overflow and scroll distance SHALL be re-measured, and the marquee SHALL start, stop or adjust its distance to match

#### Scenario: Accessibility tree sees the title once
- **WHEN** the marquee is active
- **THEN** the duplicate copy SHALL be `aria-hidden="true"`, and the placard button's accessible name SHALL be unchanged

#### Scenario: Measurement disagreement never oscillates
- **WHEN** the browser reports the playing track line as overflowing in its idle layout but fitting once the marquee strip is mounted (or the reverse)
- **THEN** the marquee SHALL activate at most `2` times for that play session, SHALL NOT toggle on every measurement, and the page SHALL stay responsive
