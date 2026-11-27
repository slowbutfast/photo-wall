## MODIFIED Requirements

### Requirement: Three-albums-per-row derived non-overlapping wall layout in world units
The shared spatial layout engine (`100px = 1 world unit`) SHALL compute placard-inclusive album bounding boxes and derive deterministic positions in `computeWallGridPositions(publishedAlbums sorted by sortOrder)` in a **3-albums-per-row** grid, centered horizontally with uniform non-overlapping row/column gaps calculated from the maximum album bounds in each row and column. Each album box SHALL be **top- and left-aligned inside its grid cell** (cell = column max width × row max height), so mixed-size albums share a common row top edge and a common column left edge instead of being centred inside a moving cell. Drafts SHALL NOT reserve wall space.

#### Scenario: Published albums wrap cleanly at 3 per row without draft holes
- **WHEN** 7 `published` albums (of 10–20 photos each) and 2 `draft` albums are passed to the wall manifest builder
- **THEN** `draft` albums SHALL be excluded, `published` albums 1–3 SHALL occupy row 0, 4–6 row 1, album 7 row 2, and no two album bounding boxes plus margin SHALL overlap

#### Scenario: Mixed-size albums share the row top and column left
- **WHEN** Row 0 contains a short album in column 1, a taller album in column 2 and a medium album in column 3, and a later row makes column 1 wider than that short album
- **THEN** every Row-0 album's top edge (`position.y + bounds.height / 2`) SHALL be equal, and the short column-1 album's left edge (`position.x - bounds.width / 2`) SHALL equal the column's left edge rather than being inset by the column width difference
