/**
 * Island-local CSS placement.
 *
 * `islandLayout.ts` works in **center-relative, y-up world units**
 * (`computeAlbumGrid` returns each cell/placard centre relative to the island
 * centre), while `.album-island` is absolutely positioned by its **top-left
 * corner** and CSS is y-down. Every child placement goes through here so the
 * two conventions can never drift apart again:
 *
 *   left = (worldX + islandWidth / 2) * 100
 *   top  = (islandHeight / 2 - worldY) * 100
 *
 * A rect is expressed by its top-left world corner, which is why callers pass
 * `centre - size / 2` horizontally and `centre + size / 2` vertically.
 */

export interface IslandSize {
  width: number;
  height: number;
}

export interface SizedRect {
  width: number;
  height: number;
}

export interface CssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Point in island-local CSS pixels (untransformed; the `.world` scale applies). */
export function islandLocalPoint(
  bounds: IslandSize,
  worldX: number,
  worldY: number,
): { left: number; top: number } {
  return {
    left: (worldX + bounds.width / 2) * 100,
    top: (bounds.height / 2 - worldY) * 100,
  };
}

/**
 * CSS box for a rect whose centre is `(centreX, centreY)` in centre-relative
 * island coordinates.
 */
export function islandRectStyle(
  bounds: IslandSize,
  centreX: number,
  centreY: number,
  size: SizedRect,
): CssRect {
  const topLeft = islandLocalPoint(
    bounds,
    centreX - size.width / 2,
    centreY + size.height / 2,
  );
  return {
    left: topLeft.left,
    top: topLeft.top,
    width: size.width * 100,
    height: size.height * 100,
  };
}
