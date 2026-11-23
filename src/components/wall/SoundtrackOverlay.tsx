'use client';

/**
 * CSS `matrix3d` DOM overlay for the active YouTube soundtrack.
 *
 * The iframe lives above the canvas (never inside WebGL), is re-projected onto
 * the soundtrack plaque every animation frame, and keeps playing across print
 * focus and gestures for the active album. While a drag/pinch/wheel gesture is
 * in flight `gestureActive` flips the frame to `pointer-events: none` so the
 * iframe cannot swallow navigation. Playback stops only on `overview` or
 * selecting a different album.
 *
 * iOS Safari may require a second tap inside the iframe before audio starts.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { computeAlbumGrid } from '@/lib/layout/islandLayout';
import { loadYouTubeIframeApi, type YouTubePlayer } from '@/lib/youtube/iframeApi';
import { useWallStore } from '@/store/useWallStore';

import { galleryViewport } from './viewportState';

const PLAQUE_WIDTH_PX = 214;
const PLAQUE_HEIGHT_PX = 200;
const FOV_DEG = 38;

export default function SoundtrackOverlay() {
  const overlay = useWallStore((state) => state.overlay);
  const wall = useWallStore((state) => state.wall);
  const setPlayhead = useWallStore((state) => state.setPlayhead);

  const album = useMemo(
    () => wall.albums.find((candidate) => candidate.id === overlay.albumId) ?? null,
    [wall, overlay.albumId],
  );

  const rect = useMemo(() => {
    if (!album?.soundtrack) return null;
    const grid = computeAlbumGrid(
      album.photos.length,
      album.gridColumns,
      album.soundtrack !== null,
    );
    if (!grid.soundtrack) return null;
    return {
      x: album.position.x + grid.soundtrack.x,
      y: album.position.y + grid.soundtrack.y,
      width: grid.soundtrack.width,
      height: grid.soundtrack.height,
    };
  }, [album]);

  const shouldMount = overlay.mounted && overlay.playing && Boolean(album?.soundtrack) && Boolean(rect);

  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [apiFailed, setApiFailed] = useState(false);

  useEffect(() => {
    if (!shouldMount) return;
    let cancelled = false;

    loadYouTubeIframeApi().then((api) => {
      if (cancelled) return;
      if (!api || !hostRef.current || !album?.soundtrack) {
        setApiFailed(true);
        return;
      }
      try {
        playerRef.current = new api.Player(hostRef.current, {
          videoId: album.soundtrack.videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (!cancelled) event.target.playVideo();
            },
          },
        });
      } catch {
        setApiFailed(true);
      }
    });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        // Player may already be torn down with the DOM node.
      }
      playerRef.current = null;
      setPlayhead(0);
    };
  }, [shouldMount, album, setPlayhead]);

  // Poll the live playhead into the glass placard once per second.
  useEffect(() => {
    if (!shouldMount) return;
    const timer = window.setInterval(() => {
      try {
        const seconds = playerRef.current?.getCurrentTime();
        if (typeof seconds === 'number' && Number.isFinite(seconds)) setPlayhead(seconds);
      } catch {
        // Ignore transient player errors while buffering.
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [shouldMount, setPlayhead]);

  // Re-project the iframe onto the plaque every frame.
  useEffect(() => {
    if (!shouldMount || !rect) return;
    let raf = 0;
    const update = () => {
      raf = window.requestAnimationFrame(update);
      const frame = frameRef.current;
      if (!frame) return;
      const cam = galleryViewport.camera;
      const height = Math.max(1, galleryViewport.height);
      const width = Math.max(1, galleryViewport.width);
      const distance = Math.max(0.2, cam.z - 0.14);
      const unitsPerPixel = (2 * distance * Math.tan(((FOV_DEG * Math.PI) / 180) / 2)) / height;

      const screenX = width / 2 + (rect.x - cam.x) / unitsPerPixel;
      const screenY = height / 2 - (rect.y - cam.y) / unitsPerPixel;
      const projectedWidth = rect.width / unitsPerPixel;
      const projectedHeight = rect.height / unitsPerPixel;
      const left = screenX - projectedWidth / 2;
      const top = screenY - projectedHeight / 2;

      const scaleX = projectedWidth / PLAQUE_WIDTH_PX;
      const scaleY = projectedHeight / PLAQUE_HEIGHT_PX;

      frame.style.transform = `matrix3d(${scaleX},0,0,0, 0,${scaleY},0,0, 0,0,1,0, ${left},${top},0,1)`;
      frame.style.opacity = projectedWidth > 12 ? '1' : '0';
    };
    raf = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(raf);
  }, [shouldMount, rect]);

  if (!shouldMount || !album?.soundtrack || !rect) return null;

  return (
    <div className="soundtrack-overlay" aria-label="Album soundtrack">
      <div
        className="soundtrack-overlay-frame"
        ref={frameRef}
        style={{ pointerEvents: overlay.gestureActive ? 'none' : 'auto' }}
      >
        <div className="soundtrack-overlay-host" ref={hostRef} />
        {apiFailed && (
          <iframe
            className="soundtrack-overlay-fallback"
            title={`${album.title} soundtrack`}
            src={`https://www.youtube-nocookie.com/embed/${
              album.soundtrack.videoId
            }?autoplay=1&playsinline=1&rel=0`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}
