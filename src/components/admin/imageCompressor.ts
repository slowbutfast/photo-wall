/**
 * Deterministic client-side upload preparation for the Curator Drawer.
 *
 * Vercel Serverless Functions reject request bodies over `4.5 MB` with a bare
 * `413` before the upload route runs, and the wall only ever serves up to
 * `2048 px` on the long edge (`LOD_BUCKETS`). This module keeps the multipart
 * payload under `CLIENT_MAX_UPLOAD_BYTES` (`4.0 MiB`):
 *
 * - Files at or below the cap pass through byte-identically (ThumbHash and
 *   dominant colour are still computed from one decoded bitmap when possible).
 * - Oversized files are decoded once with `imageOrientation: 'from-image'`,
 *   inspected via binary headers for alpha, then re-encoded down a fixed
 *   `(maxEdge, quality)` ladder as JPEG (opaque) or WebP (alpha-bearing).
 *
 * Every browser API is behind an injectable adapter so the branches run
 * deterministically in Node/Vitest without DOM globals. Default adapters
 * resolve `document` / `createImageBitmap` lazily and only throw when a code
 * path actually needs them.
 */

import { rgbaToThumbHash } from 'thumbhash';

/** Target ceiling for the encoded file payload inside `FormData` (4.0 MiB). */
export const CLIENT_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Deterministic long-edge/quality ladder, tried in order. */
export const COMPRESSION_LADDER = [
  { maxEdge: 4096, quality: 0.9 },
  { maxEdge: 4096, quality: 0.85 },
  { maxEdge: 4096, quality: 0.8 },
  { maxEdge: 3072, quality: 0.85 },
  { maxEdge: 3072, quality: 0.8 },
] as const;

/** Header bytes needed to read PNG chunk tables and WebP chunk flags. */
const HEADER_BYTE_COUNT = 64 * 1024;

const SIZE_LIMIT_MESSAGE =
  "Upload exceeded the server's request size limit. Try exporting a smaller copy.";

const WEBP_FALLBACK_MESSAGE =
  'Transparent image could not be compressed under 4 MB in this browser. Try Chrome or export a smaller PNG.';

/** Raised when a file cannot be prepared for upload (decode, encode, alpha). */
export class UploadPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadPreparationError';
  }
}

/** Upload rejection carrying the HTTP status so retries stay transient-only. */
export class UploadHttpError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = 'UploadHttpError';
    this.status = status;
  }
}

/** Immutable payload cached on a `DraftFile` and reused verbatim on retries. */
export interface PreparedUpload {
  blob: Blob;
  filename: string;
  contentType: string;
  thumbHash: string | null;
  dominantColor: string | null;
  compressed: boolean;
}

/** Minimal `<canvas>` surface needed for ThumbHash extraction and encoding. */
export interface CompressorCanvas {
  width: number;
  height: number;
  getContext(
    id: '2d',
    options?: CanvasRenderingContext2DSettings,
  ): CanvasRenderingContext2D | null;
}

/** Browser seams; tests inject fakes, production uses the defaults below. */
export interface CompressorAdapters {
  decodeBitmap(file: Blob, options?: ImageBitmapOptions): Promise<ImageBitmap>;
  createCanvas(width: number, height: number): CompressorCanvas;
  encodeCanvas(canvas: CompressorCanvas, type: string, quality?: number): Promise<Blob | null>;
  readHeaderBytes(file: Blob, byteCount: number): Promise<Uint8Array>;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function matchesAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function isWebp(bytes: Uint8Array): boolean {
  return matchesAscii(bytes, 0, 'RIFF') && matchesAscii(bytes, 8, 'WEBP');
}

/**
 * Detect whether a PNG/WebP header declares an alpha channel without touching
 * a single pixel:
 *
 * - PNG: `IHDR` colour type `4`/`6`, or a `tRNS` chunk before `IDAT`.
 * - WebP: `VP8X` alpha flag (`0x10`) or `VP8L` packed alpha bit (bit 28).
 * - JPEG / anything else: `false`.
 *
 * Malformed or truncated input returns `false`; this never throws.
 */
export function hasAlphaChannel(bytes: Uint8Array): boolean {
  if (isPng(bytes)) {
    if (bytes.length >= 26) {
      const colourType = bytes[25];
      if (colourType === 4 || colourType === 6) return true;
    }
    // Walk PNG chunks until the pixel data starts.
    let offset = 8;
    while (offset + 8 <= bytes.length) {
      const length = readUint32BE(bytes, offset);
      const typeOffset = offset + 4;
      if (matchesAscii(bytes, typeOffset, 'tRNS')) return true;
      if (matchesAscii(bytes, typeOffset, 'IDAT')) return false;
      const next = offset + 12 + length;
      if (next <= offset || next > bytes.length) return false;
      offset = next;
    }
    return false;
  }

  if (isWebp(bytes)) {
    if (matchesAscii(bytes, 12, 'VP8X')) {
      return bytes.length >= 21 && (bytes[20] & 0x10) !== 0;
    }
    if (matchesAscii(bytes, 12, 'VP8L')) {
      // Byte 20 is the VP8L signature (0x2f); the packed bitfield starts at 21.
      return bytes.length >= 25 && ((readUint32LE(bytes, 21) >>> 28) & 1) === 1;
    }
    return false;
  }

  return false;
}

/** `photo.JPEG` + `image/jpeg` → `photo.jpg`; other MIME types pass through. */
export function normalizeFilenameForMime(name: string, mime: string): string {
  const extension = mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : null;
  if (!extension) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}${extension}`;
}

/**
 * Map an upload HTTP failure to a user-facing message. JSON `{ message }` or
 * `{ error }` bodies win; a bare/non-JSON `413` becomes an actionable,
 * platform-neutral size-limit hint instead of `HTTP 413`.
 */
export function formatUploadHttpError(status: number, responseText: string): string {
  const text = responseText?.trim() ?? '';
  if (text) {
    try {
      const payload = JSON.parse(text) as { message?: unknown; error?: unknown };
      if (payload && typeof payload === 'object') {
        for (const key of ['message', 'error'] as const) {
          const value = payload[key];
          if (typeof value === 'string' && value.trim().length > 0) return value;
        }
      }
    } catch {
      // Not JSON: fall through to the status mapping.
    }
  }
  if (status === 413) return SIZE_LIMIT_MESSAGE;
  return `HTTP ${status}`;
}

/**
 * Only transient failures are worth re-sending (a 4 MB body is expensive):
 * `network_error`, `timeout`, and HTTP `5xx`. Deterministic `4xx` rejections
 * stop the retry loop immediately.
 */
export function isRetryableUploadError(error: unknown): boolean {
  if (error instanceof UploadHttpError) return error.status >= 500 && error.status <= 599;
  if (error instanceof Error) return error.message === 'network_error' || error.message === 'timeout';
  return false;
}

/**
 * Prepare-once seam: return the cached payload when present, otherwise prepare
 * and store it. Retries and manual "Retry failed" clicks reuse the exact blob,
 * so `(photoId, sha256(rawBytes))` stays identical and never 409s.
 */
export async function ensurePrepared(
  draft: { prepared: PreparedUpload | null; file: File },
  prepare: (file: File) => Promise<PreparedUpload>,
  store: (prepared: PreparedUpload) => void,
): Promise<PreparedUpload> {
  if (draft.prepared) return draft.prepared;
  const prepared = await prepare(draft.file);
  store(prepared);
  return prepared;
}

/**
 * Compute a `32px` ThumbHash and dominant colour from an already-decoded
 * bitmap on a short-lived scratch canvas. Any failure is the caller's to
 * convert into `null` metadata—never into a failed upload.
 */
async function computeMetadata(
  bitmap: ImageBitmap,
  allocateCanvas: (width: number, height: number) => CompressorCanvas,
): Promise<{ thumbHash: string | null; dominantColor: string | null }> {
  const scale = Math.min(32 / bitmap.width, 32 / bitmap.height, 1);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = allocateCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) return { thumbHash: null, dominantColor: null };
  context.drawImage(bitmap, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += 16) {
    if (data[index + 3] === 0) continue;
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    count += 1;
  }
  const dominantColor =
    count === 0
      ? null
      : `#${[r / count, g / count, b / count]
          .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
          .join('')}`;

  const thumbHash = encodeBase64(rgbaToThumbHash(width, height, data));
  return { thumbHash, dominantColor };
}

/** Long-edge-capped output dimensions; never upscales. */
function scaleToFit(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Best-effort Display-P3 context with a silent sRGB fallback. P3 ICC retention
 * in `toBlob` is a measured browser capability, not a guarantee.
 */
function acquire2dContext(canvas: CompressorCanvas): CanvasRenderingContext2D | null {
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d', { colorSpace: 'display-p3' });
  } catch {
    context = null;
  }
  if (!context) context = canvas.getContext('2d');
  return context;
}

const DEFAULT_ADAPTERS: CompressorAdapters = {
  decodeBitmap: async (file, decodeOptions) => {
    if (typeof createImageBitmap !== 'function') {
      throw new Error('createImageBitmap_unavailable');
    }
    return createImageBitmap(file, decodeOptions);
  },
  createCanvas: (width, height) => {
    if (typeof document === 'undefined') throw new Error('canvas_unavailable');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
  encodeCanvas: (canvas, type, quality) => {
    const element = canvas as unknown as HTMLCanvasElement;
    if (typeof element.toBlob !== 'function') throw new Error('canvas_to_blob_unavailable');
    return new Promise<Blob | null>((resolve) => {
      element.toBlob((blob) => resolve(blob), type, quality);
    });
  },
  readHeaderBytes: async (file, byteCount) => {
    const buffer = await file.slice(0, byteCount).arrayBuffer();
    return new Uint8Array(buffer);
  },
};

/**
 * Prepare one accepted image for upload.
 *
 * `<= CLIENT_MAX_UPLOAD_BYTES` returns the original `File` (byte-identical)
 * with best-effort metadata. Larger files decode once, pick JPEG or WebP from
 * the binary header alpha flag, and step the ladder until the blob fits.
 *
 * Always closes the decoded bitmap and zeroes every canvas in `finally`,
 * including on abort and ladder exhaustion.
 */
export async function prepareUploadFile(
  file: File,
  options: { signal?: AbortSignal; adapters?: Partial<CompressorAdapters> } = {},
): Promise<PreparedUpload> {
  const { signal } = options;
  const adapters: CompressorAdapters = { ...DEFAULT_ADAPTERS, ...options.adapters };
  const canvases: CompressorCanvas[] = [];
  let bitmap: ImageBitmap | null = null;

  const allocateCanvas = (width: number, height: number): CompressorCanvas => {
    const canvas = adapters.createCanvas(width, height);
    canvases.push(canvas);
    return canvas;
  };

  throwIfAborted(signal);

  try {
    if (file.size <= CLIENT_MAX_UPLOAD_BYTES) {
      let thumbHash: string | null = null;
      let dominantColor: string | null = null;
      try {
        const decoded = await adapters.decodeBitmap(file, { imageOrientation: 'from-image' });
        bitmap = decoded;
        const metadata = await computeMetadata(decoded, allocateCanvas);
        thumbHash = metadata.thumbHash;
        dominantColor = metadata.dominantColor;
      } catch {
        // Decoding is a nicety for small files; never fail the upload over it.
        thumbHash = null;
        dominantColor = null;
      }
      throwIfAborted(signal);
      return {
        blob: file,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        thumbHash,
        dominantColor,
        compressed: false,
      };
    }

    const alpha = hasAlphaChannel(await adapters.readHeaderBytes(file, HEADER_BYTE_COUNT));
    throwIfAborted(signal);

    let decoded: ImageBitmap;
    try {
      decoded = await adapters.decodeBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      throw new UploadPreparationError(
        `Could not decode ${file.name} in this browser. Try a smaller export.`,
      );
    }
    bitmap = decoded;
    throwIfAborted(signal);

    let thumbHash: string | null = null;
    let dominantColor: string | null = null;
    try {
      const metadata = await computeMetadata(decoded, allocateCanvas);
      thumbHash = metadata.thumbHash;
      dominantColor = metadata.dominantColor;
    } catch {
      thumbHash = null;
      dominantColor = null;
    }
    throwIfAborted(signal);

    const targetType = alpha ? 'image/webp' : 'image/jpeg';
    let surface: { canvas: CompressorCanvas; maxEdge: number } | null = null;

    for (const step of COMPRESSION_LADDER) {
      throwIfAborted(signal);

      if (!surface || surface.maxEdge !== step.maxEdge) {
        const size = scaleToFit(decoded.width, decoded.height, step.maxEdge);
        let canvas: CompressorCanvas;
        try {
          canvas = allocateCanvas(size.width, size.height);
        } catch {
          throw new UploadPreparationError(
            `Could not allocate a canvas to compress ${file.name}.`,
          );
        }
        const context = acquire2dContext(canvas);
        if (!context) {
          throw new UploadPreparationError(
            `Could not create a drawing context to compress ${file.name}.`,
          );
        }
        context.drawImage(decoded, 0, 0, size.width, size.height);
        surface = { canvas, maxEdge: step.maxEdge };
      }

      const blob = await adapters.encodeCanvas(surface.canvas, targetType, step.quality);
      if (!blob) {
        throw new UploadPreparationError(
          `This browser could not encode ${file.name} as ${targetType}.`,
        );
      }
      if (targetType === 'image/webp' && blob.type !== 'image/webp') {
        // Safari falls back to PNG; flattening to JPEG would lose transparency.
        throw new UploadPreparationError(WEBP_FALLBACK_MESSAGE);
      }
      if (blob.size <= CLIENT_MAX_UPLOAD_BYTES) {
        throwIfAborted(signal);
        return {
          blob,
          filename: normalizeFilenameForMime(file.name, targetType),
          contentType: targetType,
          thumbHash,
          dominantColor,
          compressed: true,
        };
      }
    }

    throw new UploadPreparationError(
      alpha
        ? 'Transparent image is still larger than 4 MB after compression. Try exporting a smaller copy.'
        : 'Image is still larger than 4 MB after compression. Try exporting a smaller copy.',
    );
  } finally {
    if (bitmap) {
      try {
        bitmap.close();
      } catch {
        // Teardown is best-effort.
      }
      bitmap = null;
    }
    for (const canvas of canvases) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
