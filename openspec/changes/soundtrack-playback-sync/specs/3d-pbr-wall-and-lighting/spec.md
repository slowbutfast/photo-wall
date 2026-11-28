## ADDED Requirements

### Requirement: Soundtrack plaque bridges YouTube player state without loading YouTube script
**Embed URL.** The public soundtrack iframe URL SHALL append `enablejsapi=1&origin=<encodeURIComponent(window.location.origin)>` to its existing `autoplay=1&rel=0&modestbranding=1&playsinline=1`.

**Opening the bridge.** On the iframe's `load` event, `SoundtrackPlaque` SHALL post the JSON string `{"event":"listening","id":"<albumId>","channel":"widget"}` to the iframe's `contentWindow`, with target origin `https://www.youtube-nocookie.com`. It SHALL repeat the post every `250ms` until the first message arrives from that window, or until `3000ms` have passed.

**Accepting messages.** It SHALL accept a `message` event only when both hold:
- `event.origin === 'https://www.youtube-nocookie.com'`;
- `event.source` is that iframe's `contentWindow`.

Every other message SHALL be ignored.

**Parsing.** A pure `parseYoutubeMessage(data)` SHALL map:
- `onStateChange` (`info` is a number) and `infoDelivery` / `initialDelivery` (`info.playerState`, `info.currentTime`) to `{ state?, currentTime? }`;
- anything else, malformed JSON included, to `null`, without throwing.

**Forbidden.** No `www.youtube.com` script SHALL be loaded, and `src/lib/security/csp.ts` SHALL be unchanged.

**Autoplay refused.** After the first bridge message, if no state `1` or `3` arrives within `1500ms` while the last state is `-1` or `5`, the plaque SHALL dispatch `lift-capture-layer`, so the visitor's next click reaches YouTube's own play button.

**Debug logging.** With `?debugSoundtrack=1` in the page URL, each parsed bridge message and each fallback SHALL be logged with `console.info`. Without that parameter, nothing SHALL be logged.

#### Scenario: Refused autoplay needs one click, not two
- **WHEN** a desktop browser refuses audible autoplay and the player reports `-1` then `5` after the facade click
- **THEN** within `1500ms` of the first bridge message the capture layer SHALL be removed, and a single click on the YouTube play button SHALL start playback

#### Scenario: Buffering is not mistaken for refusal
- **WHEN** the player reports `3` (buffering) for `4000ms` before reporting `1`
- **THEN** the capture layer SHALL stay armed throughout, so wheel and drag over the plaque keep panning and zooming the wall

#### Scenario: Foreign messages are ignored
- **WHEN** a `message` event arrives with `origin` `https://evil.example`, or from a window that isn't the active plaque's iframe, carrying `{"event":"onStateChange","info":1}`
- **THEN** soundtrack state SHALL be unchanged

#### Scenario: Malformed payloads never throw
- **WHEN** `parseYoutubeMessage` receives `'not json'`, `'{}'`, `42`, `null`, or `{"event":"infoDelivery","info":{"currentTime":"x"}}`
- **THEN** it SHALL return `null`, or an object without the invalid field, and SHALL NOT throw

#### Scenario: CSP is untouched
- **WHEN** the public CSP is built after this change
- **THEN** it SHALL equal the pre-change policy byte for byte, with no `www.youtube.com` in `script-src` or `frame-src`
