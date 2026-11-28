# Verification: soundtrack-playback-sync

## 1. Executive summary

The placard timecode now follows the YouTube player instead of a clock started by the click.

- **Bridge:** the soundtrack embed is opened with `enablejsapi=1&origin=…`, and `SoundtrackPlaque` listens to the embed's own postMessage reports. No YouTube script is loaded and `csp.ts` has zero diff against `5188316`.
- **`playing`:** `play` now only mounts the player. `soundtrack.playing` flips on a player-state report of `1`.
- **Timecode:** it reads a separate `soundtrackClock` store key and interpolates between reports.
- **Refused autoplay:** the capture layer lifts 1.5 s after the first report when the player stays unstarted or cued.
- **Silent embed:** it falls back to the click-anchored clock after 3 s.

**Result:** the full suite passes (770/770 across 51 files), and tsc, eslint and the production build exit 0. The reported bug scenario was reproduced live on local dev and behaved as specified (§4).

**Not verified:** playback itself (state `1`) was never reached in this sandbox, so the live cadence of position reports during real playback is unconfirmed. Safari and Firefox refusal behaviour and the iPhone checks are `PENDING MANUAL DEVICE VERIFICATION` (§6).

## 2. Environment

- **Base:** `origin/main` @ `5188316`. **Branch:** `feat/multi-20261128-0606`.
- **Node:** v22.23.2. **Next.js:** 16.4.6 (Turbopack). **Vitest:** 5.1.1.
- **Local dev:** `next dev -p 3217`, `STORAGE_DRIVER=local`, local SQLite file, demo manifest (`?demo=4`). Nothing ran against preview or production.
- **Browser:** Playwright Chromium (headless) from `/tmp/dl/node_modules/playwright-core`, live network.
- **`node_modules`:** a hardlinked copy of the main checkout's, because Turbopack refuses a symlink that points outside the project root.
- **Commit:** `43e07fe`.

## 3. Requirement Adherence Audit Matrix

### `3d-pbr-wall-and-lighting`: "Soundtrack plaque bridges YouTube player state without loading YouTube script"

| Scenario | Verified by | Result |
| :--- | :--- | :--- |
| Refused autoplay needs one click, not two | `SoundtrackPlaque.test.tsx` › autoplay refusal › lifts the capture layer once, 1500 ms after the first message; live: `logs/3.2-live-sync.log` (layer present at +500 ms, gone by +2000 ms, debug line `autoplay refused, lifting the capture layer`) | PASS |
| Buffering is not mistaken for refusal | `SoundtrackPlaque.test.tsx` › does not mistake buffering for refusal (state 3 for 4000 ms, layer stays armed; state 1 afterwards still armed) | PASS |
| Foreign messages are ignored | `SoundtrackPlaque.test.tsx` › message filtering (wrong origin, wrong source, then the right one) | PASS |
| Malformed payloads never throw | `youtubeBridge.test.ts` › the `it.each` table of `'not json'`, `'{}'`, `42`, `null`, unknown events, non-finite times, unknown state codes, plus the hostile-input test | PASS |
| CSP is untouched | `git diff 5188316 -- src/lib/security/csp.ts` is empty (0 lines); `csp.test.ts` green and unedited (inside the 770) | PASS |

Also covered by the requirement text: embed params (`SoundtrackPlaque.test.tsx` › embed URL), the 250 ms handshake retry that stops at the first message and the 3000 ms give-up (› listening handshake), and debug logging only with `?debugSoundtrack=1` (› debug logging).

### `gallery-hud-and-curator-ui`: "Placard timecode follows the player's reported playback position"

| Scenario | Verified by | Result |
| :--- | :--- | :--- |
| Refused autoplay leaves the timecode at zero | `placardTimecode.test.tsx` › shows 0:00 while the player is mounted but not playing (advanced 5 s, still `0:00`); live: timecode `0:00 / 3:25` at all seven samples over 12 s | PASS |
| Timecode starts when the video starts | `placardTimecode.test.tsx` › follows the reported position while playing (`0:10` at the report, `0:13` at +3.2 s); `computeTimecodeSeconds` table; `SoundtrackPlaque.test.tsx` › follows play and pause reports | PASS (unit). Live PLAYING not reached, see §4 |
| Pausing in the YouTube controls pauses the timecode | `placardTimecode.test.tsx` › holds when the player pauses (10 s later still `0:42`); `SoundtrackPlaque.test.tsx` › follows play and pause reports (`playing` false, clock `42.3`) | PASS (unit) |
| Track end stops the clock | `soundtrackState.test.ts` › treats state 0 exactly like track-ended; `SoundtrackPlaque.test.tsx` › stops the track on state 0; `computeTimecodeSeconds` clamps to the duration | PASS |
| Position reports do not re-render the wall | `soundtrackClock.test.ts` › writes do not change the soundtrack slice identity (ten writes, same object); `SoundtrackPlaque.test.tsx` › writes the clock rarely (≤ 1 write across ten on-line reports) | PASS |
| Silent bridge falls back to the wall clock | `SoundtrackPlaque.test.tsx` › silent bridge (false at 2900 ms, true at 3100 ms, clock set); › does not fall back once the player has spoken | PASS |

### `gallery-hud-and-curator-ui`: MODIFIED "Playing soundtrack track line scrolls as a Spotify-style marquee…"

The marquee's code is unchanged. It keys its first hold off the `playing` flag (`AlbumPlacard.tsx:170-188`, `playStartedAtRef.current = playing ? performance.now() : null`), so the new meaning of `playing` moves the anchor from the click to the first PLAYING report with no marquee edit.

| Scenario | Verified by | Result |
| :--- | :--- | :--- |
| Long title holds two seconds after play, then scrolls (now: after the first PLAYING report) | Anchor on `playing` read in the source; `soundtrackState.test.ts` › `play` leaves `playing: false` and `player-state 1` sets it; `placardMarquee.test.ts` timeline tests unchanged and green | PASS (by construction; not exercised in a browser) |
| The loop is seamless, short titles never move, idle placards keep the ellipsis, stopping snaps back, reduced motion, late font load, accessibility tree, measurement disagreement | Unchanged code; `placardMarquee.test.ts` green and unedited | PASS (regression) |

## 4. Resolved assumptions and empirical proof

| Assumption (research.md) | Outcome | Evidence |
| :--- | :--- | :--- |
| The raw `listening` post works through `youtube-nocookie.com` with `enablejsapi=1&origin=…` | **Verified.** The embed answered within about 60 ms of `load` with `initialDelivery`, `onReady` and `infoDelivery` carrying `playerState` and `currentTime`. Repeated posts get `alreadyInitialized`, so the retry stops at the first message. | `logs/1.1-bridge-spike.log` |
| The maintainer's intermittent failure is autoplay refusal or a player that never starts | **Reproduced the failure mode live.** In this sandbox the embed reports `playerState: -1`, then `onError` with code `150` (embedding disabled for that video), and never reaches `1`. The old code would have shown the timer running to about `0:12` over the 12 s window. The new code held `0:00 / 3:25` for all 12 s and lifted the capture layer at about 1.5 s. | `logs/3.2-live-sync.log` |
| `infoDelivery` arrives often enough during playback (about every 250–500 ms) to re-anchor the clock | **Still unverified.** No playable video was reachable (headless Chromium from a datacenter IP got `errorCode: "auth"` in the spike and `150` in the live run), so state `1` was never observed. The design doesn't need a particular cadence: interpolation covers the gaps, and a reported position that drifts more than 0.75 s re-anchors. | `logs/1.1-bridge-spike.log`, `logs/3.2-live-sync.log` |
| `onStateChange` fires on the first PLAYING transition | **Unverified** for the same reason. The parser accepts it, and `infoDelivery.playerState` carries the same information. | — |

**Edited existing assertions** (all in `soundtrackState.test.ts`, justified by the redefinition of `playing`):
- The `playingA()` fixture now also delivers `player-state 1`, so every "while playing" assertion keeps its meaning.
- A new `mountedA()` fixture holds the post-`play` state.
- "mounts exactly one iframe on an explicit click" now asserts `playing === false` after `play`.
- "re-arms the capture layer after re-mounting the player" now asserts `playing === false`.

Nothing else was edited.

**Test-environment note:** the jsdom cleanup test asserts behaviour (no further handshake posts, no fallback, no reaction to a late message after unmount) rather than `vi.getTimerCount() === 0`. One timer outlives unmount in jsdom and exists before any bridge message, so it isn't ours.

## 5. Nomenclature audit (research.md glossary)

| Term | Where used | Consistent? |
| :--- | :--- | :--- |
| **playing** | `SoundtrackState.playing` documented as "the mounted player reported PLAYING (state 1); not merely that play was clicked"; reducer doc updated | Yes |
| **bridge** | `youtubeBridge.ts`, `SoundtrackPlaque.tsx` comments, `bridge-unavailable` event | Yes |
| **player state** | `PlayerState` type, `player-state` event; never conflated with `SoundtrackViewMode` | Yes |
| **soundtrack clock** | `soundtrackClock` store key, `SoundtrackClock` type, `setSoundtrackClock` | Yes |
| **autoplay refused** | `AUTOPLAY_REFUSAL_MS`, the debug line, and the lift in `SoundtrackPlaque` | Yes |
| **bridge unavailable** | `BRIDGE_SILENCE_MS`, `bridge-unavailable` | Yes |

## 6. Pending manual checks

`PENDING MANUAL DEVICE VERIFICATION`:
- Safari and Firefox desktop with default autoplay blocking: the timecode stays `0:00`, the layer lifts in about 1.5 s, one click on YouTube's play button starts playback, and the timecode starts within 1 s of the video.
- Chrome desktop with a playable video: the timecode stays within 1 s of YouTube's own time display across a pause, a seek to 2:00 and a resume.
- iPhone Safari: playback stays inline and the timecode matches the video.
- Real-playback cadence of `infoDelivery` (the open assumption in §4).

## 7. Verbatim logs

All under `logs/`:
- `1.1-bridge-spike.log`: protocol spike output.
- `1.6-tdd-red.log`: the red run before implementation (31 failed, 31 passed).
- `3.1-safe-test.log`: `safe-test` aborting with `RangeError: WebAssembly.instantiate(): Out of memory` (the documented limitation).
- `3.1-vitest-full.log`: the direct serialized run, 51 files and 770 tests passed.
- `3.1-tsc.log`, `3.1-eslint.log`, `3.1-build.log`: all exit 0.
- `3.2-live-sync.log`: the live Playwright run.
