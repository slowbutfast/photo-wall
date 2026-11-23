import { randomUUID } from 'node:crypto';

import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';

import { getDb, type Database } from '@/db';
import { albums, photos, type Album, type NewAlbum, type Photo } from '@/db/schema';

export interface AdminAlbumSummary extends Album {
  photoCount: number;
}

export interface WallAlbumRecord extends Album {
  photos: Photo[];
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return base.length > 0 ? base : 'album';
}

async function uniqueSlug(db: Database, title: string, excludeId?: string): Promise<string> {
  const base = slugify(title);
  const existing = await db.select({ id: albums.id, slug: albums.slug }).from(albums);
  const taken = new Set(
    existing.filter((row) => row.id !== excludeId).map((row) => row.slug),
  );
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export async function listPublishedAlbumsWithPhotos(): Promise<WallAlbumRecord[]> {
  const db = await getDb();
  const albumRows = await db
    .select()
    .from(albums)
    .where(eq(albums.status, 'published'))
    .orderBy(asc(albums.sortOrder), asc(albums.createdAt));

  if (albumRows.length === 0) return [];

  const photoRows = await db
    .select()
    .from(photos)
    .where(
      and(
        inArray(
          photos.albumId,
          albumRows.map((album) => album.id),
        ),
        eq(photos.status, 'active'),
      ),
    )
    .orderBy(asc(photos.sortOrder), asc(photos.createdAt));

  const photosByAlbum = new Map<string, Photo[]>();
  for (const photo of photoRows) {
    const bucket = photosByAlbum.get(photo.albumId);
    if (bucket) bucket.push(photo);
    else photosByAlbum.set(photo.albumId, [photo]);
  }

  return albumRows.map((album) => ({
    ...album,
    photos: photosByAlbum.get(album.id) ?? [],
  }));
}

export async function listAdminAlbums(): Promise<AdminAlbumSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      album: albums,
      photoCount: sql<number>`count(${photos.id})`,
    })
    .from(albums)
    .leftJoin(photos, eq(photos.albumId, albums.id))
    .groupBy(albums.id)
    .orderBy(asc(albums.sortOrder), asc(albums.createdAt));

  return rows.map((row) => ({ ...row.album, photoCount: Number(row.photoCount) }));
}

export async function getAlbum(id: string): Promise<Album | null> {
  const db = await getDb();
  const [album] = await db.select().from(albums).where(eq(albums.id, id)).limit(1);
  return album ?? null;
}

export async function countActivePhotos(albumId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(photos)
    .where(and(eq(photos.albumId, albumId), eq(photos.status, 'active')));
  return Number(row?.count ?? 0);
}

export async function getNextPhotoSortOrder(albumId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ max: sql<number | null>`max(${photos.sortOrder})` })
    .from(photos)
    .where(eq(photos.albumId, albumId));
  return row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1;
}

export interface CreateAlbumInput {
  title: string;
  description?: string | null;
  expectedCount: number;
  gridColumns?: number;
}

export async function createAlbum(input: CreateAlbumInput): Promise<Album> {
  const db = await getDb();
  const [row] = await db
    .select({ max: sql<number | null>`max(${albums.sortOrder})` })
    .from(albums);
  const nextSortOrder = row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1;

  const album: NewAlbum = {
    id: randomUUID(),
    slug: await uniqueSlug(db, input.title),
    title: input.title,
    description: input.description ?? null,
    status: 'draft',
    expectedCount: input.expectedCount,
    gridColumns: input.gridColumns ?? 3,
    sortOrder: nextSortOrder,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const [created] = await db.insert(albums).values(album).returning();
  return created;
}

export type AlbumPatch = Partial<
  Pick<
    Album,
    | 'title'
    | 'description'
    | 'status'
    | 'expectedCount'
    | 'gridColumns'
    | 'sortOrder'
    | 'cameraName'
    | 'dateLabel'
    | 'locationLabel'
    | 'youtubeVideoId'
    | 'soundtrackArtist'
    | 'soundtrackTitle'
    | 'soundtrackDurationSec'
  >
>;

export async function updateAlbum(id: string, patch: AlbumPatch): Promise<Album | null> {
  const db = await getDb();
  const values: AlbumPatch & { updatedAt: Date; slug?: string } = {
    ...patch,
    updatedAt: new Date(),
  };
  if (typeof patch.title === 'string' && patch.title.trim().length > 0) {
    values.slug = await uniqueSlug(db, patch.title, id);
  }
  const [updated] = await db
    .update(albums)
    .set(values)
    .where(and(eq(albums.id, id), ne(albums.status, 'deleting')))
    .returning();
  return updated ?? null;
}

export async function markAlbumDeleting(id: string): Promise<Album | null> {
  return updateAlbum(id, { status: 'deleting' });
}

export async function deleteAlbumRows(id: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(photos).where(eq(photos.albumId, id));
    await tx.delete(albums).where(eq(albums.id, id));
  });
}

export async function listDeletingAlbums(): Promise<Album[]> {
  const db = await getDb();
  return db.select().from(albums).where(eq(albums.status, 'deleting'));
}

export async function listDeletingPhotos(): Promise<Photo[]> {
  const db = await getDb();
  return db.select().from(photos).where(eq(photos.status, 'deleting'));
}

export async function getPhoto(id: string): Promise<Photo | null> {
  const db = await getDb();
  const [photo] = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
  return photo ?? null;
}

export interface CreatePhotoInput {
  id: string;
  albumId: string;
  storagePath: string;
  contentHash: string;
  filename: string | null;
  width: number;
  height: number;
  aspectRatio: number;
  dominantColor: string | null;
  thumbHash: string | null;
  sortOrder: number;
}

export async function insertPhoto(input: CreatePhotoInput): Promise<Photo> {
  const db = await getDb();
  const [created] = await db
    .insert(photos)
    .values({
      ...input,
      status: 'active',
      createdAt: new Date(),
    })
    .returning();
  return created;
}

export type PhotoPatch = Partial<Pick<Photo, 'title' | 'caption' | 'sortOrder' | 'status'>>;

export async function updatePhoto(id: string, patch: PhotoPatch): Promise<Photo | null> {
  const db = await getDb();
  const [updated] = await db
    .update(photos)
    .set(patch)
    .where(and(eq(photos.id, id), ne(photos.status, 'deleting')))
    .returning();
  return updated ?? null;
}

export async function markPhotoDeleting(id: string): Promise<Photo | null> {
  return updatePhoto(id, { status: 'deleting' });
}

export async function deletePhotoRow(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(photos).where(eq(photos.id, id));
}

export interface AdminAlbumDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: Album['status'];
  expectedCount: number;
  gridColumns: number;
  sortOrder: number;
  cameraName: string | null;
  dateLabel: string | null;
  locationLabel: string | null;
  soundtrack: {
    videoId: string;
    artist: string | null;
    title: string | null;
    durationSec: number | null;
  } | null;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
}

export function toAdminAlbumDto(album: Album, photoCount: number): AdminAlbumDto {
  return {
    id: album.id,
    slug: album.slug,
    title: album.title,
    description: album.description,
    status: album.status,
    expectedCount: album.expectedCount,
    gridColumns: album.gridColumns,
    sortOrder: album.sortOrder,
    cameraName: album.cameraName,
    dateLabel: album.dateLabel,
    locationLabel: album.locationLabel,
    soundtrack:
      album.youtubeVideoId === null
        ? null
        : {
            videoId: album.youtubeVideoId,
            artist: album.soundtrackArtist,
            title: album.soundtrackTitle,
            durationSec: album.soundtrackDurationSec,
          },
    photoCount,
    createdAt: album.createdAt.toISOString(),
    updatedAt: album.updatedAt.toISOString(),
  };
}

export interface AdminPhotoDto {
  id: string;
  albumId: string;
  status: Photo['status'];
  storagePath: string;
  width: number;
  height: number;
  aspectRatio: number;
  dominantColor: string | null;
  thumbHash: string | null;
  sortOrder: number;
  title: string | null;
  caption: string | null;
  createdAt: string;
}

export function toAdminPhotoDto(photo: Photo): AdminPhotoDto {
  return {
    id: photo.id,
    albumId: photo.albumId,
    status: photo.status,
    storagePath: photo.storagePath,
    width: photo.width,
    height: photo.height,
    aspectRatio: photo.aspectRatio,
    dominantColor: photo.dominantColor,
    thumbHash: photo.thumbHash,
    sortOrder: photo.sortOrder,
    title: photo.title,
    caption: photo.caption,
    createdAt: photo.createdAt.toISOString(),
  };
}
