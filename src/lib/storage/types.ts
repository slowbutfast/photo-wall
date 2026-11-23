/** Unified object storage contract shared by Bunny.net and local dev. */
export interface StorageAdapter {
  /** Upload raw bytes to `/albums/{albumId}/{photoId}.{ext}`. */
  putObject(path: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Delete a single object. Missing objects are ignored. */
  deleteObject(path: string): Promise<void>;
  /** Recursively delete a directory prefix such as `/albums/{albumId}/`. */
  deletePrefix(path: string): Promise<void>;
  /** Purge cached CDN variants with a wildcard pattern (`/albums/{id}/*`). */
  purgeWildcard(path: string): Promise<void>;
  /** Public URL for an object (used for the wall manifest base). */
  publicUrl(path: string): string;
}
