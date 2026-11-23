import { readFile } from 'node:fs/promises';

import { getLocalUploadDir } from '@/lib/storage';
import { contentTypeForPath, resolveLocalUploadPath } from '@/lib/storage/local';

const NOT_FOUND = new Response('Not found', { status: 404 });

/**
 * Streams locally stored uploads (`next start` freezes `public/` at build time,
 * so files must be served through a route handler).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const target = resolveLocalUploadPath(getLocalUploadDir(), path ?? []);
  if (!target) return NOT_FOUND;

  try {
    const file = await readFile(target);
    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        'Content-Type': contentTypeForPath(target),
        'Content-Length': String(file.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NOT_FOUND;
  }
}
