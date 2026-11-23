CREATE TABLE `albums` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`expected_count` integer DEFAULT 0 NOT NULL,
	`grid_columns` integer DEFAULT 3 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`camera_name` text,
	`date_label` text,
	`location_label` text,
	`youtube_video_id` text,
	`soundtrack_artist` text,
	`soundtrack_title` text,
	`soundtrack_duration_sec` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `albums_slug_unique` ON `albums` (`slug`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`album_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`storage_path` text NOT NULL,
	`content_hash` text NOT NULL,
	`filename` text,
	`title` text,
	`caption` text,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`aspect_ratio` real NOT NULL,
	`dominant_color` text,
	`thumb_hash` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_album_id_idx` ON `photos` (`album_id`);