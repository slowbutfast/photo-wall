## Target Context Map

All line numbers are on `5188316` (`origin/main`). Re-read each file before editing.

| File | Lines | Change |
|---|---|---|
| `src/components/wall/youtubeBridge.ts` | `[NEW]` | Pure `parseYoutubeMessage`, `listeningMessage`, the `PlayerState` type and the `YOUTUBE_EMBED_ORIGIN` constant (D1). |
| `src/components/wall/soundtrackState.ts` | L35-45 (events), L111-121 (`play`), new cases | `play` sets `playing: false`. Add the `player-state` and `bridge-unavailable` events, album-scoped, returning the identical object on a no-op (D2). Update the module doc comment. |
| `src/store/useWallStore.ts` | L64, L86, L121, L135, L229-233 | The `soundtrackClock` key and `setSoundtrackClock`. `dispatchSoundtrack` resets the clock when `activeAlbumId` changes (D3). |
| `src/components/wall/SoundtrackPlaque.tsx` | L126-135 (iframe), new effect | Embed params; iframe `ref` plus `onLoad`; the `listening` retry; the `message` listener with origin and source checks; refusal and bridge-unavailable timers; clock write throttle; `?debugSoundtrack=1` (D1, D5, D6). |
| `src/components/wall/AlbumPlacard.tsx` | L50-82 (`PlacardTimecode`) | Interpolated clock (D4). The marquee (L125-270) needs no code change: `playing` semantics carry it. Confirm only. |
| `src/components/wall/__tests__/youtubeBridge.test.ts` | `[NEW]` | Parser tests. |
| `src/components/wall/__tests__/soundtrackState.test.ts` | existing + new | Updated `play` assertions; `player-state` and `bridge-unavailable` cases. |
| `src/components/wall/__tests__/SoundtrackPlaque.test.tsx` | `[NEW]` | Bridge wiring with fake timers. |
| `src/store/__tests__/soundtrackClock.test.ts` | `[NEW]` | Clock key independence and resets. |
| `src/components/wall/__tests__/placardTimecode.test.tsx` | `[NEW]` | Timecode interpolation. |

**Out of bounds:**
- `src/lib/security/csp.ts`;
- `GalleryCanvas.tsx` (its `soundtrack` selector must stay as is);
- `FolderDropzone.tsx`'s duration probe;
- `wall.css`;
- `PrintSharpOverlay`, gyro, and every file in `print-glare-tap-toggle` except `useWallStore.ts`. Touch only the soundtrack keys there.
- `playgrounds/`.

## 1. Test Scaffolding (TDD)

- [x] 1.1 Protocol spike, before any code. On local dev with network, use a throwaway Playwright script under `openspec/changes/soundtrack-playback-sync/spike/`:
  - Mount a `youtube-nocookie` embed with `enablejsapi=1&origin=…`, post `listening`, and log the first messages.
  - Record the event names, fields and cadence in research.md (move the assumption to Verified facts, or to Superseded claims) and in `logs/1.1-bridge-spike.log`.
  - If no message arrives, **HALT** and report: the design depends on it.
- [x] 1.2 Write failing `youtubeBridge.test.ts`.
- [x] 1.3 Extend and update `soundtrackState.test.ts` with the new `play` semantics, `player-state` and `bridge-unavailable`. Confirm the new cases fail.
- [x] 1.4 Write failing `soundtrackClock.test.ts`.
- [x] 1.5 Write failing `SoundtrackPlaque.test.tsx` and `placardTimecode.test.tsx`.
- [x] 1.6 Run the new and changed files. Confirm each fails for the intended reason and the pre-existing assertions pass. Save to `logs/1.6-tdd-red.log`.

## 2. Player-state bridge

- [x] 2.1 Implement `youtubeBridge.ts` (D1).
- [x] 2.2 Implement the reducer changes in `soundtrackState.ts` (D2).
- [x] 2.3 Implement `soundtrackClock` and the reset in `useWallStore.ts` (D3).
- [x] 2.4 Wire the bridge in `SoundtrackPlaque.tsx`: embed params, `listening` retry, the guarded listener, the refusal and fallback timers, the clock throttle, debug logging (D1, D5, D6).
- [x] 2.5 Implement the interpolated `PlacardTimecode` (D4). Confirm the marquee needs no edit.
- [x] 2.6 Run the narrow test files until green. Commit with explicit paths: `fix(soundtrack): drive placard timecode from YouTube player state`.

## 3. Verification & Empirical Audit

- [ ] 3.1 Run the full gates (`npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`). Use `safe-test` first and record any WebAssembly abort. Save the counts to `logs/3.1-*.log`. Confirm `csp.test.ts` is unchanged and green.
- [ ] 3.2 On local dev, in Playwright Chromium with network, play a soundtrack album:
  - Record the timecode alongside the bridge-reported `currentTime` at 5 points over 20 s (expect a difference under 1 s).
  - Then pause via `postMessage` `{"event":"command","func":"pauseVideo"}` and confirm the timecode holds.
  - Save to `logs/3.2-live-sync.log`.
- [ ] 3.3 Populate `verification.md`:
  - an executive summary and environment;
  - a Requirement Adherence Audit Matrix, mapping every scenario in both delta specs;
  - resolved assumptions (the protocol, cadence);
  - a nomenclature audit against the glossary (`playing`, bridge, player state, soundtrack clock);
  - verbatim logs.

  Mark the Safari/Firefox refusal and iPhone checks `PENDING MANUAL DEVICE VERIFICATION`.
