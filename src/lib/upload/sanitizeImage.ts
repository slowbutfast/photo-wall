/**
 * Lossless, byte-level image sanitization.
 *
 * Pixels are never decoded or re-encoded: only metadata segments/chunks are
 * removed. JPEGs keep a rebuilt Orientation-only EXIF block plus their ICC
 * profile and are truncated at the first real EOI; PNG/WebP keep ICC data while
 * Exif/XMP payloads are dropped. AVIF is rejected (415) until a full HEIF/AVIF
 * item-graph rewriter exists. Authoritative dimensions are read from the
 * headers and swapped for EXIF orientations 5–8.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_PIXEL_DIMENSION = 25_000;

export type SupportedContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
export type SupportedExtension = 'jpg' | 'png' | 'webp' | 'avif';

export type ImageValidationStatus = 413 | 415 | 422;

export class ImageValidationError extends Error {
  readonly status: ImageValidationStatus;

  constructor(status: ImageValidationStatus, message: string) {
    super(message);
    this.name = 'ImageValidationError';
    this.status = status;
  }
}

export interface SanitizedImage {
  bytes: Uint8Array;
  contentType: SupportedContentType;
  extension: SupportedExtension;
  width: number;
  height: number;
  aspectRatio: number;
}

// ---------------------------------------------------------------------------
// Small byte helpers
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

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    (bytes[offset + 1] << 8) +
    (bytes[offset + 2] << 16) +
    ((bytes[offset + 3] << 24) >>> 0)
  );
}

function writeUint16BE(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function writeUint32LE(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function writeUint16LE(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return Buffer.from(bytes.subarray(offset, offset + length)).toString('latin1');
}

function aspectRatioOf(width: number, height: number): number {
  return Math.round((width / height) * 1e6) / 1e6;
}

function assertPixelBudget(width: number, height: number): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_PIXEL_DIMENSION ||
    height > MAX_PIXEL_DIMENSION
  ) {
    throw new ImageValidationError(
      422,
      `Image dimensions ${width}x${height} exceed the supported pixel limits`,
    );
  }
}

function assertSupportedImage(): never {
  throw new ImageValidationError(
    415,
    'Unsupported media type: only JPEG, PNG and WebP images are accepted',
  );
}

function orientationSwaps(width: number, height: number, orientation: number | null): [number, number] {
  if (orientation !== null && orientation >= 5 && orientation <= 8) {
    return [height, width];
  }
  return [width, height];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function sanitizeImage(input: Uint8Array): SanitizedImage {
  const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);

  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new ImageValidationError(
      413,
      `Image exceeds the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB upload limit`,
    );
  }
  if (bytes.length < 12) assertSupportedImage();

  if (bytes[0] === 0xff && bytes[1] === 0xd8) return sanitizeJpeg(bytes);
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return sanitizePng(bytes);
  }
  if (asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 4) === 'WEBP') {
    return sanitizeWebp(bytes);
  }
  if (asciiAt(bytes, 4, 4) === 'ftyp') return sanitizeAvif(bytes);

  return assertSupportedImage();
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

interface JpegSegment {
  marker: number;
  bytes: Uint8Array;
}

function parseExifOrientation(payload: Uint8Array): number | null {
  if (payload.length < 14 || asciiAt(payload, 0, 6) !== 'Exif\u0000\u0000') return null;

  const tiff = payload.subarray(6);
  const littleEndian = tiff[0] === 0x49 && tiff[1] === 0x49;
  const bigEndian = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!littleEndian && !bigEndian) return null;

  const read16 = (offset: number): number =>
    littleEndian ? readUint16LE(tiff, offset) : readUint16BE(tiff, offset);
  const read32 = (offset: number): number =>
    littleEndian ? readUint32LE(tiff, offset) : readUint32BE(tiff, offset);

  if (read16(2) !== 42) return null;
  const ifdOffset = read32(4);
  if (ifdOffset + 2 > tiff.length) return null;

  const entryCount = read16(ifdOffset);
  const entriesStart = ifdOffset + 2;
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = entriesStart + index * 12;
    if (entryOffset + 12 > tiff.length) break;
    if (read16(entryOffset) !== 0x0112) continue;
    const value = read16(entryOffset + 8);
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

/** Rebuilds a minimal `APP1`/EXIF block containing only the Orientation tag. */
function buildOrientationExifSegment(orientation: number): Uint8Array {
  const payload = concat([
    new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]), // little-endian TIFF header
    writeUint16LE(1), // IFD entry count
    writeUint16LE(0x0112), // Orientation
    writeUint16LE(3), // SHORT
    writeUint32LE(1), // count
    writeUint16LE(orientation),
    writeUint16LE(0), // value padding
    writeUint32LE(0), // next IFD
  ]);
  const exifHeader = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
  const body = concat([exifHeader, payload]);
  return concat([new Uint8Array([0xff, 0xe1]), writeUint16BE(body.length + 2), body]);
}

const ICC_PROFILE_SIGNATURE = 'ICC_PROFILE\u0000';

function isIccProfilePayload(payload: Uint8Array): boolean {
  return (
    payload.length >= ICC_PROFILE_SIGNATURE.length &&
    asciiAt(payload, 0, ICC_PROFILE_SIGNATURE.length) === ICC_PROFILE_SIGNATURE
  );
}

/**
 * Strict JPEG allowlist: only structural/frame segments and color data survive.
 * APP0 (JFIF), ICC-only APP2, APP14 (Adobe), DQT, DHT, DRI, SOS and SOFn are
 * kept. Every other APPn (including APP11 JUMBF/C2PA), APP1, APP13 and COM is
 * dropped; a rebuilt Orientation-only APP1 is re-inserted afterwards.
 */
function isAllowedJpegSegment(marker: number, payload: Uint8Array): boolean {
  if (marker === 0xe0) return true; // APP0 / JFIF
  if (marker === 0xe2) return isIccProfilePayload(payload); // APP2 / ICC only
  if (marker === 0xee) return true; // APP14 / Adobe
  if (marker === 0xdb || marker === 0xc4 || marker === 0xdd || marker === 0xda) {
    return true; // DQT, DHT, DRI, SOS
  }
  // SOFn frame headers (excluding DHT/DAC/JPG markers in the same range).
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * Walks entropy-coded scan data and returns the offset of the `FF xx` marker
 * that terminates it, skipping `FF 00` stuffed bytes, `FF D0`–`FF D7` restart
 * markers and `FF` fill bytes. Returns null when the stream runs out (no EOI).
 */
function findScanEnd(bytes: Uint8Array, start: number): number | null {
  let offset = start;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    if (offset + 1 >= bytes.length) return null;
    const next = bytes[offset + 1];
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (next === 0xff) {
      offset += 1;
      continue;
    }
    return offset;
  }
  return null;
}

function sanitizeJpeg(bytes: Uint8Array): SanitizedImage {
  const kept: JpegSegment[] = [];
  let orientation: number | null = null;
  let width = 0;
  let height = 0;
  let sawScan = false;
  let sawEoi = false;

  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      throw new ImageValidationError(415, 'Malformed JPEG segment structure');
    }

    // Skip marker fill bytes.
    let markerOffset = offset;
    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) markerOffset += 1;
    if (markerOffset >= bytes.length) break;

    const marker = bytes[markerOffset];
    const markerStart = markerOffset - 1;
    offset = markerOffset + 1;

    if (marker === 0xd9) {
      sawEoi = true;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // TEM / stray RST
    if (marker === 0xd8) continue; // unexpected SOI

    if (offset + 2 > bytes.length) {
      throw new ImageValidationError(415, 'Truncated JPEG segment');
    }
    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      throw new ImageValidationError(415, 'Invalid JPEG segment length');
    }

    const segmentBytes = bytes.subarray(markerStart, offset + segmentLength);
    const payload = bytes.subarray(offset + 2, offset + segmentLength);
    offset += segmentLength;

    // Parse then drop EXIF/XMP APP1; the strict allowlist below drops every
    // other APPn/COM/unknown segment (including APP11 JUMBF/C2PA and MPF).
    if (marker === 0xe1) {
      const parsed = parseExifOrientation(payload);
      if (parsed !== null) orientation = parsed;
      continue;
    }
    if (!isAllowedJpegSegment(marker, payload)) continue;

    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc &&
      payload.length >= 5
    ) {
      height = readUint16BE(payload, 1);
      width = readUint16BE(payload, 3);
    }

    kept.push({ marker, bytes: segmentBytes });

    if (marker === 0xda) {
      // Keep the SOS header, then copy only entropy-coded data up to the next
      // real marker so multi-scan/progressive JPEGs continue parsing.
      const scanEnd = findScanEnd(bytes, offset);
      if (scanEnd === null) {
        throw new ImageValidationError(415, 'JPEG scan is missing an end-of-image marker');
      }
      sawScan = true;
      kept.push({ marker: -1, bytes: bytes.subarray(offset, scanEnd) });
      offset = scanEnd;
    }
  }

  if (!sawScan || !sawEoi || width === 0 || height === 0) {
    throw new ImageValidationError(415, 'JPEG is missing frame dimensions or an EOI marker');
  }

  const rebuilt: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  let insertedExif = false;
  for (const segment of kept) {
    rebuilt.push(segment.bytes);
    // Keep JFIF first, then the Orientation-only EXIF block.
    if (!insertedExif && segment.marker === 0xe0) {
      rebuilt.push(buildOrientationExifSegment(orientation ?? 1));
      insertedExif = true;
    }
  }
  if (!insertedExif) {
    rebuilt.splice(1, 0, buildOrientationExifSegment(orientation ?? 1));
  }
  // Truncate at the first real EOI: appended JPEG/MP4/GPS tails never survive.
  rebuilt.push(new Uint8Array([0xff, 0xd9]));

  const [authoritativeWidth, authoritativeHeight] = orientationSwaps(
    width,
    height,
    orientation,
  );
  assertPixelBudget(authoritativeWidth, authoritativeHeight);

  return {
    bytes: concat(rebuilt),
    contentType: 'image/jpeg',
    extension: 'jpg',
    width: authoritativeWidth,
    height: authoritativeHeight,
    aspectRatio: aspectRatioOf(authoritativeWidth, authoritativeHeight),
  };
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_ALLOWED_CHUNKS = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'iCCP',
  'sRGB',
  'gAMA',
  'cHRM',
  'pHYs',
  'tRNS',
  'cICP',
]);

function sanitizePng(bytes: Uint8Array): SanitizedImage {
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let width = 0;
  let height = 0;

  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = asciiAt(bytes, offset + 4, 4);
    const end = offset + 12 + length;

    if (length > bytes.length || end > bytes.length) {
      throw new ImageValidationError(415, 'Invalid PNG chunk length');
    }

    if (type === 'IHDR' && length >= 8) {
      width = readUint32BE(bytes, offset + 8);
      height = readUint32BE(bytes, offset + 12);
    }

    if (PNG_ALLOWED_CHUNKS.has(type)) {
      kept.push(bytes.subarray(offset, end));
    }

    offset = end;
    if (type === 'IEND') break;
  }

  if (width === 0 || height === 0) {
    throw new ImageValidationError(415, 'PNG is missing IHDR dimensions');
  }
  assertPixelBudget(width, height);

  return {
    bytes: concat(kept),
    contentType: 'image/png',
    extension: 'png',
    width,
    height,
    aspectRatio: aspectRatioOf(width, height),
  };
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

const WEBP_ALLOWED_CHUNKS = new Set([
  'VP8 ',
  'VP8L',
  'VP8X',
  'ALPH',
  'ANIM',
  'ANMF',
  'ICCP',
]);

/** VP8X feature flags carried in the first payload byte. */
const WEBP_VP8X_EXIF_FLAG = 0x08;
const WEBP_VP8X_XMP_FLAG = 0x04;

function webpDimensions(chunkType: string, payload: Uint8Array): [number, number] | null {
  if (chunkType === 'VP8X' && payload.length >= 10) {
    const width = 1 + (payload[4] | (payload[5] << 8) | (payload[6] << 16));
    const height = 1 + (payload[7] | (payload[8] << 8) | (payload[9] << 16));
    return [width, height];
  }
  if (chunkType === 'VP8L' && payload.length >= 5 && payload[0] === 0x2f) {
    const width = 1 + (((payload[2] & 0x3f) << 8) | payload[1]);
    const height =
      1 + (((payload[4] & 0x0f) << 10) | (payload[3] << 2) | ((payload[2] & 0xc0) >> 6));
    return [width, height];
  }
  if (
    chunkType === 'VP8 ' &&
    payload.length >= 10 &&
    payload[3] === 0x9d &&
    payload[4] === 0x01 &&
    payload[5] === 0x2a
  ) {
    const width = readUint16LE(payload, 6) & 0x3fff;
    const height = readUint16LE(payload, 8) & 0x3fff;
    return [width, height];
  }
  return null;
}

function sanitizeWebp(bytes: Uint8Array): SanitizedImage {
  const chunks: Uint8Array[] = [];
  let dimensions: [number, number] | null = null;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourCc = asciiAt(bytes, offset, 4);
    const size = readUint32LE(bytes, offset + 4);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + size;
    if (payloadEnd > bytes.length) {
      throw new ImageValidationError(415, 'Invalid WebP chunk length');
    }
    const chunkEnd = payloadEnd + (size % 2);

    if (WEBP_ALLOWED_CHUNKS.has(fourCc)) {
      let stored = bytes.subarray(offset, Math.min(chunkEnd, bytes.length));
      if (fourCc === 'VP8X' && size >= 1) {
        // Clear the EXIF/XMP feature bits while preserving ICC/alpha/animation
        // bits and the canvas dimensions.
        const rewritten = new Uint8Array(stored);
        rewritten[8] &= ~(WEBP_VP8X_EXIF_FLAG | WEBP_VP8X_XMP_FLAG);
        stored = rewritten;
      }
      chunks.push(stored);
      if (!dimensions) {
        dimensions = webpDimensions(fourCc, bytes.subarray(payloadStart, payloadEnd));
      }
    }

    offset = chunkEnd;
  }

  if (!dimensions) {
    throw new ImageValidationError(415, 'WebP is missing frame dimensions');
  }
  const [width, height] = dimensions;
  assertPixelBudget(width, height);

  const body = concat(chunks);
  const out = concat([
    new Uint8Array([0x52, 0x49, 0x46, 0x46]), // "RIFF"
    writeUint32LE(body.length + 4),
    new Uint8Array([0x57, 0x45, 0x42, 0x50]), // "WEBP"
    body,
  ]);

  return {
    bytes: out,
    contentType: 'image/webp',
    extension: 'webp',
    width,
    height,
    aspectRatio: aspectRatioOf(width, height),
  };
}

// ---------------------------------------------------------------------------
// AVIF / HEIF (ISO BMFF)
// ---------------------------------------------------------------------------

const AVIF_BRANDS = new Set(['avif', 'avis']);

function hasAvifBrand(bytes: Uint8Array): boolean {
  const boxSize = readUint32BE(bytes, 0);
  if (boxSize < 16 || boxSize > bytes.length) return false;
  if (AVIF_BRANDS.has(asciiAt(bytes, 8, 4))) return true;
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    if (AVIF_BRANDS.has(asciiAt(bytes, offset, 4))) return true;
  }
  return false;
}

/**
 * AVIF/HEIF metadata lives in the item-property graph (`iinf`/`infe` + `iloc` +
 * `mdat`), which cannot be rewritten by dropping top-level boxes without
 * corrupting the item offsets. Reject AVIF until a full item-graph rewriter
 * exists rather than storing un-sanitized metadata.
 */
function sanitizeAvif(bytes: Uint8Array): never {
  if (hasAvifBrand(bytes)) {
    throw new ImageValidationError(
      415,
      'AVIF uploads are not supported: lossless metadata removal requires a full HEIF/AVIF item-graph rewriter',
    );
  }
  return assertSupportedImage();
}

// re-exported for route handlers that map validation failures to responses
export function isImageValidationError(error: unknown): error is ImageValidationError {
  return error instanceof ImageValidationError;
}
