/**
 * Task 1.3 — disk-cached `?width=256|800|2048` derivatives
 * (`src/app/api/local-uploads/[...path]/route.ts`, Task 2.1).
 *
 * `STORAGE_DRIVER=local` must never make a visitor decode 2,000 originals at
 * macro zoom. The route serves bucket-snapped derivatives generated on demand
 * with `sharp`, caches them on disk, and keeps the sanitized original file as
 * the canonical untouched object (byte-for-byte).
 *
 * Cache location contract: `LOCAL_UPLOAD_CACHE_DIR` when set, otherwise
 * `.cache/local-uploads` relative to the process cwd.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { GET as getLocalUpload } from '@/app/api/local-uploads/[...path]/route';

const ORIGINAL_WIDTH = 3200;
const ORIGINAL_HEIGHT = 2400;

let root: string;
let uploadDir: string;
let cacheDir: string;
let originalJpeg: Buffer;
let portraitJpeg: Buffer;

function request(segments: string[], query = ''): Promise<Response> {
  const url = `http://localhost:3000/api/local-uploads/${segments.join('/')}${query}`;
  return getLocalUpload(new Request(url), { params: Promise.resolve({ path: segments }) });
}

async function responseBuffer(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const info = await stat(full).catch(() => null);
    if (info?.isFile()) files.push(full);
  }
  return files.sort();
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'local-uploads-test-'));
  uploadDir = path.join(root, 'uploads');
  cacheDir = path.join(root, 'cache');
  await mkdir(path.join(uploadDir, 'albums', 'a1'), { recursive: true });

  originalJpeg = await sharp({
    create: {
      width: ORIGINAL_WIDTH,
      height: ORIGINAL_HEIGHT,
      channels: 3,
      background: { r: 122, g: 96, b: 70 },
    },
  })
    .jpeg({ quality: 82 })
    .toBuffer();

  portraitJpeg = await sharp({
    create: {
      width: 2400,
      height: 3200,
      channels: 3,
      background: { r: 60, g: 74, b: 96 },
    },
  })
    .jpeg({ quality: 82 })
    .toBuffer();

  await writeFile(path.join(uploadDir, 'albums', 'a1', 'p1.jpg'), originalJpeg);
  await writeFile(path.join(uploadDir, 'albums', 'a1', 'portrait.jpg'), portraitJpeg);

  process.env.LOCAL_UPLOAD_DIR = uploadDir;
  process.env.LOCAL_UPLOAD_CACHE_DIR = cacheDir;
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('GET /api/local-uploads without a derivative query', () => {
  it('streams the canonical original byte-for-byte', async () => {
    const response = await request(['albums', 'a1', 'p1.jpg']);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');

    const body = await responseBuffer(response);
    expect(body.equals(originalJpeg)).toBe(true);
    expect(response.headers.get('content-length')).toBe(String(originalJpeg.byteLength));
  });
});

describe('GET /api/local-uploads?width= disk-cached derivatives', () => {
  it('serves 256 / 800 / 2048 buckets with the source aspect ratio', async () => {
    for (const width of [256, 800, 2048] as const) {
      const response = await request(['albums', 'a1', 'p1.jpg'], `?width=${width}`);
      expect(response.status, `width=${width}`).toBe(200);
      expect(response.headers.get('content-type'), `width=${width}`).toBe('image/jpeg');

      const body = await responseBuffer(response);
      const metadata = await sharp(body).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.width).toBe(width);
      expect(metadata.height).toBe(Math.round((ORIGINAL_HEIGHT / ORIGINAL_WIDTH) * width));
      expect(body.byteLength).toBeLessThan(originalJpeg.byteLength);
    }
  });

  it('supports ?height= for portrait sources', async () => {
    const response = await request(['albums', 'a1', 'portrait.jpg'], '?height=800');
    expect(response.status).toBe(200);
    const metadata = await sharp(await responseBuffer(response)).metadata();
    expect(metadata.height).toBe(800);
    expect(metadata.width).toBe(Math.round((2400 / 3200) * 800));
  });

  it('never rewrites the sanitized original', async () => {
    const originalPath = path.join(uploadDir, 'albums', 'a1', 'p1.jpg');
    const before = await stat(originalPath);

    await request(['albums', 'a1', 'p1.jpg'], '?width=800');
    await request(['albums', 'a1', 'p1.jpg'], '?width=2048');

    const after = await stat(originalPath);
    expect(after.size).toBe(before.size);
    expect(await readFile(originalPath)).toEqual(originalJpeg);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it('writes derivatives into the cache directory, not next to the original', async () => {
    await request(['albums', 'a1', 'p1.jpg'], '?width=256');
    await request(['albums', 'a1', 'p1.jpg'], '?width=800');

    const cached = await listFiles(cacheDir);
    expect(cached.length).toBeGreaterThanOrEqual(2);
    for (const file of cached) {
      expect(file.startsWith(cacheDir)).toBe(true);
    }

    const uploads = await listFiles(uploadDir);
    expect(uploads.sort()).toEqual(
      [
        path.join(uploadDir, 'albums', 'a1', 'p1.jpg'),
        path.join(uploadDir, 'albums', 'a1', 'portrait.jpg'),
      ].sort(),
    );
  });

  it('reuses the cached derivative instead of re-encoding it', async () => {
    const first = await request(['albums', 'a1', 'p1.jpg'], '?width=800');
    const firstBody = await responseBuffer(first);
    const cached = (await listFiles(cacheDir)).filter((file) => file.endsWith('.jpg'));
    expect(cached.length).toBeGreaterThan(0);

    const cacheStats = await Promise.all(cached.map((file) => stat(file)));
    await new Promise((resolve) => setTimeout(resolve, 30));

    const second = await request(['albums', 'a1', 'p1.jpg'], '?width=800');
    const secondBody = await responseBuffer(second);

    expect(second.status).toBe(200);
    expect(secondBody.equals(firstBody)).toBe(true);

    const afterStats = await Promise.all(cached.map((file) => stat(file)));
    for (let index = 0; index < cached.length; index += 1) {
      expect(afterStats[index].mtimeMs).toBe(cacheStats[index].mtimeMs);
    }
  });

  it('treats a non-bucket width as no derivative request (original stays canonical)', async () => {
    const response = await request(['albums', 'a1', 'p1.jpg'], '?width=500');
    expect(response.status).toBe(200);
    expect((await responseBuffer(response)).equals(originalJpeg)).toBe(true);

    const garbage = await request(['albums', 'a1', 'p1.jpg'], '?width=abc');
    expect(garbage.status).toBe(200);
    expect((await responseBuffer(garbage)).equals(originalJpeg)).toBe(true);
  });

  it('still rejects path traversal and missing files when a width is requested', async () => {
    const traversal = await request(['..', '..', 'etc', 'passwd'], '?width=256');
    expect(traversal.status).toBe(404);

    const missing = await request(['albums', 'a1', 'nope.jpg'], '?width=256');
    expect(missing.status).toBe(404);
  });
});
