/**
 * Capture-time ordering for new album uploads.
 *
 * Reads the camera's capture time from an original file's EXIF — JPEG `APP1`,
 * PNG `eXIf` or WebP `EXIF` — and sorts a dropped folder oldest-first before
 * the album cap and draft are built. The walk follows the same hand-written
 * TIFF IFD approach as `sanitizeImage.ts`'s Orientation reader, but it lives on
 * the client so it can run before `prepareUploadFile` strips the metadata.
 *
 * Everything here is pure and injected: ordering takes a `readBytes` callback,
 * so it runs in the Node test environment over byte fixtures. Malformed EXIF
 * never throws; it only makes a photo undated.
 */

/** ASCII `Exif\0\0` marker that starts a JPEG APP1 payload or a WebP EXIF chunk. */
const EXIF_PREFIX = 'Exif\u0000\u0000';

/** Head bytes requested for JPEG and PNG; APP1/eXIf metadata sits near the front. */
const MAX_HEAD_BYTES = 256 * 1024;

/** Magic-byte read used to choose between a head read and a full read. */
const MAGIC_BYTES = 12;

/** `YYYY:MM:DD HH:MM:SS`, the Exif ASCII timestamp shape. */
const DATE_PATTERN = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/** The all-zero placeholder some writers emit instead of omitting the tag. */
const PLACEHOLDER_KEY = '00000000000000';

export interface CaptureTime {
  /**
   * `YYYYMMDDHHMMSS`. Fixed width, so plain string comparison is chronological
   * order and the value travels safely through `sortOrder`.
   */
  key: string;
  /** `SubSecTimeOriginal` read as a decimal fraction (`"20"` → `0.2`). */
  subSec: number;
}

// ---------------------------------------------------------------------------
// Small byte helpers
// ---------------------------------------------------------------------------

function asciiAt(bytes: Uint8Array, offset: number, length: number): string | null {
  if (offset < 0 || offset + length > bytes.length) return null;
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(bytes[offset + index]);
  }
  return text;
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

interface TiffEntry {
  tag: number;
  count: number;
  /** Where the 12-byte entry starts, so an inline ASCII value can be read. */
  entryOffset: number;
  /** The entry's 4-byte value field, an offset for values longer than 4 bytes. */
  value: number;
}

interface TiffReader {
  bytes: Uint8Array;
  readUint16(offset: number): number;
  readUint32(offset: number): number;
}

function makeTiffReader(tiff: Uint8Array): TiffReader | null {
  const littleEndian = tiff[0] === 0x49 && tiff[1] === 0x49;
  const bigEndian = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!littleEndian && !bigEndian) return null;

  const readUint16 = littleEndian
    ? (offset: number) => readUint16LE(tiff, offset)
    : (offset: number) => readUint16BE(tiff, offset);
  const readUint32 = littleEndian
    ? (offset: number) => readUint32LE(tiff, offset)
    : (offset: number) => readUint32BE(tiff, offset);

  return { bytes: tiff, readUint16, readUint32 };
}

/** Reads an IFD's entries, or `null` when the offset or an entry runs past the end. */
function readIfd(reader: TiffReader, offset: number): TiffEntry[] | null {
  const { bytes, readUint16, readUint32 } = reader;
  if (offset < 0 || offset + 2 > bytes.length) return null;

  const count = readUint16(offset);
  const entriesStart = offset + 2;
  if (entriesStart + count * 12 > bytes.length) return null;

  const entries: TiffEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const entryOffset = entriesStart + index * 12;
    entries.push({
      tag: readUint16(entryOffset),
      count: readUint32(entryOffset + 4),
      entryOffset,
      value: readUint32(entryOffset + 8),
    });
  }
  return entries;
}

function findEntry(entries: TiffEntry[], tag: number): TiffEntry | null {
  return entries.find((entry) => entry.tag === tag) ?? null;
}

/** Reads an ASCII tag, inline when it fits in 4 bytes and by offset otherwise. */
function readAsciiTag(reader: TiffReader, entries: TiffEntry[], tag: number): string | null {
  const entry = findEntry(entries, tag);
  if (!entry || entry.count <= 0) return null;

  const start = entry.count > 4 ? entry.value : entry.entryOffset + 8;
  if (start < 0 || start + entry.count > reader.bytes.length) return null;

  let text = '';
  for (let index = 0; index < entry.count; index += 1) {
    const byte = reader.bytes[start + index];
    if (byte === 0) break;
    text += String.fromCharCode(byte);
  }
  return text;
}

function parseCaptureDate(value: string | null): string | null {
  if (!value) return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;

  const key = `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}${match[6]}`;
  return key === PLACEHOLDER_KEY ? null : key;
}

function parseSubSeconds(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 0;
  return Number(`0.${value}`);
}

/**
 * Reads capture time from a TIFF block: IFD0 `DateTime` (`0x0132`) and the
 * Exif IFD's `DateTimeOriginal` (`0x9003`), `DateTimeDigitized` (`0x9004`) and
 * `SubSecTimeOriginal` (`0x9291`).
 */
function readTiffCaptureTime(tiff: Uint8Array): CaptureTime | null {
  const reader = makeTiffReader(tiff);
  if (!reader) return null;
  if (tiff.length < 8 || reader.readUint16(2) !== 42) return null;

  const ifd0 = readIfd(reader, reader.readUint32(4));
  if (!ifd0) return null;

  let exifEntries: TiffEntry[] = [];
  const exifPointer = findEntry(ifd0, 0x8769);
  if (exifPointer) {
    const exifIfd = readIfd(reader, exifPointer.value);
    if (!exifIfd) return null;
    exifEntries = exifIfd;
  }

  const candidates = [
    parseCaptureDate(readAsciiTag(reader, exifEntries, 0x9003)),
    parseCaptureDate(readAsciiTag(reader, exifEntries, 0x9004)),
    parseCaptureDate(readAsciiTag(reader, ifd0, 0x0132)),
  ];
  const key = candidates.find((candidate) => candidate !== null);
  if (!key) return null;

  return { key, subSec: parseSubSeconds(readAsciiTag(reader, exifEntries, 0x9291)) };
}

// ---------------------------------------------------------------------------
// Container walks
// ---------------------------------------------------------------------------

/** Walks JPEG segments to the first Exif APP1, stopping at SOS/EOI. */
function readJpegCaptureTime(bytes: Uint8Array): CaptureTime | null {
  let offset = 2;

  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;

    // Fill bytes: any number of 0xFF before a marker.
    let markerOffset = offset;
    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) markerOffset += 1;
    if (markerOffset >= bytes.length) return null;

    const marker = bytes[markerOffset];
    offset = markerOffset + 1;

    // Standalone markers carry no length.
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    // Image data starts at SOS, and EOI ends the file.
    if (marker === 0xda || marker === 0xd9) return null;

    if (offset + 2 > bytes.length) return null;
    const length = readUint16BE(bytes, offset);
    if (length < 2) return null;

    const payloadStart = offset + 2;
    const payloadLength = length - 2;
    if (payloadStart + payloadLength > bytes.length) return null;

    if (marker === 0xe1 && asciiAt(bytes, payloadStart, 6) === EXIF_PREFIX) {
      return readTiffCaptureTime(bytes.subarray(payloadStart + 6, payloadStart + payloadLength));
    }

    offset = payloadStart + payloadLength;
  }

  return null;
}

/** Walks PNG chunks to `eXIf`, stopping at `IDAT`/`IEND`. */
function readPngCaptureTime(bytes: Uint8Array): CaptureTime | null {
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = asciiAt(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    // The 4-byte CRC follows the data.
    if (dataEnd + 4 > bytes.length) return null;
    if (type === 'IDAT' || type === 'IEND') return null;
    if (type === 'eXIf') return readTiffCaptureTime(bytes.subarray(dataStart, dataEnd));

    offset = dataEnd + 4;
  }

  return null;
}

/** Walks RIFF chunks to `EXIF`; WebP writers put it after the image data. */
function readWebpCaptureTime(bytes: Uint8Array): CaptureTime | null {
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const fourcc = asciiAt(bytes, offset, 4);
    const size = readUint32LE(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > bytes.length) return null;

    if (fourcc === 'EXIF') {
      const hasPrefix = asciiAt(bytes, dataStart, 6) === EXIF_PREFIX;
      return readTiffCaptureTime(
        bytes.subarray(hasPrefix ? dataStart + 6 : dataStart, dataEnd),
      );
    }

    // RIFF chunks are padded to an even size.
    offset = dataEnd + (size % 2);
  }

  return null;
}

/**
 * Reads the capture time from a JPEG, PNG or WebP byte head. Returns `null` when
 * the timestamp is missing, malformed or the container is unsupported — never
 * throws.
 */
export function readCaptureTime(bytes: Uint8Array): CaptureTime | null {
  try {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      return readJpegCaptureTime(bytes);
    }
    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return readPngCaptureTime(bytes);
    }
    if (bytes.length >= 12 && asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 4) === 'WEBP') {
      return readWebpCaptureTime(bytes);
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Comparison and ordering
// ---------------------------------------------------------------------------

const NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Orders capture times: dated before undated, then `key`, then `subSec`.
 * Undated photos are equal here; `orderByCaptureTime` adds the filename and
 * input-index tie-breaks.
 */
export function compareCapture(a: CaptureTime | null, b: CaptureTime | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  if (a.subSec !== b.subSec) return a.subSec < b.subSec ? -1 : 1;
  return 0;
}

/**
 * Orders items by capture time, oldest first, reading each original file
 * through `readBytes`. Dated photos come before undated ones; ties fall back to
 * natural filename order, then the original index. A `readBytes` rejection
 * counts as undated. The input array is never mutated.
 */
export async function orderByCaptureTime<T extends { name: string }>(
  items: readonly T[],
  readBytes: (item: T) => Promise<Uint8Array>,
): Promise<T[]> {
  const entries: Array<{ item: T; index: number; capture: CaptureTime | null }> = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    let capture: CaptureTime | null = null;
    try {
      capture = readCaptureTime(await readBytes(item));
    } catch {
      // A file that disappeared mid-read is simply undated.
      capture = null;
    }
    entries.push({ item, index, capture });
  }

  entries.sort((left, right) => {
    const byCapture = compareCapture(left.capture, right.capture);
    if (byCapture !== 0) return byCapture;

    const byName = NAME_COLLATOR.compare(left.item.name, right.item.name);
    if (byName !== 0) return byName;

    return left.index - right.index;
  });

  return entries.map((entry) => entry.item);
}

// ---------------------------------------------------------------------------
// Browser adapter
// ---------------------------------------------------------------------------

function looksLikeWebp(head: Uint8Array): boolean {
  return head.length >= 12 && asciiAt(head, 0, 4) === 'RIFF' && asciiAt(head, 8, 4) === 'WEBP';
}

function looksLikeJpegOrPng(head: Uint8Array): boolean {
  if (head.length >= 2 && head[0] === 0xff && head[1] === 0xd8) return true;
  return (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  );
}

/**
 * Reads the bytes needed to find a file's capture time. JPEG and PNG only need
 * the head, because their metadata precedes the image data; WebP needs the
 * whole file because its `EXIF` chunk trails the bitstream.
 */
export async function readCaptureBytes(file: File): Promise<Uint8Array> {
  const head = new Uint8Array(await file.slice(0, MAGIC_BYTES).arrayBuffer());
  if (looksLikeWebp(head)) return new Uint8Array(await file.arrayBuffer());
  if (looksLikeJpegOrPng(head)) {
    return new Uint8Array(await file.slice(0, MAX_HEAD_BYTES).arrayBuffer());
  }
  return head;
}
