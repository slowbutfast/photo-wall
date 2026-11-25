> [!NOTE]
> This document specifies **technical system architecture only** (data flow, storage, APIs, concurrency, state synchronization, and security).
> All visual, aesthetic, and UI design decisions (colors, typography, component styling, responsive layout) must be defined in `design.md`.

## Context

`useWallStore.soundtrack` is a single shared state, and `GalleryCanvas` renders one `SoundtrackPlaque` per visible island. Each plaque reads the whole state and projects it through `showsIframe(state)`, a wall-level predicate, so all of them flip to "playing" together. The reducer is correct. The defect is only in that per-plaque projection.

## System Architecture Diagram

```mermaid
flowchart LR
  S[(soundtrack state<br/>activeAlbumId, currentAlbumId)] --> PA[SoundtrackPlaque A]
  S --> PB[SoundtrackPlaque B]
  PA -->|showsIframeFor(state, 'A') = true| IA[iframe A]
  PB -->|showsIframeFor(state, 'B') = false| FB[facade B]
```

## Goals / Non-Goals

**Goals:** at most one iframe in the DOM, a pure tested predicate, and minimal diff.

**Non-Goals:** reducer changes, `playsinline` (`mobile-touch-compatibility`), a DOM test harness.

## Technical Decisions

- **D1:** Add `export function showsIframeFor(state, albumId)`, which returns `showsIframe(state) && state.activeAlbumId === albumId`. Keep `showsIframe` unchanged, because the existing tests rely on its wall-level meaning. **Alternative rejected:** an inline component check, since it can't be tested in the Node environment.
- **D2:** In `SoundtrackPlaque`:
  - `const iframeVisible = showsIframeFor(state, album.id)`
  - `const facade = !iframeVisible`
  - `const armed = iframeVisible && captureLayerActive(state)`
  - `data-state` reads `iframeVisible`

  The `play` handler and the unmount cleanup are unchanged. The cleanup is already album-scoped.
- **D3:** Tests in `soundtrackState.test.ts`:
  - a direct A/B case;
  - the A→B handover;
  - an exclusivity property over the existing randomised event-sequence test (the L252 area): for ids `['A','B','C']`, `ids.filter(id => showsIframeFor(s, id)).length <= 1`, and any true id equals `s.activeAlbumId`.

## Risks / Trade-offs

- **[Risk]** Another consumer relies on the wall-level `showsIframe` to show a player. → The grep at implementation time confirms that only `SoundtrackPlaque` imports it.
- **[Trade-off]** None. This strictly reduces what gets mounted.

## Migration & Rollback Plan

No data impact. Rollback is a single-commit revert.
