import { describe, expect, it } from 'vitest';

import {
  ImageValidationError,
  MAX_UPLOAD_BYTES,
  sanitizeImage,
} from '@/lib/upload/sanitizeImage';

// ---------------------------------------------------------------------------
// Binary fixture builders (no image libraries allowed: sanitization is byte-level)
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

function be16(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function be32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function le16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function le32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  return concat([
    new Uint8Array([0xff, marker]),
    be16(payload.length + 2),
    payload,
  ]);
}

/** Minimal little-endian TIFF/EXIF block: Make, Model and Orientation in IFD0. */
function buildExifPayload(orientation: number): Uint8Array {
  const make = ascii('Canon\u0000');
  const model = ascii('EOS R5\u0000');
  const ifdOffset = 8;
  const entryCount = 3;
  const dataOffset = ifdOffset + 2 + entryCount * 12 + 4;

  const tiffHeader = concat([ascii('II'), le16(42), le32(ifdOffset)]);
  const ifdCount = le16(entryCount);
  const makeEntry = concat([
    le16(0x010f),
    le16(2),
    le32(make.length),
    le32(dataOffset),
  ]);
  const modelEntry = concat([
    le16(0x0110),
    le16(2),
    le32(model.length),
    le32(dataOffset + make.length),
  ]);
  const orientationEntry = concat([
    le16(0x0112),
    le16(3),
    le32(1),
    concat([le16(orientation), le16(0)]),
  ]);
  const nextIfd = le32(0);

  return concat([
    ascii('Exif\u0000\u0000'),
    tiffHeader,
    ifdCount,
    makeEntry,
    modelEntry,
    orientationEntry,
    nextIfd,
    make,
    model,
  ]);
}

function buildJpeg(options: { orientation: number }): Uint8Array {
  const exif = jpegSegment(0xe1, buildExifPayload(options.orientation));
  const xmp = jpegSegment(
    0xe1,
    concat([
      ascii('http://ns.adobe.com/xap/1.0/\u0000'),
      ascii('<x:xmpmeta xmlns:x="adobe:ns:meta/"><exif:GPSLatitude>40,42N</exif:GPSLatitude></x:xmpmeta>'),
    ]),
  );
  const icc = jpegSegment(
    0xe2,
    concat([ascii('ICC_PROFILE\u0000\u0001\u0001'), ascii('DISPLAY_P3_FAKE_PROFILE_BYTES')]),
  );
  const sof0 = jpegSegment(
    0xc0,
    concat([new Uint8Array([8]), be16(3000), be16(4000), new Uint8Array([3]), ascii('\u0001\u0022\u0000\u0002\u0011\u0001\u0003\u0011\u0001')]),
  );
  const jfif = jpegSegment(0xe0, concat([ascii('JFIF\u0000'), new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 0])]));
  const sos = jpegSegment(0xda, new Uint8Array([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]));
  const scan = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0xff, 0xd9]);

  return concat([
    new Uint8Array([0xff, 0xd8]),
    jfif,
    exif,
    xmp,
    icc,
    sof0,
    sos,
    scan,
  ]);
}

/**
 * JPEG with an `APP11` JUMBF/C2PA box carrying `stds.exif` GPS assertions plus
 * `APP3`/`APP15` ancillary metadata. A strict allowlist must drop all three
 * while keeping the orientation EXIF, ICC profile, dimensions and pixels.
 */
function buildJpegWithJumbf(): Uint8Array {
  const jfif = jpegSegment(0xe0, concat([ascii('JFIF\u0000'), new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 0])]));
  const exif = jpegSegment(0xe1, buildExifPayload(6));
  const icc = jpegSegment(
    0xe2,
    concat([ascii('ICC_PROFILE\u0000\u0001\u0001'), ascii('DISPLAY_P3_FAKE_PROFILE_BYTES')]),
  );
  const jumbf = jpegSegment(
    0xeb,
    concat([
      ascii('jumb'),
      ascii('c2pa'),
      ascii('stds.exif GPSLatitude 40,42N'),
    ]),
  );
  const app3 = jpegSegment(0xe3, ascii('APP3_METADATA_SECRET'));
  const app15 = jpegSegment(0xef, ascii('APP15_METADATA_SECRET'));
  const sof0 = jpegSegment(
    0xc0,
    concat([new Uint8Array([8]), be16(3000), be16(4000), new Uint8Array([3]), ascii('\u0001\u0022\u0000\u0002\u0011\u0001\u0003\u0011\u0001')]),
  );
  const sos = jpegSegment(0xda, new Uint8Array([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]));
  const scan = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0xff, 0xd9]);

  return concat([
    new Uint8Array([0xff, 0xd8]),
    jfif,
    exif,
    icc,
    jumbf,
    app3,
    app15,
    sof0,
    sos,
    scan,
  ]);
}

/**
 * JPEG with an APP2 `MPF\0` secondary image, an APP2 gain map, APP13/COM
 * metadata, plus a second JPEG carrying GPS/camera EXIF appended after the
 * primary EOI and a raw motion-photo trailer. Only the primary scan may
 * survive, truncated at the first real EOI.
 */
function buildJpegWithAppendedTail(): Uint8Array {
  const jfif = jpegSegment(0xe0, concat([ascii('JFIF\u0000'), new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 0])]));
  const exif = jpegSegment(0xe1, buildExifPayload(6));
  const xmp = jpegSegment(0xe1, concat([ascii('<x:xmpmeta><exif:GPSLatitude>40,42N</exif:GPSLatitude></x:xmpmeta>')]));
  const icc = jpegSegment(
    0xe2,
    concat([ascii('ICC_PROFILE\u0000\u0001\u0001'), ascii('DISPLAY_P3_FAKE_PROFILE_BYTES')]),
  );
  const mpf = jpegSegment(0xe2, concat([ascii('MPF\u0000'), ascii('MPF_SECONDARY_IMAGE_BYTES')]));
  const gainMap = jpegSegment(
    0xe2,
    concat([ascii('urn:iso:std:iso:ts:21496:-1\u0000'), ascii('GAIN_MAP_DATA')]),
  );
  const app13 = jpegSegment(0xed, concat([ascii('Photoshop 3.0\u0000'), ascii('IPTC_SECRET')]));
  const comment = jpegSegment(0xfe, ascii('COM_SECRET'));
  const sof0 = jpegSegment(
    0xc0,
    concat([
      new Uint8Array([8]),
      be16(3000),
      be16(4000),
      new Uint8Array([1]),
      new Uint8Array([1, 0x11, 0]),
    ]),
  );
  const sos = jpegSegment(0xda, new Uint8Array([1, 1, 0, 0, 0x3f, 0]));
  // Entropy-coded data with FF 00 byte stuffing and an FF D0 restart marker.
  const entropy = new Uint8Array([
    0x12, 0x34, 0xff, 0x00, 0x56, 0x78, 0xff, 0xd0, 0x9a, 0xbc,
  ]);

  // Appended secondary JPEG (motion-photo / MPF image) with camera + GPS EXIF.
  const appendedExif = jpegSegment(0xe1, buildExifPayload(1));
  const appendedSof = jpegSegment(
    0xc0,
    concat([
      new Uint8Array([8]),
      be16(10),
      be16(10),
      new Uint8Array([1]),
      new Uint8Array([1, 0x11, 0]),
    ]),
  );
  const appendedSos = jpegSegment(0xda, new Uint8Array([1, 1, 0, 0, 0x3f, 0]));
  const appendedJpeg = concat([
    new Uint8Array([0xff, 0xd8]),
    appendedExif,
    appendedSof,
    appendedSos,
    new Uint8Array([0xde, 0xad, 0xff, 0xd9]),
  ]);
  const trailer = ascii('APPENDED_MP4_GPS_ATOM');

  return concat([
    new Uint8Array([0xff, 0xd8]),
    jfif,
    exif,
    xmp,
    icc,
    mpf,
    gainMap,
    app13,
    comment,
    sof0,
    sos,
    entropy,
    new Uint8Array([0xff, 0xd9]),
    appendedJpeg,
    trailer,
  ]);
}

/** Two-scan progressive JPEG with a COM segment between the scans. */
function buildProgressiveJpeg(): Uint8Array {
  const jfif = jpegSegment(0xe0, concat([ascii('JFIF\u0000'), new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 0])]));
  const dqt = jpegSegment(0xdb, concat([new Uint8Array([0]), new Uint8Array(64).fill(0x10)]));
  const sof2 = jpegSegment(
    0xc2,
    concat([
      new Uint8Array([8]),
      be16(800),
      be16(1200),
      new Uint8Array([1]),
      new Uint8Array([1, 0x11, 0]),
    ]),
  );
  const dht1 = jpegSegment(0xc4, concat([new Uint8Array([0x00]), new Uint8Array(16).fill(1), new Uint8Array([0])]));
  const dht2 = jpegSegment(0xc4, concat([new Uint8Array([0x10]), new Uint8Array(16).fill(1), new Uint8Array([0])]));
  const sos1 = jpegSegment(0xda, new Uint8Array([1, 1, 0, 0, 0x01, 0]));
  const sos2 = jpegSegment(0xda, new Uint8Array([1, 1, 0, 0, 0x02, 0]));
  const comment = jpegSegment(0xfe, ascii('PROGRESSIVE_SECRET_COM'));

  return concat([
    new Uint8Array([0xff, 0xd8]),
    jfif,
    dqt,
    sof2,
    dht1,
    sos1,
    new Uint8Array([0x11, 0x22]),
    dht2,
    comment,
    sos2,
    new Uint8Array([0x33, 0x44, 0xff, 0x00, 0x55]),
    new Uint8Array([0xff, 0xd9]),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = ascii(type);
  return concat([
    be32(data.length),
    typeBytes,
    data,
    be32(crc32(concat([typeBytes, data]))),
  ]);
}

function buildPng(): Uint8Array {
  const ihdr = pngChunk(
    'IHDR',
    concat([be32(640), be32(480), new Uint8Array([8, 2, 0, 0, 0])]),
  );
  const iccp = pngChunk('iCCP', concat([ascii('Display P3\u0000\u0000'), ascii('FAKE')]));
  const exif = pngChunk('eXIf', concat([ascii('II'), le16(42), le32(8)]));
  const text = pngChunk('tEXt', concat([ascii('XML:com.adobe.xmp\u0000<x:xmpmeta/>'), new Uint8Array([0])]));
  const itxt = pngChunk('iTXt', concat([ascii('Comment\u0000\u0000\u0000\u0000\u0000GPSLatitude')]));
  const iend = pngChunk('IEND', new Uint8Array(0));

  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdr,
    iccp,
    exif,
    text,
    itxt,
    iend,
  ]);
}

/** PNG with a `caBX` JUMBF/C2PA chunk plus an unknown ancillary chunk. */
function buildPngWithCabx(): Uint8Array {
  const ihdr = pngChunk(
    'IHDR',
    concat([be32(1024), be32(768), new Uint8Array([8, 2, 0, 0, 0])]),
  );
  const iccp = pngChunk('iCCP', concat([ascii('Display P3\u0000\u0000'), ascii('FAKE')]));
  const cabx = pngChunk(
    'caBX',
    concat([ascii('jumb'), ascii('c2pa'), ascii('stds.exif GPSLatitude 40,42N')]),
  );
  const unknown = pngChunk('abcd', ascii('UNKNOWN_ANCILLARY_SECRET'));
  const iend = pngChunk('IEND', new Uint8Array(0));

  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdr,
    iccp,
    cabx,
    unknown,
    iend,
  ]);
}

function riffChunk(fourCc: string, data: Uint8Array): Uint8Array {
  const padded = data.length % 2 === 0 ? data : concat([data, new Uint8Array([0])]);
  return concat([ascii(fourCc), le32(data.length), padded]);
}

function buildWebp(): Uint8Array {
  // VP8X flags: ICC (0x20) + EXIF (0x08) + XMP (0x04) all set; only ICC may survive.
  const vp8xPayload = concat([
    new Uint8Array([0x2c, 0x00, 0x00, 0x00]),
    new Uint8Array([799 & 0xff, (799 >> 8) & 0xff, (799 >> 16) & 0xff]),
    new Uint8Array([599 & 0xff, (599 >> 8) & 0xff, (599 >> 16) & 0xff]),
  ]);
  const chunks = concat([
    riffChunk('VP8X', vp8xPayload),
    riffChunk('ICCP', concat([ascii('ICC_PROFILE\u0000'), ascii('DISPLAY_P3_FAKE')])),
    riffChunk('EXIF', ascii('Canon EOS R5 GPSLatitude')),
    riffChunk('XMP ', ascii('<x:xmpmeta/>')),
    riffChunk('caBX', concat([ascii('jumb'), ascii('c2pa'), ascii('stds.exif GPSLatitude')])),
    riffChunk('JUNK', ascii('JUNK_METADATA_SECRET')),
    riffChunk('VP8 ', new Uint8Array([0, 0, 0, 0x9d, 0x01, 0x2a, 1, 2, 3, 4])),
  ]);
  const riff = concat([ascii('RIFF'), le32(4 + chunks.length), ascii('WEBP')]);
  return concat([riff, chunks]);
}

function box(type: string, payload: Uint8Array): Uint8Array {
  return concat([be32(payload.length + 8), ascii(type), payload]);
}

function fullBox(type: string, versionFlags: number, payload: Uint8Array): Uint8Array {
  return box(type, concat([be32(versionFlags), payload]));
}

function buildAvif(): Uint8Array {
  const ftyp = box(
    'ftyp',
    concat([ascii('avif'), be32(0), ascii('avif'), ascii('mif1')]),
  );
  const ispe = fullBox('ispe', 0, concat([be32(1200), be32(800)]));
  const ipco = box('ipco', ispe);
  const iprp = box('iprp', ipco);
  const exif = box('Exif', concat([be32(0), ascii('Canon EOS R5 GPSLatitude')]));
  const meta = fullBox('meta', 0, concat([iprp, exif]));
  const mdat = box('mdat', new Uint8Array([1, 2, 3, 4, 5, 6]));

  return concat([ftyp, meta, mdat]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function expectValidationError(fn: () => unknown, status: number): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ImageValidationError);
    expect((error as ImageValidationError).status).toBe(status);
    return;
  }
  throw new Error(`expected ImageValidationError with status ${status}`);
}

describe('sanitizeImage size and magic-byte guards', () => {
  it('rejects uploads larger than 25 MB with 413 before sniffing bytes', () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
    expectValidationError(
      () => sanitizeImage(new Uint8Array(MAX_UPLOAD_BYTES + 1)),
      413,
    );
  });

  it('rejects an mp4 with 415', () => {
    const mp4 = concat([be32(24), ascii('ftypmp42'), be32(0), ascii('mp42isom'), new Uint8Array(8)]);
    expectValidationError(() => sanitizeImage(mp4), 415);
  });

  it('rejects a text file renamed to .jpg with 415', () => {
    expectValidationError(() => sanitizeImage(ascii('this is definitely not a jpeg')), 415);
  });

  it('rejects an empty buffer with 415', () => {
    expectValidationError(() => sanitizeImage(new Uint8Array(0)), 415);
  });
});

describe('sanitizeImage JPEG handling', () => {
  it('preserves Orientation=6, swaps authoritative dimensions, strips GPS/camera/XMP and keeps ICC', () => {
    const input = buildJpeg({ orientation: 6 });
    const result = sanitizeImage(input);

    expect(result.contentType).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
    expect(result.width).toBe(3000);
    expect(result.height).toBe(4000);
    expect(result.aspectRatio).toBeCloseTo(0.75, 6);

    const text = Buffer.from(result.bytes).toString('latin1');

    // Orientation-only EXIF tag remains (tag 0x0112, type SHORT, count 1, value 6).
    expect(text.includes('\u0012\u0001\u0003\u0000\u0001\u0000\u0000\u0000\u0006\u0000\u0000\u0000')).toBe(true);
    expect(text).toContain('Exif\u0000\u0000');
    // Camera, GPS and XMP payloads are gone.
    expect(text).not.toContain('Canon');
    expect(text).not.toContain('EOS R5');
    expect(text).not.toContain('GPSLatitude');
    expect(text).not.toContain('xmpmeta');
    expect(text).not.toContain('adobe.com/xap/1.0');
    // ICC profile survives byte-for-byte.
    expect(text).toContain('ICC_PROFILE\u0000\u0001\u0001DISPLAY_P3_FAKE_PROFILE_BYTES');
    // Compressed pixel payload is untouched.
    expect(text).toContain('\u0012\u0034\u0056\u0078');
    // Orientation-6 photos keep their original SOF dimensions (no re-encode).
    expect(text.includes('\u0008\u000b\u00b8\u000f\u00a0')).toBe(true);
  });

  it('uses width-driven dimensions for orientation 1', () => {
    const result = sanitizeImage(buildJpeg({ orientation: 1 }));

    expect(result.width).toBe(4000);
    expect(result.height).toBe(3000);
    expect(result.aspectRatio).toBeCloseTo(4000 / 3000, 6);
    expect(Buffer.from(result.bytes).toString('latin1')).toContain('Exif\u0000\u0000');
  });

  it('does not grow the file while stripping metadata', () => {
    const input = buildJpeg({ orientation: 6 });
    const result = sanitizeImage(input);

    expect(result.bytes.length).toBeLessThan(input.length);
  });

  it('drops APP11/JUMBF C2PA, APP3 and APP15 metadata while keeping orientation, ICC and pixels', () => {
    const result = sanitizeImage(buildJpegWithJumbf());

    expect(result.contentType).toBe('image/jpeg');
    expect(result.width).toBe(3000);
    expect(result.height).toBe(4000);

    const text = Buffer.from(result.bytes).toString('latin1');

    // C2PA/JUMBF GPS assertion and ancillary APPn metadata are gone.
    expect(text).not.toContain('jumb');
    expect(text).not.toContain('c2pa');
    expect(text).not.toContain('stds.exif');
    expect(text).not.toContain('GPSLatitude');
    expect(text).not.toContain('APP3_METADATA_SECRET');
    expect(text).not.toContain('APP15_METADATA_SECRET');

    // Orientation-only EXIF, ICC profile, dimensions and pixels survive.
    expect(text).toContain('Exif\u0000\u0000');
    expect(text.includes('\u0012\u0001\u0003\u0000\u0001\u0000\u0000\u0000\u0006\u0000\u0000\u0000')).toBe(true);
    expect(text).toContain('ICC_PROFILE\u0000\u0001\u0001DISPLAY_P3_FAKE_PROFILE_BYTES');
    expect(text.includes('\u0008\u000b\u00b8\u000f\u00a0')).toBe(true);
    expect(text).toContain('\u0012\u0034\u0056\u0078');
  });

  it('truncates at the first EOI and drops APP2 MPF/gain-map + appended JPEG/GPS tails', () => {
    const input = buildJpegWithAppendedTail();
    const result = sanitizeImage(input);

    expect(result.width).toBe(3000);
    expect(result.height).toBe(4000);
    expect(result.aspectRatio).toBeCloseTo(0.75, 6);

    const text = Buffer.from(result.bytes).toString('latin1');

    // MPF secondary image, gain map, APP13/IPTC, COM and the appended tail are gone.
    expect(text).not.toContain('MPF');
    expect(text).not.toContain('GAIN_MAP_DATA');
    expect(text).not.toContain('IPTC_SECRET');
    expect(text).not.toContain('COM_SECRET');
    expect(text).not.toContain('APPENDED_MP4_GPS_ATOM');
    expect(text).not.toContain('GPSLatitude');
    expect(text).not.toContain('xmpmeta');
    expect(text).not.toContain('Canon');
    expect(text).not.toContain('EOS R5');

    // Orientation-only EXIF and the ICC profile survive.
    expect(text).toContain('Exif\u0000\u0000');
    expect(text.includes('\u0012\u0001\u0003\u0000\u0001\u0000\u0000\u0000\u0006\u0000\u0000\u0000')).toBe(true);
    expect(text).toContain('ICC_PROFILE\u0000\u0001\u0001DISPLAY_P3_FAKE_PROFILE_BYTES');

    // The primary scan survives byte-for-byte, including stuffing and restart markers.
    expect(text).toContain('\u0012\u0034\u00ff\u0000\u0056\u0078\u00ff\u00d0\u009a\u00bc');

    // Output is truncated at the first real EOI.
    expect(result.bytes.length).toBeLessThan(input.length);
    expect(result.bytes[result.bytes.length - 2]).toBe(0xff);
    expect(result.bytes[result.bytes.length - 1]).toBe(0xd9);
    expect(text.split('\u00ff\u00d9')).toHaveLength(2); // exactly one EOI
    expect(text).not.toContain('APPENDED');
  });

  it('walks multi-scan progressive JPEGs to EOI and drops inter-scan COM metadata', () => {
    const result = sanitizeImage(buildProgressiveJpeg());

    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);

    const text = Buffer.from(result.bytes).toString('latin1');
    expect(text).not.toContain('PROGRESSIVE_SECRET_COM');
    expect(text).toContain('\u0011\u0022');
    expect(text).toContain('\u0033\u0044\u00ff\u0000\u0055');
    expect(text.split('\u00ff\u00da')).toHaveLength(3); // both SOS headers kept
    expect(result.bytes[result.bytes.length - 2]).toBe(0xff);
    expect(result.bytes[result.bytes.length - 1]).toBe(0xd9);
  });
});

describe('sanitizeImage PNG handling', () => {
  it('drops eXIf and XMP text chunks while keeping iCCP and IHDR dimensions', () => {
    const result = sanitizeImage(buildPng());

    expect(result.contentType).toBe('image/png');
    expect(result.extension).toBe('png');
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
    expect(result.aspectRatio).toBeCloseTo(640 / 480, 6);

    const text = Buffer.from(result.bytes).toString('latin1');
    expect(text).toContain('iCCP');
    expect(text).toContain('Display P3');
    expect(text).not.toContain('eXIf');
    expect(text).not.toContain('tEXt');
    expect(text).not.toContain('iTXt');
    expect(text).not.toContain('GPSLatitude');
    expect(text).not.toContain('xmpmeta');
  });
  it('drops caBX JUMBF/C2PA and unknown ancillary chunks while keeping iCCP and IHDR dimensions', () => {
    const result = sanitizeImage(buildPngWithCabx());

    expect(result.contentType).toBe('image/png');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);

    const text = Buffer.from(result.bytes).toString('latin1');
    expect(text).toContain('iCCP');
    expect(text).toContain('Display P3');
    expect(text).not.toContain('caBX');
    expect(text).not.toContain('jumb');
    expect(text).not.toContain('c2pa');
    expect(text).not.toContain('stds.exif');
    expect(text).not.toContain('GPSLatitude');
    // Unknown ancillary chunks are dropped rather than passed through.
    expect(text).not.toContain('abcd');
    expect(text).not.toContain('UNKNOWN_ANCILLARY_SECRET');
  });
});

describe('sanitizeImage WebP handling', () => {
  it('reads VP8X dimensions and strips EXIF/XMP chunks', () => {
    const result = sanitizeImage(buildWebp());

    expect(result.contentType).toBe('image/webp');
    expect(result.extension).toBe('webp');
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);

    const text = Buffer.from(result.bytes).toString('latin1');
    expect(text).not.toContain('EXIF');
    expect(text).not.toContain('XMP ');
    expect(text).not.toContain('Canon');
    expect(text).toContain('VP8 ');
    // RIFF size header is rewritten to match the stripped payload.
    expect(text.slice(0, 4)).toBe('RIFF');
    expect(result.bytes.length).toBeLessThan(buildWebp().length);
  });

  it('clears VP8X EXIF/XMP flags and drops caBX/JUNK while preserving ICC and canvas size', () => {
    const result = sanitizeImage(buildWebp());

    expect(result.width).toBe(800);
    expect(result.height).toBe(600);

    const text = Buffer.from(result.bytes).toString('latin1');
    expect(text).not.toContain('EXIF');
    expect(text).not.toContain('XMP ');
    expect(text).not.toContain('caBX');
    expect(text).not.toContain('JUNK');
    expect(text).not.toContain('stds.exif');
    expect(text).toContain('ICCP');

    // The VP8X payload flags byte has EXIF (0x08) and XMP (0x04) cleared while
    // the ICC (0x20) bit is preserved.
    const vp8xIndex = text.indexOf('VP8X');
    expect(vp8xIndex).toBeGreaterThanOrEqual(0);
    const flags = result.bytes[vp8xIndex + 8];
    expect(flags & 0x0c).toBe(0);
    expect(flags & 0x20).toBe(0x20);

    // RIFF container size stays consistent with the rewritten payload.
    const riffSize =
      result.bytes[4] |
      (result.bytes[5] << 8) |
      (result.bytes[6] << 16) |
      (result.bytes[7] << 24);
    expect(riffSize).toBe(result.bytes.length - 8);
  });
});

describe('sanitizeImage AVIF handling', () => {
  it('rejects AVIF with 415 until a full item-graph rewriter exists', () => {
    expectValidationError(() => sanitizeImage(buildAvif()), 415);
  });
});
