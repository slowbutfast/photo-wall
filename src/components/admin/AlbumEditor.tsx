'use client';

/**
 * Two-tab Album Editor docked in the Curator Studio **Exhibitions** tab.
 *
 * `Photos (N)` reorders prints with `@dnd-kit/sortable` (pointer, touch and
 * keyboard) and an equal-width `⤒` / `←` / `→` / `⤓` bar, previews the wall
 * live through `onDraftChange`, and saves the whole permutation atomically with
 * one `PUT …/photo-order`. A `409 order_stale` reply is merged through
 * `mergeStaleOrder` so the curator's arrangement survives a concurrent
 * upload/delete. `Details` edits the unified Caption, wall grid columns, native
 * date/time inputs (stored together in `albums.dateLabel`), location and the
 * YouTube soundtrack. Nothing is written until the explicit Save button.
 *
 * `@dnd-kit/*` is imported only from `src/components/admin/*`, so the public
 * `/photos` bundle stays at zero admin bytes (`publicBoundaryAudit.test.ts`).
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { v7 as uuidv7 } from 'uuid';

import { withBase } from '@/lib/basePath';
import { buildLodUrl } from '@/lib/cdn/lodUrl';
import { MAX_PHOTOS_PER_ALBUM } from '@/lib/layout/islandLayout';
import type { WallSoundtrack } from '@/lib/layout/types';
import { loadYouTubeIframeApi, type YouTubePlayer } from '@/lib/youtube/iframeApi';

import {
  formatUploadHttpError,
  prepareUploadFile,
  type PreparedUpload,
} from './imageCompressor';
import {
  isOrderDirty,
  mergeStaleOrder,
  moveItem,
  moveToFirst,
  moveToLast,
  parseCombinedDateLabel,
  resolveDateLabel,
} from './photoOrderState';

const THUMBNAIL_LOD = 256;
const GRID_COLUMN_CHOICES = [2, 3, 4, 5] as const;

export interface AlbumEditorAlbum {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'deleting';
  gridColumns: number;
  dateLabel: string | null;
  locationLabel: string | null;
  soundtrack: WallSoundtrack | null;
}

export interface AlbumEditorPhoto {
  id: string;
  albumId: string;
  storagePath: string;
  width: number;
  height: number;
  aspectRatio: number;
  dominantColor: string | null;
  thumbHash: string | null;
  sortOrder: number;
  title: string | null;
  caption: string | null;
}

export interface AlbumEditorDraft {
  photos: AlbumEditorPhoto[];
  title: string;
  gridColumns: number;
  dateLabel: string | null;
  locationLabel: string | null;
  soundtrack: WallSoundtrack | null;
}

export interface AlbumEditorProps {
  album: AlbumEditorAlbum;
  photos: AlbumEditorPhoto[];
  cdnBase: string;
  onBack: () => void;
  /** Live overlay for `<GalleryCanvas mode="preview" />`; no server writes. */
  onDraftChange: (draft: AlbumEditorDraft) => void;
  /** Persisted (or intentionally discarded) — refetch the manifest here. */
  onSaved: () => void | Promise<void>;
  onDeleted: () => void;
}

interface SoundtrackDraft {
  videoId: string | null;
  artist: string;
  title: string;
  durationSec: number | null;
}

interface DetailsSnapshot {
  title: string;
  gridColumns: number;
  dateIso: string;
  time24: string;
  /** Stored label as-is, so an unparseable legacy value is never discarded. */
  rawDateLabel: string | null;
  locationLabel: string;
  soundtrack: SoundtrackDraft;
}

type EditorTab = 'photos' | 'details';
type PhotoLayout = 'grid' | 'list';

function soundtrackFromAlbum(album: AlbumEditorAlbum): SoundtrackDraft {
  return {
    videoId: album.soundtrack?.videoId ?? null,
    artist: album.soundtrack?.artist ?? '',
    title: album.soundtrack?.title ?? '',
    durationSec: album.soundtrack?.durationSec ?? null,
  };
}

function detailsFromAlbum(album: AlbumEditorAlbum): DetailsSnapshot {
  const { dateIso, time24 } = parseCombinedDateLabel(album.dateLabel);
  return {
    title: album.title,
    gridColumns: album.gridColumns,
    dateIso,
    time24,
    rawDateLabel: album.dateLabel ?? null,
    locationLabel: album.locationLabel ?? '',
    soundtrack: soundtrackFromAlbum(album),
  };
}

function sameSoundtrack(left: SoundtrackDraft, right: SoundtrackDraft): boolean {
  return (
    left.videoId === right.videoId &&
    left.artist === right.artist &&
    left.title === right.title &&
    left.durationSec === right.durationSec
  );
}

function sameDetails(left: DetailsSnapshot, right: DetailsSnapshot): boolean {
  return (
    left.title === right.title &&
    left.gridColumns === right.gridColumns &&
    left.dateIso === right.dateIso &&
    left.time24 === right.time24 &&
    left.rawDateLabel === right.rawDateLabel &&
    left.locationLabel === right.locationLabel &&
    sameSoundtrack(left.soundtrack, right.soundtrack)
  );
}

function toDraftSoundtrack(draft: SoundtrackDraft): WallSoundtrack | null {
  if (!draft.videoId) return null;
  return {
    videoId: draft.videoId,
    artist: draft.artist.trim() || null,
    title: draft.title.trim() || null,
    durationSec: draft.durationSec,
  };
}

function extractVideoId(url: string): string | null {
  const match = String(url).match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

export default function AlbumEditor({
  album,
  photos: initialPhotos,
  cdnBase,
  onBack,
  onDraftChange,
  onSaved,
  onDeleted,
}: AlbumEditorProps) {
  const [tab, setTab] = useState<EditorTab>('photos');
  const [layout, setLayout] = useState<PhotoLayout>('grid');
  const [photos, setPhotos] = useState<AlbumEditorPhoto[]>(initialPhotos);
  const [savedPhotoIds, setSavedPhotoIds] = useState<string[]>(
    initialPhotos.map((photo) => photo.id),
  );
  const [details, setDetails] = useState<DetailsSnapshot>(() => detailsFromAlbum(album));
  const [savedDetails, setSavedDetails] = useState<DetailsSnapshot>(() =>
    detailsFromAlbum(album),
  );
  const [youtubeUrl, setYoutubeUrl] = useState(
    album.soundtrack ? `https://www.youtube.com/watch?v=${album.soundtrack.videoId}` : '',
  );
  const [confirmDeleteAlbum, setConfirmDeleteAlbum] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const durationHostRef = useRef<HTMLDivElement>(null);
  const durationPlayerRef = useRef<YouTubePlayer | null>(null);

  const readOnly = photos.length <= 1;
  const orderDirty = !readOnly && isOrderDirty(photos.map((photo) => photo.id), savedPhotoIds);
  const detailsDirty = !sameDetails(details, savedDetails);
  const atPhotoCap = photos.length >= MAX_PHOTOS_PER_ALBUM;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Live optimistic overlay for the Studio preview wall.
  useEffect(() => {
    onDraftChange({
      photos,
      title: details.title,
      gridColumns: details.gridColumns,
      dateLabel: resolveDateLabel(details, savedDetails),
      locationLabel: details.locationLabel.trim() || null,
      soundtrack: toDraftSoundtrack(details.soundtrack),
    });
  }, [photos, details, savedDetails, onDraftChange]);

  // The hidden probe mounts a 1×1 player; always tear it down on unmount.
  useEffect(() => {
    return () => {
      try {
        durationPlayerRef.current?.destroy();
      } catch {
        // Ignore teardown errors.
      }
      durationPlayerRef.current = null;
    };
  }, []);

  const photoIds = useMemo(() => photos.map((photo) => photo.id), [photos]);

  const updatePhotoOrder = (next: AlbumEditorPhoto[]) => {
    setPhotos(next);
    setNotice(null);
    setError(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (readOnly) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = photoIds.indexOf(String(active.id));
    const to = photoIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    updatePhotoOrder(moveItem(photos, from, to));
  };

  const loadAlbumDetail = async (): Promise<{
    album: AlbumEditorAlbum;
    photos: AlbumEditorPhoto[];
  } | null> => {
    try {
      const response = await fetch(withBase(`/api/admin/albums/${encodeURIComponent(album.id)}`), {
        credentials: 'same-origin',
      });
      if (!response.ok) return null;
      return (await response.json()) as {
        album: AlbumEditorAlbum;
        photos: AlbumEditorPhoto[];
      };
    } catch {
      return null;
    }
  };

  const saveOrder = async () => {
    if (readOnly || savingOrder) return;
    setSavingOrder(true);
    setError(null);
    setStaleNotice(null);
    setNotice(null);
    try {
      const response = await fetch(
        withBase(`/api/admin/albums/${encodeURIComponent(album.id)}/photo-order`),
        {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoIds: photos.map((photo) => photo.id) }),
        },
      );

      if (response.status === 409) {
        const payload = (await response.json()) as {
          error?: string;
          activePhotoIds?: string[];
        };
        if (payload.error === 'order_stale' && payload.activePhotoIds) {
          const fresh = await loadAlbumDetail();
          if (fresh) {
            const serverById = new Map(fresh.photos.map((photo) => [photo.id, photo]));
            const mergedIds = mergeStaleOrder(
              photos.map((photo) => photo.id),
              fresh.photos.map((photo) => photo.id),
            );
            const mergedPhotos = mergedIds
              .map((id) => serverById.get(id))
              .filter((photo): photo is AlbumEditorPhoto => Boolean(photo))
              .map((photo, index) => ({ ...photo, sortOrder: index }));
            setPhotos(mergedPhotos);
            setSavedPhotoIds(fresh.photos.map((photo) => photo.id));
            setStaleNotice(
              'Another tab changed this album. New prints were appended and deleted ones dropped — your order is preserved. Review, then Save Order again.',
            );
          } else {
            setError('Could not reload the album after an order conflict.');
          }
          return;
        }
        setError('Could not save the order (409).');
        return;
      }

      if (!response.ok) {
        setError(`Could not save the order (${response.status}).`);
        return;
      }

      const payload = (await response.json()) as { photoIds?: string[] };
      setSavedPhotoIds(payload.photoIds ?? photos.map((photo) => photo.id));
      setStaleNotice(null);
      setNotice(`Saved ${photos.length} print${photos.length === 1 ? '' : 's'}.`);
      await onSaved();
    } catch {
      setError('Save failed (network error). Your arrangement is preserved.');
    } finally {
      setSavingOrder(false);
    }
  };

  const discardOrder = () => {
    const byId = new Map(photos.map((photo) => [photo.id, photo]));
    const restored = savedPhotoIds
      .map((id) => byId.get(id))
      .filter((photo): photo is AlbumEditorPhoto => Boolean(photo));
    // Keep prints added in this session (never persisted into the baseline yet).
    const extras = photos.filter((photo) => !savedPhotoIds.includes(photo.id));
    setPhotos([...restored, ...extras]);
    setStaleNotice(null);
    setError(null);
  };

  const addPrint = async (file: File) => {
    if (atPhotoCap || adding) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      let prepared: PreparedUpload;
      try {
        prepared = await prepareUploadFile(file);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not prepare that image.');
        return;
      }

      const photoId = uuidv7();
      const form = new FormData();
      form.append('file', prepared.blob, prepared.filename);
      form.append('photoId', photoId);
      if (prepared.thumbHash) form.append('thumbHash', prepared.thumbHash);
      if (prepared.dominantColor) form.append('dominantColor', prepared.dominantColor);

      const response = await fetch(
        withBase(`/api/admin/albums/${encodeURIComponent(album.id)}/photos`),
        {
          method: 'POST',
          credentials: 'same-origin',
          body: form,
        },
      );
      if (!response.ok) {
        setError(formatUploadHttpError(response.status, await response.text()));
        return;
      }

      const created = (await response.json()) as AlbumEditorPhoto;
      setPhotos((current) => [...current, created]);
      setSavedPhotoIds((current) => [...current, created.id]);
      setNotice(`Added print #${photos.length + 1}. Remember to save the wall order if it moved.`);
      await onSaved();
    } catch {
      setError('Upload failed (network error).');
    } finally {
      setAdding(false);
    }
  };

  const deletePrint = async (photo: AlbumEditorPhoto) => {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        withBase(`/api/admin/photos/${encodeURIComponent(photo.id)}`),
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (!response.ok) {
        setError(`Could not delete print #${photos.indexOf(photo) + 1}.`);
        return;
      }
      setPhotos((current) => current.filter((candidate) => candidate.id !== photo.id));
      setSavedPhotoIds((current) => current.filter((id) => id !== photo.id));
      setNotice('Print deleted.');
      await onSaved();
    } catch {
      setError('Delete failed (network error).');
    }
  };

  /**
   * Best-effort duration probe mirroring `FolderDropzone`: the Studio CSP
   * allows `www.youtube.com/iframe_api`, so mount a hidden 1×1 player, wait for
   * `getDuration()` to stabilise, then destroy it. Blocked networks leave the
   * duration unset; title/artist stay manually editable either way.
   */
  const captureDuration = async (videoId: string) => {
    const api = await loadYouTubeIframeApi();
    if (!api || !durationHostRef.current) return;
    try {
      durationPlayerRef.current?.destroy();
    } catch {
      // Ignore stale players.
    }
    try {
      const player = new api.Player(durationHostRef.current, {
        videoId,
        width: 1,
        height: 1,
        playerVars: { autoplay: 0, controls: 0, playsinline: 1 },
        events: {
          onReady: (event) => {
            window.setTimeout(() => {
              try {
                const duration = event.target.getDuration();
                if (Number.isFinite(duration) && duration > 0) {
                  setDetails((current) =>
                    current.soundtrack.videoId === videoId
                      ? {
                          ...current,
                          soundtrack: {
                            ...current.soundtrack,
                            durationSec: Math.round(duration),
                          },
                        }
                      : current,
                  );
                }
              } catch {
                // Duration capture is best-effort.
              }
              try {
                event.target.destroy();
              } catch {
                // Ignore teardown errors.
              }
            }, 1400);
          },
        },
      });
      durationPlayerRef.current = player;
    } catch {
      // Best-effort: leave the duration empty.
    }
  };

  const inspectYoutube = async () => {
    const url = youtubeUrl.trim();
    if (!url) return;
    setError(null);
    try {
      const response = await fetch(withBase('/api/admin/youtube/inspect'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        setError('Could not read that YouTube URL.');
        return;
      }
      const payload = (await response.json()) as {
        videoId: string;
        artistGuess: string | null;
        titleGuess: string | null;
      };
      setDetails((current) => ({
        ...current,
        soundtrack: {
          videoId: payload.videoId,
          artist: payload.artistGuess ?? current.soundtrack.artist,
          title: payload.titleGuess ?? current.soundtrack.title,
          durationSec:
            payload.videoId === current.soundtrack.videoId
              ? current.soundtrack.durationSec
              : null,
        },
      }));
      setNotice('Inspected soundtrack metadata.');
      void captureDuration(payload.videoId);
    } catch {
      setError('Could not read that YouTube URL.');
    }
  };

  const onYoutubeUrlChange = (value: string) => {
    setYoutubeUrl(value);
    const videoId = extractVideoId(value);
    if (!value.trim() && !details.soundtrack.title && !details.soundtrack.artist) {
      setDetails((current) => ({
        ...current,
        soundtrack: { videoId: null, artist: '', title: '', durationSec: null },
      }));
      return;
    }
    if (videoId) {
      setDetails((current) => ({
        ...current,
        soundtrack: {
          ...current.soundtrack,
          videoId,
          durationSec:
            videoId === current.soundtrack.videoId ? current.soundtrack.durationSec : null,
        },
      }));
    }
  };

  const clearSoundtrack = () => {
    setYoutubeUrl('');
    setDetails((current) => ({
      ...current,
      soundtrack: { videoId: null, artist: '', title: '', durationSec: null },
    }));
  };

  const saveDetails = async () => {
    if (savingDetails) return;
    if (details.title.trim().length === 0) {
      setError('Caption is required.');
      return;
    }
    setSavingDetails(true);
    setError(null);
    setNotice(null);
    try {
      const soundtrack = toDraftSoundtrack(details.soundtrack);
      const dateLabel = resolveDateLabel(details, savedDetails);
      const response = await fetch(
        withBase(`/api/admin/albums/${encodeURIComponent(album.id)}`),
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: details.title.trim(),
            gridColumns: details.gridColumns,
            dateLabel,
            locationLabel: details.locationLabel.trim() || null,
            youtubeVideoId: soundtrack?.videoId ?? null,
            soundtrackArtist: soundtrack?.artist ?? null,
            soundtrackTitle: soundtrack?.title ?? null,
            soundtrackDurationSec: soundtrack?.durationSec ?? null,
          }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ? `Could not save details (${payload.error}).` : 'Could not save details.');
        return;
      }
      const nextDetails: DetailsSnapshot = {
        ...details,
        title: details.title.trim(),
        locationLabel: details.locationLabel.trim(),
        rawDateLabel: dateLabel,
      };
      setDetails(nextDetails);
      setSavedDetails(nextDetails);
      setNotice('Details saved.');
      await onSaved();
    } catch {
      setError('Save failed (network error).');
    } finally {
      setSavingDetails(false);
    }
  };

  const toggleStatus = async () => {
    if (savingStatus) return;
    const next = album.status === 'published' ? 'draft' : 'published';
    setSavingStatus(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        withBase(`/api/admin/albums/${encodeURIComponent(album.id)}`),
        {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next, allowPartial: true }),
        },
      );
      if (!response.ok) {
        setError(`Could not ${next === 'published' ? 'publish' : 'unpublish'} this album.`);
        return;
      }
      setNotice(next === 'published' ? 'Published to the wall.' : 'Moved to draft.');
      await onSaved();
    } catch {
      setError('Status update failed (network error).');
    } finally {
      setSavingStatus(false);
    }
  };

  const deleteAlbum = async () => {
    if (!confirmDeleteAlbum) {
      setConfirmDeleteAlbum(true);
      return;
    }
    setError(null);
    try {
      const response = await fetch(
        withBase(`/api/admin/albums/${encodeURIComponent(album.id)}`),
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (!response.ok && response.status !== 502) {
        setError('Could not delete this album.');
        return;
      }
      onDeleted();
    } catch {
      setError('Delete failed (network error).');
    }
  };

  const thumbnailUrl = (photo: AlbumEditorPhoto) =>
    buildLodUrl(cdnBase, photo.storagePath, THUMBNAIL_LOD, photo.aspectRatio);

  return (
    <div className="album-editor">
      <div className="album-editor-header">
        <button type="button" className="admin-text-button" onClick={onBack}>
          ← All Exhibitions
        </button>
        <h2 className="studio-panel-title album-editor-title">{album.title}</h2>
        <p className="admin-note album-editor-sub">
          {album.status} · {photos.length}/{MAX_PHOTOS_PER_ALBUM} prints · {details.gridColumns}{' '}
          cols
        </p>
      </div>

      <div className="album-editor-tabs" role="tablist" aria-label="Album editor sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'photos'}
          className={`album-editor-tab${tab === 'photos' ? ' active' : ''}`}
          onClick={() => setTab('photos')}
        >
          Photos ({photos.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'details'}
          className={`album-editor-tab${tab === 'details' ? ' active' : ''}`}
          onClick={() => setTab('details')}
        >
          Details
        </button>
      </div>

      {staleNotice ? (
        <div className="album-editor-banner is-warning" role="status">
          <p>{staleNotice}</p>
          <button type="button" className="admin-button" onClick={() => void saveOrder()}>
            Retry Save Order
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="album-editor-banner is-error" role="alert">
          <p>{error}</p>
          {tab === 'photos' && orderDirty ? (
            <button type="button" className="admin-button" onClick={() => void saveOrder()}>
              Retry Save Order
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <div className="album-editor-banner is-ok" role="status">
          <p>{notice}</p>
        </div>
      ) : null}

      {tab === 'photos' ? (
        <>
          <div className="album-editor-toolbar">
            <div className="admin-segmented">
              <button
                type="button"
                className={`admin-segment${layout === 'grid' ? ' active' : ''}`}
                onClick={() => setLayout('grid')}
              >
                Wall Grid ({details.gridColumns} col)
              </button>
              <button
                type="button"
                className={`admin-segment${layout === 'list' ? ' active' : ''}`}
                onClick={() => setLayout('list')}
              >
                List
              </button>
            </div>
            <button
              type="button"
              className="admin-button"
              disabled={atPhotoCap || adding}
              onClick={() => fileInputRef.current?.click()}
            >
              {adding ? 'Adding…' : '+ Add Print'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void addPrint(file);
              }}
            />
          </div>

          {readOnly ? (
            <p className="admin-note">Add at least 2 prints to reorder.</p>
          ) : null}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={photoIds}
              strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
            >
              <div
                className={`album-editor-photos${layout === 'list' ? ' is-list' : ''}`}
                style={
                  layout === 'grid'
                    ? ({ gridTemplateColumns: `repeat(${details.gridColumns}, minmax(0, 1fr))` } as CSSProperties)
                    : undefined
                }
              >
                {photos.map((photo, index) => (
                  <SortablePhoto
                    key={photo.id}
                    photo={photo}
                    index={index}
                    total={photos.length}
                    layout={layout}
                    readOnly={readOnly}
                    thumbnailUrl={thumbnailUrl(photo)}
                    onMove={(from, to) => updatePhotoOrder(moveItem(photos, from, to))}
                    onFirst={() => updatePhotoOrder(moveToFirst(photos, index))}
                    onLast={() => updatePhotoOrder(moveToLast(photos, index))}
                    onDelete={() => void deletePrint(photo)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="album-editor-savebar">
            {readOnly ? (
              <span className="admin-note">Synced with wall &amp; Prev/Next</span>
            ) : orderDirty ? (
              <>
                <span className="album-editor-dirty">Unsaved order</span>
                <div className="album-editor-savebar-actions">
                  <button type="button" className="admin-button" onClick={discardOrder}>
                    Discard
                  </button>
                  <button
                    type="button"
                    className="admin-button admin-button-primary"
                    disabled={savingOrder}
                    onClick={() => void saveOrder()}
                  >
                    {savingOrder ? 'Saving…' : 'Save Order'}
                  </button>
                </div>
              </>
            ) : (
              <span className="admin-note">Synced with wall &amp; Prev/Next</span>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="album-editor-details">
            <label className="admin-field" htmlFor="album-editor-caption">
              <span>
                Caption<span className="album-required">*</span>
              </span>
              <textarea
                id="album-editor-caption"
                rows={2}
                value={details.title}
                onChange={(event) =>
                  setDetails((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>

            <div className="admin-field">
              <span>
                Wall Grid Columns<span className="album-required">*</span>
              </span>
              <div className="admin-segmented">
                {GRID_COLUMN_CHOICES.map((columns) => (
                  <button
                    key={columns}
                    type="button"
                    className={`admin-segment${details.gridColumns === columns ? ' active' : ''}`}
                    onClick={() =>
                      setDetails((current) => ({ ...current, gridColumns: columns }))
                    }
                  >
                    {columns} cols
                  </button>
                ))}
              </div>
            </div>

            {details.rawDateLabel &&
            details.rawDateLabel.trim().length > 0 &&
            details.dateIso === '' &&
            details.time24 === '' ? (
              <p className="admin-note">
                Current: {details.rawDateLabel}{' '}
                <button
                  type="button"
                  className="admin-text-button"
                  onClick={() =>
                    setDetails((current) => ({ ...current, rawDateLabel: null }))
                  }
                >
                  Clear date
                </button>
              </p>
            ) : null}

            <div className="admin-field-grid">
              <label className="admin-field" htmlFor="album-editor-date">
                <span>Date</span>
                <input
                  id="album-editor-date"
                  type="date"
                  value={details.dateIso}
                  onChange={(event) =>
                    setDetails((current) => ({ ...current, dateIso: event.target.value }))
                  }
                />
              </label>
              <label className="admin-field" htmlFor="album-editor-time">
                <span>Time</span>
                <input
                  id="album-editor-time"
                  type="time"
                  value={details.time24}
                  onChange={(event) =>
                    setDetails((current) => ({ ...current, time24: event.target.value }))
                  }
                />
              </label>
            </div>

            <label className="admin-field" htmlFor="album-editor-location">
              <span>Geotag / Location</span>
              <input
                id="album-editor-location"
                type="text"
                value={details.locationLabel}
                placeholder="Shibuya, Tokyo"
                onChange={(event) =>
                  setDetails((current) => ({ ...current, locationLabel: event.target.value }))
                }
              />
            </label>

            <section className="album-editor-card">
              <div className="admin-section-header">
                <h3 className="studio-panel-title">YouTube Soundtrack</h3>
                {details.soundtrack.videoId ? (
                  <button type="button" className="admin-text-button" onClick={clearSoundtrack}>
                    Clear
                  </button>
                ) : null}
              </div>
              <label className="admin-field" htmlFor="album-editor-youtube">
                <span>YouTube Video Link</span>
                <div className="admin-inline">
                  <input
                    id="album-editor-youtube"
                    type="url"
                    value={youtubeUrl}
                    placeholder="https://www.youtube.com/watch?v=…"
                    onChange={(event) => onYoutubeUrlChange(event.target.value)}
                  />
                  <button
                    type="button"
                    className="admin-button"
                    onClick={() => void inspectYoutube()}
                  >
                    Inspect
                  </button>
                </div>
              </label>
              <div className="admin-field-grid">
                <label className="admin-field" htmlFor="album-editor-track-title">
                  <span>Song Title</span>
                  <input
                    id="album-editor-track-title"
                    type="text"
                    value={details.soundtrack.title}
                    onChange={(event) =>
                      setDetails((current) => ({
                        ...current,
                        soundtrack: { ...current.soundtrack, title: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="admin-field" htmlFor="album-editor-track-artist">
                  <span>Artist</span>
                  <input
                    id="album-editor-track-artist"
                    type="text"
                    value={details.soundtrack.artist}
                    onChange={(event) =>
                      setDetails((current) => ({
                        ...current,
                        soundtrack: { ...current.soundtrack, artist: event.target.value },
                      }))
                    }
                  />
                </label>
              </div>
              <p className="admin-note">
                Song title, artist and the live timecode render at the bottom of the placard.
              </p>
              <div ref={durationHostRef} className="admin-hidden-player" aria-hidden="true" />
            </section>

            <div className="album-editor-status-actions">
              <button
                type="button"
                className="admin-button"
                disabled={savingStatus}
                onClick={() => void toggleStatus()}
              >
                {album.status === 'published' ? 'Move to Draft' : 'Publish to Wall'}
              </button>
              <button
                type="button"
                className={`admin-button${confirmDeleteAlbum ? ' admin-button-danger' : ''}`}
                onClick={() => void deleteAlbum()}
              >
                {confirmDeleteAlbum ? 'Confirm Delete Album' : 'Delete Album'}
              </button>
            </div>
          </div>

          <div className="album-editor-savebar">
            <span className="admin-note">Stored in albums.dateLabel (zero DB migration)</span>
            <div className="album-editor-savebar-actions">
              {detailsDirty ? <span className="album-editor-dirty">Unsaved changes</span> : null}
              <button
                type="button"
                className="admin-button admin-button-primary"
                disabled={savingDetails || details.title.trim().length === 0}
                onClick={() => void saveDetails()}
              >
                {savingDetails ? 'Saving…' : 'Save Details'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SortablePhoto({
  photo,
  index,
  total,
  layout,
  readOnly,
  thumbnailUrl,
  onMove,
  onFirst,
  onLast,
  onDelete,
}: {
  photo: AlbumEditorPhoto;
  index: number;
  total: number;
  layout: PhotoLayout;
  readOnly: boolean;
  thumbnailUrl: string;
  onMove: (from: number, to: number) => void;
  onFirst: () => void;
  onLast: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
    disabled: readOnly,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : undefined,
  };

  const stop = (event: ReactPointerEvent | ReactMouseEvent) => event.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`album-editor-photo${layout === 'list' ? ' is-list-row' : ''}${
        isDragging ? ' is-dragging' : ''
      }`}
    >
      <div
        className="album-editor-photo-media"
        {...attributes}
        {...listeners}
        aria-label={`Print ${index + 1}${readOnly ? '' : ' — drag or use the arrow keys to reorder'}`}
        tabIndex={readOnly ? -1 : 0}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbnailUrl} alt={`Print ${index + 1}`} loading="lazy" decoding="async" draggable={false} />
        <span className="album-editor-photo-index">#{index + 1}</span>
        <button
          type="button"
          className="album-editor-photo-delete"
          aria-label={`Delete print ${index + 1}`}
          title="Delete print"
          onPointerDown={stop}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          ×
        </button>
      </div>

      <div className="album-editor-photo-actions">
        <button
          type="button"
          title="Move to first"
          aria-label={`Move print ${index + 1} to first`}
          disabled={readOnly || index === 0}
          onClick={() => onFirst()}
        >
          ⤒
        </button>
        <button
          type="button"
          title="Move earlier"
          aria-label={`Move print ${index + 1} earlier`}
          disabled={readOnly || index === 0}
          onClick={() => onMove(index, index - 1)}
        >
          ←
        </button>
        <button
          type="button"
          title="Move later"
          aria-label={`Move print ${index + 1} later`}
          disabled={readOnly || index === total - 1}
          onClick={() => onMove(index, index + 1)}
        >
          →
        </button>
        <button
          type="button"
          title="Move to last"
          aria-label={`Move print ${index + 1} to last`}
          disabled={readOnly || index === total - 1}
          onClick={() => onLast()}
        >
          ⤓
        </button>
      </div>
    </div>
  );
}
