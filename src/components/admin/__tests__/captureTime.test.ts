import { describe, expect, it } from 'vitest';

import {
  compareCapture,
  orderByCaptureTime,
  readCaptureBytes,
  readCaptureTime,
  type CaptureTime,
} from '../captureTime';
import { splitAlbumCap } from '../folderReader';

// ---------------------------------------------------------------------------
// Byte fixtures
//
// Every fixture is built in-test from bytes: a TIFF block in either byte order,
// wrapped as a JPEG APP1, a PNG eXIf chunk or a WebP EXIF chunk. No binary
// fixture files are committed.
// ---------------------------------------------------------------------------

type Endian = 'II' | 'MM';

interface EntrySpec {
  tag: number;
  type?: number;
  value: string | number;
}

interface TiffOptions {
  endian?: Endian;
  ifd0?: EntrySpec[];
  exif?: EntrySpec[];
  magic?: number;
  ifd0Offset?: number;
  /** Overrides the Exif IFD pointer written into IFD0. */
  exifPointer?: number;
}

const SAMPLE_DATE = '2025:10:05 12:30:00';

function asciiBytes(text: string, nulTerminated = true): Uint8Array {
  const bytes = new Uint8Array(text.length + (nulTerminated ? 1 : 0));
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  return bytes;
}

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

function putUint16(out: Uint8Array, offset: number, value: number, endian: Endian): void {
  if (endian === 'II') {
    out[offset] = value & 0xff;
    out[offset + 1] = (value >>> 8) & 0xff;
    return;
  }
  out[offset] = (value >>> 8) & 0xff;
  out[offset + 1] = value & 0xff;
}

function putUint32(out: Uint8Array, offset: number, value: number, endian: Endian): void {
  if (endian === 'II') {
    out[offset] = value & 0xff;
    out[offset + 1] = (value >>> 8) & 0xff;
    out[offset + 2] = (value >>> 16) & 0xff;
    out[offset + 3] = (value >>> 24) & 0xff;
    return;
  }
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

function uint32Bytes(value: number, endian: Endian): Uint8Array {
  const bytes = new Uint8Array(4);
  putUint32(bytes, 0, value, endian);
  return bytes;
}

function putUint32BE(out: Uint8Array, offset: number, value: number): void {
  putUint32(out, offset, value, 'MM');
}

function putUint32LE(out: Uint8Array, offset: number, value: number): void {
  putUint32(out, offset, value, 'II');
}

interface ResolvedEntry {
  tag: number;
  type: number;
  count: number;
  inline?: Uint8Array;
  offset?: number;
}

/**
 * Builds a minimal TIFF stream: an IFD0 with optional `0x0132`, an Exif IFD
 * (`0x8769` pointer) carrying `0x9003` / `0x9004` / `0x9291`, and inline or
 * offset ASCII storage depending on the value length.
 */
function buildTiff(options: TiffOptions = {}): Uint8Array {
  const endian = options.endian ?? 'II';
  const ifd0 = [...(options.ifd0 ?? [])];
  const exif = options.exif;
  const ifd0Offset = options.ifd0Offset ?? 8;

  const hasExplicitPointer = ifd0.some((entry) => entry.tag === 0x8769);
  const ifd0Count = ifd0.length + (exif && !hasExplicitPointer ? 1 : 0);
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const exifOffset = exif ? ifd0Offset + ifd0Size : 0;
  const exifSize = exif ? 2 + exif.length * 12 + 4 : 0;
  let dataOffset = exif ? exifOffset + exifSize : ifd0Offset + ifd0Size;

  const pending: Array<{ offset: number; bytes: Uint8Array }> = [];

  const resolve = (entry: EntrySpec): ResolvedEntry => {
    if (typeof entry.value === 'number') {
      return {
        tag: entry.tag,
        type: entry.type ?? 4,
        count: 1,
        inline: uint32Bytes(entry.value, endian),
      };
    }

    const valueBytes = asciiBytes(entry.value);
    if (valueBytes.length <= 4) {
      return {
        tag: entry.tag,
        type: entry.type ?? 2,
        count: valueBytes.length,
        inline: valueBytes,
      };
    }

    if (dataOffset % 2 === 1) dataOffset += 1;
    const offset = dataOffset;
    dataOffset += valueBytes.length;
    pending.push({ offset, bytes: valueBytes });
    return {
      tag: entry.tag,
      type: entry.type ?? 2,
      count: valueBytes.length,
      offset,
    };
  };

  const ifd0Entries = ifd0.map(resolve);
  if (exif && !hasExplicitPointer) {
    ifd0Entries.push({
      tag: 0x8769,
      type: 4,
      count: 1,
      inline: uint32Bytes(options.exifPointer ?? exifOffset, endian),
    });
  }
  const exifEntries = exif ? exif.map(resolve) : [];

  const out = new Uint8Array(Math.max(8, dataOffset));
  const orderByte = endian === 'II' ? 0x49 : 0x4d;
  out[0] = orderByte;
  out[1] = orderByte;
  putUint16(out, 2, options.magic ?? 42, endian);
  putUint32(out, 4, ifd0Offset, endian);

  const writeIfd = (offset: number, entries: ResolvedEntry[]): void => {
    putUint16(out, offset, entries.length, endian);
    entries.forEach((entry, index) => {
      const at = offset + 2 + index * 12;
      putUint16(out, at, entry.tag, endian);
      putUint16(out, at + 2, entry.type, endian);
      putUint32(out, at + 4, entry.count, endian);
      if (entry.inline) {
        out.set(entry.inline, at + 8);
        return;
      }
      putUint32(out, at + 8, entry.offset ?? 0, endian);
    });
    putUint32(out, offset + 2 + entries.length * 12, 0, endian);
  };

  writeIfd(ifd0Offset, ifd0Entries);
  if (exif) writeIfd(exifOffset, exifEntries);
  for (const chunk of pending) out.set(chunk.bytes, chunk.offset);
  return out;
}

interface JpegSegment {
  marker: number;
  payload: Uint8Array;
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2;
  const out = new Uint8Array(4 + payload.length);
  out[0] = 0xff;
  out[1] = marker;
  out[2] = (length >>> 8) & 0xff;
  out[3] = length & 0xff;
  out.set(payload, 4);
  return out;
}

function buildJpeg(segments: JpegSegment[]): Uint8Array {
  return concat([
    new Uint8Array([0xff, 0xd8]),
    ...segments.map((segment) => jpegSegment(segment.marker, segment.payload)),
    new Uint8Array([0xff, 0xda, 0x00, 0x02]),
    new Uint8Array([0xff, 0xd9]),
  ]);
}

const EXIF_PREFIX = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);

function jpegWithExif(tiff: Uint8Array): Uint8Array {
  return buildJpeg([{ marker: 0xe1, payload: concat([EXIF_PREFIX, tiff]) }]);
}

function buildJpegWithXmp(): Uint8Array {
  return buildJpeg([
    { marker: 0xe1, payload: asciiBytes('http://ns.adobe.com/xap/1.0/\u0000<x:xmpmeta/>', false) },
  ]);
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  putUint32BE(out, 0, data.length);
  out.set(asciiBytes(type, false), 4);
  out.set(data, 8);
  // The CRC stays zero: the capture-time reader never validates it.
  return out;
}

function buildPng(chunks: Array<{ type: string; data: Uint8Array }>): Uint8Array {
  return concat([PNG_SIGNATURE, ...chunks.map((chunk) => pngChunk(chunk.type, chunk.data))]);
}

function pngWithExif(tiff: Uint8Array): Uint8Array {
  return buildPng([
    { type: 'IHDR', data: new Uint8Array(13) },
    { type: 'eXIf', data: tiff },
    { type: 'IDAT', data: new Uint8Array([0]) },
  ]);
}

function buildPngWithDataBeforeExif(tiff: Uint8Array): Uint8Array {
  return buildPng([
    { type: 'IHDR', data: new Uint8Array(13) },
    { type: 'IDAT', data: new Uint8Array([0]) },
    { type: 'eXIf', data: tiff },
  ]);
}

function webpChunk(fourcc: string, data: Uint8Array): Uint8Array {
  const padded = data.length + (data.length % 2);
  const out = new Uint8Array(8 + padded);
  out.set(asciiBytes(fourcc, false), 0);
  putUint32LE(out, 4, data.length);
  out.set(data, 8);
  return out;
}

function buildWebp(chunks: Array<{ fourcc: string; data: Uint8Array }>): Uint8Array {
  const body = concat(chunks.map((chunk) => webpChunk(chunk.fourcc, chunk.data)));
  const out = new Uint8Array(12 + body.length);
  out.set(asciiBytes('RIFF', false), 0);
  putUint32LE(out, 4, 4 + body.length);
  out.set(asciiBytes('WEBP', false), 8);
  out.set(body, 12);
  return out;
}

function webpWithExif(tiff: Uint8Array, options: { prefix?: boolean } = {}): Uint8Array {
  const data = options.prefix ? concat([EXIF_PREFIX, tiff]) : tiff;
  return buildWebp([
    { fourcc: 'VP8X', data: new Uint8Array(10) },
    { fourcc: 'VP8L', data: new Uint8Array([0x2f, 0x00, 0x00, 0x00, 0x00]) },
    { fourcc: 'EXIF', data },
  ]);
}

function tiffWithExifDate(
  date: string,
  options: Omit<TiffOptions, 'exif'> & { subSec?: string } = {},
): Uint8Array {
  const { subSec, ...tiffOptions } = options;
  const exif: EntrySpec[] = [{ tag: 0x9003, value: date }];
  if (subSec !== undefined) exif.push({ tag: 0x9291, value: subSec });
  return buildTiff({ ...tiffOptions, exif });
}

function patchIfdOffset(tiff: Uint8Array, offset: number): Uint8Array {
  const copy = tiff.slice();
  putUint32(copy, 4, offset, copy[0] === 0x49 ? 'II' : 'MM');
  return copy;
}

// ---------------------------------------------------------------------------
// readCaptureTime: containers and TIFF shape
// ---------------------------------------------------------------------------

const CONTAINERS: Array<[string, (tiff: Uint8Array) => Uint8Array]> = [
  ['JPEG APP1', (tiff) => jpegWithExif(tiff)],
  ['PNG eXIf', (tiff) => pngWithExif(tiff)],
  ['WebP EXIF', (tiff) => webpWithExif(tiff)],
];

describe('readCaptureTime', () => {
  for (const [container, wrap] of CONTAINERS) {
    for (const endian of ['II', 'MM'] as const) {
      it(`extracts DateTimeOriginal from ${container} (${endian} byte order)`, () => {
        const tiff = tiffWithExifDate('2025:10:05 12:30:00', { endian });
        expect(readCaptureTime(wrap(tiff))).toEqual({
          key: '20251005123000',
          subSec: 0,
        });
      });
    }
  }

  it('tolerates an Exif\\0\\0 prefix on the WebP EXIF chunk', () => {
    const tiff = tiffWithExifDate(SAMPLE_DATE);
    expect(readCaptureTime(webpWithExif(tiff, { prefix: true }))).toEqual({
      key: '20251005123000',
      subSec: 0,
    });
  });

  it('reads ASCII values stored by offset and inline sub-seconds', () => {
    // DateTimeOriginal is 20 bytes with the NUL, so it lives past the entry's
    // 4-byte value field; "20" stays inline.
    const tiff = buildTiff({
      exif: [
        { tag: 0x9003, value: SAMPLE_DATE },
        { tag: 0x9291, value: '20' },
      ],
    });
    expect(readCaptureTime(jpegWithExif(tiff))).toEqual({
      key: '20251005123000',
      subSec: 0.2,
    });
  });

  it('prefers DateTimeOriginal over DateTimeDigitized over IFD0 DateTime', () => {
    const tiff = buildTiff({
      ifd0: [{ tag: 0x0132, value: '2025:10:05 10:00:00' }],
      exif: [
        { tag: 0x9003, value: '2025:10:05 12:00:00' },
        { tag: 0x9004, value: '2025:10:05 11:00:00' },
      ],
    });
    expect(readCaptureTime(jpegWithExif(tiff))?.key).toBe('20251005120000');
  });

  it('falls back to DateTimeDigitized when DateTimeOriginal is missing', () => {
    const tiff = buildTiff({
      ifd0: [{ tag: 0x0132, value: '2025:10:05 10:00:00' }],
      exif: [{ tag: 0x9004, value: '2025:10:05 11:00:00' }],
    });
    expect(readCaptureTime(jpegWithExif(tiff))?.key).toBe('20251005110000');
  });

  it('falls back to IFD0 DateTime when the Exif timestamps are missing', () => {
    const tiff = buildTiff({
      ifd0: [{ tag: 0x0132, value: '2025:10:05 10:00:00' }],
    });
    expect(readCaptureTime(jpegWithExif(tiff))?.key).toBe('20251005100000');
  });

  it('parses SubSecTimeOriginal as a decimal fraction', () => {
    const fifth = readCaptureTime(
      jpegWithExif(buildTiff({ exif: [{ tag: 0x9003, value: SAMPLE_DATE }, { tag: 0x9291, value: '5' }] })),
    );
    const twenty = readCaptureTime(
      jpegWithExif(buildTiff({ exif: [{ tag: 0x9003, value: SAMPLE_DATE }, { tag: 0x9291, value: '20' }] })),
    );
    const missing = readCaptureTime(jpegWithExif(tiffWithExifDate(SAMPLE_DATE)));

    expect(fifth?.subSec).toBe(0.5);
    expect(twenty?.subSec).toBe(0.2);
    expect(missing?.subSec).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// readCaptureTime: malformed input degrades to null, never throws
// ---------------------------------------------------------------------------

describe('readCaptureTime malformed input', () => {
  const truncated = jpegWithExif(tiffWithExifDate(SAMPLE_DATE)).slice(0, 24);

  const cases: Array<[string, Uint8Array]> = [
    ['empty buffer', new Uint8Array(0)],
    ['non-image bytes', asciiBytes('plain text, not an image', false)],
    ['truncated APP1', truncated],
    [
      'IFD offset past the end',
      jpegWithExif(patchIfdOffset(tiffWithExifDate(SAMPLE_DATE), 0xffff)),
    ],
    [
      'Exif IFD pointer past the end',
      jpegWithExif(buildTiff({ exif: [{ tag: 0x9003, value: SAMPLE_DATE }], exifPointer: 0xffff })),
    ],
    [
      'wrong TIFF magic',
      jpegWithExif(buildTiff({ magic: 41, exif: [{ tag: 0x9003, value: SAMPLE_DATE }] })),
    ],
    [
      'bad-shaped date string',
      jpegWithExif(buildTiff({ exif: [{ tag: 0x9003, value: '2025-10-05 12:30:00' }] })),
    ],
    [
      'all-zero placeholder',
      jpegWithExif(buildTiff({ exif: [{ tag: 0x9003, value: '0000:00:00 00:00:00' }] })),
    ],
    ['APP1 that is not Exif', buildJpegWithXmp()],
    [
      'PNG with IDAT before eXIf',
      buildPngWithDataBeforeExif(tiffWithExifDate(SAMPLE_DATE)),
    ],
  ];

  it.each(cases)('returns null for %s', (_label, bytes) => {
    expect(readCaptureTime(bytes)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// compareCapture
// ---------------------------------------------------------------------------

describe('compareCapture', () => {
  const early: CaptureTime = { key: '20251005090000', subSec: 0 };
  const late: CaptureTime = { key: '20251005120000', subSec: 0 };

  it('orders dated capture times ascending', () => {
    expect(compareCapture(early, late)).toBeLessThan(0);
    expect(compareCapture(late, early)).toBeGreaterThan(0);
    expect(compareCapture(early, early)).toBe(0);
  });

  it('orders equal seconds by sub-seconds as a decimal fraction', () => {
    const pointTwo: CaptureTime = { key: '20251005120000', subSec: 0.2 };
    const pointFive: CaptureTime = { key: '20251005120000', subSec: 0.5 };
    expect(compareCapture(pointTwo, pointFive)).toBeLessThan(0);
    expect(compareCapture(pointFive, pointTwo)).toBeGreaterThan(0);
  });

  it('places undated photos after dated ones', () => {
    expect(compareCapture(early, null)).toBeLessThan(0);
    expect(compareCapture(null, early)).toBeGreaterThan(0);
    expect(compareCapture(null, null)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// orderByCaptureTime
// ---------------------------------------------------------------------------

interface TestItem {
  name: string;
  bytes: Uint8Array;
}

function readItem(item: TestItem): Promise<Uint8Array> {
  return Promise.resolve(item.bytes);
}

function dated(name: string, date: string, subSec?: string): TestItem {
  return { name, bytes: jpegWithExif(tiffWithExifDate(date, { subSec })) };
}

/** A JPEG whose EXIF was stripped: no APP1 at all. */
function undatedJpeg(name: string): TestItem {
  return { name, bytes: buildJpeg([]) };
}

/** A PNG screenshot: header plus image data, no eXIf chunk. */
function undatedPng(name: string): TestItem {
  return {
    name,
    bytes: buildPng([
      { type: 'IHDR', data: new Uint8Array(13) },
      { type: 'IDAT', data: new Uint8Array([0]) },
    ]),
  };
}

describe('orderByCaptureTime', () => {
  it('orders the C/A/B scenario oldest first', async () => {
    const items = [
      dated('C.jpg', '2025:10:05 18:00:00'),
      dated('A.jpg', '2025:10:05 09:00:00'),
      dated('B.jpg', '2025:10:05 12:30:00'),
    ];
    const ordered = await orderByCaptureTime(items, readItem);
    expect(ordered.map((item) => item.name)).toEqual(['A.jpg', 'B.jpg', 'C.jpg']);
  });

  it('breaks same-second ties by sub-seconds', async () => {
    const items = [
      dated('IMG_10.jpg', '2025:10:05 12:00:00', '20'),
      dated('IMG_2.jpg', '2025:10:05 12:00:00', '50'),
      dated('IMG_3.jpg', '2025:10:05 12:00:00'),
    ];
    const ordered = await orderByCaptureTime(items, readItem);
    expect(ordered.map((item) => item.name)).toEqual(['IMG_3.jpg', 'IMG_10.jpg', 'IMG_2.jpg']);
  });

  it('breaks remaining ties with natural filename order', async () => {
    const items = [
      dated('IMG_10.jpg', '2025:10:05 12:00:00'),
      dated('IMG_2.jpg', '2025:10:05 12:00:00'),
    ];
    const ordered = await orderByCaptureTime(items, readItem);
    expect(ordered.map((item) => item.name)).toEqual(['IMG_2.jpg', 'IMG_10.jpg']);
  });

  it('places undated photos after dated ones in natural filename order', async () => {
    const items = [
      undatedPng('IMG_10.png'),
      dated('B.jpg', '2025:10:05 12:00:00'),
      undatedJpeg('IMG_2.jpg'),
      dated('A.jpg', '2025:10:05 09:00:00'),
    ];
    const ordered = await orderByCaptureTime(items, readItem);
    expect(ordered.map((item) => item.name)).toEqual(['A.jpg', 'B.jpg', 'IMG_2.jpg', 'IMG_10.png']);
  });

  it('keeps input order when names and capture times are equal', async () => {
    const first: TestItem = { name: 'same.jpg', bytes: new Uint8Array(0) };
    const second: TestItem = { name: 'same.jpg', bytes: new Uint8Array(0) };
    const ordered = await orderByCaptureTime([first, second], readItem);
    expect(ordered[0]).toBe(first);
    expect(ordered[1]).toBe(second);
  });

  it('treats a readBytes rejection as undated', async () => {
    const failing: TestItem = { name: 'broken.jpg', bytes: new Uint8Array(0) };
    const items = [failing, dated('A.jpg', '2025:10:05 09:00:00')];
    const ordered = await orderByCaptureTime(items, async (item) => {
      if (item === failing) throw new Error('NotReadableError');
      return readItem(item);
    });
    expect(ordered.map((item) => item.name)).toEqual(['A.jpg', 'broken.jpg']);
  });

  it('returns a new array and leaves the input unmutated', async () => {
    const items = [
      dated('C.jpg', '2025:10:05 18:00:00'),
      dated('A.jpg', '2025:10:05 09:00:00'),
    ];
    const before = items.map((item) => item.name);
    const ordered = await orderByCaptureTime(items, readItem);

    expect(ordered).not.toBe(items);
    expect(items.map((item) => item.name)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Cap interplay
// ---------------------------------------------------------------------------

describe('cap interplay', () => {
  it('keeps the 20 earliest photos of a shuffled 25-photo folder', async () => {
    const chronological: TestItem[] = Array.from({ length: 25 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0');
      return dated(`photo-${day}.jpg`, `2025:10:${day} 10:00:00`);
    });
    // 7 is coprime with 25, so (i * 7) % 25 is a deterministic shuffle.
    const shuffled = Array.from({ length: 25 }, (_, index) => chronological[(index * 7) % 25]);

    const ordered = await orderByCaptureTime(shuffled, readItem);
    const { accepted, overflow } = splitAlbumCap(ordered as unknown as File[], 20);

    expect(accepted.map((file) => file.name)).toEqual(
      chronological.slice(0, 20).map((item) => item.name),
    );
    expect(overflow).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Read budget
// ---------------------------------------------------------------------------

interface SpyFile {
  file: File;
  slices: Array<{ start: number; end: number | undefined }>;
  state: { fullReads: number };
}

function spyFile(name: string, bytes: Uint8Array): SpyFile {
  const slices: Array<{ start: number; end: number | undefined }> = [];
  const state = { fullReads: 0 };
  const toArrayBuffer = (view: Uint8Array): ArrayBuffer =>
    view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;

  const file = {
    name,
    size: bytes.length,
    slice(start = 0, end: number = bytes.length) {
      slices.push({ start, end });
      const view = bytes.slice(start, end);
      return { arrayBuffer: async () => toArrayBuffer(view) };
    },
    async arrayBuffer() {
      state.fullReads += 1;
      return toArrayBuffer(bytes);
    },
  };

  return { file: file as unknown as File, slices, state };
}

describe('readCaptureBytes', () => {
  const expected: CaptureTime = { key: '20251005123000', subSec: 0 };
  const tiff = tiffWithExifDate(SAMPLE_DATE);

  it('reads only the first 256 KiB of a JPEG and still finds the timestamp', async () => {
    const spy = spyFile('photo.jpg', jpegWithExif(tiff));
    const bytes = await readCaptureBytes(spy.file);

    expect(spy.slices).toEqual([
      { start: 0, end: 12 },
      { start: 0, end: 256 * 1024 },
    ]);
    expect(spy.state.fullReads).toBe(0);
    expect(readCaptureTime(bytes)).toEqual(expected);
  });

  it('reads only the first 256 KiB of a PNG and still finds the timestamp', async () => {
    const spy = spyFile('photo.png', pngWithExif(tiff));
    const bytes = await readCaptureBytes(spy.file);

    expect(spy.slices).toEqual([
      { start: 0, end: 12 },
      { start: 0, end: 256 * 1024 },
    ]);
    expect(spy.state.fullReads).toBe(0);
    expect(readCaptureTime(bytes)).toEqual(expected);
  });

  it('reads a WebP in full because its EXIF chunk trails the image data', async () => {
    const spy = spyFile('photo.webp', webpWithExif(tiff));
    const bytes = await readCaptureBytes(spy.file);

    expect(spy.state.fullReads).toBe(1);
    expect(spy.slices).toEqual([{ start: 0, end: 12 }]);
    expect(readCaptureTime(bytes)).toEqual(expected);
  });

  it('degrades to undated when EXIF sits beyond the 256 KiB head', async () => {
    // Five 60 KiB APP2 segments push the Exif APP1 past the head budget. This
    // is the pathological writer the JPEG assumption calls out; the walk on the
    // full file still finds the timestamp, and the capped read fails safely.
    const padding = Array.from({ length: 5 }, () => ({
      marker: 0xe2,
      payload: new Uint8Array(60 * 1024),
    }));
    const bytes = buildJpeg([
      ...padding,
      { marker: 0xe1, payload: concat([EXIF_PREFIX, tiff]) },
    ]);
    const spy = spyFile('heavy.jpg', bytes);

    expect(readCaptureTime(bytes)).toEqual(expected);
    expect(readCaptureTime(await readCaptureBytes(spy.file))).toBeNull();
  });
});
