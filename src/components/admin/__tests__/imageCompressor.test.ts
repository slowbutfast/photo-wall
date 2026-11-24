import { describe, expect, it, vi } from 'vitest';

import {
  CLIENT_MAX_UPLOAD_BYTES,
  COMPRESSION_LADDER,
  UploadHttpError,
  UploadPreparationError,
  ensurePrepared,
  formatUploadHttpError,
  hasAlphaChannel,
  isRetryableUploadError,
  normalizeFilenameForMime,
  prepareUploadFile,
  type CompressorAdapters,
  type CompressorCanvas,
  type PreparedUpload,
} from '../imageCompressor';

const HEADER_BYTE_COUNT = 64 * 1024;

interface FakeBitmap {
  width: number;
  height: number;
  closed: number;
  close(): void;
}

interface FakeCanvas extends CompressorCanvas {
  drawn: number;
  contextRequests: Array<{ id: '2d'; options?: CanvasRenderingContext2DSettings }>;
}

type ContextBehaviour = 'ok' | 'throw-on-p3' | 'null-on-p3' | 'null';

interface HarnessOptions {
  bitmap?: { width: number; height: number };
  decodeError?: boolean;
  headerBytes?: Uint8Array;
  /** Successive encode output sizes; the last entry repeats once exhausted. */
  sizes?: number[];
  /** Force the returned blob MIME (simulates Safari's PNG WebP fallback). */
  blobType?: string;
  contextBehaviour?: ContextBehaviour;
  onEncode?: () => void;
}

function fakeBitmap(width = 6000, height = 4000): FakeBitmap {
  const bitmap: FakeBitmap = {
    width,
    height,
    closed: 0,
    close() {
      bitmap.closed += 1;
    },
  };
  return bitmap;
}

function createHarness(options: HarnessOptions = {}) {
  const bitmap = fakeBitmap(options.bitmap?.width, options.bitmap?.height);
  const canvases: FakeCanvas[] = [];
  // Dimensions are captured at encode time because `finally` zeroes canvases.
  const encodeCalls: Array<{
    type: string;
    quality?: number;
    canvas: FakeCanvas;
    width: number;
    height: number;
  }> = [];
  const decodeCalls: Array<{ file: Blob; options?: ImageBitmapOptions }> = [];
  const headerCalls: Array<{ byteCount: number }> = [];
  let encodeIndex = 0;

  const adapters: Partial<CompressorAdapters> = {
    decodeBitmap: async (file, decodeOptions) => {
      decodeCalls.push({ file, options: decodeOptions });
      if (options.decodeError) throw new Error('decode_failed');
      return bitmap as unknown as ImageBitmap;
    },
    createCanvas: (width, height) => {
      const contextRequests: FakeCanvas['contextRequests'] = [];
      const canvas: FakeCanvas = {
        width,
        height,
        drawn: 0,
        contextRequests,
        getContext(id, contextOptions) {
          contextRequests.push({ id, options: contextOptions });
          if (options.contextBehaviour === 'null') return null;
          if (contextOptions?.colorSpace === 'display-p3') {
            if (options.contextBehaviour === 'throw-on-p3') throw new Error('color_space_unsupported');
            if (options.contextBehaviour === 'null-on-p3') return null;
          }
          const context = {
            drawImage() {
              canvas.drawn += 1;
            },
            getImageData(_sx: number, _sy: number, sw: number, sh: number) {
              const data = new Uint8ClampedArray(sw * sh * 4);
              for (let index = 0; index < data.length; index += 4) {
                data[index] = 10;
                data[index + 1] = 20;
                data[index + 2] = 30;
                data[index + 3] = 255;
              }
              return { data, width: sw, height: sh };
            },
          };
          return context as unknown as CanvasRenderingContext2D;
        },
      };
      canvases.push(canvas);
      return canvas;
    },
    encodeCanvas: async (canvas, type, quality) => {
      const fakeCanvas = canvas as FakeCanvas;
      encodeCalls.push({
        type,
        quality,
        canvas: fakeCanvas,
        width: fakeCanvas.width,
        height: fakeCanvas.height,
      });
      options.onEncode?.();
      const sizes = options.sizes ?? [CLIENT_MAX_UPLOAD_BYTES];
      const size = sizes[Math.min(encodeIndex, sizes.length - 1)];
      encodeIndex += 1;
      return { size, type: options.blobType ?? type } as unknown as Blob;
    },
    readHeaderBytes: async (_file, byteCount) => {
      headerCalls.push({ byteCount });
      return options.headerBytes ?? jpegHeader();
    },
  };

  return { adapters, bitmap, canvases, encodeCalls, decodeCalls, headerCalls };
}

function smallFile(name: string, type: string, bytes = 2048): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/**
 * Oversized fixtures only need the shape `prepareUploadFile` reads. Real bytes
 * are injected through the adapters, which keeps the ladder tests cheap.
 */
function bigFile(name: string, type: string): File {
  return {
    name,
    type,
    size: CLIENT_MAX_UPLOAD_BYTES + 1,
  } as unknown as File;
}

function jpegHeader(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
}

function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    target[offset + index] = text.charCodeAt(index);
  }
}

function writeU32LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function pushChunk(target: number[], type: string, data: number[] = []): void {
  const length = data.length;
  target.push((length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff);
  for (const character of type) target.push(character.charCodeAt(0));
  target.push(...data);
  // CRC is not inspected, but its four bytes keep chunk offsets honest.
  target.push(0, 0, 0, 0);
}

function pngHeader(
  colourType: number,
  extraChunks: Array<{ type: string; data?: number[] }> = [],
): Uint8Array {
  const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  pushChunk(bytes, 'IHDR', [0, 0, 0x10, 0, 0, 0, 0x10, 0, 8, colourType, 0, 0, 0]);
  for (const chunk of extraChunks) pushChunk(bytes, chunk.type, chunk.data ?? []);
  pushChunk(bytes, 'IDAT', [1, 2, 3]);
  return new Uint8Array(bytes);
}

function webpVp8x(alpha: boolean): Uint8Array {
  const bytes = new Uint8Array(40);
  writeAscii(bytes, 0, 'RIFF');
  writeAscii(bytes, 8, 'WEBP');
  writeAscii(bytes, 12, 'VP8X');
  writeU32LE(bytes, 16, 10);
  bytes[20] = alpha ? 0x10 : 0x00;
  return bytes;
}

function webpVp8l(alpha: boolean): Uint8Array {
  const bytes = new Uint8Array(40);
  writeAscii(bytes, 0, 'RIFF');
  writeAscii(bytes, 8, 'WEBP');
  writeAscii(bytes, 12, 'VP8L');
  writeU32LE(bytes, 16, 20);
  bytes[20] = 0x2f;
  writeU32LE(bytes, 21, alpha ? 1 << 28 : 0);
  return bytes;
}

function webpVp8(): Uint8Array {
  const bytes = new Uint8Array(40);
  writeAscii(bytes, 0, 'RIFF');
  writeAscii(bytes, 8, 'WEBP');
  writeAscii(bytes, 12, 'VP8 ');
  writeU32LE(bytes, 16, 20);
  return bytes;
}

function expectZeroed(canvases: FakeCanvas[]): void {
  for (const canvas of canvases) {
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 0, height: 0 });
  }
}

describe('constants', () => {
  it('targets 4.0 MiB and the deterministic ladder', () => {
    expect(CLIENT_MAX_UPLOAD_BYTES).toBe(4 * 1024 * 1024);
    expect(COMPRESSION_LADDER).toEqual([
      { maxEdge: 4096, quality: 0.9 },
      { maxEdge: 4096, quality: 0.85 },
      { maxEdge: 4096, quality: 0.8 },
      { maxEdge: 3072, quality: 0.85 },
      { maxEdge: 3072, quality: 0.8 },
    ]);
  });
});

describe('error classes', () => {
  it('carry their own name and, for HTTP errors, the status', () => {
    expect(new UploadPreparationError('nope')).toMatchObject({
      name: 'UploadPreparationError',
      message: 'nope',
    });
    expect(new UploadHttpError(413, 'too big')).toMatchObject({
      name: 'UploadHttpError',
      message: 'too big',
      status: 413,
    });
  });
});

describe('prepareUploadFile passthrough', () => {
  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['screenshot.png', 'image/png'],
    ['frame.webp', 'image/webp'],
  ])('passes a small %s through byte-identically', async (name, type) => {
    const file = smallFile(name, type);
    const harness = createHarness();

    const prepared = await prepareUploadFile(file, { adapters: harness.adapters });

    expect(prepared.blob).toBe(file);
    expect(prepared.filename).toBe(name);
    expect(prepared.contentType).toBe(type);
    expect(prepared.compressed).toBe(false);
    expect(prepared.thumbHash).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(prepared.dominantColor).toBe('#0a141e');
    expect(harness.decodeCalls).toHaveLength(1);
    expect(harness.decodeCalls[0].options).toEqual({ imageOrientation: 'from-image' });
    expect(harness.bitmap.closed).toBe(1);
    expect(harness.canvases).toHaveLength(1);
    expectZeroed(harness.canvases);
  });

  it('still uploads a small file when client decoding throws', async () => {
    const file = smallFile('unreadable.heic.jpg', 'image/jpeg');
    const harness = createHarness({ decodeError: true });

    const prepared = await prepareUploadFile(file, { adapters: harness.adapters });

    expect(prepared.blob).toBe(file);
    expect(prepared.filename).toBe('unreadable.heic.jpg');
    expect(prepared.contentType).toBe('image/jpeg');
    expect(prepared.compressed).toBe(false);
    expect(prepared.thumbHash).toBeNull();
    expect(prepared.dominantColor).toBeNull();
    expect(harness.canvases).toHaveLength(0);
  });

  it('still uploads a small file when the scratch canvas has no context', async () => {
    const file = smallFile('no-context.png', 'image/png');
    const harness = createHarness({ contextBehaviour: 'null' });

    const prepared = await prepareUploadFile(file, { adapters: harness.adapters });

    expect(prepared.blob).toBe(file);
    expect(prepared.thumbHash).toBeNull();
    expect(prepared.dominantColor).toBeNull();
    expect(harness.bitmap.closed).toBe(1);
    expect(harness.canvases).toHaveLength(1);
    expectZeroed(harness.canvases);
  });
});

describe('hasAlphaChannel', () => {
  it('detects PNG IHDR colour types 4 (grayscale+alpha) and 6 (RGBA)', () => {
    expect(hasAlphaChannel(pngHeader(4))).toBe(true);
    expect(hasAlphaChannel(pngHeader(6))).toBe(true);
  });

  it('treats opaque PNG colour types 0, 2 and 3 without tRNS as opaque', () => {
    expect(hasAlphaChannel(pngHeader(0))).toBe(false);
    expect(hasAlphaChannel(pngHeader(2))).toBe(false);
    expect(hasAlphaChannel(pngHeader(3))).toBe(false);
  });

  it('detects a tRNS chunk that appears before IDAT', () => {
    expect(hasAlphaChannel(pngHeader(2, [{ type: 'tRNS' }]))).toBe(true);
    expect(hasAlphaChannel(pngHeader(3, [{ type: 'tRNS', data: [0, 0, 0] }]))).toBe(true);
  });

  it('detects the WebP VP8X alpha flag', () => {
    expect(hasAlphaChannel(webpVp8x(true))).toBe(true);
    expect(hasAlphaChannel(webpVp8x(false))).toBe(false);
  });

  it('detects the WebP VP8L alpha bit', () => {
    expect(hasAlphaChannel(webpVp8l(true))).toBe(true);
    expect(hasAlphaChannel(webpVp8l(false))).toBe(false);
  });

  it('returns false for lossy VP8 WebP and JPEG', () => {
    expect(hasAlphaChannel(webpVp8())).toBe(false);
    expect(hasAlphaChannel(jpegHeader())).toBe(false);
  });

  it('never throws on truncated or foreign headers', () => {
    expect(hasAlphaChannel(new Uint8Array(0))).toBe(false);
    expect(hasAlphaChannel(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(hasAlphaChannel(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]))).toBe(
      false,
    );
    expect(hasAlphaChannel(pngHeader(2).slice(0, 20))).toBe(false);
  });
});

describe('prepareUploadFile compression', () => {
  it('steps the opaque JPEG ladder, redrawing only when maxEdge changes', async () => {
    const file = bigFile('IMG_0001.JPG', 'image/jpeg');
    const harness = createHarness({ sizes: [5_200_000, 4_800_000, 4_600_000, 4_400_000, 4_194_304] });

    const prepared = await prepareUploadFile(file, { adapters: harness.adapters });

    expect(harness.encodeCalls.map((call) => [call.width, call.quality])).toEqual([
      [4096, 0.9],
      [4096, 0.85],
      [4096, 0.8],
      [3072, 0.85],
      [3072, 0.8],
    ]);
    expect(harness.encodeCalls.every((call) => call.type === 'image/jpeg')).toBe(true);
    // Scratch ThumbHash canvas plus one canvas per distinct long edge.
    expect(harness.canvases).toHaveLength(3);
    expect(harness.canvases.slice(1).map((canvas) => canvas.drawn)).toEqual([1, 1]);
    expect(prepared.contentType).toBe('image/jpeg');
    expect(prepared.filename).toBe('IMG_0001.jpg');
    expect(prepared.compressed).toBe(true);
    expect(prepared.thumbHash).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(prepared.dominantColor).toBe('#0a141e');
    expect(harness.decodeCalls).toHaveLength(1);
    expect(harness.decodeCalls[0].options).toEqual({ imageOrientation: 'from-image' });
    expect(harness.headerCalls[0].byteCount).toBe(HEADER_BYTE_COUNT);
    expect(harness.bitmap.closed).toBe(1);
    expectZeroed(harness.canvases);
  });

  it('stops after the first encode when it already fits', async () => {
    const file = bigFile('IMG_0002.jpeg', 'image/jpeg');
    const harness = createHarness({ sizes: [3_000_000] });

    const prepared = await prepareUploadFile(file, { adapters: harness.adapters });

    expect(harness.encodeCalls).toHaveLength(1);
    expect(harness.encodeCalls[0]).toMatchObject({ type: 'image/jpeg', quality: 0.9 });
    expect(harness.canvases).toHaveLength(2);
    expect(prepared.filename).toBe('IMG_0002.jpg');
    expect(prepared.compressed).toBe(true);
    expect(harness.bitmap.closed).toBe(1);
    expectZeroed(harness.canvases);
  });

  it('never upscales an image smaller than the ladder cap', async () => {
    const file = bigFile('small-dimensions.png', 'image/png');
    const harness = createHarness({ bitmap: { width: 1000, height: 800 }, sizes: [1_000] });

    const prepared = await prepareUploadFile(file, { adapters: harness.adapters });

    expect(harness.encodeCalls[0].width).toBe(1000);
    expect(harness.encodeCalls[0].height).toBe(800);
    expect(prepared.filename).toBe('small-dimensions.jpg');
  });

  it('encodes an alpha-channel PNG as WebP and never as JPEG', async () => {
    const file = bigFile('transparent.png', 'image/png');
    const harness = createHarness({ headerBytes: pngHeader(6), sizes: [5_000_000, 4_100_000] });

    const prepared = await prepareUploadFile(file, { adapters: harness.adapters });

    expect(harness.encodeCalls.map((call) => call.type)).toEqual(['image/webp', 'image/webp']);
    expect(harness.encodeCalls.some((call) => call.type === 'image/jpeg')).toBe(false);
    expect(prepared.contentType).toBe('image/webp');
    expect(prepared.filename).toBe('transparent.webp');
    expect(prepared.compressed).toBe(true);
    expect(harness.bitmap.closed).toBe(1);
    expectZeroed(harness.canvases);
  });

  it('fails explicitly when the browser cannot encode WebP (Safari PNG fallback)', async () => {
    const file = bigFile('transparent.webp', 'image/webp');
    const harness = createHarness({
      headerBytes: webpVp8x(true),
      sizes: [1_000],
      blobType: 'image/png',
    });

    await expect(
      prepareUploadFile(file, { adapters: harness.adapters }),
    ).rejects.toMatchObject({
      name: 'UploadPreparationError',
      message:
        'Transparent image could not be compressed under 4 MB in this browser. Try Chrome or export a smaller PNG.',
    });
    expect(harness.encodeCalls).toHaveLength(1);
    expect(harness.bitmap.closed).toBe(1);
    expectZeroed(harness.canvases);
  });

  it('fails with a clear error and releases resources when the ladder is exhausted', async () => {
    const file = bigFile('huge.jpg', 'image/jpeg');
    const harness = createHarness({ sizes: [9_000_000] });

    const error = await prepareUploadFile(file, { adapters: harness.adapters }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(UploadPreparationError);
    expect((error as Error).message).toMatch(/4 MB/);
    expect(harness.encodeCalls).toHaveLength(5);
    expect(harness.bitmap.closed).toBe(1);
    expect(harness.canvases).toHaveLength(3);
    expectZeroed(harness.canvases);
  });

  it('fails cleanly when decoding an oversized file throws', async () => {
    const file = bigFile('broken.jpg', 'image/jpeg');
    const harness = createHarness({ decodeError: true });

    await expect(
      prepareUploadFile(file, { adapters: harness.adapters }),
    ).rejects.toBeInstanceOf(UploadPreparationError);
    expect(harness.encodeCalls).toHaveLength(0);
    expect(harness.canvases).toHaveLength(0);
  });
});

describe('Display-P3 fallback', () => {
  it.each<ContextBehaviour>(['throw-on-p3', 'null-on-p3'])(
    'falls back to sRGB when the display-p3 request is %s',
    async (contextBehaviour) => {
      const file = bigFile('p3.jpg', 'image/jpeg');
      const harness = createHarness({ contextBehaviour, sizes: [1_000] });

      const prepared = await prepareUploadFile(file, { adapters: harness.adapters });

      const compressionCanvas = harness.canvases[harness.canvases.length - 1];
      expect(compressionCanvas.contextRequests).toEqual([
        { id: '2d', options: { colorSpace: 'display-p3' } },
        { id: '2d', options: undefined },
      ]);
      expect(compressionCanvas.drawn).toBe(1);
      expect(prepared.compressed).toBe(true);
    },
  );
});

describe('cancellation', () => {
  it('throws AbortError before doing any work when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const harness = createHarness();

    await expect(
      prepareUploadFile(smallFile('photo.jpg', 'image/jpeg'), {
        signal: controller.signal,
        adapters: harness.adapters,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.decodeCalls).toHaveLength(0);
    expect(harness.canvases).toHaveLength(0);
  });

  it('aborts between ladder steps and still releases the bitmap and canvases', async () => {
    const controller = new AbortController();
    const harness = createHarness({ sizes: [9_000_000], onEncode: () => controller.abort() });

    await expect(
      prepareUploadFile(bigFile('abort-me.jpg', 'image/jpeg'), {
        signal: controller.signal,
        adapters: harness.adapters,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.encodeCalls).toHaveLength(1);
    expect(harness.bitmap.closed).toBe(1);
    expect(harness.canvases).toHaveLength(2);
    expectZeroed(harness.canvases);
  });

  it('does not return a passthrough upload after the signal aborts', async () => {
    const controller = new AbortController();
    const harness = createHarness({ onEncode: () => controller.abort() });

    await expect(
      prepareUploadFile(smallFile('late.jpg', 'image/jpeg'), {
        signal: controller.signal,
        adapters: {
          ...harness.adapters,
          decodeBitmap: async () => {
            controller.abort();
            return harness.bitmap as unknown as ImageBitmap;
          },
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.bitmap.closed).toBe(1);
    expectZeroed(harness.canvases);
  });
});

describe('formatUploadHttpError', () => {
  it('maps a bare or non-JSON 413 to the platform-neutral message', () => {
    const message =
      "Upload exceeded the server's request size limit. Try exporting a smaller copy.";
    expect(formatUploadHttpError(413, '')).toBe(message);
    expect(formatUploadHttpError(413, '   ')).toBe(message);
    expect(formatUploadHttpError(413, '<html><body>Request Entity Too Large</body></html>')).toBe(
      message,
    );
  });

  it('uses a 413 message from a JSON body when present', () => {
    expect(formatUploadHttpError(413, '{"error":"payload_too_large"}')).toBe('payload_too_large');
  });

  it('preserves JSON message and error fields', () => {
    expect(formatUploadHttpError(500, '{"message":"storage_write_failed"}')).toBe(
      'storage_write_failed',
    );
    expect(formatUploadHttpError(400, '{"error":"invalid_photo_id"}')).toBe('invalid_photo_id');
    expect(formatUploadHttpError(409, '{"error":"photo_id_conflict","message":"Conflict"}')).toBe(
      'Conflict',
    );
  });

  it('falls back to HTTP status for non-413 non-JSON responses', () => {
    expect(formatUploadHttpError(500, '')).toBe('HTTP 500');
    expect(formatUploadHttpError(502, 'Bad Gateway')).toBe('HTTP 502');
  });
});

describe('normalizeFilenameForMime', () => {
  it('normalizes JPEG and WebP extensions while preserving the base name', () => {
    expect(normalizeFilenameForMime('IMG_0001.JPG', 'image/jpeg')).toBe('IMG_0001.jpg');
    expect(normalizeFilenameForMime('IMG_0001.jpeg', 'image/jpeg')).toBe('IMG_0001.jpg');
    expect(normalizeFilenameForMime('transparent.png', 'image/webp')).toBe('transparent.webp');
    expect(normalizeFilenameForMime('no-extension', 'image/jpeg')).toBe('no-extension.jpg');
  });

  it('leaves other MIME types untouched', () => {
    expect(normalizeFilenameForMime('keep.png', 'image/png')).toBe('keep.png');
  });
});

describe('ensurePrepared', () => {
  it('prepares once and returns the same cached reference on later calls', async () => {
    const file = smallFile('photo.jpg', 'image/jpeg');
    const prepared: PreparedUpload = {
      blob: file,
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      thumbHash: 'hash',
      dominantColor: '#000000',
      compressed: false,
    };
    const draft: { prepared: PreparedUpload | null; file: File } = { prepared: null, file };
    const prepare = vi.fn(async () => prepared);
    const store = vi.fn((next: PreparedUpload) => {
      draft.prepared = next;
    });

    const first = await ensurePrepared(draft, prepare, store);
    const second = await ensurePrepared(draft, prepare, store);

    expect(first).toBe(prepared);
    expect(second).toBe(prepared);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledTimes(1);
  });
});

describe('isRetryableUploadError', () => {
  it('retries only transient failures', () => {
    expect(isRetryableUploadError(new Error('network_error'))).toBe(true);
    expect(isRetryableUploadError(new Error('timeout'))).toBe(true);
    for (const status of [500, 502, 503]) {
      expect(isRetryableUploadError(new UploadHttpError(status, 'boom'))).toBe(true);
    }
  });

  it('never retries deterministic client rejections', () => {
    for (const status of [400, 409, 413, 415]) {
      expect(isRetryableUploadError(new UploadHttpError(status, 'rejected'))).toBe(false);
    }
    expect(isRetryableUploadError(new Error('HTTP 500'))).toBe(false);
    expect(isRetryableUploadError(new UploadPreparationError('nope'))).toBe(false);
    expect(isRetryableUploadError('network_error')).toBe(false);
    expect(isRetryableUploadError(null)).toBe(false);
  });
});
