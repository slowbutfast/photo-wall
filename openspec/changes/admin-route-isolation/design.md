---
name: Chiaroscuro Gallery — Public / & /admin Isolation
tokensRef: ../../../DESIGN.md
---

## Visual Overview

- **Public `/` HUD (`GalleryHud`)**: Top-right displays **only** `Overview` (lock icon and `Curate` trigger completely removed). Bottom Exhibition Room Directory (with horizontal edge fade masks) and unobstructed `PhotoFocusBar` remain unchanged.
- **Unauthenticated `/admin` Login (`AdminLoginForm`)**: Minimal centered card using `DESIGN.md` `admin-surface` (`#FFFFFF`), `admin-ink` (`#1A1B19`), `admin-accent` (`#2D3B36`), `TeX Gyre Heros`, and sharp `3px` radius — rendered on dark plaster `#141412` without mounting the Curator Drawer or wall preview until authenticated.
- **Authenticated `/admin` Curator View (`AdminWallApp`)**: Renders the shared gallery wall with top-right `Curate` and `Sign out` buttons (opening `AdminDrawer` with upload, draft management, Pending Deletions retry, and client-local Lighting Preview) and live preview of published + draft albums.
- **Draft Visual Marker on `/admin` Wall Preview**: Draft albums rendered in `AdminWallApp` display a subtle dashed mat outline (`1px dashed rgba(236, 234, 228, 0.55)`) and a compact `"DRAFT"` badge (`10.5px` uppercase `0.06em` tracking) on their beveled glass placard so curators can immediately distinguish unpublished drafts from live exhibitions.
