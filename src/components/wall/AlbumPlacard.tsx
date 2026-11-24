'use client';

/**
 * Pure presentational album placard.
 *
 * Fixed `214×200px` anatomy: title, optional `[Date · Time · Location]`, draft
 * badge, bottom-pinned soundtrack line with live tabular timecode, and the two
 * metallic corner standoffs. Geometry is computed by `islandLayout` and passed
 * in as `placedStyle`; selection and drag suppression stay in `GalleryCanvas`.
 */

import { useEffect, useState } from 'react';

import type { WallAlbum } from '@/lib/layout/types';
import { useWallStore } from '@/store/useWallStore';

import type { CssRect } from './islandPlacement';
import type { PlacardMaterial } from './placardMaterial';

/** Empty metadata halves collapse cleanly with no stray separators. */
function placardMetaLine(album: WallAlbum): string {
  return [album.dateLabel, album.locationLabel]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(' · ');
}

/** `0:42` / `3:25` tabular timecode formatting. */
function formatClock(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const whole = Math.floor(totalSeconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Live placard timecode.
 *
 * The public CSP intentionally does not load `www.youtube.com/iframe_api`, so
 * the plaque cannot read the native player's clock. Anchor a local ticker to the
 * explicit play click instead (the embedded player also starts at 0 on mount)
 * and clamp it to the stored duration. Nothing renders once playback stops.
 */
function PlacardTimecode({
  albumId,
  durationSec,
}: {
  albumId: string;
  durationSec: number | null;
}) {
  const playing = useWallStore(
    (store) => store.soundtrack.playing && store.soundtrack.activeAlbumId === albumId,
  );
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();
    const tick = () => {
      const seconds = Math.floor((performance.now() - startedAt) / 1000);
      setElapsed(
        durationSec !== null && durationSec > 0 ? Math.min(seconds, durationSec) : seconds,
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [albumId, durationSec, playing]);

  return (
    <span className="placard-timecode" aria-live="off">
      {formatClock(playing ? elapsed : 0)}
      {durationSec !== null && durationSec > 0 ? ` / ${formatClock(durationSec)}` : ''}
    </span>
  );
}

export interface AlbumPlacardProps {
  album: WallAlbum;
  /** Island-local CSS placement from `islandRectStyle`. */
  placedStyle: CssRect;
  material: PlacardMaterial;
  isDraft: boolean;
  /** Per-object `--lit*` custom properties from `playgroundLighting`. */
  lightingVars?: Record<string, string>;
  onSelectAlbum: (albumId: string) => void;
  wasDragged: () => boolean;
}

export default function AlbumPlacard({
  album,
  placedStyle,
  material,
  isDraft,
  lightingVars,
  onSelectAlbum,
  wasDragged,
}: AlbumPlacardProps) {
  const metaLine = placardMetaLine(album);
  const trackLine = album.soundtrack
    ? [album.soundtrack.title, album.soundtrack.artist].filter(Boolean).join(' — ') ||
      'Soundtrack'
    : '';

  return (
    <button
      type="button"
      className={`museum-placard mat-${material} is-lit${isDraft ? ' is-draft' : ''}`}
      style={{ ...placedStyle, ...(lightingVars ?? {}) }}
      onClick={(event) => {
        event.stopPropagation();
        if (wasDragged()) return;
        onSelectAlbum(album.id);
      }}
      aria-label={`${isDraft ? 'Draft album ' : 'Open '}${album.title}`}
    >
      <h3 className="placard-title">{album.title}</h3>
      {metaLine ? <p className="placard-meta">{metaLine}</p> : null}
      {isDraft ? <span className="placard-draft-badge">Draft</span> : null}
      {album.soundtrack ? (
        <span className="placard-soundtrack">
          <span className="placard-track-name" title={trackLine}>
            {trackLine}
          </span>
          <PlacardTimecode albumId={album.id} durationSec={album.soundtrack.durationSec} />
        </span>
      ) : null}
      <span className="placard-standoff left" />
      <span className="placard-standoff right" />
    </button>
  );
}
