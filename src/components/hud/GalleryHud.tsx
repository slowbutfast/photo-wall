'use client';

/**
 * Quiet gallery ephemera HUD.
 *
 * Top-right `Overview` plus a subtle lock icon until `GET /api/admin/auth`
 * reports a session (`Curate` afterwards), and a bottom Exhibition Room
 * Directory that flies to an album on click. No top-left telemetry and no
 * manual mood control for public visitors.
 */

import { Lock } from 'lucide-react';

import { useWallStore } from '@/store/useWallStore';

export default function GalleryHud() {
  const albums = useWallStore((state) => state.wall.albums);
  const authenticated = useWallStore((state) => state.authenticated);
  const authChecked = useWallStore((state) => state.authChecked);
  const viewMode = useWallStore((state) => state.viewMode);
  const focusedAlbumId = useWallStore((state) => state.focusedAlbumId);
  const goOverview = useWallStore((state) => state.goOverview);
  const enterAlbum = useWallStore((state) => state.enterAlbum);
  const setCuratorOpen = useWallStore((state) => state.setCuratorOpen);

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
        <button
          type="button"
          className="hud-button hud-button-lock"
          onClick={() => setCuratorOpen(true)}
          title={authenticated ? 'Open Curator Drawer' : 'Curator sign in'}
          aria-label={authenticated ? 'Open Curator Drawer' : 'Curator locked'}
        >
          {authenticated ? (
            <span className="hud-curate-label">Curate</span>
          ) : (
            <Lock size={13} strokeWidth={1.75} aria-hidden="true" />
          )}
          {!authenticated && authChecked ? <span className="sr-only">Curator locked</span> : null}
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
