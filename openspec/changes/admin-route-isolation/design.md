---
name: Chiaroscuro Gallery — Public / & /admin Isolation
tokensRef: ../../../DESIGN.md
---

## Visual Overview

- **Public `/` HUD (`GalleryHud`)**: Top-right displays **only** `Overview` (lock icon and `Curate` trigger completely removed). Bottom Exhibition Room Directory and unobstructed `PhotoFocusBar` remain unchanged.
- **Unauthenticated `/admin` Login (`AdminLoginForm`)**: Minimal centered card using `DESIGN.md` `admin-surface` (`#FFFFFF`), `admin-ink` (`#1A1B19`), `admin-accent` (`#2D3B36`), `TeX Gyre Heros`, and sharp `3px` radius — rendered on dark plaster `#141412` without mounting the Curator Drawer or wall preview until authenticated.
- **Authenticated `/admin` Curator View (`AdminWallApp`)**: Renders the shared gallery wall with a top-right `Curate` button (opening `AdminDrawer` with upload, draft management, Pending Deletions retry, and client-local Lighting Preview) and live preview of published + draft albums.
