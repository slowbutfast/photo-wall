## Automated Tests

Runner: `npx vitest run` (Vitest). Try `safe-test` first. If it aborts on WebAssembly under its `ulimit -v` cap (a known issue from earlier changes), record the log and run the direct command serialized.

- **`npx vitest run src/components/wall/__tests__/youtubeBridge.test.ts` `[NEW]`:** the bridge requirement (parsing).
  - `onStateChange` with `info: 1` gives `{ state: 1 }`.
  - `infoDelivery` with `{ playerState: 2, currentTime: 42.3 }` gives both fields.
  - `initialDelivery` is handled the same way as `infoDelivery`.
  - Malformed inputs return `null` without throwing: `'not json'`, `'{}'`, `42`, `null`, an unknown `event`, a non-finite `currentTime`, and an unknown state code such as `7`.
  - `listeningMessage('a1')` is exactly `{"event":"listening","id":"a1","channel":"widget"}`.
- **`npx vitest run src/components/wall/__tests__/soundtrackState.test.ts` (extended and updated):**
  - `play` now leaves `playing: false` while still setting `activeAlbumId` and `captureLayerActive`. The existing assertions that `play ⇒ playing` are updated; justify this in verification.md.
  - `player-state`:
    - `1` sets `playing: true`.
    - `2`, `3`, `-1` and `5` set it false.
    - `0` equals the `track-ended` result.
    - A mismatched `albumId` returns the identical state object.
    - A no-op transition returns the identical object.
  - `bridge-unavailable` sets `playing: true`, and only for the active album.
  - Every pre-existing exclusivity, album-switch and zoom-out assertion is unchanged.
- **Store test** (`src/store/__tests__/soundtrackClock.test.ts` `[NEW]`, or alongside the existing store tests):
  - `setSoundtrackClock` doesn't change `getState().soundtrack` identity.
  - A change of `activeAlbumId` (`play` B after A, `stop`, `goOverview`) resets the clock.
- **`npx vitest run src/components/wall/__tests__/SoundtrackPlaque.test.tsx` `[NEW]`** (jsdom; fake `postMessage` and `message` events; fake timers):
  - The iframe `src` contains `enablejsapi=1` and an encoded `origin=`.
  - `load` posts `listening` to the iframe window with target origin `https://www.youtube-nocookie.com`. It retries every 250 ms and stops after the first message.
  - A message from the wrong origin, or a different `source`, changes nothing.
  - `-1` then `5`, with no `1` for 1500 ms, dispatches `lift-capture-layer` once.
  - `3` for 4000 ms doesn't lift it.
  - No message for 3000 ms after `load` dispatches `bridge-unavailable`.
  - Ten `infoDelivery` messages within 0.75 s of drift cause at most one clock write.
  - Timers are cleared on unmount.
- **`PlacardTimecode` test** (in `AlbumPlacard.test.tsx` if it exists, otherwise `[NEW]` `placardTimecode.test.tsx`):
  - It shows `0:00` while mounted but not playing.
  - With the clock at `{ positionSec: 10, at: t0 }` and playing, it reads `0:13` at `t0 + 3.2 s`.
  - It holds while paused, and clamps to `durationSec`.
- **`npx vitest run src/components/wall/__tests__/placardMarquee.test.ts`:** regression; it must stay green unchanged.
- **CSP regression:** `npx vitest run src/lib/security/__tests__/csp.test.ts` must stay green and unchanged.
- **Full gates:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`.

## Manual Verification

Use local dev only (`STORAGE_DRIVER=local`, local DB, an album with a soundtrack). Never use preview or production, which share the production DB.

- **Protocol spike (task 1.1):**
  - **WHEN** a Playwright Chromium page on local dev (with network) mounts a `youtube-nocookie` embed with `enablejsapi=1&origin=…` and posts `listening`.
  - **THEN** record in research.md the first five messages received: their `event` names, whether `info.playerState` and `info.currentTime` are present, and the cadence. If none arrive, stop and report.
- **Autoplay refused** (`PENDING MANUAL VERIFICATION` unless reproducible headlessly):
  - **WHEN** in Safari or Firefox desktop (default autoplay blocking), with `?debugSoundtrack=1`, you click an unplayed facade.
  - **THEN** the console shows `-1` or `5` and the timecode stays `0:00`. Within about 1.5 s, one click on YouTube's play button starts audio, and the timecode starts within 1 s of the video.
- **Autoplay allowed:**
  - **WHEN** in Chrome desktop you click an unplayed facade.
  - **THEN** the timecode stays within 1 s of YouTube's own time display throughout.
  - Pausing, seeking to 2:00, and resuming in YouTube's controls are reflected within 1 s.
- **Wall gestures:**
  - **WHEN** a video is buffering or playing and you wheel or drag over the plaque.
  - **THEN** the wall pans and zooms, as before.
- **iPhone Safari** (`PENDING MANUAL DEVICE VERIFICATION`):
  - **WHEN** you tap a facade.
  - **THEN** playback stays inline, and the timecode matches the video.
