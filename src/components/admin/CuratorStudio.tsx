'use client';

/**
 * Persistent split Curator Studio.
 *
 * Desktop (`>= 1024px`): `<GalleryCanvas mode="preview" />` fills the left
 * stage beside a persistent `440px` sidebar with **Exhibitions | Upload |
 * Settings** tabs. Mobile: a **Wall Preview / Manage Studio** switcher hides or
 * shows the panes without unmounting them, so upload queues and unsaved state
 * survive tab switches.
 *
 * The **Exhibitions** tab is the album wall-order editor plus the two-tab
 * `AlbumEditor`. All reordering is local until an explicit **Save Wall Order** /
 * **Save Order**, and every unsaved edit is layered onto the preview wall
 * through `previewAlbums` (no server calls, no autosave churn). Every request
 * goes through `withBase()`.
 */

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

import { withBase } from '@/lib/basePath';
import { MAX_PHOTOS_PER_ALBUM, computeWallGridPositions } from '@/lib/layout/islandLayout';
import type { WallAlbum, WallPhoto } from '@/lib/layout/types';
import type { Mood } from '@/lib/lighting/nyTimeMood';
import { PLAYGROUND_THEMES, playgroundThemeStyle } from '@/lib/lighting/playgroundTheme';
import { PLACARD_MATERIAL_OPTIONS } from '@/components/wall/placardMaterial';
import GalleryCanvas from '@/components/wall/GalleryCanvas';
import { useWallManifest } from '@/components/wall/useWallManifest';
import { useWallStore } from '@/store/useWallStore';

import AlbumEditor, {
  type AlbumEditorAlbum,
  type AlbumEditorDraft,
  type AlbumEditorPhoto,
} from './AlbumEditor';
import FolderDropzone from './FolderDropzone';
import { isOrderDirty, mergeStaleOrder, moveWithinSubset } from './photoOrderState';

type StudioTab = 'exhibitions' | 'upload' | 'settings';
type MobilePane = 'preview' | 'manage';
type AlbumFilter = 'all' | 'published' | 'draft';

interface AdminAlbumSummary {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'deleting';
  photoCount: number;
}

interface AdminAlbumDetail {
  album: AlbumEditorAlbum;
  photos: AlbumEditorPhoto[];
  cdnBase: string;
}

const MOOD_OPTIONS: Array<{ label: string; value: Mood | 'auto' }> = [
  { label: 'Auto (NYC)', value: 'auto' },
  { label: 'Alabaster', value: 'alabaster' },
  { label: 'Concrete', value: 'concrete' },
  { label: 'Chiaroscuro', value: 'chiaroscuro' },
];

const FILTER_OPTIONS: Array<{ label: string; value: AlbumFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Published', value: 'published' },
  { label: 'Draft', value: 'draft' },
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

  const [filter, setFilter] = useState<AlbumFilter>('all');
  const [wallOrder, setWallOrder] = useState<string[] | null>(null);
  const [savingWallOrder, setSavingWallOrder] = useState(false);
  const [wallError, setWallError] = useState<string | null>(null);
  const [wallNotice, setWallNotice] = useState<string | null>(null);

  const [detail, setDetail] = useState<AdminAlbumDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<AlbumEditorDraft | null>(null);

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

  // --- Wall order ----------------------------------------------------------
  const serverAlbumIds = useMemo(
    () => manifest.albums.map((album) => album.id),
    [manifest.albums],
  );

  // Reconcile a pending local order with the current server set without an
  // effect: concurrent uploads append, deletes drop, and a converged order
  // falls back to the server list.
  const effectiveWallOrder = useMemo(() => {
    if (wallOrder === null) return serverAlbumIds;
    const merged = mergeStaleOrder(wallOrder, serverAlbumIds);
    return isOrderDirty(merged, serverAlbumIds) ? merged : serverAlbumIds;
  }, [wallOrder, serverAlbumIds]);

  const wallOrderDirty =
    wallOrder !== null && isOrderDirty(effectiveWallOrder, serverAlbumIds);
  const albumById = useMemo(
    () => new Map(manifest.albums.map((album) => [album.id, album])),
    [manifest.albums],
  );
  const orderedAlbums = useMemo(
    () =>
      effectiveWallOrder
        .map((id) => albumById.get(id))
        .filter((album): album is WallAlbum => Boolean(album)),
    [effectiveWallOrder, albumById],
  );
  const visibleAlbums = useMemo(
    () => orderedAlbums.filter((album) => filter === 'all' || album.status === filter),
    [orderedAlbums, filter],
  );

  const applyWallOrder = useCallback(
    (next: string[]) => {
      setWallOrder(isOrderDirty(next, serverAlbumIds) ? next : null);
      setWallNotice(null);
      setWallError(null);
    },
    [serverAlbumIds],
  );

  const visibleAlbumIds = useMemo(
    () => visibleAlbums.map((album) => album.id),
    [visibleAlbums],
  );

  const moveAlbum = useCallback(
    (from: number, to: number) => {
      applyWallOrder(
        moveWithinSubset(effectiveWallOrder, visibleAlbumIds, from, to),
      );
    },
    [effectiveWallOrder, visibleAlbumIds, applyWallOrder],
  );

  const albumSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleAlbumDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = visibleAlbumIds.indexOf(String(active.id));
    const to = visibleAlbumIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    moveAlbum(from, to);
  };

  const saveWallOrder = async () => {
    if (!wallOrderDirty || savingWallOrder) return;
    setSavingWallOrder(true);
    setWallError(null);
    setWallNotice(null);
    try {
      const response = await fetch(withBase('/api/admin/album-order'), {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumIds: effectiveWallOrder }),
      });

      if (response.status === 409) {
        const payload = (await response.json()) as {
          error?: string;
          activeAlbumIds?: string[];
        };
        if (payload.error === 'order_stale' && payload.activeAlbumIds) {
          const merged = mergeStaleOrder(effectiveWallOrder, payload.activeAlbumIds);
          setWallOrder(isOrderDirty(merged, payload.activeAlbumIds) ? merged : null);
          setWallNotice(
            'Another tab changed the wall. New albums were appended and deleted ones dropped — your order is preserved. Review, then Save Wall Order again.',
          );
          await manifest.refresh();
          return;
        }
        setWallError('Could not save the wall order (409).');
        return;
      }

      if (!response.ok) {
        setWallError(`Could not save the wall order (${response.status}).`);
        return;
      }

      setWallOrder(null);
      setWallNotice('Wall order saved.');
      await manifest.refresh();
    } catch {
      setWallError('Save failed (network error). Your order is preserved.');
    } finally {
      setSavingWallOrder(false);
    }
  };

  const discardWallOrder = () => {
    setWallOrder(null);
    setWallNotice(null);
    setWallError(null);
  };

  // --- Album detail / editor ----------------------------------------------
  const loadDetail = useCallback(async (albumId: string): Promise<AdminAlbumDetail | null> => {
    const response = await fetch(withBase(`/api/admin/albums/${encodeURIComponent(albumId)}`), {
      credentials: 'same-origin',
    });
    if (response.status === 401 || response.status === 403) {
      window.location.assign(withBase('/admin/login'));
      return null;
    }
    if (!response.ok) return null;
    return (await response.json()) as AdminAlbumDetail;
  }, []);

  const selectAlbum = useCallback(
    async (albumId: string) => {
      setSelectedAlbumId(albumId);
      // Re-clicking the album already open must not discard unsaved edits.
      if (selectedAlbumId === albumId && detail) return;
      setEditorDraft(null);
      setDetailError(null);
      setDetailLoading(true);
      try {
        const fresh = await loadDetail(albumId);
        if (!fresh) {
          setDetail(null);
          setDetailError('Could not open that album.');
          return;
        }
        setDetail(fresh);
      } catch {
        setDetail(null);
        setDetailError('Could not open that album.');
      } finally {
        setDetailLoading(false);
      }
    },
    [detail, loadDetail, selectedAlbumId],
  );

  const handleSelectAlbum = useCallback(
    (albumId: string) => {
      setSelectedAlbumId(albumId);
      void selectAlbum(albumId);
    },
    [selectAlbum],
  );

  const selectFromDirectory = (albumId: string) => {
    setSelectedAlbumId(albumId);
    enterAlbum(albumId);
    void selectAlbum(albumId);
  };

  const backToDirectory = useCallback(() => {
    setSelectedAlbumId(null);
    setDetail(null);
    setEditorDraft(null);
    setDetailError(null);
  }, []);

  const handleDraftChange = useCallback((draft: AlbumEditorDraft) => {
    setEditorDraft(draft);
  }, []);

  const handleEditorSaved = useCallback(async () => {
    await manifest.refresh();
    if (selectedAlbumId) {
      try {
        const fresh = await loadDetail(selectedAlbumId);
        if (fresh) setDetail(fresh);
      } catch {
        // The wall refresh already reflects the save; keep the editor state.
      }
    }
  }, [manifest, selectedAlbumId, loadDetail]);

  const handleEditorDeleted = useCallback(async () => {
    backToDirectory();
    await Promise.all([manifest.refresh(), loadAdminAlbums()]);
  }, [backToDirectory, manifest, loadAdminAlbums]);

  // --- Live preview overlay ------------------------------------------------
  const previewAlbums = useMemo<WallAlbum[]>(() => {
    const base = manifest.albums.map((album) => ({ ...album, photos: [...album.photos] }));
    const byId = new Map(base.map((album) => [album.id, album]));
    const ordered: WallAlbum[] = [];
    for (const id of effectiveWallOrder) {
      const album = byId.get(id);
      if (album) ordered.push(album);
    }
    for (const album of base) {
      if (!effectiveWallOrder.includes(album.id)) ordered.push(album);
    }

    const overlaid = ordered.map((album) => {
      if (!editorDraft || !detail || album.id !== detail.album.id) return album;
      const photos: WallPhoto[] = editorDraft.photos.map((photo, index) => ({
        id: photo.id,
        storagePath: photo.storagePath,
        width: photo.width,
        height: photo.height,
        aspectRatio: photo.aspectRatio,
        dominantColor: photo.dominantColor,
        thumbHash: photo.thumbHash,
        sortOrder: index,
      }));
      return {
        ...album,
        title: editorDraft.title.trim() || album.title,
        gridColumns: editorDraft.gridColumns,
        dateLabel: editorDraft.dateLabel,
        locationLabel: editorDraft.locationLabel,
        soundtrack: editorDraft.soundtrack,
        photos,
      };
    });

    const placements = computeWallGridPositions(
      overlaid.map((album, index) => ({
        id: album.id,
        status: album.status ?? 'published',
        photoCount: album.photos.length,
        gridColumns: album.gridColumns,
        sortOrder: index,
        hasSoundtrack: album.soundtrack !== null,
      })),
      { includeStatuses: ['published', 'draft'] },
    );
    const placementById = new Map(placements.map((placement) => [placement.id, placement]));

    return overlaid.flatMap((album, index) => {
      const placement = placementById.get(album.id);
      if (!placement) return [];
      return [{ ...album, sortOrder: index, position: placement.position, bounds: placement.bounds }];
    });
  }, [manifest.albums, effectiveWallOrder, editorDraft, detail]);

  // --- Studio shell --------------------------------------------------------
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
            albums={previewAlbums}
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
            {selectedAlbumId ? (
              detail ? (
                <AlbumEditor
                  album={detail.album}
                  photos={detail.photos}
                  cdnBase={detail.cdnBase}
                  onBack={backToDirectory}
                  onDraftChange={handleDraftChange}
                  onSaved={handleEditorSaved}
                  onDeleted={() => void handleEditorDeleted()}
                />
              ) : detailLoading ? (
                <p className="admin-note" role="status">
                  Opening album…
                </p>
              ) : (
                <>
                  <p className="admin-error" role="alert">
                    {detailError ?? 'Could not open that album.'}
                  </p>
                  <button type="button" className="admin-text-button" onClick={backToDirectory}>
                    ← All Exhibitions
                  </button>
                </>
              )
            ) : (
              <>
                <div className="admin-section-header">
                  <h2 className="studio-panel-title">Exhibitions</h2>
                  <button type="button" className="admin-text-button" onClick={goOverview}>
                    Overview
                  </button>
                </div>
                <p className="admin-note">
                  {orderedAlbums.length} albums · Drag rows or use ↑/↓ to reorder the wall
                </p>

                <div className="admin-segmented admin-segmented-wrap" role="group" aria-label="Filter albums">
                  {FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`admin-segment${filter === option.value ? ' active' : ''}`}
                      onClick={() => setFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {wallNotice ? (
                  <div className="album-editor-banner is-warning" role="status">
                    <p>{wallNotice}</p>
                  </div>
                ) : null}
                {wallError ? (
                  <div className="album-editor-banner is-error" role="alert">
                    <p>{wallError}</p>
                    {wallOrderDirty ? (
                      <button
                        type="button"
                        className="admin-button"
                        onClick={() => void saveWallOrder()}
                      >
                        Retry Save Wall Order
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {manifest.albums.length === 0 ? (
                  <p className="admin-note">No albums on the wall yet.</p>
                ) : visibleAlbums.length === 0 ? (
                  <p className="admin-note">No {filter} albums.</p>
                ) : (
                  <DndContext
                    sensors={albumSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleAlbumDragEnd}
                  >
                    <SortableContext
                      items={visibleAlbums.map((album) => album.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="studio-album-list">
                        {visibleAlbums.map((album, index) => (
                          <SortableAlbumRow
                            key={album.id}
                            album={album}
                            index={index}
                            total={visibleAlbums.length}
                            selected={selectedAlbumId === album.id}
                            onSelect={() => selectFromDirectory(album.id)}
                            onMove={moveAlbum}
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}

                <div className="album-editor-savebar">
                  {wallOrderDirty ? (
                    <>
                      <span className="album-editor-dirty">Unsaved wall order</span>
                      <div className="album-editor-savebar-actions">
                        <button
                          type="button"
                          className="admin-button"
                          onClick={discardWallOrder}
                        >
                          Discard
                        </button>
                        <button
                          type="button"
                          className="admin-button admin-button-primary"
                          disabled={savingWallOrder}
                          onClick={() => void saveWallOrder()}
                        >
                          {savingWallOrder ? 'Saving…' : 'Save Wall Order'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <span className="admin-note">Wall order synced</span>
                  )}
                </div>
              </>
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

function SortableAlbumRow({
  album,
  index,
  total,
  selected,
  onSelect,
  onMove,
}: {
  album: WallAlbum;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: album.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`studio-album-row${selected ? ' active' : ''}${
        isDragging ? ' is-dragging' : ''
      }`}
    >
      <button
        type="button"
        className="studio-album-drag"
        aria-label={`Drag ${album.title} to reorder the wall`}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <button type="button" className="studio-album-main" onClick={onSelect}>
        <span className="studio-album-title">{album.title}</span>
        <span className="studio-album-meta">
          <span className={`studio-status studio-status-${album.status ?? 'published'}`}>
            {album.status ?? 'published'}
          </span>
          <span>{album.photos.length} prints</span>
        </span>
      </button>
      <span className="studio-album-row-actions">
        <button
          type="button"
          aria-label={`Move ${album.title} up`}
          disabled={index <= 0}
          onClick={() => onMove(index, index - 1)}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move ${album.title} down`}
          disabled={index >= total - 1}
          onClick={() => onMove(index, index + 1)}
        >
          ↓
        </button>
        <button type="button" className="studio-album-edit" onClick={onSelect}>
          Edit
        </button>
      </span>
    </li>
  );
}
