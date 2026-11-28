> [!NOTE]
> This document specifies **technical system architecture only**: data flow, state and the postMessage protocol.
> The timecode's visual behaviour is in `design.md`.

## Context

**Today's flow.** A click on `.soundtrack-facade` dispatches `enter-album` (if needed) and `play`. The reducer sets `activeAlbumId`, `playing: true` and `captureLayerActive: true` in one step (`soundtrackState.ts:111-121`).
- `PlacardTimecode` starts a `performance.now()` interval as soon as `playing` is true (`AlbumPlacard.tsx:59-76`).
- The marquee anchors its first hold on the same flip (`AlbumPlacard.tsx:140-151`).
- The iframe is a black box: no `enablejsapi` and no message listener.

**Constraints.**
- **CSP:** the public CSP forbids `www.youtube.com` (`csp.ts:11`), which rules out the official `iframe_api`.
- **Re-renders:** `GalleryCanvas` subscribes to the whole `soundtrack` slice (`GalleryCanvas.tsx:315`). Any high-frequency write to that slice re-renders the whole wall.
- **Single player:** at most one iframe, per the existing requirement. The bridge therefore only ever talks to one window.

## System Architecture Diagram

```mermaid
sequenceDiagram
  participant V as Visitor
  participant P as SoundtrackPlaque
  participant S as useWallStore.soundtrack
  participant C as useWallStore.soundtrackClock
  participant Y as youtube-nocookie iframe
  participant T as PlacardTimecode
  V->>P: click facade
  P->>S: play(albumId)  (activeAlbumId, playing=false, capture armed)
  P->>Y: mount ?autoplay=1&enablejsapi=1&origin=…
  Y-->>P: load
  loop every 250ms until first message (max 3000ms)
    P->>Y: postMessage {"event":"listening",…}
  end
  Y-->>P: message (origin + source checked)
  P->>P: parseYoutubeMessage()
  alt state changed
    P->>S: player-state(state)   (playing = state===1; 0 => track-ended)
  end
  alt currentTime present
    P->>C: setSoundtrackClock({albumId, positionSec, at})
  end
  T->>C: subscribe; interpolate while S.playing
  Note over P: no 1/3 within 1500ms of first message and last state is -1/5 → lift-capture-layer
  Note over P: no message within 3000ms of load → bridge-unavailable (playing=true, wall clock)
```

## Goals / Non-Goals

**Goals**
- `playing` reflects the player's real state.
- The timecode tracks the reported position within 1 s.
- Refused autoplay costs exactly one more click.
- No CSP change and no new dependency.
- No additional `GalleryCanvas` renders per position report.

**Non-goals**
- Seek and pause controls outside the iframe.
- Muted autoplay.
- Studio's duration probe in `FolderDropzone` (it keeps its own IFrame API path).
- Any change to the one-iframe rule, the album-switch rules or the zoom-out stop rules.

## Technical Decisions

### D1. A raw postMessage bridge instead of the IFrame API script
- `youtubeBridge.ts` is pure: `parseYoutubeMessage(data: unknown): { state?: PlayerState; currentTime?: number } | null`, plus `listeningMessage(id)`.
- `SoundtrackPlaque` owns the side effects:
  - the iframe `ref`;
  - `onLoad`, which starts the `listening` retry timer;
  - a `window` `message` listener registered only while `iframeVisible`;
  - the origin and source checks.
- **Alternative rejected:** `iframe_api` and its wrappers, which need CSP `script-src https://www.youtube.com` on the public wall.

### D2. `playing` is driven by player state; `play` only mounts
- New events in the reducer:
  - `player-state { albumId, state }`;
  - `bridge-unavailable { albumId }`.
- Both are ignored unless `albumId === activeAlbumId`, which drops stale messages from a player being torn down.
- `player-state`:
  - `1` sets `playing: true`;
  - `-1`, `2`, `3`, `5` set `playing: false`;
  - `0` delegates to the existing `track-ended` branch.
  - When nothing changes, it returns the same state object, so zustand doesn't notify.
- `bridge-unavailable` sets `playing: true`: the legacy behaviour.
- `play` keeps `activeAlbumId` and `captureLayerActive: true`, but now sets `playing: false`.

### D3. The clock lives in a separate store key
- `useWallStore` gains:
  - `soundtrackClock: { albumId: string | null; positionSec: number; at: number }`;
  - `setSoundtrackClock(next)`.
- `GalleryCanvas`'s selector (`state.soundtrack`) is untouched, so position writes never re-render the wall.
- The clock resets to `{ albumId: null, positionSec: 0, at: 0 }` whenever `activeAlbumId` changes: via `play` for a new album, `stop`, `enter-overview` and album switches.
  - Implementation: `dispatchSoundtrack` compares the old and new `activeAlbumId` and resets the clock in the same `set` call.
- **Write throttle:** `SoundtrackPlaque` writes the clock when either of these holds:
  - the state changed;
  - `|reported − interpolated| > 0.75 s`.

  Steady playback therefore writes rarely, while seeks and pauses re-anchor immediately.

### D4. The timecode interpolates
- `PlacardTimecode` subscribes to `soundtrack.playing` (album-scoped, as today) and to `soundtrackClock` (album-scoped).
- While playing, a `250 ms` interval recomputes `floor(positionSec + (now − at)/1000)`, clamped to `[0, durationSec]`. React bails out when the second hasn't changed.
- While not playing, it shows `floor(positionSec)` if `clock.albumId === albumId`, otherwise `0`.
- In bridge-unavailable mode no clock writes arrive. `bridge-unavailable` sets the clock to `{ positionSec: 0, at: now }`, so the same interpolation reproduces the wall clock.

### D5. Refusal detection lives in the plaque, not the reducer
- It's time-based, so it stays out of the pure reducer.
- **Arming the timer:** on the first bridge message, start a `1500 ms` timeout.
- **Cancelling it:** any `1` or `3` report cancels the timeout.
- **Firing:** when it fires and the last state is `-1` or `5`, dispatch `lift-capture-layer`.
- **Cleanup:** all timers clear on iframe unmount.

### D6. Debug logging
- `const debug = useMemo(() => new URLSearchParams(location.search).has('debugSoundtrack'), [])`.
- `console.info('[soundtrack]', parsed)` runs only when `debug` is set.

## Risks / Trade-offs

- **[The widget protocol is undocumented and could change]** → The bridge-unavailable fallback restores exactly today's behaviour. Task 1.1 verifies the protocol live before anything else.
- **[`origin` param mismatch]** (for example `basePath` or preview hosts) → `window.location.origin` excludes the path, so it's correct for `/photos` and for preview domains.
- **[A late message from an unmounted iframe]** → Messages are album-scoped and checked against `activeAlbumId`, and the listener is removed on unmount.
- **[Visitors on browsers that refuse autoplay now see `0:00` until they click play]** → That's the correct behaviour. Previously the timer lied.
- **[Behaviour change for tests asserting `play ⇒ playing`]** → Those assertions are updated in `soundtrackState.test.ts`, with the justification recorded in verification.md.

## Migration & Rollback Plan

- No data or API migration.
- A single revertible commit for the behaviour, plus one for the tests. Reverting restores the wall clock.
