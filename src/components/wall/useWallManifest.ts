'use client';

/**
 * Manifest adapter for the DOM wall.
 *
 * `GET /api/wall` already excludes drafts and carries the derived 3-column
 * world geometry, so this hook only has to:
 * - hand the renderer a stable, `sortOrder`-sorted album list;
 * - expose a `lodUrl(photo, longestEdge)` bound to the manifest's CDN base via
 *   `lodUrl.ts` (Bunny Optimizer in production, `/api/local-uploads?width=` in
 *   local mode);
 * - refresh cleanly after a curator publish/edit/delete (the store's
 *   `refreshWall` is what the Curator Drawer already calls).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { withBase } from '@/lib/basePath';
import { buildLodUrl } from '@/lib/cdn/lodUrl';
import type { WallAlbum, WallPhoto, WallSummary } from '@/lib/layout/types';
import { useWallStore } from '@/store/useWallStore';

export interface WallManifestOptions {
  /**
   * Fetch the manifest when neither the SSR manifest nor the store has a wall
   * yet. Disabled for demo fixtures (`?demo=`), which own the wall.
   */
  autoFetch?: boolean;
  /**
   * Manifest endpoint. `/api/wall` for the public gallery; the
   * `admin-route-isolation` change passes `/api/admin/wall-preview` here for the
   * authenticated preview without forking the renderer.
   */
  manifestUrl?: string;
}

export interface WallManifestView {
  albums: WallAlbum[];
  cdnBase: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Longest-edge URL for a photo (LOD buckets `256 / 800 / 2048`). */
  lodUrl: (photo: WallPhoto, longestEdge: number) => string;
}

export function useWallManifest(
  initialWall?: WallSummary,
  options: WallManifestOptions = {},
): WallManifestView {
  const autoFetch = options.autoFetch ?? true;
  const manifestUrl = options.manifestUrl ?? withBase('/api/wall');
  const wall = useWallStore((state) => state.wall);
  const setWall = useWallStore((state) => state.setWall);
  const [error, setError] = useState<string | null>(null);

  // Seed once when no SSR manifest was provided and the store is still empty.
  useEffect(() => {
    if (initialWall && initialWall.albums.length > 0 && wall.albums.length === 0) {
      setWall(initialWall);
    }
  }, [initialWall, setWall, wall.albums.length]);

  useEffect(() => {
    // An SSR manifest or a demo wall is already authoritative for this load;
    // curator mutations refresh through `refreshWall` instead.
    if (!autoFetch) return;
    if (wall.albums.length > 0 || (initialWall?.albums.length ?? 0) > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(withBase(manifestUrl), { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as WallSummary;
        if (cancelled) return;
        setWall(payload);
        setError(null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'manifest_unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoFetch, initialWall, manifestUrl, setWall, wall.albums.length]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(withBase(manifestUrl), { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setWall((await response.json()) as WallSummary);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'refresh_failed');
    }
  }, [manifestUrl, setWall]);

  const albums = useMemo(
    () =>
      [...wall.albums]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
        .map((album) => ({
          ...album,
          photos: [...album.photos].sort((a, b) => a.sortOrder - b.sortOrder),
        })),
    [wall.albums],
  );

  const lodUrl = useCallback(
    (photo: WallPhoto, longestEdge: number) => {
      // CDN-less fixtures (inline demo images) and absolute URLs pass through.
      if (photo.storagePath.startsWith('data:') || /^https?:\/\//.test(photo.storagePath)) {
        return photo.storagePath;
      }
      return buildLodUrl(wall.cdnBase, photo.storagePath, longestEdge, photo.aspectRatio);
    },
    [wall.cdnBase],
  );

  return {
    albums,
    cdnBase: wall.cdnBase,
    // Still loading the *first* manifest: an empty wall with no error yet.
    loading: albums.length === 0 && error === null,
    error,
    refresh,
    lodUrl,
  };
}

export default useWallManifest;
