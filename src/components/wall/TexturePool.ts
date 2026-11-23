/**
 * Priority-ordered VRAM texture pool.
 *
 * Costs are derived from actual decoded `ImageBitmap` dimensions
 * (`width * height * 4 * 1.33`) rather than requested LOD sizes, so local
 * full-resolution originals cannot silently blow the budget. Uploads are
 * throttled to `<= 2` `initTexture` calls per frame, and both bitmaps and GPU
 * textures are released on eviction.
 *
 * The pool is renderer-agnostic: tests inject a fake uploader and fake
 * bitmaps/textures, so no WebGL context is required.
 */

export type TexturePriority = 'off-screen' | 'visible-thumb' | 'visible-medium' | 'focus';

export interface TextureHandle {
  dispose(): void;
}

export interface DecodedBitmap {
  width: number;
  height: number;
  close(): void;
}

export interface TextureUploader {
  initTexture(texture: TextureHandle): void;
}

export interface TexturePoolEntry {
  id: string;
  bitmap: DecodedBitmap;
  texture: TextureHandle;
  priority: TexturePriority;
  bytes: number;
  lastUsed: number;
  uploaded: boolean;
  bitmapClosed: boolean;
}

export interface TexturePoolAddOptions {
  id: string;
  bitmap: DecodedBitmap;
  texture: TextureHandle;
  priority?: TexturePriority;
  /** Queue a GPU upload for this entry (default `true`). */
  upload?: boolean;
}

export interface TexturePoolOptions {
  renderer: TextureUploader;
  /** Viewport width used for the desktop/mobile budget heuristic. Default 1920. */
  viewportWidth?: number;
  /** Explicit byte budget overriding the viewport heuristic. */
  budgetBytes?: number;
  /** Evict over-budget entries immediately on add (default `true`). */
  autoEvict?: boolean;
}

/** RGBA channels plus a ~33% mipmap/overhead allowance. */
export const BYTES_PER_PIXEL = 4;
export const MIPMAP_FACTOR = 1.33;
export const MOBILE_BREAKPOINT_PX = 768;
export const DESKTOP_VRAM_BUDGET_BYTES = 256 * 1024 * 1024;
export const MOBILE_VRAM_BUDGET_BYTES = 96 * 1024 * 1024;
export const MAX_UPLOADS_PER_FRAME = 2;
export const FOCUS_MAX_TEXTURES = 3;

const PRIORITY_RANK: Record<TexturePriority, number> = {
  'off-screen': 0,
  'visible-thumb': 1,
  'visible-medium': 2,
  focus: 3,
};

export function decodedBitmapBytes(width: number, height: number): number {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  return Math.round(safeWidth * safeHeight * BYTES_PER_PIXEL * MIPMAP_FACTOR);
}

/** Desktop budget at `>= 768px`, mobile budget below it. */
export function getVramBudget(viewportWidth: number): number {
  return viewportWidth < MOBILE_BREAKPOINT_PX
    ? MOBILE_VRAM_BUDGET_BYTES
    : DESKTOP_VRAM_BUDGET_BYTES;
}

export class TexturePool {
  private readonly items = new Map<string, TexturePoolEntry>();
  private readonly uploadQueue: string[] = [];
  private readonly renderer: TextureUploader;
  private readonly autoEvict: boolean;
  private clock = 0;

  public readonly budgetBytes: number;

  constructor(options: TexturePoolOptions) {
    this.renderer = options.renderer;
    this.budgetBytes = options.budgetBytes ?? getVramBudget(options.viewportWidth ?? 1920);
    this.autoEvict = options.autoEvict ?? true;
  }

  get count(): number {
    return this.items.size;
  }

  get usedBytes(): number {
    let total = 0;
    for (const entry of this.items.values()) total += entry.bytes;
    return total;
  }

  get pendingUploadCount(): number {
    return this.uploadQueue.length;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  get(id: string): TexturePoolEntry | undefined {
    return this.items.get(id);
  }

  entries(): TexturePoolEntry[] {
    return Array.from(this.items.values());
  }

  add(options: TexturePoolAddOptions): void {
    if (this.items.has(options.id)) this.release(options.id);

    const entry: TexturePoolEntry = {
      id: options.id,
      bitmap: options.bitmap,
      texture: options.texture,
      priority: options.priority ?? 'visible-medium',
      bytes: decodedBitmapBytes(options.bitmap.width, options.bitmap.height),
      lastUsed: (this.clock += 1),
      uploaded: false,
      bitmapClosed: false,
    };
    this.items.set(entry.id, entry);

    if (options.upload ?? true) this.uploadQueue.push(entry.id);

    this.enforceFocusCap();
    if (this.autoEvict) this.evictToBudget();
  }

  setPriority(id: string, priority: TexturePriority): boolean {
    const entry = this.items.get(id);
    if (!entry) return false;
    entry.priority = priority;
    entry.lastUsed = (this.clock += 1);
    this.enforceFocusCap();
    if (this.autoEvict) this.evictToBudget();
    return true;
  }

  touch(id: string): void {
    const entry = this.items.get(id);
    if (entry) entry.lastUsed = (this.clock += 1);
  }

  /** Mark an existing entry for GPU upload on the next frame(s). */
  requestUpload(id: string): boolean {
    const entry = this.items.get(id);
    if (!entry || entry.uploaded) return false;
    if (!this.uploadQueue.includes(id)) this.uploadQueue.push(id);
    return true;
  }

  /**
   * Upload at most `MAX_UPLOADS_PER_FRAME` queued textures, closing each
   * decoded bitmap immediately after its GPU upload.
   */
  uploadPending(): number {
    let uploads = 0;
    while (uploads < MAX_UPLOADS_PER_FRAME && this.uploadQueue.length > 0) {
      const id = this.uploadQueue.shift() as string;
      const entry = this.items.get(id);
      if (!entry || entry.uploaded) continue;

      this.renderer.initTexture(entry.texture);
      entry.uploaded = true;
      this.closeBitmap(entry);
      uploads += 1;
    }
    return uploads;
  }

  /** Evict lowest-priority entries until the decoded-byte budget is met. */
  evictToBudget(): string[] {
    const evicted: string[] = [];
    while (this.usedBytes > this.budgetBytes && this.items.size > 0) {
      const victim = this.pickEvictionVictim();
      if (!victim) break;
      this.disposeEntry(victim);
      evicted.push(victim.id);
    }
    return evicted;
  }

  /** Dispose a texture and close its bitmap (if still open). */
  release(id: string): void {
    const entry = this.items.get(id);
    if (!entry) return;
    this.disposeEntry(entry);
  }

  disposeAll(): void {
    for (const entry of Array.from(this.items.values())) {
      this.disposeEntry(entry);
    }
    this.uploadQueue.length = 0;
  }

  private pickEvictionVictim(): TexturePoolEntry | undefined {
    const all = Array.from(this.items.values());
    if (all.length === 0) return undefined;

    // Never keep more than three focus textures resident.
    const protectedFocus = new Set(
      all
        .filter((entry) => entry.priority === 'focus')
        .sort((a, b) => b.lastUsed - a.lastUsed)
        .slice(0, FOCUS_MAX_TEXTURES)
        .map((entry) => entry.id),
    );

    const candidates = all.filter((entry) => !protectedFocus.has(entry.id));
    const pool = candidates.length > 0 ? candidates : all;
    return pool.sort(
      (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.lastUsed - b.lastUsed,
    )[0];
  }

  private enforceFocusCap(): void {
    const focusEntries = Array.from(this.items.values())
      .filter((entry) => entry.priority === 'focus')
      .sort((a, b) => b.lastUsed - a.lastUsed);
    for (const entry of focusEntries.slice(FOCUS_MAX_TEXTURES)) {
      entry.priority = 'visible-medium';
    }
  }

  private closeBitmap(entry: TexturePoolEntry): void {
    if (entry.bitmapClosed) return;
    entry.bitmapClosed = true;
    entry.bitmap.close();
  }

  private disposeEntry(entry: TexturePoolEntry): void {
    entry.texture.dispose();
    this.closeBitmap(entry);
    this.items.delete(entry.id);
    let index = this.uploadQueue.indexOf(entry.id);
    while (index >= 0) {
      this.uploadQueue.splice(index, 1);
      index = this.uploadQueue.indexOf(entry.id);
    }
  }
}
