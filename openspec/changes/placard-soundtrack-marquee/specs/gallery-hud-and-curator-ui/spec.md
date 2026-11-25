## ADDED Requirements

### Requirement: Playing soundtrack track line scrolls as a Spotify-style marquee when it overflows
`AlbumPlacard`'s **track line** (`Song Title — Artist`) SHALL become a seamless horizontal marquee only while both of these hold:
- that album's soundtrack is **playing** (`soundtrack.playing && soundtrack.activeAlbumId === album.id`);
- the line is **overflowing** (laid-out text width exceeds the line's box width by more than `1px`).

The marquee timeline SHALL repeat indefinitely with these phases:
1. A `2000ms` **hold** at the start position, measured from when playing became true.
2. A linear scroll left, at `30px/s`, by exactly `textWidth + 40px`. During the scroll an `aria-hidden` duplicate of the text, `40px` behind the original, arrives at the original's start position.
3. An instant restart that is visually seamless, followed by the next `2000ms` hold.

While the marquee is active, both edges of the line SHALL fade out over `12px`. When it's inactive, the line SHALL truncate with an ellipsis, exactly as it does today.

When playing becomes false, or the line stops overflowing, the marquee SHALL stop immediately and the line SHALL return to its start position. Under `prefers-reduced-motion: reduce`, the marquee SHALL never run.

The timing constants SHALL live in one exported constant. The placard SHALL remain a fixed `214×200px`, and the timecode SHALL be unaffected.

#### Scenario: Long title holds two seconds after play, then scrolls
- **WHEN** a visitor plays an album whose track line `A Very Long Song Title That Keeps Going — Some Artist Name` overflows the placard
- **THEN** the line SHALL stay at its start position for `2000ms` after the play click, then scroll left at a constant `30px/s`

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
