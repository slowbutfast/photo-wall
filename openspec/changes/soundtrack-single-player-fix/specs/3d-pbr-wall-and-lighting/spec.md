## ADDED Requirements

### Requirement: Only the active album's plaque mounts a soundtrack player
Each rendered `SoundtrackPlaque` SHALL decide whether to show its iframe, its capture layer and `data-state="playing"` from a per-album predicate, `showsIframeFor(state, albumId)`. The predicate SHALL be true only when `showsIframe(state)` holds **and** `state.activeAlbumId === albumId`. Every other mounted plaque SHALL keep its resting facade and SHALL NOT mount an iframe, so at most one `youtube-nocookie.com` iframe exists in the DOM at any time.

#### Scenario: Clicking one plaque plays only that album
- **WHEN** albums A and B (both with soundtracks) are visible at album tier and a visitor clicks A's plaque facade
- **THEN** only A's plaque SHALL mount an iframe and play; B's plaque SHALL keep its resting facade, and the DOM SHALL contain exactly one `.soundtrack-iframe`

#### Scenario: Switching to another plaque hands over the single player
- **WHEN** A is playing and the visitor clicks B's plaque facade
- **THEN** A's iframe SHALL unmount, back to its facade, and only B's plaque SHALL mount an iframe

#### Scenario: Predicate is exclusive across any set of albums
- **WHEN** `showsIframeFor(state, id)` is evaluated for every album id on the wall after any sequence of soundtrack events
- **THEN** at most one id SHALL return `true`, and that id SHALL equal `state.activeAlbumId`
