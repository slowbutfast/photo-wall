'use client';

/**
 * Quiet gallery ephemera HUD for the strictly read-only public wall.
 *
 * Top-right `Overview` plus a bottom Exhibition Room Directory that flies to an
 * album on click. No curator trigger, no auth probe and no manual mood control:
 * all curation lives in the server-gated `/admin` tree.
 */

import { useWallStore } from '@/store/useWallStore';

export default function GalleryHud() {
  const albums = useWallStore((state) => state.wall.albums);
  const viewMode = useWallStore((state) => state.viewMode);
  const focusedAlbumId = useWallStore((state) => state.focusedAlbumId);
  const goOverview = useWallStore((state) => state.goOverview);
  const enterAlbum = useWallStore((state) => state.enterAlbum);

  return (
    <>
      <div className="gallery-hud hud-top-right">
        <button
          type="button"
          className={`hud-button${viewMode === 'overview' ? ' active' : ''}`}
          onClick={goOverview}
          title="Return to Gallery Overview (0)"
        >
          Overview
        </button>
      </div>

      {albums.length > 0 && viewMode !== 'print' ? (
        <nav className="hud-directory" aria-label="Exhibition Room Directory">
          <div className="hud-directory-list">
            {albums.map((album) => (
              <button
                key={album.id}
                type="button"
                className={`hud-directory-item${
                  focusedAlbumId === album.id ? ' active' : ''
                }`}
                onClick={() => enterAlbum(album.id)}
                title={`Fly to ${album.title}`}
              >
                {album.title}
              </button>
            ))}
          </div>
        </nav>
      ) : null}
    </>
  );
}
