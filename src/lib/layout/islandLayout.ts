import type { AlbumPlacement, AlbumStatus, LayoutAlbum, Size, WorldPoint } from './types';

export type { AlbumPlacement, LayoutAlbum, Size, WorldPoint } from './types';

/** `100px = 1 world unit`. */
export const WORLD_SCALE = 0.01;
/** Albums per wall row (Instagram-style 3-column exhibition grid). */
export const ALBUMS_PER_ROW = 3;
export const PLACARD_WIDTH = 2.14;
export const PLACARD_HEIGHT = 2.0;
export const SOUNDTRACK_HEIGHT = 2.0;
/** Gap between the placard and the soundtrack plaque directly beneath it. */
export const SOUNDTRACK_GAP = 0.12;
/**
 * Nominal print cell edge in world units (`158px`, verbatim from
 * `playgrounds/photo_wall_playground.html` `.photo-cell`).
 */
export const CELL_SIZE = 1.58;
/** Print-to-print gutter inside an album island (24px). */
export const GUTTER = 0.24;
/** Mat padding around each print (11px). */
export const MAT_PADDING = 0.11;
/**
 * Gap between a placard and its own photo grid (94px).
 */
export const PLACARD_GAP = 0.94;
/** Island inner padding around the placard column + photo grid (20px). */
export const ISLAND_PADDING = 0.2;
/** Playground `.museum-placard { margin-top: 8px }` inside the column. */
export const PLACARD_TOP_OFFSET = 0.08;
/**
 * Gap between adjacent album islands (220px).
 * Roughly one placard width so dark plaster separates adjacent light pools.
 */
export const ISLAND_GAP = 2.2;

/** Hard cap on photos per album (a 4-5 column salon cluster). */
export const MAX_PHOTOS_PER_ALBUM = 20;

/** Grid columns allowed for a salon cluster: 4-5 columns. */
export const MIN_SALON_COLUMNS = 4;
export const MAX_SALON_COLUMNS = 5;

const MAX_GRID_COLUMNS = 12;

export interface AlbumGridPhoto {
  column: number;
  row: number;
  x: number;
  y: number;
}

export interface AlbumRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlbumGrid {
  bounds: Size;
  grid: {
    columns: number;
    rows: number;
    width: number;
    height: number;
  };
  /** Beveled glass standoff placard, left of the grid and top-aligned to it. */
  placard: AlbumRect;
  /** Optional soundtrack plaque directly beneath the placard. */
  soundtrack: AlbumRect | null;
  photos: AlbumGridPhoto[];
}

function clampColumns(gridColumns: number | undefined): number {
  const columns = Math.floor(gridColumns ?? 3);
  if (!Number.isFinite(columns) || columns < 1) return 1;
  return Math.min(columns, MAX_GRID_COLUMNS);
}

/**
 * Album bounding box in world units. Horizontally it covers placard + gap +
 * print grid; vertically it takes the taller of the grid or the placard stack
 * (placard plus optional soundtrack plaque). Empty albums keep a single
 * nominal cell so drafts never collapse to zero-sized boxes.
 */
export function computeAlbumBounds(
  photoCount: number,
  gridColumns = 3,
  hasSoundtrack = false,
): Size {
  return computeAlbumGrid(photoCount, gridColumns, hasSoundtrack).bounds;
}

/**
 * Lays out one album island centered on its own origin: the beveled glass
 * placard (`2.14u x 2.00u`) mounts `PLACARD_GAP` to the left of the print grid
 * and `PLACARD_TOP_OFFSET` below its top edge; the optional soundtrack plaque
 * (`2.14u x 2.00u`) sits `SOUNDTRACK_GAP` directly beneath the placard.
 *
 * The `ISLAND_PADDING` border and the `158px` cells mirror the playground's
 * `.album-island` flex box 1:1 (100px = 1 world unit), so the absolute
 * production positions land within 1px of the playground DOM.
 */
export function computeAlbumGrid(
  photoCount: number,
  gridColumns = 3,
  hasSoundtrack = false,
): AlbumGrid {
  const columns = clampColumns(gridColumns);
  const count = Math.max(0, Math.floor(photoCount));
  const rows = count === 0 ? 1 : Math.ceil(count / columns);
  const usedColumns = count === 0 ? 1 : Math.min(columns, count);

  const gridWidth = usedColumns * CELL_SIZE + (usedColumns - 1) * GUTTER;
  const gridHeight = rows * CELL_SIZE + (rows - 1) * GUTTER;
  const placardStackHeight =
    PLACARD_TOP_OFFSET +
    PLACARD_HEIGHT +
    (hasSoundtrack ? SOUNDTRACK_GAP + SOUNDTRACK_HEIGHT : 0);
  const contentHeight = Math.max(gridHeight, placardStackHeight);

  const islandWidth = PLACARD_WIDTH + PLACARD_GAP + gridWidth + ISLAND_PADDING * 2;
  const islandHeight = contentHeight + ISLAND_PADDING * 2;

  const islandLeft = -islandWidth / 2;
  const islandTop = islandHeight / 2;
  // The grid and placard column are top-aligned inside the padded island.
  const contentLeft = islandLeft + ISLAND_PADDING;
  const contentTop = islandTop - ISLAND_PADDING;
  const gridLeft = contentLeft + PLACARD_WIDTH + PLACARD_GAP;

  // Placard hugs the left edge, offset by the playground's 8px margin-top.
  const placard: AlbumRect = {
    x: contentLeft + PLACARD_WIDTH / 2,
    y: contentTop - PLACARD_TOP_OFFSET - PLACARD_HEIGHT / 2,
    width: PLACARD_WIDTH,
    height: PLACARD_HEIGHT,
  };

  const soundtrack: AlbumRect | null = hasSoundtrack
    ? {
        x: placard.x,
        y: placard.y - PLACARD_HEIGHT / 2 - SOUNDTRACK_GAP - SOUNDTRACK_HEIGHT / 2,
        width: PLACARD_WIDTH,
        height: SOUNDTRACK_HEIGHT,
      }
    : null;

  const photos: AlbumGridPhoto[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = gridLeft + CELL_SIZE / 2 + column * (CELL_SIZE + GUTTER);
    const y = contentTop - CELL_SIZE / 2 - row * (CELL_SIZE + GUTTER);
    photos.push({ column, row, x, y });
  }

  return {
    bounds: { width: islandWidth, height: islandHeight },
    grid: { columns: usedColumns, rows, width: gridWidth, height: gridHeight },
    placard,
    soundtrack,
    photos,
  };
}

function rowChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Balanced exhibition row count: 4-album walls arrange cleanly in 2×2 instead
 * of 3 + 1 orphan; all other counts use `ALBUMS_PER_ROW` (3).
 */
export function albumsPerRowForCount(albumCount: number): number {
  return albumCount === 4 ? 2 : ALBUMS_PER_ROW;
}

/**
 * First-row count for Overview entry camera framing, bounded by both viewport
 * aspect ratio and the layout's actual row width (`albumsPerRowForCount`).
 */
export function entryFirstRowCount(albumCount: number, aspect: number): number {
  const aspectPerRow = aspect >= 1.4 ? 3 : aspect >= 0.9 ? 2 : 1;
  return Math.min(aspectPerRow, albumsPerRowForCount(albumCount));
}

export interface WallGridOptions {
  /**
   * Album statuses that reserve wall space. Defaults to `['published']`, so the
   * public wall never shows drafts; the Curator Studio passes
   * `['published', 'draft']` for its live preview.
   */
  includeStatuses?: readonly AlbumStatus[];
}

/**
 * Deterministic 3-albums-per-row placement. Deleting albums are excluded so
 * they never reserve wall space; drafts are excluded unless requested through
 * `includeStatuses`. Column widths are the maximum bounds per column (rows stay
 * aligned) and rows advance top-to-bottom.
 *
 * Each album is top- and left-aligned inside its grid cell (cell = column max
 * width × row max height), so mixed-size albums share a row top line and a
 * column left datum instead of being centred in a box that moves with their own
 * photo count.
 */
export function computeWallGridPositions(
  albums: LayoutAlbum[],
  options: WallGridOptions = {},
): AlbumPlacement[] {
  const include = new Set<AlbumStatus>(options.includeStatuses ?? ['published']);
  const visible = albums
    .filter((album) => include.has(album.status))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));

  if (visible.length === 0) return [];

  const measured = visible.map((album) => ({
    album,
    bounds: computeAlbumBounds(album.photoCount, album.gridColumns ?? 3, album.hasSoundtrack),
  }));

  const rows = rowChunks(measured, albumsPerRowForCount(measured.length));

  const columnWidths: number[] = [];
  for (const row of rows) {
    row.forEach((entry, column) => {
      columnWidths[column] = Math.max(columnWidths[column] ?? 0, entry.bounds.width);
    });
  }

  const placements: AlbumPlacement[] = [];
  let rowTop = 0;

  for (const row of rows) {
    const rowHeight = Math.max(...row.map((entry) => entry.bounds.height));
    const rowWidth =
      row.reduce(
        (sum, entry, column) => sum + Math.max(columnWidths[column] ?? 0, entry.bounds.width),
        0,
      ) +
      ISLAND_GAP * (row.length - 1);

    let cursor = -rowWidth / 2;
    row.forEach((entry, column) => {
      const width = Math.max(columnWidths[column] ?? 0, entry.bounds.width);
      const position: WorldPoint = {
        x: cursor + entry.bounds.width / 2,
        y: rowTop - entry.bounds.height / 2,
      };
      placements.push({ id: entry.album.id, position, bounds: entry.bounds });
      cursor += width + ISLAND_GAP;
    });

    rowTop -= rowHeight + ISLAND_GAP;
  }

  return placements;
}
