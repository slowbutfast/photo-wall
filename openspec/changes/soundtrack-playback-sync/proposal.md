## Why

The placard timecode starts when the visitor clicks the soundtrack facade, not when the video plays. When the embed doesn't actually start (autoplay refused, slow buffering, an ad), the timer runs ahead of a silent player, and the maintainer sees the desync intermittently on desktop. If autoplay is refused, the armed capture layer also swallows the first click on YouTube's own play button, so starting playback takes two more clicks while the clock keeps running (research.md, Verified facts).

## What Changes

- The soundtrack embed URL gains `enablejsapi=1&origin=<page origin>`. `SoundtrackPlaque` opens a postMessage **bridge** to the iframe and parses the **player state** and position. No YouTube script is loaded, and the CSP is unchanged.
- **BREAKING (internal semantics):** `soundtrack.playing` now means the player reported PLAYING, not that the visitor clicked.
  - `play` mounts the player with `playing: false`.
  - A new `player-state` event drives `playing`.
  - Player state `0` dispatches the existing, until now unused, `track-ended`.
- A separate **soundtrack clock** store key (`{ positionSec, at }`) carries the reported position. Only `PlacardTimecode` subscribes to it, so `GalleryCanvas` doesn't re-render on every position report.
- The placard timecode shows the player's real position. It holds at `0:00` until playback starts, and it follows pauses, seeks and buffering.
- **Autoplay refused:** if the player stays unstarted or cued for 1.5 s after the bridge is ready, the capture layer lifts automatically, so one click on YouTube's play button starts playback.
- **Bridge unavailable** (no message within 3 s of the iframe loading): falls back to today's wall-clock behaviour, so the change is never worse than `main`.
- `?debugSoundtrack=1` logs bridge states to the console, to diagnose this on real browsers.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `3d-pbr-wall-and-lighting`: adds a requirement that the soundtrack plaque bridges player state and lifts the capture layer when autoplay is refused.
- `gallery-hud-and-curator-ui`:
  - adds a requirement that the placard timecode follows the player's reported position;
  - modifies the marquee requirement so its hold is measured from the start of playback, not from the click.

## Impact

- **Code:**
  - `src/components/wall/SoundtrackPlaque.tsx`
  - `src/components/wall/soundtrackState.ts`
  - `src/components/wall/AlbumPlacard.tsx` (`PlacardTimecode`, marquee anchor)
  - `src/store/useWallStore.ts` (the `soundtrackClock` key)
  - `src/components/wall/youtubeBridge.ts` `[NEW]`
- **Tests:** `soundtrackState.test.ts` (updated: `play` no longer implies `playing`), `youtubeBridge.test.ts` `[NEW]`, `placardMarquee.test.ts` (regression).
- **APIs, DB, CSP, dependencies:** none.
- **Shares `useWallStore.ts` with `print-glare-tap-toggle`,** on a different key.
