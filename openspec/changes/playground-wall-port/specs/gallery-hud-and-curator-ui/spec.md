## MODIFIED Requirements

### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger
The visitor interface SHALL omit top-left coordinate telemetry, check session status via `GET /api/admin/auth` on mount, show a subtle lock icon until authenticated (and `Curate` once authenticated), present the playground's exact Swiss-label top-right segmented control (`11px`, `500`, `uppercase`, `0.1em`, `24px` inset), compact centered translucent bottom dock (`max-width: min(760px, calc(100vw - 48px))`, `rgba(18,18,18,0.85)`, `blur(8px)`, horizontal edge fade masks), tracked uppercase `PhotoFocusBar` (`← PREV` / `NEXT →` / `RETURN [ESC]`), and Curator Settings with the playground's placard-material selector (`mat-glass` default + `mat-aluminum` / `mat-acrylic` / `mat-rag`) and `MAX_PHOTOS_PER_ALBUM = 20`, wiring `AdminDrawer` mutations to refresh `GET /api/wall` and re-render the playground wall live.

#### Scenario: Unauthenticated visitor sees lock icon instead of Curate
- **WHEN** a visitor loads the gallery without an admin session cookie
- **THEN** the top-right HUD SHALL display `OVERVIEW` and a subtle lock icon rather than an active `CURATE` label

#### Scenario: Publishing, deleting, or switching placard material updates the playground wall live
- **WHEN** an authenticated curator publishes/deletes an album or switches placard material in `AdminDrawer`
- **THEN** the playground wall and WebGL2 spotlight fixtures SHALL update live without a full page reload
