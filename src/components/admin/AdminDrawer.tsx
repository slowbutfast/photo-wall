'use client';

/**
 * Slide-over Curator Drawer (loaded through `next/dynamic({ ssr: false })`).
 *
 * Password login against `POST /api/admin/auth`, recursive folder uploads, a
 * client-local Lighting Preview selector, and the Pending Deletions retry list.
 * The drawer surface follows the `admin-surface` / `admin-ink` / `admin-accent`
 * tokens from `DESIGN.md`.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';

import { MAX_PHOTOS_PER_ALBUM } from '@/lib/layout/islandLayout';
import type { Mood } from '@/lib/lighting/nyTimeMood';
import { PLACARD_MATERIAL_OPTIONS } from '@/components/wall/placardMaterial';
import { useWallStore } from '@/store/useWallStore';

import FolderDropzone from './FolderDropzone';

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

export interface AdminDrawerProps {
  onClose: () => void;
}

export default function AdminDrawer({ onClose }: AdminDrawerProps) {
  const authenticated = useWallStore((state) => state.authenticated);
  const authChecked = useWallStore((state) => state.authChecked);
  const manualMood = useWallStore((state) => state.manualMood);
  const setManualMood = useWallStore((state) => state.setManualMood);
  const placardMaterial = useWallStore((state) => state.placardMaterial);
  const setPlacardMaterial = useWallStore((state) => state.setPlacardMaterial);
  const setAuthenticated = useWallStore((state) => state.setAuthenticated);
  const refreshAuth = useWallStore((state) => state.refreshAuth);

  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [albums, setAlbums] = useState<AdminAlbumSummary[]>([]);
  const [albumsError, setAlbumsError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const loadAlbums = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/albums', { credentials: 'same-origin' });
      if (response.status === 401 || response.status === 403) {
        setAuthenticated(false);
        return;
      }
      if (!response.ok) {
        setAlbumsError('Could not load albums.');
        return;
      }
      const payload = (await response.json()) as { albums?: AdminAlbumSummary[] };
      setAlbums(payload.albums ?? []);
      setAlbumsError(null);
    } catch {
      setAlbumsError('Could not load albums.');
    }
  }, [setAuthenticated]);

  useEffect(() => {
    if (authChecked) return;
    const timer = window.setTimeout(() => {
      void refreshAuth();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authChecked, refreshAuth]);

  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setTimeout(() => {
      void loadAlbums();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authenticated, loadAlbums]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setLoginError(null);
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setLoginError('Incorrect password.');
        return;
      }
      setPassword('');
      setAuthenticated(true);
    } catch {
      setLoginError('Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE', credentials: 'same-origin' });
    } catch {
      // Clearing the cookie failed; force a local signed-out state anyway.
    }
    setAuthenticated(false);
  };

  const handleRetryDeletions = async () => {
    setRetrying(true);
    try {
      await fetch('/api/admin/deletions/retry', {
        method: 'POST',
        credentials: 'same-origin',
      });
      await loadAlbums();
      await useWallStore.getState().refreshWall();
    } catch {
      setAlbumsError('Retry failed.');
    } finally {
      setRetrying(false);
    }
  };

  const deletingAlbums = albums.filter((album) => album.status === 'deleting');
  const draftAlbums = albums.filter((album) => album.status === 'draft');

  return (
    <aside className="admin-drawer" aria-label="Curator Drawer">
      <header className="admin-drawer-header">
        <div>
          <h2 className="admin-drawer-title">Curate &amp; Upload</h2>
          <p className="admin-drawer-sub">Private wall management</p>
        </div>
        <button type="button" className="admin-icon-button" onClick={onClose} aria-label="Close Curator Drawer">
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>

      <div className="admin-drawer-body">
        {!authenticated ? (
          <form className="admin-login" onSubmit={handleLogin}>
            <p className="admin-note">
              {authChecked
                ? 'Enter the curator password to manage the wall.'
                : 'Checking session…'}
            </p>
            <label className="admin-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {loginError ? <p className="admin-error">{loginError}</p> : null}
            <button type="submit" className="admin-button admin-button-primary" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <>
            <section className="admin-section">
              <div className="admin-section-header">
                <h3>Folder upload</h3>
                <button type="button" className="admin-text-button" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
              <FolderDropzone />
            </section>

            <section className="admin-section">
              <h3>Lighting Preview</h3>
              <p className="admin-note">Client-only. Public visitors always follow NYC solar time.</p>
              <div className="admin-segmented">
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
              <h3>Placard Material</h3>
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
                <h3>Pending Deletions</h3>
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
              {draftAlbums.length > 0 ? (
                <>
                  <h4 className="admin-subhead">Drafts</h4>
                  <ul className="admin-list">
                    {draftAlbums.map((album) => (
                      <li key={album.id} className="admin-list-item">
                        <span>{album.title}</span>
                        <span className="admin-badge">{album.photoCount} photos</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
