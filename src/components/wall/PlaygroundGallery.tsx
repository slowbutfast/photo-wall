'use client';

/**
 * Public gallery adapter over the shared `<GalleryCanvas mode="public" />`.
 *
 * The camera controller, DOM culling, WebGL2 plaster shader and placard anatomy
 * all live in `GalleryCanvas.tsx` so the public wall and the Curator Studio
 * preview render the exact same surface. This wrapper keeps the existing
 * `PhotoWallApp` contract (published-only manifest, no draft affordances).
 */

import type { WallAlbum, WallPhoto } from '@/lib/layout/types';
import type { PlaygroundTheme } from '@/lib/lighting/playgroundTheme';

import GalleryCanvas from './GalleryCanvas';

export interface PlaygroundGalleryProps {
  albums: readonly WallAlbum[];
  /** Longest-edge LOD URL builder bound to the manifest's CDN base. */
  lodUrl: (photo: WallPhoto, longestEdge: number) => string;
  theme: PlaygroundTheme;
}

export default function PlaygroundGallery(props: PlaygroundGalleryProps) {
  return <GalleryCanvas {...props} mode="public" />;
}
