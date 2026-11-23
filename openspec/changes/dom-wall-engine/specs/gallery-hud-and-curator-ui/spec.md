## MODIFIED Requirements

### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger
The visitor interface SHALL keep the existing `GalleryHud`, `PhotoFocusBar`, and lazy-loaded `AdminDrawer` / `FolderDropzone` wired to `useWallManifest` and `GalleryViewport`, ensuring that published albums update the CSS wall islands live on publish/edit/delete while `draft` albums remain exclusively inside the Curator Drawer and the bottom Exhibition Room Directory scrolls cleanly without clipping.

#### Scenario: Publishing or deleting an album updates the DOM wall and baked lightmap live
- **WHEN** an authenticated curator publishes a new album or deletes an existing album in `AdminDrawer`
- **THEN** `useWallManifest` SHALL refresh `GET /api/wall`, re-bake the wall-space lightmap, and update `CssGalleryWorld` without a full page reload
