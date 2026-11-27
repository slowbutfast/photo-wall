'use client';

/**
 * Full-width bottom Photo Focus bar.
 *
 * Shows plain `PREV` / `NEXT`, the album caption as the primary line, optional
 * owner-entered `Date • Location` (only populated fields), and a right-hand
 * spacer aligned to the persistent bottom-right `RETURN` button in
 * `GalleryHud`. Stays mounted with `is-hidden` + `inert` outside Print Focus so
 * the bar can slide/fade while the last visible caption is latched (never
 * fading out blank).
 */

import { useEffect, useRef } from 'react';

import { useWallStore } from '@/store/useWallStore';

export default function PhotoFocusBar() {
  const viewMode = useWallStore((state) => state.viewMode);
  const focusedAlbumId = useWallStore((state) => state.focusedAlbumId);
  const focusedPhotoId = useWallStore((state) => state.focusedPhotoId);
  const albums = useWallStore((state) => state.wall.albums);
  const stepPhoto = useWallStore((state) => state.stepPhoto);
  const setBottomInset = useWallStore((state) => state.setBottomInset);

  const barRef = useRef<HTMLDivElement>(null);
  const album = albums.find((candidate) => candidate.id === focusedAlbumId) ?? null;
  const photo = album?.photos.find((candidate) => candidate.id === focusedPhotoId) ?? null;
  const visible = viewMode === 'print' && Boolean(album) && Boolean(photo);

  /*
   * `returnOneLevel()` keeps `focusedAlbumId` when stepping Print Focus ->
   * Album View, so the caption is still available for the whole `0.22s` exit
   * fade (never blank). Overview clears it, but the bar is already hidden.
   */
  const shown = album && viewMode !== 'overview' ? album : null;

  useEffect(() => {
    if (!visible) {
      setBottomInset(0);
      return;
    }
    const measure = () => {
      const height = barRef.current?.getBoundingClientRect().height ?? 0;
      setBottomInset(height + 10);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      setBottomInset(0);
    };
  }, [visible, setBottomInset]);

  const metadata = shown
    ? [shown.dateLabel, shown.locationLabel]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join(' • ')
    : '';

  return (
    <div
      className={`photo-focus-bar${visible ? '' : ' is-hidden'}`}
      ref={barRef}
      role="region"
      aria-label="Photo focus"
      aria-hidden={visible ? undefined : true}
      inert={visible ? undefined : true}
    >
      <div className="photo-focus-nav">
        <button type="button" className="hud-button" onClick={() => stepPhoto(-1)}>
          PREV
        </button>
        <button type="button" className="hud-button" onClick={() => stepPhoto(1)}>
          NEXT
        </button>
      </div>

      <div className="photo-focus-info">
        {shown ? (
          <>
            <span className="photo-focus-title hud-label">
              {shown.description || shown.title}
            </span>
            {metadata ? <span className="photo-focus-meta hud-meta">{metadata}</span> : null}
          </>
        ) : null}
      </div>

      <span className="hud-button photo-focus-return-spacer" aria-hidden="true">
        RETURN
      </span>
    </div>
  );
}
