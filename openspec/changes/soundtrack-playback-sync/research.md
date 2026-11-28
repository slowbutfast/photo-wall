## Source material

**Maintainer, 2026-11-28, verbatim:**

> "can you investigate why on desktop sometimes when you play a YouTube video, sometimes when you press the thumbnail of an unplayed YouTube video, it like loads the YouTube video and then the timer starts but then the YouTube video doesn't actually start playing so then the YouTube video is desynced with the timer on the placard"

**Investigation summary (planning session, 2026-11-28, on `origin/main` @ `5188316`):**
- The placard timer is a wall clock started by the click. Nothing in the app reads the player's state.
- When the embed doesn't start (autoplay refused, buffering, ads, an unembeddable video), the timer runs anyway.
- If autoplay is refused, the armed capture layer also swallows the first click on YouTube's own play button.

### Raised but not acted on

- **Loading the official IFrame Player API script (`https://www.youtube.com/iframe_api`) on the public wall.** Rejected: `src/lib/security/csp.ts:11` deliberately keeps `www.youtube.com` out of the public policy. The Studio-only probe is the only place it's allowed.
- **Muted autoplay (`mute=1`) so autoplay always succeeds.** Rejected: a soundtrack that starts silent defeats the feature, and unmuting needs another click inside the iframe anyway.
- **Showing YouTube's live position in the HUD, or offering seek controls.** Out of scope. The timer only mirrors the player.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **player mounted** | `soundtrack.activeAlbumId === album.id`. The single `.soundtrack-iframe` exists for that album. | That audio is playing. |
| **playing** (after this change) | The player has reported state `1` (PLAYING) and hasn't since reported paused, buffering, ended or unstarted. | That the visitor clicked play. Before this change `playing` meant "clicked". This change redefines it. |
| **bridge** | The postMessage channel between `SoundtrackPlaque` and the YouTube embed (`enablejsapi=1`), and the pure parser in `youtubeBridge.ts`. | The official `YT.Player` JS API object. No YouTube script is loaded. |
| **player state** | YouTube's numeric state: `-1` unstarted, `0` ended, `1` playing, `2` paused, `3` buffering, `5` cued. | `SoundtrackViewMode` (`overview` / `album` / `print`). |
| **soundtrack clock** | `{ positionSec, at }`: the last position the player reported and the `performance.now()` time it arrived. The timecode interpolates from it. | The marquee timeline. That still runs from the moment `playing` became true. |
| **autoplay refused** | The bridge is ready, but within the grace period the state stays `-1` or `5`, with no `1` or `3`. | Buffering. State `3` means the player is trying to play. |
| **bridge unavailable** | No message from the iframe within the bridge timeout after `load`. | Autoplay refused. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| YouTube IFrame Player API reference (developers.google.com/youtube/iframe_api_reference) | `enablejsapi=1` and `origin` params; player state codes `-1, 0, 1, 2, 3, 5`. | Docs (study only) | 2026-11-28, from memory of the published reference; not re-fetched |
| The iframe_api widget protocol, as observed in the API script's behaviour | The parent posts `{"event":"listening","id":…,"channel":"widget"}`. The embed replies with JSON strings: `onReady`, `initialDelivery`, `infoDelivery` (`info.playerState`, `info.currentTime`) and `onStateChange`. | Not code-copied; approach only | 2026-11-28, **unverified in this environment**: see Unverified assumptions |
| Chrome autoplay policy (developer.chrome.com/blog/autoplay) | Cross-origin iframes need `allow="autoplay"` plus user activation on the top frame. A refused autoplay leaves the player cued. | Docs | 2026-11-28, from memory |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Raw postMessage bridge to `youtube-nocookie.com` (`enablejsapi=1`) | **Adopted** | No CSP change and no third-party script. A pure parser makes it testable. | 2026-11-28 |
| Official `iframe_api` script | Rejected | It's blocked by the public CSP on purpose (`csp.ts:11`), and it adds a third-party script to the public wall. | 2026-11-28 |
| `react-youtube` / `youtube-player` npm packages | Rejected | Both load `iframe_api`, so they hit the same CSP problem, and they're new dependencies. | 2026-11-28 |
| Keep the wall-clock timer, but start it on iframe `load` | Rejected | `load` fires before playback and also fires when autoplay is refused, so it doesn't fix the desync. | 2026-11-28 |

## Patterns adopted

- **Optimistic UI with server truth, applied to the player.** The click mounts the player immediately; only the player's own reports mark it as playing. Lands in `soundtrackState.ts`.
- **Interpolated clock with periodic re-anchoring,** the standard media-timeline technique. Lands in `PlacardTimecode`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `play` sets `playing: true` immediately | `soundtrackState.ts:111-121` | Read the source on `5188316` | 2026-11-28 | stable |
| The timecode is a wall clock from the moment `playing` flips | `AlbumPlacard.tsx:59-76` (`performance.now()` plus a 1 s `setInterval`) | Read the source | 2026-11-28 | stable |
| The marquee anchors on `playing` | `AlbumPlacard.tsx:140-151` (`playStartedAtRef`) | Read the source | 2026-11-28 | stable |
| Nothing dispatches `track-ended` | No call site outside the reducer and tests | `git grep` over `src` | 2026-11-28 | stable |
| Embed URL | `youtube-nocookie.com/embed/<id>?autoplay=1&rel=0&modestbranding=1&playsinline=1`, `allow="autoplay; encrypted-media; picture-in-picture"` | `SoundtrackPlaque.tsx:127-134` | 2026-11-28 | stable |
| Public CSP excludes `www.youtube.com`; `frame-src` allows `www.youtube-nocookie.com` | `csp.ts:11, 42-53` | Read the source | 2026-11-28 | stable |
| The capture layer is armed on `play` and lifted only by its own click | `soundtrackState.ts:118, 132-134`; `SoundtrackPlaque.tsx:137-144` | Read the source | 2026-11-28 | stable |
| `GalleryCanvas` subscribes to the whole `soundtrack` slice | `GalleryCanvas.tsx:315` (`useWallStore((state) => state.soundtrack)`) | Read the source | 2026-11-28 | stable |
| A store write per position report would re-render `GalleryCanvas` | Follows from the row above: a new object identity on every report | Reasoning from zustand selector semantics | 2026-11-28 | stable |

## Unverified assumptions

- **The widget protocol works through `youtube-nocookie.com` with `enablejsapi=1` and an `origin` param, replying to a raw `listening` message.** Checking it costs one local-dev Playwright run with network access (task 1.1). If it fails, the bridge-unavailable fallback keeps today's behaviour, so the change is never worse than `main`.
- **`infoDelivery` arrives often enough during playback (about every 250–500 ms) to re-anchor the clock.** Checked in the same run.
- **The maintainer's intermittent failure is autoplay refusal rather than long buffering.** The `?debugSoundtrack=1` log distinguishes the two. The fix covers both cases.

## Superseded claims

- *"The timer ticks when the soundtrack plays"* (the spec "Fixed-height placard anatomy…"). It actually ticked when the visitor clicked. This change replaces that behaviour.

## Links out

- `openspec/specs/3d-pbr-wall-and-lighting/spec.md`: the soundtrack plaque requirements
- `openspec/specs/gallery-hud-and-curator-ui/spec.md`: the placard timecode and marquee requirements
- `src/lib/security/csp.ts`
