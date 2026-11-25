## Why

Clicking one album's unplayed Soundtrack Plaque also starts the YouTube soundtracks of **other** visible albums. Each mounted plaque decides whether to show its player from a wall-level predicate, `showsIframe(state)`, that never checks the plaque's own album (research: Verified facts). Every visible plaque therefore mounts its own `autoplay=1` iframe. That breaks the spec's "at most one native iframe" guarantee and plays several songs at once.

## What Changes

- Add a pure per-album predicate, `showsIframeFor(state, albumId)`, to `src/components/wall/soundtrackState.ts`.
- `SoundtrackPlaque` uses it for the facade-vs-iframe decision, the capture layer and `data-state`, so only the active album's plaque mounts a player. Every other plaque keeps its resting facade.
- Add regression tests: the per-album predicate is true only for the active album, and across any list of album ids at most one plaque would render an iframe.
- No visual, CSS, API or dependency change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `3d-pbr-wall-and-lighting`: adds an explicit requirement that the single-player guarantee holds **per rendered plaque**, not only in the state machine.

## Impact

- **Code:**
  - `src/components/wall/soundtrackState.ts` (new export)
  - `src/components/wall/SoundtrackPlaque.tsx` (3 lines)
  - `src/components/wall/__tests__/soundtrackState.test.ts` (new cases)
- **Ordering:** `mobile-touch-compatibility` also edits `SoundtrackPlaque.tsx`, so it must land after this.
