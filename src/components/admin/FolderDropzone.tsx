'use client';

/**
 * Recursive folder dropzone for the Curator Drawer.
 *
 * Reads every folder through the looping `readEntries()` helper (Chrome returns
 * at most 100 entries per page), skips videos with a notice, prepares each
 * image through `prepareUploadFile` (byte-identical passthrough under 4.0 MiB,
 * ThumbHash + dominant colour, deterministic compression ladder above it),
 * streams each prepared payload through XHR (`upload.onprogress`) with UUIDv7
 * ids, retries transient failures, and only issues the explicit `PATCH` publish
 * after every upload succeeds. The prepared payload is cached on the draft so
 * retries reuse the exact bytes, and a per-album `AbortController` cancels
 * in-flight preparation/XHR when the draft is discarded.
 */

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { v7 as uuidv7 } from 'uuid';

import { withBase } from '@/lib/basePath';
import { MAX_PHOTOS_PER_ALBUM } from '@/lib/layout/islandLayout';
import { loadYouTubeIframeApi } from '@/lib/youtube/iframeApi';
import { useWallStore } from '@/store/useWallStore';

import {
  readDroppedFolders,
  splitAlbumCap,
  type DataTransferItemLike,
  type FolderContents,
} from './folderReader';
import {
  ensurePrepared,
  formatUploadHttpError,
  isRetryableUploadError,
  prepareUploadFile,
  UploadHttpError,
  type PreparedUpload,
} from './imageCompressor';

type FileState = 'pending' | 'uploading' | 'done' | 'failed';

interface DraftFile {
  key: string;
  name: string;
  file: File;
  photoId: string;
  prepared: PreparedUpload | null;
  state: FileState;
  progress: number;
  error: string | null;
}

interface Draft {
  albumId: string;
  title: string;
  files: DraftFile[];
  skipped: string[];
  published: boolean;
  publishError: string | null;
}

interface OptionalSettings {
  cameraName: string;
  dateLabel: string;
  locationLabel: string;
  youtubeUrl: string;
  artist: string;
  song: string;
  videoId: string | null;
  durationSec: number | null;
}

const EMPTY_SETTINGS: OptionalSettings = {
  cameraName: '',
  dateLabel: '',
  locationLabel: '',
  youtubeUrl: '',
  artist: '',
  song: '',
  videoId: null,
  durationSec: null,
};

const MAX_ATTEMPTS = 2;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Upload failed';
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

async function createAlbum(title: string, expectedCount: number): Promise<string | null> {
  try {
    const response = await fetch(withBase('/api/admin/albums'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, expectedCount, gridColumns: 4 }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { id?: string };
    return payload.id ?? null;
  } catch {
    return null;
  }
}

function uploadPhoto(
  albumId: string,
  draftFile: DraftFile,
  prepared: PreparedUpload,
  sortOrder: number,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', withBase(`/api/admin/albums/${encodeURIComponent(albumId)}/photos`));
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };

    const handleAbort = () => {
      xhr.abort();
    };
    signal.addEventListener('abort', handleAbort, { once: true });
    const stopListening = () => signal.removeEventListener('abort', handleAbort);

    xhr.onload = () => {
      stopListening();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new UploadHttpError(xhr.status, formatUploadHttpError(xhr.status, xhr.responseText)));
    };
    xhr.onerror = () => {
      stopListening();
      reject(new Error('network_error'));
    };
    xhr.ontimeout = () => {
      stopListening();
      reject(new Error('timeout'));
    };
    xhr.onabort = () => {
      stopListening();
      reject(abortError());
    };

    const form = new FormData();
    form.append('file', prepared.blob, prepared.filename);
    form.append('photoId', draftFile.photoId);
    if (prepared.thumbHash) form.append('thumbHash', prepared.thumbHash);
    if (prepared.dominantColor) form.append('dominantColor', prepared.dominantColor);
    form.append('sortOrder', String(sortOrder));
    xhr.send(form);
  });
}

async function patchAlbum(
  albumId: string,
  title: string,
  settings: OptionalSettings,
): Promise<void> {
  const body: Record<string, unknown> = {
    title,
    status: 'published',
    cameraName: settings.cameraName,
    dateLabel: settings.dateLabel,
    locationLabel: settings.locationLabel,
    soundtrackArtist: settings.artist,
    soundtrackTitle: settings.song,
    soundtrackDurationSec: settings.durationSec,
  };
  if (settings.videoId) body.youtubeVideoId = settings.videoId;

  const response = await fetch(withBase(`/api/admin/albums/${encodeURIComponent(albumId)}`), {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `Publish failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Keep the status message.
    }
    throw new Error(message);
  }
}

export default function FolderDropzone() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const draftsRef = useRef<Draft[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<OptionalSettings>(EMPTY_SETTINGS);
  const settingsRef = useRef<OptionalSettings>(EMPTY_SETTINGS);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const durationHostRef = useRef<HTMLDivElement>(null);
  const durationPlayerRef = useRef<{ destroy: () => void } | null>(null);
  const refreshWall = useWallStore((state) => state.refreshWall);

  useEffect(() => {
    const input = fileInputRef.current;
    if (input) {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    }
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    return () => {
      try {
        durationPlayerRef.current?.destroy();
      } catch {
        // Ignore teardown errors.
      }
    };
  }, []);

  const commitDrafts = (next: Draft[]) => {
    draftsRef.current = next;
    setDrafts(next);
  };

  const updateDraft = (albumId: string, updater: (draft: Draft) => Draft) => {
    commitDrafts(
      draftsRef.current.map((draft) => (draft.albumId === albumId ? updater(draft) : draft)),
    );
  };

  const updateFile = (
    albumId: string,
    fileKey: string,
    updater: (file: DraftFile) => DraftFile,
  ) => {
    updateDraft(albumId, (draft) => ({
      ...draft,
      files: draft.files.map((file) => (file.key === fileKey ? updater(file) : file)),
    }));
  };

  const uploadDraftFiles = async (albumId: string) => {
    const draft = draftsRef.current.find((candidate) => candidate.albumId === albumId);
    if (!draft) return;

    // A fresh controller per run also covers manual "Retry failed" clicks.
    const controller = new AbortController();
    abortControllersRef.current.set(albumId, controller);
    const { signal } = controller;
    const fileCount = draft.files.length;

    for (let index = 0; index < fileCount; index += 1) {
      if (signal.aborted) return;
      const current = draftsRef.current
        .find((candidate) => candidate.albumId === albumId)
        ?.files[index];
      if (!current || current.state === 'done') continue;

      updateFile(albumId, current.key, (file) => ({
        ...file,
        state: 'uploading',
        progress: 0,
        error: null,
      }));

      let prepared: PreparedUpload;
      try {
        prepared = await ensurePrepared(
          current,
          (file) => prepareUploadFile(file, { signal }),
          (next) => updateFile(albumId, current.key, (file) => ({ ...file, prepared: next })),
        );
      } catch (error) {
        // Discard cancels in-flight preparation: never mark a cancelled file
        // (or the remaining ones) as failed.
        if (signal.aborted) return;
        updateFile(albumId, current.key, (file) => ({
          ...file,
          state: 'failed',
          error: errorMessage(error),
        }));
        continue;
      }
      if (signal.aborted) return;

      let lastError: unknown = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        if (signal.aborted) return;
        try {
          await uploadPhoto(
            albumId,
            current,
            prepared,
            index,
            (progress) => {
              updateFile(albumId, current.key, (file) => ({ ...file, progress }));
            },
            signal,
          );
          lastError = null;
          break;
        } catch (error) {
          if (signal.aborted) return;
          lastError = error;
          // Deterministic 4xx rejections must not re-send a multi-MB body.
          if (!isRetryableUploadError(error)) break;
        }
      }
      if (signal.aborted) return;

      updateFile(albumId, current.key, (file) => ({
        ...file,
        state: lastError ? 'failed' : 'done',
        progress: lastError ? file.progress : 1,
        error: lastError ? errorMessage(lastError) : null,
      }));
    }

    // Finished without cancellation: drop the controller, never abort it.
    if (abortControllersRef.current.get(albumId) === controller) {
      abortControllersRef.current.delete(albumId);
    }
  };

  const publishDraft = async (albumId: string) => {
    const draft = draftsRef.current.find((candidate) => candidate.albumId === albumId);
    if (!draft) return;
    const allDone = draft.files.every((file) => file.state === 'done');
    if (!allDone) return;

    try {
      await patchAlbum(albumId, draft.title, settingsRef.current);
      updateDraft(albumId, (current) => ({ ...current, published: true, publishError: null }));
      setNotice(`Published ${draft.title}`);
      await refreshWall();
    } catch (error) {
      updateDraft(albumId, (current) => ({
        ...current,
        publishError: errorMessage(error),
      }));
    }
  };

  const discardDraft = async (albumId: string) => {
    // Stop preparation between steps and abort any in-flight XHR before the
    // DELETE tombstones the album.
    const controller = abortControllersRef.current.get(albumId);
    abortControllersRef.current.delete(albumId);
    controller?.abort();
    try {
      await fetch(withBase(`/api/admin/albums/${encodeURIComponent(albumId)}`), {
        method: 'DELETE',
        credentials: 'same-origin',
      });
    } catch {
      // The tombstone sweep will retry storage deletes.
    }
    commitDrafts(draftsRef.current.filter((draft) => draft.albumId !== albumId));
  };

  const beginUpload = async (groups: FolderContents[]) => {
    if (groups.length === 0) {
      setNotice('No photos found in that drop.');
      return;
    }
    setBusy(true);
    setNotice(null);

    try {
      for (const group of groups) {
        const { accepted, overflow } = splitAlbumCap(group.files, MAX_PHOTOS_PER_ALBUM);
        if (accepted.length === 0) {
          setNotice(
            group.skipped.length > 0
              ? `${group.skipped.length} non-image file${group.skipped.length === 1 ? '' : 's'} skipped.`
              : 'No photos found in that drop.',
          );
          continue;
        }

        const title = group.folder || 'Untitled Album';
        const albumId = await createAlbum(title, accepted.length);
        if (!albumId) {
          setNotice('Could not create the album draft. Are you still signed in?');
          continue;
        }

        const draft: Draft = {
          albumId,
          title,
          files: accepted.map((file, index) => ({
            key: `${albumId}-${index}`,
            name: file.name,
            file,
            photoId: uuidv7(),
            prepared: null,
            state: 'pending',
            progress: 0,
            error: null,
          })),
          skipped: group.skipped,
          published: false,
          publishError: null,
        };
        commitDrafts([...draftsRef.current, draft]);

        const notices: string[] = [];
        if (overflow > 0) {
          notices.push(
            `${overflow} photo${overflow === 1 ? '' : 's'} over the ${MAX_PHOTOS_PER_ALBUM}-photo cap skipped.`,
          );
        }
        if (group.skipped.length > 0) {
          notices.push(
            `${group.skipped.length} video${
              group.skipped.length === 1 ? '' : 's'
            } skipped while reading ${title}.`,
          );
        }
        if (notices.length > 0) setNotice(notices.join(' '));

        await uploadDraftFiles(albumId);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    // Snapshot entries and files synchronously: both the DataTransfer and
    // `webkitGetAsEntry()` become invalid after the event handler returns.
    const items = Array.from(event.dataTransfer.items).map<DataTransferItemLike>((item) => {
      const entry = item.webkitGetAsEntry?.() ?? null;
      const file = item.getAsFile?.() ?? null;
      return {
        kind: item.kind,
        webkitGetAsEntry: () => entry,
        getAsFile: () => file,
      };
    });
    const groups = await readDroppedFolders(items);
    await beginUpload(groups);
  };

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    const images = files.filter((file) =>
      file.type === 'image/jpeg' ||
      file.type === 'image/png' ||
      file.type === 'image/webp' ||
      /\.(jpe?g|png|webp)$/i.test(file.name),
    );
    const skipped = files.filter((file) => !images.includes(file)).map((file) => file.name);
    await beginUpload([{ folder: '', files: images, skipped }]);
  };

  const inspectYoutube = async () => {
    if (!settings.youtubeUrl.trim()) return;
    try {
      const response = await fetch(withBase('/api/admin/youtube/inspect'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: settings.youtubeUrl.trim() }),
      });
      if (!response.ok) {
        setNotice('Could not read that YouTube URL.');
        return;
      }
      const payload = (await response.json()) as {
        videoId: string;
        artistGuess: string | null;
        titleGuess: string | null;
      };
      setSettings((previous) => ({
        ...previous,
        videoId: payload.videoId,
        artist: payload.artistGuess ?? previous.artist,
        song: payload.titleGuess ?? previous.song,
        durationSec: null,
      }));
      void captureDuration(payload.videoId);
    } catch {
      setNotice('Could not read that YouTube URL.');
    }
  };

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
                  setSettings((previous) => ({
                    ...previous,
                    durationSec: Math.round(duration),
                  }));
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

  const retryDraft = async (albumId: string) => {
    setBusy(true);
    try {
      await uploadDraftFiles(albumId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-section">
      <div
        className={`folder-dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          void handleDrop(event);
        }}
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
        }}
      >
        <span className="folder-dropzone-title">Drop an album folder</span>
        <span className="folder-dropzone-sub">
          Recursive read, images only. Videos are skipped with a notice.
        </span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => {
            void handleFileInput(event);
          }}
        />
      </div>

      {busy ? <p className="admin-note">Uploading…</p> : null}
      {notice ? <p className="admin-note">{notice}</p> : null}

      <div className="admin-field-grid">
        <label className="admin-field">
          <span>Timestamp (optional)</span>
          <input
            type="text"
            value={settings.dateLabel}
            onChange={(event) =>
              setSettings((previous) => ({ ...previous, dateLabel: event.target.value }))
            }
            placeholder="October 2025"
          />
        </label>
        <label className="admin-field">
          <span>Geotag / Location (optional)</span>
          <input
            type="text"
            value={settings.locationLabel}
            onChange={(event) =>
              setSettings((previous) => ({ ...previous, locationLabel: event.target.value }))
            }
            placeholder="Shibuya, Tokyo"
          />
        </label>
      </div>

      <div className="admin-field-grid">
        <label className="admin-field admin-field-wide">
          <span>YouTube soundtrack URL (optional)</span>
          <div className="admin-inline">
            <input
              type="url"
              value={settings.youtubeUrl}
              onChange={(event) =>
                setSettings((previous) => ({ ...previous, youtubeUrl: event.target.value }))
              }
              placeholder="https://www.youtube.com/watch?v=…"
            />
            <button type="button" className="admin-button" onClick={() => void inspectYoutube()}>
              Inspect
            </button>
          </div>
        </label>
        <label className="admin-field">
          <span>Artist</span>
          <input
            type="text"
            value={settings.artist}
            onChange={(event) =>
              setSettings((previous) => ({ ...previous, artist: event.target.value }))
            }
          />
        </label>
        <label className="admin-field">
          <span>Song Title</span>
          <input
            type="text"
            value={settings.song}
            onChange={(event) => setSettings((previous) => ({ ...previous, song: event.target.value }))}
          />
        </label>
      </div>

      <div ref={durationHostRef} className="admin-hidden-player" aria-hidden="true" />

      <div className="admin-draft-list">
        {drafts.map((draft) => {
          const done = draft.files.filter((file) => file.state === 'done').length;
          const failed = draft.files.filter((file) => file.state === 'failed').length;
          const allDone = done === draft.files.length && draft.files.length > 0;
          return (
            <article key={draft.albumId} className="admin-draft">
              <header className="admin-draft-header">
                <strong>{draft.title}</strong>
                <span className="admin-draft-status">
                  {draft.published
                    ? 'Published'
                    : allDone
                      ? 'Ready to publish'
                      : failed > 0
                        ? `${failed} failed`
                        : `${done}/${draft.files.length}`}
                </span>
              </header>
              <div className="admin-progress" aria-hidden="true">
                <span style={{ width: `${draft.files.length ? (done / draft.files.length) * 100 : 0}%` }} />
              </div>
              {draft.skipped.length > 0 ? (
                <p className="admin-note">
                  Skipped {draft.skipped.length} non-image file
                  {draft.skipped.length === 1 ? '' : 's'}.
                </p>
              ) : null}
              {failed > 0 ? (
                <ul className="admin-failed-list">
                  {draft.files
                    .filter((file) => file.state === 'failed')
                    .map((file) => (
                      <li key={file.key}>
                        {file.name} — {file.error ?? 'failed'}
                      </li>
                    ))}
                </ul>
              ) : null}
              {draft.publishError ? <p className="admin-error">{draft.publishError}</p> : null}
              <div className="admin-draft-actions">
                {failed > 0 ? (
                  <button
                    type="button"
                    className="admin-button"
                    disabled={busy}
                    onClick={() => void retryDraft(draft.albumId)}
                  >
                    Retry failed uploads
                  </button>
                ) : null}
                {allDone && !draft.published ? (
                  <button
                    type="button"
                    className="admin-button admin-button-primary"
                    disabled={busy}
                    onClick={() => void publishDraft(draft.albumId)}
                  >
                    Publish album
                  </button>
                ) : null}
                {!draft.published ? (
                  <button
                    type="button"
                    className="admin-button"
                    onClick={() => void discardDraft(draft.albumId)}
                  >
                    Discard draft
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
