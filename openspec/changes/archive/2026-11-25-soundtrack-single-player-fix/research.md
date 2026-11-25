## Source material

**Maintainer, 2026-11-24 (Claude Code session):**

> "can you debug why when I click on one video of an unplayed YouTube video from the canvas, it triggers another separate YouTube video that I'm not clicking on?"

The diagnosis was delivered in the same session. The maintainer then asked for it to be batched with `upload-chronological-order` and `placard-soundtrack-marquee`, and to exclude `mobile-touch-compatibility`.

### Raised but not acted on

- **Adding `playsinline=1` to the plaque iframe.** That belongs to `mobile-touch-compatibility`, which edits the same file after this fix merges.
- **Adding a React or DOM test harness** (for example `@testing-library/react` + jsdom). Vitest runs in the `node` environment, and adding a DOM runner is a dependency decision bigger than this fix. The defect is pinned at the pure predicate level instead (see Patterns adopted).

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Active album** | `soundtrack.activeAlbumId`: the one album whose player the state machine considers mounted. | The album currently in view (`currentAlbumId`). |
| **Per-album predicate** | A function of `(state, albumId)` that answers for one plaque. | `showsIframe(state)`, which answers for the whole wall. |
| **Mounted plaque** | A `<SoundtrackPlaque>` instance rendered by `GalleryCanvas` for a culled, visible island. | The single player in the state machine. |

## External research

None needed. This is an internal logic defect.

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Add `showsIframeFor(state, albumId)` to `soundtrackState.ts` | **Adopted** | Pure and unit-testable in Node, and it keeps the decision inside the state module. | 2026-11-24 |
| Inline `state.activeAlbumId === album.id &&` in the component | Rejected | It can't be tested without a DOM harness, which is exactly the gap that let this ship. | 2026-11-24 |
| Change `showsIframe` itself to take an album id | Rejected | Its wall-level meaning is used by the existing tests (`soundtrackState.test.ts` L55–L164). Keep it, and add the scoped variant. | 2026-11-24 |

## Patterns adopted

- **Testing a per-instance projection as a property.** For a list of album ids, at most one id may satisfy the predicate. This turns the spec's "at most one iframe" from a claim about state into a claim about what every plaque renders.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Every mounted plaque decides whether to show its iframe from a wall-level predicate | `const facade = !showsIframe(state); const iframeVisible = showsIframe(state);` | Read `src/components/wall/SoundtrackPlaque.tsx:71-72`. | 2026-11-24 | decays |
| `showsIframe` never checks the plaque's album | `activeAlbumId !== null && activeAlbumId === currentAlbumId` | Read `soundtrackState.ts` `showsIframe`. | 2026-11-24 | stable |
| One plaque is rendered per visible island | `<SoundtrackPlaque album={album} tier={tier} />` inside the per-island render | Read `GalleryCanvas.tsx:889`. | 2026-11-24 | decays |
| Each iframe autoplays its **own** video | `src=…/embed/${soundtrack.videoId}?autoplay=1…` | Read `SoundtrackPlaque.tsx`. | 2026-11-24 | stable |
| So after `play(A)`, every visible plaque with a soundtrack mounts and autoplays | Derived from the three rows above | Code trace (reproduced as the maintainer's symptom) | 2026-11-24 | — |
| The state machine itself does keep a single player | `mountedIframeCount ≤ 1` property test passes | Read `soundtrackState.test.ts` L96–L104 and L252. | 2026-11-24 | stable |
| The capture layer and `data-state` share the same defect | `armed = captureLayerActive(state)`, `data-state={iframeVisible ? …}` | Read `SoundtrackPlaque.tsx`. | 2026-11-24 | decays |
| The unmount cleanup is already album-scoped | `if (live.activeAlbumId === album.id) dispatch stop` | Read `SoundtrackPlaque.tsx` `useEffect`. | 2026-11-24 | decays |
| The defect dates from the DOM wall engine | `git log -L` on the line points at `9ec7dee` | git. | 2026-11-24 | stable |

## Unverified assumptions

- **No other component renders an iframe from `showsIframe`.** Only `SoundtrackPlaque.tsx` imports it outside tests (by grep). Checking costs re-running the grep at implementation time.

## Superseded claims

None.

## Links out

- `openspec/specs/3d-pbr-wall-and-lighting/spec.md` L25: "at most one native `youtube-nocookie.com` `<iframe>` on click".
