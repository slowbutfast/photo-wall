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
 * `soundtrack-playback-sync`: the iframe is opened with `enablejsapi=1`, and the
 * plaque listens to the embed's own postMessage reports (`youtubeBridge`) so
 * `soundtrack.playing` and the placard timecode follow what the player is
 * really doing. No YouTube script is loaded (the public CSP forbids it). If the
 * player stays unstarted, the capture layer lifts so one click on YouTube's own
 * play button starts it; if the embed never answers, behaviour falls back to the
 * click-anchored clock.
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
import {
  YOUTUBE_EMBED_ORIGIN,
  listeningMessage,
  parseYoutubeMessage,
  type PlayerState,
} from './youtubeBridge';
import type { ZoomTier } from './zoomTier';

/** Re-post the `listening` handshake until the embed answers. */
const LISTENING_RETRY_MS = 250;
/** No answer this long after `load`: assume the bridge is unavailable. */
const BRIDGE_SILENCE_MS = 3000;
/** Unstarted or cued this long after the first report: autoplay was refused. */
const AUTOPLAY_REFUSAL_MS = 1500;
/** Re-anchor the clock when the reported position drifts this far from our interpolation. */
const CLOCK_DRIFT_SEC = 0.75;

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
  // The iframe element once it has fired `load`; the bridge opens on it.
  const [loadedFrame, setLoadedFrame] = useState<HTMLIFrameElement | null>(null);

  const iframeVisible = showsIframeFor(state, album.id);
  const activeFrame = iframeVisible && loadedFrame?.isConnected ? loadedFrame : null;

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

  // Player-state bridge: handshake, filtered listener, autoplay-refusal and
  // silent-embed timers, and the throttled clock write. All timers and the
  // listener are torn down with the iframe.
  useEffect(() => {
    const target = activeFrame?.contentWindow;
    if (!activeFrame || !target) return undefined;

    const albumId = album.id;
    const debug = new URLSearchParams(window.location.search).has('debugSoundtrack');

    let heard = false;
    let lastState: PlayerState | null = null;
    let anchored = false;
    let clockPos = 0;
    let clockAt = 0;
    let refusalTimer: number | null = null;

    const store = () => useWallStore.getState();

    const writeClock = (positionSec: number) => {
      anchored = true;
      clockPos = positionSec;
      clockAt = performance.now();
      store().setSoundtrackClock({ albumId, positionSec, at: clockAt });
    };
    const interpolated = () =>
      lastState === 1 ? clockPos + (performance.now() - clockAt) / 1000 : clockPos;

    const post = () => {
      try {
        target.postMessage(listeningMessage(albumId), YOUTUBE_EMBED_ORIGIN);
      } catch {
        // A torn-down frame: the silence timer handles the fallback.
      }
    };

    post();
    const retryTimer = window.setInterval(post, LISTENING_RETRY_MS);

    const silenceTimer = window.setTimeout(() => {
      window.clearInterval(retryTimer);
      if (heard) return;
      if (debug) console.info('[soundtrack] bridge unavailable, using the click-anchored clock');
      store().dispatchSoundtrack({ type: 'bridge-unavailable', albumId });
      store().setSoundtrackClock({ albumId, positionSec: 0, at: performance.now() });
    }, BRIDGE_SILENCE_MS);

    const onMessage = (event: MessageEvent) => {
      // Only the embed we mounted may drive playback state.
      if (event.origin !== YOUTUBE_EMBED_ORIGIN || event.source !== target) return;

      if (!heard) {
        heard = true;
        window.clearInterval(retryTimer);
        window.clearTimeout(silenceTimer);
        refusalTimer = window.setTimeout(() => {
          refusalTimer = null;
          if (lastState === -1 || lastState === 5) {
            if (debug) console.info('[soundtrack] autoplay refused, lifting the capture layer');
            store().dispatchSoundtrack({ type: 'lift-capture-layer' });
          }
        }, AUTOPLAY_REFUSAL_MS);
      }

      const parsed = parseYoutubeMessage(event.data);
      if (debug) console.info('[soundtrack]', parsed ?? event.data);
      if (!parsed) return;

      const expected = interpolated();
      const stateChanged = parsed.state !== undefined && parsed.state !== lastState;

      if (parsed.state !== undefined) {
        if (parsed.state === 1 || parsed.state === 3) {
          if (refusalTimer !== null) {
            window.clearTimeout(refusalTimer);
            refusalTimer = null;
          }
        }
        if (stateChanged) {
          lastState = parsed.state;
          store().dispatchSoundtrack({ type: 'player-state', albumId, state: parsed.state });
        }
      }

      if (parsed.currentTime !== undefined) {
        if (
          !anchored ||
          stateChanged ||
          Math.abs(parsed.currentTime - expected) > CLOCK_DRIFT_SEC
        ) {
          writeClock(parsed.currentTime);
        }
      } else if (stateChanged) {
        writeClock(expected);
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(retryTimer);
      window.clearTimeout(silenceTimer);
      if (refusalTimer !== null) window.clearTimeout(refusalTimer);
    };
  }, [activeFrame, album.id]);

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
  const facade = !iframeVisible;
  const armed = iframeVisible && captureLayerActive(state);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

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
          src={`https://www.youtube-nocookie.com/embed/${soundtrack.videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(origin)}`}
          title={soundtrack.title ?? `${album.title} soundtrack`}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          onLoad={(event) => setLoadedFrame(event.currentTarget)}
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
