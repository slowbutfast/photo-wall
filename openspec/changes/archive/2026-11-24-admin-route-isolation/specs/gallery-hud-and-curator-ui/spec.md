## MODIFIED Requirements

### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger
Public `/photos` SHALL be strictly read-only with zero curator triggers, zero admin imports, and zero `/api/admin/auth` requests on page load. The public HUD SHALL present the playground's exact Swiss-label top-right `Overview` control (`11px`, `500`, `uppercase`, `0.1em`, `24px` inset), compact centered translucent bottom dock (`max-width: min(760px, calc(100vw - 48px))`, `rgba(18,18,18,0.85)`, `blur(8px)`, horizontal edge fade masks), and tracked uppercase `PhotoFocusBar` (`← PREV` / `NEXT →` / `RETURN [ESC]`). A static import-graph audit (`publicBoundaryAudit.test.ts`) SHALL enforce that `src/app/(gallery)` never transitively imports `@/components/admin/*` or references `/api/admin`.

#### Scenario: Public gallery loads zero admin UI or auth calls
- **WHEN** a visitor opens `/photos`
- **THEN** no lock or `Curate` button SHALL render, zero requests SHALL be made to `/photos/api/admin/*`, and zero admin JS chunks SHALL be downloaded

### Requirement: Lazy-loaded Curator Drawer with resilient folder upload and soundtrack editor
All curation tools SHALL live exclusively inside the persistent split **Curator Studio** at `/photos/admin` (replacing the floating drawer over `/photos`). On desktop (`>= 1024px`), the Studio SHALL render the shared `<GalleryCanvas mode="preview" />` on the left beside a persistent `440px` sidebar with three top-level tabs: **Exhibitions** (published + draft album directory), **Upload** (recursive `FolderDropzone` with `client-upload-compression`, 20-photo cap recovery, optional Date/Time/Location and YouTube soundtrack inspect), and **Settings** (client-local Lighting Preview, Placard Material selector `.mat-acrylic` / `.mat-aluminum` / `.mat-foamcore`, Pending Deletions retry list, and Sign Out). On mobile (`< 1024px`), the Studio SHALL switch between **Wall Preview** and **Manage Studio** tabs without losing unsaved order, upload queue, or draft state. Draft albums in `<GalleryCanvas mode="preview" />` SHALL render with dashed mats and a `"Draft"` placard badge.

#### Scenario: Studio renders live draft-aware preview beside Upload and Settings
- **WHEN** an authenticated curator opens `/photos/admin`
- **THEN** `<GalleryCanvas mode="preview" />` SHALL display both published and draft albums (with dashed mats and `"Draft"` badges on drafts) beside the persistent **Exhibitions | Upload | Settings** sidebar, and switching Placard Material or Lighting Preview in Settings SHALL update the preview immediately

#### Scenario: Mobile Studio tabs preserve in-progress upload and draft state
- **WHEN** a curator on a `< 1024px` viewport starts an upload or edits a draft in **Manage Studio** and toggles to **Wall Preview** and back
- **THEN** the upload queue and unsaved draft state SHALL remain intact without resetting
