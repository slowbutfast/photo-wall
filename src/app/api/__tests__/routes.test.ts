import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { v7 as uuidv7 } from 'uuid';

vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { DELETE as deleteAlbum, PATCH as patchAlbum } from '@/app/api/admin/albums/[id]/route';
import { POST as uploadPhoto } from '@/app/api/admin/albums/[id]/photos/route';
import { GET as listAlbums, POST as createAlbumRoute } from '@/app/api/admin/albums/route';
import { DELETE as logout, GET as authStatus, POST as login } from '@/app/api/admin/auth/route';
import { POST as retryDeletions } from '@/app/api/admin/deletions/retry/route';
import { DELETE as deletePhoto, PATCH as patchPhoto } from '@/app/api/admin/photos/[id]/route';
import { POST as inspectYoutube } from '@/app/api/admin/youtube/inspect/route';
import { GET as getLocalUpload } from '@/app/api/local-uploads/[...path]/route';
import { GET as getWall } from '@/app/api/wall/route';
import { createDatabase, resetDbForTesting, setDbForTesting, type Database } from '@/db';
import { albums, photos } from '@/db/schema';
import {
  countActivePhotos,
  deleteAlbumRows,
  getAlbum,
  getPhoto,
  markAlbumDeleting,
  markPhotoDeleting,
  updateAlbum,
  updatePhoto,
} from '@/db/repository';
import { resetLoginRateLimits } from '@/lib/auth';
import { LocalStorageAdapter, resolveLocalUploadPath } from '@/lib/storage/local';
import {
  resetStorageAdapterForTesting,
  setStorageAdapterForTesting,
} from '@/lib/storage';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function be16(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function le16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function le32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  return concat([new Uint8Array([0xff, marker]), be16(payload.length + 2), payload]);
}

/** 4000x3000 JPEG with Orientation=6, GPS/camera EXIF and an XMP packet. */
function buildOrientedJpeg(): Uint8Array {
  const exifTiff = concat([
    ascii('II'),
    le16(42),
    le32(8),
    le16(1),
    le16(0x0112),
    le16(3),
    le32(1),
    le16(6),
    le16(0),
    le32(0),
  ]);
  const exif = jpegSegment(0xe1, concat([ascii('Exif\u0000\u0000'), exifTiff]));
  const xmp = jpegSegment(
    0xe1,
    concat([
      ascii('http://ns.adobe.com/xap/1.0/\u0000'),
      ascii('<x:xmpmeta><exif:GPSLatitude>40,42N</exif:GPSLatitude><tiff:Make>Canon</tiff:Make></x:xmpmeta>'),
    ]),
  );
  const jfif = jpegSegment(0xe0, concat([ascii('JFIF\u0000'), new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 0])]));
  const sof0 = jpegSegment(
    0xc0,
    concat([
      new Uint8Array([8]),
      be16(3000),
      be16(4000),
      new Uint8Array([1]),
      new Uint8Array([1, 0x11, 0]),
    ]),
  );
  const sos = jpegSegment(0xda, new Uint8Array([1, 1, 0, 0, 0x3f, 0]));
  const scan = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0xff, 0xd9]);

  return concat([new Uint8Array([0xff, 0xd8]), jfif, exif, xmp, sof0, sos, scan]);
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

const ADMIN_PASSWORD = 'test-password-1234';
const ORIGIN = 'http://localhost:3000';

function url(pathname: string): string {
  return `${ORIGIN}${pathname}`;
}

function jsonRequest(
  pathname: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url(pathname), {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function uploadRequest(
  albumId: string,
  options: {
    cookie: string;
    photoId: string;
    bytes: Uint8Array;
    filename?: string;
    contentType?: string;
    extraFields?: Record<string, string>;
  },
): Request {
  const form = new FormData();
  form.set(
    'file',
    new File([toBlobPart(options.bytes)], options.filename ?? 'photo.jpg', {
      type: options.contentType ?? 'image/jpeg',
    }),
  );
  form.set('photoId', options.photoId);
  for (const [key, value] of Object.entries(options.extraFields ?? {})) {
    form.set(key, value);
  }
  return new Request(url(`/api/admin/albums/${albumId}/photos`), {
    method: 'POST',
    headers: { cookie: options.cookie },
    body: form,
  });
}

async function loginCookie(): Promise<string> {
  resetLoginRateLimits();
  const response = await login(
    jsonRequest('/api/admin/auth', 'POST', { password: ADMIN_PASSWORD }),
  );
  expect(response.status).toBe(200);
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  return setCookie!.split(';')[0];
}

async function createAlbum(
  cookie: string,
  input: { title: string; expectedCount: number; gridColumns?: number; description?: string },
) {
  const response = await createAlbumRoute(
    jsonRequest('/api/admin/albums', 'POST', input, { cookie }),
  );
  expect(response.status).toBe(201);
  return (await response.json()) as {
    id: string;
    slug: string;
    status: string;
    expectedCount: number;
    photoCount: number;
  };
}

async function uploadOne(
  cookie: string,
  albumId: string,
  photoId = uuidv7(),
  bytes = buildOrientedJpeg(),
) {
  return uploadPhoto(uploadRequest(albumId, { cookie, photoId, bytes }), {
    params: Promise.resolve({ id: albumId }),
  });
}

async function publish(cookie: string, albumId: string, allowPartial = false) {
  return patchAlbum(
    jsonRequest(
      `/api/admin/albums/${albumId}`,
      'PATCH',
      { status: 'published', allowPartial },
      { cookie },
    ),
    { params: Promise.resolve({ id: albumId }) },
  );
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

const scratchRoot = path.resolve('data', `test-routes-${randomUUID()}`);
const databaseUrl = `file:${path.join(scratchRoot, 'test.db')}`;
const uploadRoot = path.join(scratchRoot, 'uploads');

let db: Database;
let storage: LocalStorageAdapter;

beforeAll(async () => {
  await mkdir(scratchRoot, { recursive: true });
  db = await createDatabase(databaseUrl);
  setDbForTesting(db);
  storage = new LocalStorageAdapter(uploadRoot);
  setStorageAdapterForTesting(storage);
});

afterAll(async () => {
  resetDbForTesting();
  resetStorageAdapterForTesting();
  await rm(scratchRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  resetLoginRateLimits();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  await db.delete(photos);
  await db.delete(albums);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('admin auth route', () => {
  it('reports unauthenticated sessions and login state', async () => {
    const anonymous = await authStatus(new Request(url('/api/admin/auth')));
    await expect(anonymous.json()).resolves.toEqual({ authenticated: false });

    const cookie = await loginCookie();
    const authenticated = await authStatus(
      new Request(url('/api/admin/auth'), { headers: { cookie } }),
    );
    await expect(authenticated.json()).resolves.toEqual({ authenticated: true });
  });

  it('sets an HttpOnly SameSite=Lax cookie on successful login', async () => {
    const response = await login(
      jsonRequest('/api/admin/auth', 'POST', { password: ADMIN_PASSWORD }),
    );
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('Secure'); // NODE_ENV=test
  });

  it('rejects a wrong password with 401 and rate-limits brute force with 429', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await login(
        jsonRequest('/api/admin/auth', 'POST', { password: 'nope' }, { 'x-forwarded-for': '198.51.100.4' }),
      );
      expect(response.status).toBe(401);
    }

    const limited = await login(
      jsonRequest('/api/admin/auth', 'POST', { password: 'nope' }, { 'x-forwarded-for': '198.51.100.4' }),
    );
    expect(limited.status).toBe(429);
  });

  it('clears the session cookie on DELETE', async () => {
    const response = await logout(jsonRequest('/api/admin/auth', 'DELETE'));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('rejects unauthenticated mutations with 401', async () => {
    const response = await createAlbumRoute(
      jsonRequest('/api/admin/albums', 'POST', { title: 'Nope', expectedCount: 0 }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects cross-origin mutations with 403', async () => {
    const cookie = await loginCookie();
    const response = await createAlbumRoute(
      jsonRequest(
        '/api/admin/albums',
        'POST',
        { title: 'Cross origin', expectedCount: 0 },
        { cookie, origin: 'https://evil.example', host: 'localhost:3000' },
      ),
    );
    expect(response.status).toBe(403);
  });

  it('rejects unauthenticated reads of the album list with 401', async () => {
    const response = await listAlbums(new Request(url('/api/admin/albums')));
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Album lifecycle & manifest
// ---------------------------------------------------------------------------

describe('album lifecycle', () => {
  it('creates drafts, lists them, and keeps them out of GET /api/wall', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, {
      title: 'Kyoto, 2019',
      expectedCount: 12,
      gridColumns: 4,
    });

    expect(album.status).toBe('draft');
    expect(album.expectedCount).toBe(12);

    const list = await listAlbums(
      new Request(url('/api/admin/albums'), { headers: { cookie } }),
    );
    const payload = (await list.json()) as { albums: Array<{ id: string; status: string }> };
    expect(payload.albums.map((entry) => entry.status)).toContain('draft');

    const wall = await getWall();
    const wallPayload = (await wall.json()) as { cdnBase: string; albums: unknown[] };
    expect(wallPayload.cdnBase).toBe('/api/local-uploads');
    expect(wallPayload.albums).toHaveLength(0);
  });

  it('enforces the publish completion rule and accepts allowPartial', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Half full', expectedCount: 2 });

    const rejected = await publish(cookie, album.id);
    expect(rejected.status).toBe(409);
    const rejection = (await rejected.json()) as { uploadedCount: number; expectedCount: number };
    expect(rejection.uploadedCount).toBe(0);
    expect(rejection.expectedCount).toBe(2);

    const partial = await publish(cookie, album.id, true);
    expect(partial.status).toBe(200);
  });

  it('publishes a complete album, invalidates the wall tag and excludes deleting rows', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Lisbon', expectedCount: 2 });

    expect((await uploadOne(cookie, album.id)).status).toBe(201);
    expect((await uploadOne(cookie, album.id)).status).toBe(201);

    const published = await publish(cookie, album.id);
    expect(published.status).toBe(200);

    const { revalidateTag } = await import('next/cache');
    expect(vi.mocked(revalidateTag)).toHaveBeenCalledWith('wall', { expire: 0 });

    const wall = await getWall();
    const wallPayload = (await wall.json()) as {
      cdnBase: string;
      albums: Array<{
        id: string;
        title: string;
        gridColumns: number;
        position: { x: number; y: number };
        bounds: { width: number; height: number };
        photos: Array<{ id: string; width: number; height: number; aspectRatio: number }>;
      }>;
    };

    expect(wallPayload.albums).toHaveLength(1);
    expect(wallPayload.albums[0].id).toBe(album.id);
    expect(wallPayload.albums[0].position).toEqual({ x: 0, y: expect.any(Number) });
    expect(wallPayload.albums[0].bounds.width).toBeGreaterThan(0);
    expect(wallPayload.albums[0].photos).toHaveLength(2);
    expect(wallPayload.albums[0].photos[0].width).toBe(3000);
    expect(wallPayload.albums[0].photos[0].height).toBe(4000);
    expect(wallPayload.albums[0].photos[0].aspectRatio).toBeCloseTo(0.75, 6);

    // Draft and deleting albums are invisible.
    const draft = await createAlbum(cookie, { title: 'Draft wing', expectedCount: 1 });
    const deletedId = (await createAlbum(cookie, { title: 'Tombstone', expectedCount: 0 })).id;
    await markAlbumDeleting(deletedId);

    const after = (await (await getWall()).json()) as { albums: Array<{ id: string }> };
    expect(after.albums.map((entry) => entry.id)).toEqual([album.id]);
    expect(after.albums.map((entry) => entry.id)).not.toContain(draft.id);
  });

  it('updates metadata and soundtrack fields and rejects an unknown album', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Metadata', expectedCount: 0 });

    const response = await patchAlbum(
      jsonRequest(
        `/api/admin/albums/${album.id}`,
        'PATCH',
        {
          cameraName: 'Leica M6',
          dateLabel: 'Summer 1998',
          locationLabel: 'Tokyo',
          youtubeVideoId: 'dQw4w9WgXcQ',
          soundtrackArtist: 'Massive Attack',
          soundtrackTitle: 'Teardrop',
          soundtrackDurationSec: 330,
          gridColumns: 4,
          sortOrder: 7,
        },
        { cookie },
      ),
      { params: Promise.resolve({ id: album.id }) },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      cameraName: string;
      dateLabel: string;
      locationLabel: string;
      gridColumns: number;
      sortOrder: number;
      soundtrack: { videoId: string; artist: string; title: string; durationSec: number };
    };
    expect(payload.cameraName).toBe('Leica M6');
    expect(payload.gridColumns).toBe(4);
    expect(payload.sortOrder).toBe(7);
    expect(payload.soundtrack).toEqual({
      videoId: 'dQw4w9WgXcQ',
      artist: 'Massive Attack',
      title: 'Teardrop',
      durationSec: 330,
    });

    const missing = await patchAlbum(
      jsonRequest('/api/admin/albums/missing', 'PATCH', { title: 'x' }, { cookie }),
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(missing.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Tombstone PATCH guards
// ---------------------------------------------------------------------------

describe('tombstone PATCH guards', () => {
  it('rejects PATCH on a deleting album with 409 and leaves the row unchanged', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Tombstone album', expectedCount: 0 });
    await markAlbumDeleting(album.id);

    const response = await patchAlbum(
      jsonRequest(
        `/api/admin/albums/${album.id}`,
        'PATCH',
        { title: 'Resurrected', status: 'published', allowPartial: true },
        { cookie },
      ),
      { params: Promise.resolve({ id: album.id }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'album_deleting' });

    const row = await getAlbum(album.id);
    expect(row?.status).toBe('deleting');
    expect(row?.title).toBe('Tombstone album');
  });

  it('rejects PATCH on a deleting photo with 409 and leaves the row unchanged', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Tombstone photo', expectedCount: 1 });
    const upload = await uploadOne(cookie, album.id);
    const photo = (await upload.json()) as { id: string };
    await markPhotoDeleting(photo.id);

    const response = await patchPhoto(
      jsonRequest(
        `/api/admin/photos/${photo.id}`,
        'PATCH',
        { title: 'Resurrected', caption: 'Nope' },
        { cookie },
      ),
      { params: Promise.resolve({ id: photo.id }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'photo_deleting' });

    const row = await getPhoto(photo.id);
    expect(row?.status).toBe('deleting');
    expect(row?.title).toBeNull();
  });

  it('updateAlbum/updatePhoto refuse tombstoned rows at the repository layer', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Repo guard', expectedCount: 1 });
    const upload = await uploadOne(cookie, album.id);
    const photo = (await upload.json()) as { id: string };

    await markAlbumDeleting(album.id);
    await markPhotoDeleting(photo.id);

    expect(await updateAlbum(album.id, { title: 'Nope' })).toBeNull();
    expect(await updatePhoto(photo.id, { title: 'Nope' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Photo upload contract
// ---------------------------------------------------------------------------

describe('photo upload contract', () => {
  it('derives post-orientation dimensions and persists no EXIF/GPS fields', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Orientation', expectedCount: 1 });

    const response = await uploadOne(cookie, album.id);
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;

    expect(body.width).toBe(3000);
    expect(body.height).toBe(4000);
    expect(body.aspectRatio).toBeCloseTo(0.75, 6);
    expect(body).not.toHaveProperty('gpsLatitude');
    expect(body).not.toHaveProperty('cameraMake');
    expect(JSON.stringify(body)).not.toContain('GPSLatitude');
    expect(JSON.stringify(body)).not.toContain('Canon');

    const stored = await stat(path.join(uploadRoot, 'albums', album.id, `${body.id}.jpg`));
    expect(stored.isFile()).toBe(true);

    const storedBytes = await readFile(
      path.join(uploadRoot, 'albums', album.id, `${body.id}.jpg`),
    );
    const storedText = storedBytes.toString('latin1');
    expect(storedText).not.toContain('GPSLatitude');
    expect(storedText).not.toContain('Canon');
    expect(storedText).not.toContain('xmpmeta');
    // Orientation remains in the rebuilt EXIF allowlist.
    expect(storedText).toContain('\u0012\u0001\u0003\u0000\u0001\u0000\u0000\u0000\u0006\u0000\u0000\u0000');
  });

  it('returns 200 on an identical photoId + bytes retry without touching storage', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Retry', expectedCount: 1 });
    const photoId = uuidv7();
    const bytes = buildOrientedJpeg();

    const first = await uploadOne(cookie, album.id, photoId, bytes);
    expect(first.status).toBe(201);

    const putSpy = vi.spyOn(storage, 'putObject');
    const second = await uploadOne(cookie, album.id, photoId, bytes);

    expect(second.status).toBe(200);
    expect(putSpy).not.toHaveBeenCalled();
    expect(await countActivePhotos(album.id)).toBe(1);
  });

  it('returns 409 when a photoId is reused with different bytes', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Conflict', expectedCount: 1 });
    const photoId = uuidv7();

    expect((await uploadOne(cookie, album.id, photoId)).status).toBe(201);

    const differentBytes = buildOrientedJpeg();
    differentBytes[differentBytes.length - 3] = 0x99;
    const conflict = await uploadOne(cookie, album.id, photoId, differentBytes);

    expect(conflict.status).toBe(409);
  });

  it('returns 409 for uploads to a deleting album before any storage write', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Tombstoned', expectedCount: 1 });
    await markAlbumDeleting(album.id);

    const putSpy = vi.spyOn(storage, 'putObject');
    const response = await uploadOne(cookie, album.id);

    expect(response.status).toBe(409);
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('rejects oversize and non-image uploads with 413/415', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Bad files', expectedCount: 1 });

    const oversize = await uploadOne(
      cookie,
      album.id,
      uuidv7(),
      new Uint8Array(25 * 1024 * 1024 + 1),
    );
    expect(oversize.status).toBe(413);

    const mp4 = new Uint8Array([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70,
      0x6d, 0x70, 0x34, 0x32,
      0x00, 0x00, 0x00, 0x00,
    ]);
    const spoofed = await uploadOne(cookie, album.id, uuidv7(), mp4);
    expect(spoofed.status).toBe(415);
  });

  it('rolls back the storage object when the DB insert fails', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Rollback', expectedCount: 1 });
    const photoId = uuidv7();

    const repository = await import('@/db/repository');
    const insertSpy = vi
      .spyOn(repository, 'insertPhoto')
      .mockRejectedValueOnce(new Error('database exploded'));
    const deleteSpy = vi.spyOn(storage, 'deleteObject');

    const response = await uploadOne(cookie, album.id, photoId);

    expect(insertSpy).toHaveBeenCalled();
    expect(response.status).toBe(500);
    expect(deleteSpy).toHaveBeenCalledWith(
      `/albums/${album.id}/${photoId}.jpg`,
    );
    await expect(
      stat(path.join(uploadRoot, 'albums', album.id, `${photoId}.jpg`)),
    ).rejects.toThrow();
  });

  it('returns 200 without deleting storage when a concurrent winner committed the same photoId', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Race winner', expectedCount: 1 });
    const photoId = uuidv7();

    const repository = await import('@/db/repository');
    const originalInsert = repository.insertPhoto;
    const insertSpy = vi
      .spyOn(repository, 'insertPhoto')
      .mockImplementationOnce(async (input) => {
        // Simulate the concurrent winner committing first, then our insert
        // failing on the photos.id primary key.
        await originalInsert(input);
        throw new Error('UNIQUE constraint failed: photos.id');
      });
    const deleteSpy = vi.spyOn(storage, 'deleteObject');

    const response = await uploadOne(cookie, album.id, photoId);

    expect(insertSpy).toHaveBeenCalled();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; storagePath: string };
    expect(body.id).toBe(photoId);

    // The winner's live storage object must survive the loser's cleanup path.
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(await getPhoto(photoId)).not.toBeNull();
    const stored = await stat(path.join(uploadRoot, 'albums', album.id, `${photoId}.jpg`));
    expect(stored.isFile()).toBe(true);
  });

  it('returns 409 without deleting the live object when the racing row has different bytes', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Race conflict', expectedCount: 1 });
    const photoId = uuidv7();

    const repository = await import('@/db/repository');
    const originalInsert = repository.insertPhoto;
    vi.spyOn(repository, 'insertPhoto').mockImplementationOnce(async (input) => {
      await originalInsert({ ...input, contentHash: 'winner-different-hash' });
      throw new Error('UNIQUE constraint failed: photos.id');
    });
    const deleteSpy = vi.spyOn(storage, 'deleteObject');

    const response = await uploadOne(cookie, album.id, photoId);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'photo_id_conflict' });
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Photo metadata & deletion
// ---------------------------------------------------------------------------

describe('photo routes', () => {
  it('PATCHes title/caption/sortOrder and DELETEs with a wildcard purge', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Photo CRUD', expectedCount: 1 });
    const upload = await uploadOne(cookie, album.id);
    const photo = (await upload.json()) as { id: string };

    const patched = await patchPhoto(
      jsonRequest(
        `/api/admin/photos/${photo.id}`,
        'PATCH',
        { title: 'Harbour', caption: 'Dusk', sortOrder: 3 },
        { cookie },
      ),
      { params: Promise.resolve({ id: photo.id }) },
    );
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as {
      title: string;
      caption: string;
      sortOrder: number;
    };
    expect(patchedBody.title).toBe('Harbour');
    expect(patchedBody.caption).toBe('Dusk');
    expect(patchedBody.sortOrder).toBe(3);

    const purgeSpy = vi.spyOn(storage, 'purgeWildcard');
    const deleted = await deletePhoto(
      jsonRequest(`/api/admin/photos/${photo.id}`, 'DELETE', undefined, { cookie }),
      { params: Promise.resolve({ id: photo.id }) },
    );
    expect(deleted.status).toBe(200);
    expect(await getPhoto(photo.id)).toBeNull();
    expect(purgeSpy).toHaveBeenCalledWith(`/albums/${album.id}/${photo.id}.*`);
  });
});

// ---------------------------------------------------------------------------
// Album deletion & tombstone retry
// ---------------------------------------------------------------------------

describe('album deletion and tombstone retry', () => {
  it('marks deleting, purges the wildcard, deletes rows and empties the wall', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Delete me', expectedCount: 1 });
    const upload = await uploadOne(cookie, album.id);
    expect(upload.status).toBe(201);
    expect((await publish(cookie, album.id)).status).toBe(200);

    const purgeSpy = vi.spyOn(storage, 'purgeWildcard');
    const deleted = await deleteAlbum(
      jsonRequest(`/api/admin/albums/${album.id}`, 'DELETE', undefined, { cookie }),
      { params: Promise.resolve({ id: album.id }) },
    );

    expect(deleted.status).toBe(200);
    expect(purgeSpy).toHaveBeenCalledWith(`/albums/${album.id}/*`);

    const wall = (await (await getWall()).json()) as { albums: unknown[] };
    expect(wall.albums).toHaveLength(0);

    const list = (await (
      await listAlbums(new Request(url('/api/admin/albums'), { headers: { cookie } }))
    ).json()) as { albums: unknown[] };
    expect(list.albums).toHaveLength(0);

    await expect(stat(path.join(uploadRoot, 'albums', album.id))).rejects.toThrow();
  });

  it('resumes deleting tombstones through the retry endpoint', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Retry tombstone', expectedCount: 1 });
    await uploadOne(cookie, album.id);
    await markAlbumDeleting(album.id);

    const response = await retryDeletions(
      jsonRequest('/api/admin/deletions/retry', 'POST', undefined, { cookie }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ retried: 1, failed: 0 });

    const list = (await (
      await listAlbums(new Request(url('/api/admin/albums'), { headers: { cookie } }))
    ).json()) as { albums: unknown[] };
    expect(list.albums).toHaveLength(0);
  });

  it('deletes child photo rows with the album transaction', async () => {
    const cookie = await loginCookie();
    const album = await createAlbum(cookie, { title: 'Cascade', expectedCount: 2 });
    await uploadOne(cookie, album.id);
    await uploadOne(cookie, album.id);
    expect(await countActivePhotos(album.id)).toBe(2);

    await deleteAlbumRows(album.id);

    expect(await countActivePhotos(album.id)).toBe(0);
    const remaining = await db.select().from(photos);
    expect(remaining).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// YouTube inspect
// ---------------------------------------------------------------------------

describe('youtube inspect', () => {
  it('returns artist/title guesses for a valid URL through a videoId-only oEmbed call', async () => {
    const cookie = await loginCookie();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({
          title: 'Massive Attack - Teardrop (Official Video)',
          author_name: 'Massive Attack',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await inspectYoutube(
      jsonRequest(
        '/api/admin/youtube/inspect',
        'POST',
        { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123' },
        { cookie },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      videoId: 'dQw4w9WgXcQ',
      artistGuess: 'Massive Attack',
      titleGuess: 'Teardrop',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requested = String(fetchMock.mock.calls[0][0]);
    expect(requested).toContain('dQw4w9WgXcQ');
    expect(requested.startsWith('https://www.youtube.com/oembed?url=')).toBe(true);

    vi.unstubAllGlobals();
  });

  it('rejects SSRF-style URLs with 400 without an outbound request', async () => {
    const cookie = await loginCookie();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    for (const candidate of [
      'http://169.254.169.254/latest/meta-data',
      'http://127.0.0.1:3000/watch?v=dQw4w9WgXcQ',
      'https://vimeo.com/123456789',
    ]) {
      const response = await inspectYoutube(
        jsonRequest('/api/admin/youtube/inspect', 'POST', { url: candidate }, { cookie }),
      );
      expect(response.status).toBe(400);
    }

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('requires authentication', async () => {
    const response = await inspectYoutube(
      jsonRequest('/api/admin/youtube/inspect', 'POST', {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    );
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Local uploads route
// ---------------------------------------------------------------------------

describe('GET /api/local-uploads/[...path]', () => {
  const uploadDir = path.resolve(process.env.LOCAL_UPLOAD_DIR ?? './data/test-uploads');

  afterAll(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('serves stored files with the right content type', async () => {
    const target = path.join(uploadDir, 'albums', 'a1', 'p1.jpg');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const response = await getLocalUpload(new Request(url('/api/local-uploads/albums/a1/p1.jpg')), {
      params: Promise.resolve({ path: ['albums', 'a1', 'p1.jpg'] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
  });

  it('rejects path traversal attempts', async () => {
    expect(resolveLocalUploadPath(uploadDir, ['..', 'secrets.txt'])).toBeNull();
    expect(resolveLocalUploadPath(uploadDir, ['albums', '..', '..', 'etc', 'passwd'])).toBeNull();

    const response = await getLocalUpload(new Request(url('/api/local-uploads/..%2Fsecrets')), {
      params: Promise.resolve({ path: ['..', 'secrets'] }),
    });
    expect(response.status).toBe(404);
  });

  it('returns a fresh 404 on each repeated missing-file request', async () => {
    const segments = ['albums', 'missing-album', 'missing-photo.jpg'];
    const context = () => ({ params: Promise.resolve({ path: segments }) });

    const first = await getLocalUpload(
      new Request(url('/api/local-uploads/albums/missing-album/missing-photo.jpg')),
      context(),
    );
    expect(first.status).toBe(404);
    await expect(first.text()).resolves.toBe('Not found');

    const second = await getLocalUpload(
      new Request(url('/api/local-uploads/albums/missing-album/missing-photo.jpg')),
      context(),
    );
    expect(second.status).toBe(404);
    await expect(second.text()).resolves.toBe('Not found');
  });
});
