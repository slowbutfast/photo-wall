'use client';

/**
 * Persistent split Curator Studio.
 *
 * Desktop (`>= 1024px`): `<GalleryCanvas mode="preview" />` fills the left
 * stage beside a persistent `440px` sidebar with **Exhibitions | Upload |
 * Settings** tabs. Mobile: a **Wall Preview / Manage Studio** switcher hides or
 * shows the panes without unmounting them, so upload queues and unsaved state
 * survive tab switches. Every request goes through `withBase()`.
 */

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

import { withBase } from '@/lib/basePath';
import { MAX_PHOTOS_PER_ALBUM } from '@/lib/layout/islandLayout';
import type { Mood } from '@/lib/lighting/nyTimeMood';
import { PLAYGROUND_THEMES, playgroundThemeStyle } from '@/lib/lighting/playgroundTheme';
import { PLACARD_MATERIAL_OPTIONS } from '@/components/wall/placardMaterial';
import GalleryCanvas from '@/components/wall/GalleryCanvas';
import { useWallManifest } from '@/components/wall/useWallManifest';
import { useWallStore } from '@/store/useWallStore';

import FolderDropzone from './FolderDropzone';

type StudioTab = 'exhibitions' | 'upload' | 'settings';
type MobilePane = 'preview' | 'manage';

interface AdminAlbumSummary {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'deleting';
  photoCount: number;
}

const MOOD_OPTIONS: Array<{ label: string; value: Mood | 'auto' }> = [
  { label: 'Auto (NYC)', value: 'auto' },
  { label: 'Alabaster', value: 'alabaster' },
  { label: 'Concrete', value: 'concrete' },
  { label: 'Chiaroscuro', value: 'chiaroscuro' },
];

const PREVIEW_MANIFEST_URL = withBase('/api/admin/wall-preview');

export interface CuratorStudioProps {
  initialMood: Mood;
}

export default function CuratorStudio({ initialMood }: CuratorStudioProps) {
  const [tab, setTab] = useState<StudioTab>('exhibitions');
  const [mobilePane, setMobilePane] = useState<MobilePane>('preview');
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [adminAlbums, setAdminAlbums] = useState<AdminAlbumSummary[]>([]);
  const [albumsError, setAlbumsError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const manualMood = useWallStore((state) => state.manualMood);
  const setManualMood = useWallStore((state) => state.setManualMood);
  const placardMaterial = useWallStore((state) => state.placardMaterial);
  const setPlacardMaterial = useWallStore((state) => state.setPlacardMaterial);
  const enterAlbum = useWallStore((state) => state.enterAlbum);
  const goOverview = useWallStore((state) => state.goOverview);

  const manifest = useWallManifest(undefined, {
    manifestUrl: PREVIEW_MANIFEST_URL,
  });

  const effectiveMood = manualMood ?? initialMood;
  const theme = PLAYGROUND_THEMES[effectiveMood];

  useEffect(() => {
    useWallStore.getState().hydratePlacardMaterial();
  }, []);

  const loadAdminAlbums = useCallback(async () => {
    try {
      const response = await fetch(withBase('/api/admin/albums'), {
        credentials: 'same-origin',
      });
      if (response.status === 401 || response.status === 403) {
        window.location.assign(withBase('/admin/login'));
        return;
      }
      if (!response.ok) {
        setAlbumsError('Could not load albums.');
        return;
      }
      const payload = (await response.json()) as { albums?: AdminAlbumSummary[] };
      setAdminAlbums(payload.albums ?? []);
      setAlbumsError(null);
    } catch {
      setAlbumsError('Could not load albums.');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAdminAlbums();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAdminAlbums]);

  const handleSelectAlbum = useCallback((albumId: string) => {
    setSelectedAlbumId(albumId);
  }, []);

  const selectFromDirectory = (albumId: string) => {
    setSelectedAlbumId(albumId);
    enterAlbum(albumId);
  };

  const handleSignOut = async () => {
    try {
      await fetch(withBase('/api/admin/auth'), {
        method: 'DELETE',
        credentials: 'same-origin',
      });
    } catch {
      // The cookie clear failed; send the curator to login anyway.
    }
    window.location.assign(withBase('/admin/login'));
  };

  const handleRetryDeletions = async () => {
    setRetrying(true);
    try {
      await fetch(withBase('/api/admin/deletions/retry'), {
        method: 'POST',
        credentials: 'same-origin',
      });
      await Promise.all([loadAdminAlbums(), manifest.refresh()]);
    } catch {
      setAlbumsError('Retry failed.');
    } finally {
      setRetrying(false);
    }
  };

  const deletingAlbums = adminAlbums.filter((album) => album.status === 'deleting');

  return (
    <div className="studio-shell" data-pane={mobilePane}>
      <section className="studio-stage" aria-label="Live wall preview">
        <div
          className="studio-canvas-root gallery-root-inner playground-wall-root"
          data-mood={effectiveMood}
          style={playgroundThemeStyle(theme) as CSSProperties}
        >
          <GalleryCanvas
            albums={manifest.albums}
            lodUrl={manifest.lodUrl}
            theme={theme}
            mode="preview"
            selectedAlbumId={selectedAlbumId}
            onSelectAlbum={handleSelectAlbum}
          />
        </div>
        {manifest.loading ? (
          <p className="studio-stage-status" role="status">
            Loading wall preview…
          </p>
        ) : null}
        {manifest.error ? (
          <p className="studio-stage-status studio-stage-error" role="alert">
            {manifest.error}
          </p>
        ) : null}
      </section>

      <aside className="studio-sidebar" aria-label="Curator Studio">
        <header className="studio-header">
          <div>
            <p className="studio-eyebrow">Chiaroscuro Gallery</p>
            <h1 className="studio-title">Curator Studio</h1>
          </div>
          <button type="button" className="admin-text-button" onClick={() => void handleSignOut()}>
            Sign Out
          </button>
        </header>

        <nav className="studio-tabs" role="tablist" aria-label="Studio sections">
          {(['exhibitions', 'upload', 'settings'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={tab === candidate}
              className={`studio-tab${tab === candidate ? ' active' : ''}`}
              onClick={() => setTab(candidate)}
            >
              {candidate === 'exhibitions'
                ? 'Exhibitions'
                : candidate === 'upload'
                  ? 'Upload'
                  : 'Settings'}
            </button>
          ))}
        </nav>

        <div className="studio-body">
          <section
            className="studio-panel"
            data-active={tab === 'exhibitions'}
            aria-label="Exhibitions"
          >
            <div className="admin-section-header">
              <h2 className="studio-panel-title">Wall Directory</h2>
              <button type="button" className="admin-text-button" onClick={goOverview}>
                Overview
              </button>
            </div>
            {manifest.albums.length === 0 ? (
              <p className="admin-note">No albums on the wall yet.</p>
            ) : (
              <ul className="studio-album-list">
                {manifest.albums.map((album) => (
                  <li key={album.id}>
                    <button
                      type="button"
                      className={`studio-album${
                        selectedAlbumId === album.id ? ' active' : ''
                      }`}
                      onClick={() => selectFromDirectory(album.id)}
                    >
                      <span className="studio-album-title">{album.title}</span>
                      <span className="studio-album-meta">
                        <span
                          className={`studio-status studio-status-${album.status ?? 'published'}`}
                        >
                          {album.status ?? 'published'}
                        </span>
                        <span>{album.photos.length} prints</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="studio-panel"
            data-active={tab === 'upload'}
            aria-label="Upload"
          >
            <div className="admin-section-header">
              <h2 className="studio-panel-title">Upload an Album</h2>
            </div>
            <p className="admin-note">
              Drop a folder of up to {MAX_PHOTOS_PER_ALBUM} images. Drafts appear on the preview
              wall with a dashed mat until published.
            </p>
            <FolderDropzone />
          </section>

          <section
            className="studio-panel"
            data-active={tab === 'settings'}
            aria-label="Settings"
          >
            <section className="admin-section">
              <h2 className="studio-panel-title">Lighting Preview</h2>
              <p className="admin-note">
                Client-only. Public visitors always follow NYC solar time.
              </p>
              <div className="admin-segmented admin-segmented-wrap">
                {MOOD_OPTIONS.map((option) => {
                  const active =
                    option.value === 'auto' ? manualMood === null : manualMood === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`admin-segment${active ? ' active' : ''}`}
                      onClick={() =>
                        setManualMood(option.value === 'auto' ? null : (option.value as Mood))
                      }
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="admin-section">
              <h2 className="studio-panel-title">Placard Material</h2>
              <p className="admin-note">
                Default is Beveled Glass. The wall mounts at most {MAX_PHOTOS_PER_ALBUM} prints per
                album.
              </p>
              <div className="admin-segmented admin-segmented-wrap">
                {PLACARD_MATERIAL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`admin-segment${
                      placardMaterial === option.value ? ' active' : ''
                    }`}
                    onClick={() => setPlacardMaterial(option.value)}
                    title={option.hint}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="admin-section">
              <div className="admin-section-header">
                <h2 className="studio-panel-title">Pending Deletions</h2>
                <button
                  type="button"
                  className="admin-text-button"
                  disabled={retrying || deletingAlbums.length === 0}
                  onClick={() => void handleRetryDeletions()}
                >
                  {retrying ? 'Retrying…' : 'Retry all'}
                </button>
              </div>
              {albumsError ? <p className="admin-error">{albumsError}</p> : null}
              {deletingAlbums.length === 0 ? (
                <p className="admin-note">No pending deletions.</p>
              ) : (
                <ul className="admin-list">
                  {deletingAlbums.map((album) => (
                    <li key={album.id} className="admin-list-item">
                      <span>{album.title}</span>
                      <span className="admin-badge">deleting</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </section>
        </div>
      </aside>

      <div className="studio-mobile-switcher" role="tablist" aria-label="Studio view">
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'preview'}
          className={`studio-mobile-tab${mobilePane === 'preview' ? ' active' : ''}`}
          onClick={() => setMobilePane('preview')}
        >
          Wall Preview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'manage'}
          className={`studio-mobile-tab${mobilePane === 'manage' ? ' active' : ''}`}
          onClick={() => setMobilePane('manage')}
        >
          Manage Studio
        </button>
      </div>
    </div>
  );
}
