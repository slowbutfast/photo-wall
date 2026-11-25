'use client';

/**
 * Matte-black soundtrack plaque (`2.14u x 2.00u`), mounted `0.12u` beneath the
 * beveled glass placard inside the DOM wall.
 *
 * DOM adaptation of the former R3F mesh: it renders a resting thumbnail proxied
 * through `/api/youtube/thumb/[id]` (never `i.ytimg.com` directly), mounts **one**
 * native `youtube-nocookie.com` iframe on click, and keeps a transparent capture
 * layer over the player so the first wheel/drag over the plaque still pans or
 * zooms the gallery. The layer lifts only on an explicit click into the player.
 *
 * Hidden entirely at macro tier (`zoomTierStyle('macro').soundtrackThumbnail`).
 */

import { useEffect, useState } from 'react';

import { withBase } from '@/lib/basePath';
import { computeAlbumGrid } from '@/lib/layout/islandLayout';
import { islandRectStyle } from './islandPlacement';
import type { WallAlbum } from '@/lib/layout/types';
import { useWallStore } from '@/store/useWallStore';

import { captureLayerActive, showsIframeFor } from './soundtrackState';
import type { ZoomTier } from './zoomTier';

export interface SoundtrackPlaqueProps {
  album: WallAlbum;
  tier: ZoomTier;
}

export default function SoundtrackPlaque({ album, tier }: SoundtrackPlaqueProps) {
  const soundtrack = album.soundtrack;
  const state = useWallStore((store) => store.soundtrack);
  const dispatchSoundtrack = useWallStore((store) => store.dispatchSoundtrack);
  // A failed thumbnail proxy must leave the charcoal facade + play glyph, never
  // a broken-image icon on the wall.
  const [thumbFailed, setThumbFailed] = useState(false);

  // Switching albums (or zooming out) already stops the slice; unmounting this
  // plaque while its player is the active one must stop it too.
  useEffect(() => {
    return () => {
      const live = useWallStore.getState().soundtrack;
      if (live.activeAlbumId === album.id) {
        useWallStore.getState().dispatchSoundtrack({ type: 'stop' });
      }
    };
  }, [album.id]);

  if (!soundtrack || tier === 'macro') return null;

  const grid = computeAlbumGrid(
    album.photos.length,
    album.gridColumns,
    album.soundtrack !== null,
  );
  if (!grid.soundtrack) return null;

  const rect = grid.soundtrack;
  const placed = islandRectStyle(album.bounds, rect.x, rect.y, rect);
  const geometry = {
    left: `${placed.left}px`,
    top: `${placed.top}px`,
    width: `${placed.width}px`,
    height: `${placed.height}px`,
  };

  // Visibility is a *zoom tier* decision (macro hides the plaque entirely);
  // the state machine's `viewMode` only gates the player lifecycle. The player
  // is projected per album so only the active plaque mounts an iframe.
  const iframeVisible = showsIframeFor(state, album.id);
  const facade = !iframeVisible;
  const armed = iframeVisible && captureLayerActive(state);

  const play = () => {
    // Mounting from the overview zoom tier: the slice's player guard needs the
    // album to be the "current" one, which is local to the soundtrack machine.
    if (useWallStore.getState().soundtrack.currentAlbumId !== album.id) {
      dispatchSoundtrack({ type: 'enter-album', albumId: album.id });
    }
    dispatchSoundtrack({ type: 'play', albumId: album.id });
  };

  return (
    <div
      className="soundtrack-plaque"
      style={geometry}
      data-state={iframeVisible ? 'playing' : 'resting'}
    >
      {facade ? (
        <button
          type="button"
          className="soundtrack-facade"
          onClick={play}
          aria-label={`Play soundtrack: ${soundtrack.artist ?? 'YouTube'} — ${
            soundtrack.title ?? 'soundtrack'
          }`}
        >
          <span className="soundtrack-poster-fallback" aria-hidden="true">
            <span className="soundtrack-poster-title">
              {soundtrack.title ?? album.title}
            </span>
            {soundtrack.artist ? (
              <span className="soundtrack-poster-artist">{soundtrack.artist}</span>
            ) : null}
          </span>
          {thumbFailed ? null : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              className="soundtrack-thumb"
              src={withBase(`/api/youtube/thumb/${soundtrack.videoId}`)}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => setThumbFailed(true)}
            />
          )}
          <span className="soundtrack-play-badge" aria-hidden="true">
            <span className="soundtrack-play-btn">▶</span>
          </span>
        </button>
      ) : null}

      {iframeVisible ? (
        <iframe
          className="soundtrack-iframe"
          src={`https://www.youtube-nocookie.com/embed/${soundtrack.videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
          title={soundtrack.title ?? `${album.title} soundtrack`}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : null}

      {iframeVisible && armed ? (
        <button
          type="button"
          className="soundtrack-capture-layer"
          onClick={() => dispatchSoundtrack({ type: 'lift-capture-layer' })}
          aria-label="Enter YouTube player controls"
        />
      ) : null}
    </div>
  );
}
