/** Shared wall geometry & manifest types (`100px = 1 world unit`). */

export interface Size {
  width: number;
  height: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export interface WallPhoto {
  id: string;
  storagePath: string;
  width: number;
  height: number;
  aspectRatio: number;
  dominantColor: string | null;
  thumbHash: string | null;
  sortOrder: number;
}

export interface WallSoundtrack {
  videoId: string;
  artist: string | null;
  title: string | null;
  durationSec: number | null;
}

export interface WallAlbum {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  /** Present on preview manifests; published on the public wall. */
  status?: AlbumStatus;
  gridColumns: number;
  sortOrder: number;
  /** World-unit center of the album island. */
  position: WorldPoint;
  /** Placard-inclusive album bounding box in world units. */
  bounds: Size;
  cameraName: string | null;
  dateLabel: string | null;
  locationLabel: string | null;
  soundtrack: WallSoundtrack | null;
  photos: WallPhoto[];
}

export interface WallSummary {
  cdnBase: string;
  albums: WallAlbum[];
}

export type AlbumStatus = 'draft' | 'published' | 'deleting';
export type PhotoStatus = 'active' | 'deleting';

export interface LayoutAlbum {
  id: string;
  status: AlbumStatus;
  photoCount: number;
  gridColumns?: number;
  sortOrder: number;
  hasSoundtrack?: boolean;
}

export interface AlbumPlacement {
  id: string;
  position: WorldPoint;
  bounds: Size;
}
