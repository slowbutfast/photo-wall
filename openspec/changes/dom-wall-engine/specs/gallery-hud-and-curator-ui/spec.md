## MODIFIED Requirements

### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger
The visitor interface SHALL omit top-left coordinate telemetry, check session status via `GET /api/admin/auth` on mount, show a subtle lock icon until authenticated (and `Curate` once authenticated), present `Overview` + a horizontally scrollable bottom Exhibition Room Directory with subtle horizontal edge fade masks (preventing mid-word hard clipping), and wire `GalleryHud`, `PhotoFocusBar`, and lazy-loaded `AdminDrawer` / `FolderDropzone` to `useWallManifest` and `GalleryViewport` so published albums update the CSS wall islands and baked lightmap live on publish/edit/delete while `draft` albums remain exclusively inside the Curator Drawer.

#### Scenario: Unauthenticated visitor sees lock icon instead of Curate
- **WHEN** a visitor loads the gallery without an admin session cookie
- **THEN** the top-right HUD SHALL display `Overview` and a subtle lock icon rather than an active `Curate` label

#### Scenario: Publishing or deleting an album updates the DOM wall and baked lightmap live
- **WHEN** an authenticated curator publishes a new album or deletes an existing album in `AdminDrawer`
- **THEN** `useWallManifest` SHALL refresh `GET /api/wall`, re-bake the wall-space lightmap on the GPU, and update `CssGalleryWorld` without a full page reload
