## MODIFIED Requirements

### Requirement: Quiet gallery ephemera HUD with lock-gated Curator trigger
This change restyles the HUD chrome without altering its authentication boundary (which `admin-route-isolation` owns separately): the HUD SHALL present the playground's exact Swiss-label top-right segmented control (`11px`, `500`, `uppercase`, `0.1em`, `24px` inset), compact centered translucent bottom dock (`max-width: min(760px, calc(100vw - 48px))`, `rgba(18,18,18,0.85)`, `blur(8px)`, horizontal edge fade masks), tracked uppercase `PhotoFocusBar` (`← PREV` / `NEXT →` / `RETURN [ESC]`), Curator Settings with the real playground placard-material selector (**Beveled Glass** → `.mat-acrylic` default, **Brushed Aluminum** → `.mat-aluminum`, **Archival Foamcore** → `.mat-foamcore`), and a `FolderDropzone` that recovers cleanly (showing a clear validation error without getting stuck) when a single folder contains more than `MAX_PHOTOS_PER_ALBUM = 20` files.

#### Scenario: Switching placard material or dropping >20 files in one folder behaves cleanly
- **WHEN** a curator switches placard material in Settings or drops a folder with 25 images into `FolderDropzone`
- **THEN** placards SHALL switch immediately between `.mat-acrylic`, `.mat-aluminum`, and `.mat-foamcore`, and `FolderDropzone` SHALL display a clear 20-photo cap message and remain usable without getting stuck
