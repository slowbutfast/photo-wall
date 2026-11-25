## Source material

**Maintainer, 2026-11-24 (Claude Code session):**

> "change this code to be like a UI/UX updating change where the text for the music, if it's longer and cannot fit horizontally within the width of the placard, scrolls like a news ticker similar to how it does on Spotify. And I want it so that there's like a two second delay to when the video starts playing and then to when it starts rotating. And can you model the news ticker animation similar to how Spotify does it?"

How the request was read:
- **"the text for the music"** is the placard's `Song Title — Artist` line (`.placard-track-name` in `AlbumPlacard.tsx`).
- **"cannot fit horizontally"** means the measured text overflows its box. Short titles never move.
- **"two second delay … then … starts rotating"** means that after playback starts, the line holds still for 2 s, then begins scrolling.
- **"like Spotify"** means the now-playing title marquee (see External research).

The maintainer was also offered folding this into `upload-chronological-order`. That was rejected: the two changes touch different files, specs and verification gates.

### Raised but not acted on

- **Scrolling while idle (not playing).** Spotify only scrolls the active track. An idle wall of moving text would be noisy, so idle placards keep the current ellipsis.
- **Scrolling the Caption or Metadata lines.** Not requested. They stay as they are.
- **Syncing the delay to real audio start.** The public CSP intentionally does not load `www.youtube.com/iframe_api` (`AlbumPlacard.tsx` timecode comment; `admin-route-isolation`). The only signal is the play click, so the delay is anchored there, the same anchor `PlacardTimecode` already uses.
- **Scrolling the black Soundtrack Plaque under the placard.** Not requested. Its YouTube facade shows its own title.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Track line** | The placard footer text `Song Title — Artist` (or `Soundtrack`), rendered in `.placard-track-name`. | The timecode, the Soundtrack Plaque, or the YouTube iframe title. |
| **Overflowing** | The track line's laid-out text width (`scrollWidth`) is wider than its box (`clientWidth`, about 166 px inside a 214 px placard with 24 px side padding), by more than 1 px. | Visual overflow from the world `scale()` transform, which doesn't affect layout widths. |
| **Marquee / ticker** | A seamless horizontal loop. The text and an `aria-hidden` duplicate, separated by a gap, slide left at a constant speed until the duplicate sits exactly where the original started. Then the loop restarts with no visible jump. | A ping-pong (scroll left, then back right) or a CSS `<marquee>` element. |
| **Hold** | A 2 s stationary phase with the line at its start position. It runs before the first scroll after play, and before each later cycle. | An easing curve. The scroll itself is linear. |
| **Playing** | `soundtrack.playing && soundtrack.activeAlbumId === album.id` in `useWallStore`, set by the play click. | Confirmed audio output. The public wall can't observe that (see above). |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| Spotify iOS and Android now-playing title (observed behaviour, from memory) | The title sits still, then scrolls left at constant speed with a duplicate following after a gap. It loops seamlessly with a pause at the start of each cycle, and the edges fade. Only the active track scrolls. | n/a (UX observation; no code) | 2026-11-24 (no fresh capture) |
| MDN `Element.animate()` / Web Animations API | Keyframes with `offset` allow a hold-then-move timeline in a single `iterations: Infinity` animation. `transform`-only animations stay on the compositor. `animation.cancel()` restores the start state. | CC-BY-SA docs (reference only) | 2026-11-24 (prior knowledge) |
| MDN `prefers-reduced-motion` | The media query for users who've asked for less motion. | CC-BY-SA (reference only) | 2026-11-24 (prior knowledge) |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| CSS `@keyframes` with custom properties for distance and duration | Rejected | The hold must be a fixed 2 s while the scroll length depends on the text, so the keyframe percentages would have to be computed per title. That ends up generating CSS from JS, which is worse than WAAPI. | 2026-11-24 |
| Web Animations API (`element.animate`) driven by a pure timeline helper | **Adopted** | Exact hold-then-scroll offsets computed per title, compositor-only `transform`, trivial cancel on stop, and the math is testable in Node. | 2026-11-24 |
| `requestAnimationFrame` loop that sets `translateX` | Rejected | Runs on the main thread, adds per-frame React or DOM writes, and stalls during camera gestures. | 2026-11-24 |
| `react-fast-marquee` and similar packages | Rejected | A new dependency for about 40 lines of code, and none of them model a per-cycle hold. | 2026-11-24 |

## Patterns adopted

- **Seamless loop by duplication:** render `[text][gap][text]` and translate by `-(textWidth + gap)`. This is the standard marquee technique (approach only, no code copied).
- **A store selector anchored to the play click:** the same selector `PlacardTimecode` already uses (`AlbumPlacard.tsx`), so the timecode and the ticker start from one signal.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| The track line currently truncates with an ellipsis | `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` | Read `src/styles/wall.css:603-613` (`.playground-wall-root .placard-track-name`). | 2026-11-24 | decays |
| The placard is a fixed 214 × 200 px with 24 px side padding | Content width about 166 px | Read `wall.css:535-543`. | 2026-11-24 | stable |
| The track line text is `title — artist`, falling back to `Soundtrack` | `[title, artist].filter(Boolean).join(' — ')` | Read `AlbumPlacard.tsx` `trackLine`. | 2026-11-24 | decays |
| "Playing" is set by the click and cleared on stop, overview or track end | `play` → `playing: true`; `stop`, `enter-overview` and `track-ended` clear it | Read `soundtrackState.ts:111-139`. | 2026-11-24 | stable |
| Only one album can be playing at a time | Single `activeAlbumId` | Read `soundtrackState.ts` `play` case. | 2026-11-24 | stable |
| Placard text isn't mounted at macro tier | `TIER_STYLES.macro.placardText: false` | Read `zoomTier.ts`. | 2026-11-24 | stable |
| Nothing in the app honours `prefers-reduced-motion` today | No matches | `grep -rn prefers-reduced-motion src` returned nothing. | 2026-11-24 | decays |
| The same `AlbumPlacard` renders on `/photos` and in the Studio preview | Shared component | Read `GalleryCanvas.tsx` (`AlbumPlacard` import) and the `CuratorStudio` preview canvas. | 2026-11-24 | stable |

## Unverified assumptions

- **Spotify's exact constants.** These are from memory, not measured: a hold of about 2–3 s, a speed of roughly 25–35 px/s, a gap of about 2–3 em, and edge fades of about 8–16 px. The values chosen here (2 s hold, 30 px/s, 40 px gap, 12 px fade) sit in that range and live in one exported constant, so tuning is a one-line edit. Checking costs a screen recording of Spotify mobile, played frame by frame.
- **The 2 s from the click roughly matches the audio starting.** YouTube usually starts in under 1 s once the iframe mounts. If it buffers longer, the ticker may start first. Checking costs a stopwatch run on a slow connection.
- **WAAPI transform animations stay smooth inside the `scale()`-transformed world.** The placard has `translateZ`/`preserve-3d` ancestors. Checking costs a DevTools Performance trace at album tier with one ticker running.

## Superseded claims

None yet.

## Links out

- `openspec/specs/gallery-hud-and-curator-ui/spec.md` L62: placard anatomy requirement (fixed 214 × 200, timecode).
- `openspec/specs/3d-pbr-wall-and-lighting/spec.md` L25: placard materials (aluminum, acrylic, foamcore colours).
