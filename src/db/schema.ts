import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const albums = sqliteTable('albums', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum: ['draft', 'published', 'deleting'] })
    .notNull()
    .default('draft'),
  expectedCount: integer('expected_count').notNull().default(0),
  gridColumns: integer('grid_columns').notNull().default(3),
  sortOrder: integer('sort_order').notNull().default(0),
  cameraName: text('camera_name'),
  dateLabel: text('date_label'),
  locationLabel: text('location_label'),
  youtubeVideoId: text('youtube_video_id'),
  soundtrackArtist: text('soundtrack_artist'),
  soundtrackTitle: text('soundtrack_title'),
  soundtrackDurationSec: integer('soundtrack_duration_sec'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    albumId: text('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['active', 'deleting'] })
      .notNull()
      .default('active'),
    storagePath: text('storage_path').notNull(),
    contentHash: text('content_hash').notNull(),
    filename: text('filename'),
    title: text('title'),
    caption: text('caption'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    aspectRatio: real('aspect_ratio').notNull(),
    dominantColor: text('dominant_color'),
    thumbHash: text('thumb_hash'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('photos_album_id_idx').on(table.albumId)],
);

export type Album = typeof albums.$inferSelect;
export type NewAlbum = typeof albums.$inferInsert;
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
