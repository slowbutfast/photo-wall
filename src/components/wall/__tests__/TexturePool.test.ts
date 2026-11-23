import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  DESKTOP_VRAM_BUDGET_BYTES,
  FOCUS_MAX_TEXTURES,
  MAX_UPLOADS_PER_FRAME,
  MOBILE_VRAM_BUDGET_BYTES,
  TexturePool,
  decodedBitmapBytes,
  getVramBudget,
  type TextureHandle,
  type TexturePriority,
  type TextureUploader,
} from '../TexturePool';

interface FakeBitmap {
  width: number;
  height: number;
  close: Mock<() => void>;
}

type FakeTexture = { dispose: Mock<() => void> };

function makeBitmap(width: number, height: number): FakeBitmap {
  return { width, height, close: vi.fn<() => void>() };
}

function makeTexture(): FakeTexture {
  return { dispose: vi.fn<() => void>() };
}

function makeUploader() {
  const initTexture = vi.fn<(texture: TextureHandle) => void>();
  const uploader: TextureUploader = { initTexture };
  return { uploader, initTexture };
}

function addEntry(
  pool: TexturePool,
  id: string,
  options: { width?: number; height?: number; priority?: TexturePriority; upload?: boolean } = {},
) {
  const bitmap = makeBitmap(options.width ?? 100, options.height ?? 100);
  const texture = makeTexture();
  pool.add({ id, bitmap, texture, priority: options.priority, upload: options.upload });
  return { bitmap, texture };
}

describe('getVramBudget', () => {
  it('uses the 96 MB mobile budget below 768px and 256 MB above', () => {
    expect(getVramBudget(320)).toBe(MOBILE_VRAM_BUDGET_BYTES);
    expect(getVramBudget(767)).toBe(MOBILE_VRAM_BUDGET_BYTES);
    expect(getVramBudget(768)).toBe(DESKTOP_VRAM_BUDGET_BYTES);
    expect(getVramBudget(1920)).toBe(DESKTOP_VRAM_BUDGET_BYTES);
    expect(MOBILE_VRAM_BUDGET_BYTES).toBe(96 * 1024 * 1024);
    expect(DESKTOP_VRAM_BUDGET_BYTES).toBe(256 * 1024 * 1024);
  });
});

describe('decodedBitmapBytes', () => {
  it('accounts for RGBA + mipmaps from decoded ImageBitmap dimensions', () => {
    expect(decodedBitmapBytes(1000, 500)).toBe(Math.round(1000 * 500 * 4 * 1.33));
    expect(decodedBitmapBytes(1, 1)).toBe(Math.round(4 * 1.33));
  });
});

describe('TexturePool accounting', () => {
  it('sums decoded bitmap bytes across prints and YouTube thumbnails', () => {
    const pool = new TexturePool({ renderer: makeUploader().uploader, viewportWidth: 1920 });
    addEntry(pool, 'print', { width: 2000, height: 1500 });
    addEntry(pool, 'thumb', { width: 1280, height: 720 });
    expect(pool.usedBytes).toBe(
      decodedBitmapBytes(2000, 1500) + decodedBitmapBytes(1280, 720),
    );
    expect(pool.count).toBe(2);
  });

  it('selects the budget from the viewport heuristic', () => {
    const desktop = new TexturePool({ renderer: makeUploader().uploader, viewportWidth: 1440 });
    const mobile = new TexturePool({ renderer: makeUploader().uploader, viewportWidth: 390 });
    expect(desktop.budgetBytes).toBe(DESKTOP_VRAM_BUDGET_BYTES);
    expect(mobile.budgetBytes).toBe(MOBILE_VRAM_BUDGET_BYTES);
  });
});

describe('TexturePool priority eviction', () => {
  it('evicts off-screen → visible thumbs → visible medium → focus', () => {
    const pool = new TexturePool({
      renderer: makeUploader().uploader,
      viewportWidth: 1920,
      budgetBytes: 200,
      autoEvict: false,
    });
    addEntry(pool, 'offscreen', { width: 5, height: 5, priority: 'off-screen' }); // 133 bytes
    addEntry(pool, 'thumb', { width: 5, height: 5, priority: 'visible-thumb' });
    addEntry(pool, 'medium', { width: 5, height: 5, priority: 'visible-medium' });
    addEntry(pool, 'focus', { width: 5, height: 5, priority: 'focus' });

    const evicted = pool.evictToBudget();
    expect(evicted).toEqual(['offscreen', 'thumb', 'medium']);
    expect(pool.count).toBe(1);
    expect(pool.has('focus')).toBe(true);
  });

  it('caps focus textures at three by demoting the oldest', () => {
    const pool = new TexturePool({ renderer: makeUploader().uploader, viewportWidth: 1920 });
    addEntry(pool, 'focus-1', { priority: 'focus' });
    addEntry(pool, 'focus-2', { priority: 'focus' });
    addEntry(pool, 'focus-3', { priority: 'focus' });
    addEntry(pool, 'focus-4', { priority: 'focus' });

    const focusEntries = pool.entries().filter((entry) => entry.priority === 'focus');
    expect(focusEntries).toHaveLength(FOCUS_MAX_TEXTURES);
    expect(focusEntries.map((entry) => entry.id).sort()).toEqual(['focus-2', 'focus-3', 'focus-4']);
    expect(pool.get('focus-1')?.priority).toBe('visible-medium');
  });

  it('enforces the cap when priorities are updated after insertion', () => {
    const pool = new TexturePool({ renderer: makeUploader().uploader, viewportWidth: 1920 });
    for (let index = 0; index < 5; index += 1) {
      addEntry(pool, `t${index}`, { priority: 'visible-medium' });
    }
    for (let index = 0; index < 5; index += 1) {
      pool.setPriority(`t${index}`, 'focus');
    }
    expect(pool.entries().filter((entry) => entry.priority === 'focus')).toHaveLength(
      FOCUS_MAX_TEXTURES,
    );
  });

  it('disposes textures and closes bitmaps when evicted', () => {
    const uploader = makeUploader();
    const pool = new TexturePool({
      renderer: uploader.uploader,
      viewportWidth: 1920,
      budgetBytes: 1,
      autoEvict: false,
    });
    const { bitmap, texture } = addEntry(pool, 'oversized', { width: 100, height: 100 });
    const evicted = pool.evictToBudget();
    expect(evicted).toEqual(['oversized']);
    expect(texture.dispose).toHaveBeenCalledTimes(1);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(pool.count).toBe(0);
    expect(pool.usedBytes).toBe(0);
  });

  it('evicts immediately after an add when over budget', () => {
    const pool = new TexturePool({
      renderer: makeUploader().uploader,
      viewportWidth: 1920,
      budgetBytes: 200,
    });
    addEntry(pool, 'a', { width: 5, height: 5, priority: 'off-screen' }); // 133
    addEntry(pool, 'b', { width: 5, height: 5, priority: 'off-screen' }); // 266 total
    expect(pool.has('a')).toBe(false);
    expect(pool.has('b')).toBe(true);
  });
});

describe('TexturePool upload throttling', () => {
  it('uploads at most two initTexture calls per frame and closes + disposes correctly', () => {
    const { uploader, initTexture } = makeUploader();
    const pool = new TexturePool({ renderer: uploader, viewportWidth: 1920 });
    const created = Array.from({ length: 5 }, (_, index) =>
      addEntry(pool, `u${index}`, { upload: true }),
    );

    expect(MAX_UPLOADS_PER_FRAME).toBe(2);
    expect(pool.pendingUploadCount).toBe(5);
    expect(pool.uploadPending()).toBe(2);
    expect(initTexture).toHaveBeenCalledTimes(2);
    expect(created[0].bitmap.close).toHaveBeenCalledTimes(1);
    expect(created[1].bitmap.close).toHaveBeenCalledTimes(1);
    expect(created[2].bitmap.close).not.toHaveBeenCalled();

    expect(pool.uploadPending()).toBe(2);
    expect(initTexture).toHaveBeenCalledTimes(4);
    expect(pool.uploadPending()).toBe(1);
    expect(initTexture).toHaveBeenCalledTimes(5);
    expect(pool.uploadPending()).toBe(0);
    expect(pool.pendingUploadCount).toBe(0);
  });

  it('drops queued uploads for entries evicted before upload', () => {
    const { uploader, initTexture } = makeUploader();
    const pool = new TexturePool({ renderer: uploader, viewportWidth: 1920 });
    addEntry(pool, 'gone', { upload: true, priority: 'off-screen' });
    pool.release('gone');
    expect(pool.uploadPending()).toBe(0);
    expect(initTexture).not.toHaveBeenCalled();
  });

  it('does not double-close a bitmap when releasing an uploaded entry', () => {
    const { uploader } = makeUploader();
    const pool = new TexturePool({ renderer: uploader, viewportWidth: 1920 });
    const { bitmap, texture } = addEntry(pool, 'one', { upload: true });
    pool.uploadPending();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    pool.release('one');
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(texture.dispose).toHaveBeenCalledTimes(1);
  });
});
