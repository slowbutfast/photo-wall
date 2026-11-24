import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import sharp from 'sharp';

import { getLocalUploadDir } from '@/lib/storage';
import { contentTypeForPath, resolveLocalUploadPath } from '@/lib/storage/local';

const notFound = () => new Response('Not found', { status: 404 });

/**
 * Image LOD buckets served at read time. `128` was deliberately dropped: the
 * renderer snaps projected size (`ceil(cellPx * scale * DPR)`) to these three
 * widths only, so a bucket never has to be guessed.
 */
const WIDTH_BUCKETS = new Set([256, 800, 2048]);
const HEIGHT_BUCKETS = new Set([256, 800, 2048]);

const DERIVABLE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

interface DerivativeRequest {
  /** Longest-edge bucket, or null when the query is not a bucket request. */
  width: number | null;
  height: number | null;
}

function parseDerivative(searchParams: URLSearchParams): DerivativeRequest {
  const parse = (name: string, buckets: Set<number>): number | null => {
    const raw = searchParams.get(name);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isInteger(value) && buckets.has(value) ? value : null;
  };
  return { width: parse('width', WIDTH_BUCKETS), height: parse('height', HEIGHT_BUCKETS) };
}

/** `LOCAL_UPLOAD_CACHE_DIR`, else `.cache/local-uploads` under the cwd. */
export function getDerivativeCacheDir(): string {
  // The deployment override is passed through verbatim; the default is a
  // statically-scoped path so the bundler never traces the whole project.
  const override = process.env.LOCAL_UPLOAD_CACHE_DIR;
  if (override && override.trim().length > 0) return override;
  return path.join(process.cwd(), '.cache', 'local-uploads');
}

/**
 * Deterministic cache path for one derivative: the original's path mirrored
 * under the cache root with a bucket suffix, so two requests for the same
 * bucket reuse one file and the canonical original is never touched.
 */
function derivativePath(
  uploadRoot: string,
  originalPath: string,
  request: DerivativeRequest,
): string | null {
  const relative = path.relative(path.resolve(uploadRoot), originalPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const suffix =
    request.width !== null ? `w${request.width}` : request.height !== null ? `h${request.height}` : null;
  if (!suffix) return null;
  return path.join(getDerivativeCacheDir(), `${relative}@${suffix}.${outputExtension(originalPath)}`);
}

function outputExtension(originalPath: string): string {
  const source = originalPath.split('.').pop()?.toLowerCase() ?? 'jpeg';
  if (source === 'jpeg' || source === 'jpg') return 'jpg';
  if (source === 'png') return 'png';
  if (source === 'avif') return 'avif';
  return 'webp';
}

function contentTypeForExtension(extension: string): string {
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'avif':
      return 'image/avif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

async function buildDerivative(source: Buffer, request: DerivativeRequest, originalPath: string) {
  const resized = sharp(source).rotate();
  const pipeline =
    request.width !== null ? resized.resize({ width: request.width }) : resized.resize({ height: request.height! });

  switch (outputExtension(originalPath)) {
    case 'png':
      return pipeline.png().toBuffer();
    case 'avif':
      return pipeline.avif({ quality: 55 }).toBuffer();
    case 'webp':
      return pipeline.webp({ quality: 82 }).toBuffer();
    default:
      return pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  }
}

function imageResponse(body: Uint8Array, contentType: string): Response {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function originalResponse(body: Uint8Array, target: string): Response {
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': contentTypeForPath(target),
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Streams locally stored uploads (`next start` freezes `public/` at build time,
 * so files must be served through a route handler).
 *
 * `?width=256|800|2048` (or `?height=`) serves a disk-cached derivative built
 * on demand with `sharp`. The sanitized original stays canonical and is never
 * rewritten: derivatives live under `LOCAL_UPLOAD_CACHE_DIR` (default
 * `.cache/local-uploads`). Non-bucket values, non-image files and undecodable
 * bytes fall through to the original so a bad query can never 500 the wall.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await context.params;
  const uploadRoot = getLocalUploadDir();
  const target = resolveLocalUploadPath(uploadRoot, segments ?? []);
  if (!target) return notFound();

  let original: Buffer;
  try {
    original = await readFile(target);
  } catch {
    return notFound();
  }

  const extension = target.split('.').pop()?.toLowerCase() ?? '';
  const derivative = parseDerivative(new URL(request.url).searchParams);
  const wantsDerivative = derivative.width !== null || derivative.height !== null;
  if (!wantsDerivative || !DERIVABLE_EXTENSIONS.has(extension)) {
    return originalResponse(original, target);
  }

  const cachePath = derivativePath(uploadRoot, target, derivative);
  if (!cachePath) return originalResponse(original, target);

  const contentType = contentTypeForExtension(outputExtension(target));

  try {
    const cached = await readFile(cachePath);
    return imageResponse(cached, contentType);
  } catch {
    // Cache miss: build the derivative below.
  }

  let derivativeBytes: Buffer;
  try {
    derivativeBytes = await buildDerivative(original, derivative, target);
  } catch {
    // Not a decodable image after all: keep serving the canonical original.
    return originalResponse(original, target);
  }

  try {
    await mkdir(path.dirname(cachePath), { recursive: true });
    // Atomic temp-file + rename: a concurrent request can never read a
    // half-written derivative, and a crash leaves only an orphan temp file.
    const tempPath = `${cachePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, derivativeBytes);
      await rename(tempPath, cachePath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  } catch {
    // A read-only cache still serves the derivative; it is just not reused.
  }

  return imageResponse(derivativeBytes, contentType);
}
