'use client';

/**
 * Full-width bottom Photo Focus bar.
 *
 * Shows `Prev` / `Next`, the album caption as the primary line, optional
 * owner-entered `Camera • Date • Location` (only populated fields), and
 * `Return (Esc)`. Never blurs the surrounding gallery.
 */

import { useEffect, useRef } from 'react';

import { useWallStore } from '@/store/useWallStore';

export default function PhotoFocusBar() {
  const viewMode = useWallStore((state) => state.viewMode);
  const focusedAlbumId = useWallStore((state) => state.focusedAlbumId);
  const focusedPhotoId = useWallStore((state) => state.focusedPhotoId);
  const albums = useWallStore((state) => state.wall.albums);
  const stepPhoto = useWallStore((state) => state.stepPhoto);
  const returnOneLevel = useWallStore((state) => state.returnOneLevel);
  const setBottomInset = useWallStore((state) => state.setBottomInset);

  const barRef = useRef<HTMLDivElement>(null);
  const album = albums.find((candidate) => candidate.id === focusedAlbumId) ?? null;
  const photo = album?.photos.find((candidate) => candidate.id === focusedPhotoId) ?? null;
  const visible = viewMode === 'print' && Boolean(album) && Boolean(photo);

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

  if (!visible || !album || !photo) return null;

  const metadata = [album.cameraName, album.dateLabel, album.locationLabel]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' • ');

  return (
    <div className="photo-focus-bar" ref={barRef} role="region" aria-label="Photo focus">
      <div className="photo-focus-nav">
        <button type="button" className="hud-button" onClick={() => stepPhoto(-1)}>
          <span aria-hidden="true">←</span> PREV
        </button>
        <button type="button" className="hud-button" onClick={() => stepPhoto(1)}>
          NEXT <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className="photo-focus-info">
        <span className="photo-focus-title hud-label">{album.description || album.title}</span>
        {metadata ? <span className="photo-focus-meta hud-meta">{metadata}</span> : null}
      </div>

      <button type="button" className="hud-button hud-button-primary" onClick={returnOneLevel}>
        RETURN [ESC]
      </button>
    </div>
  );
}
