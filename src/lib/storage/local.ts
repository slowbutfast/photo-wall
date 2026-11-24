import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { withBase } from '@/lib/basePath';

import type { StorageAdapter } from './types';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

export function contentTypeForPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}

/**
 * Resolves a URL path segment list to a file inside `rootDir`, or null when it
 * escapes the root (path traversal) or contains invalid segments.
 */
export function resolveLocalUploadPath(rootDir: string, segments: string[]): string | null {
  if (segments.length === 0) return null;
  for (const segment of segments) {
    if (
      segment.length === 0 ||
      segment === '.' ||
      segment === '..' ||
      segment.includes('/') ||
      segment.includes('\\') ||
      segment.includes('\0')
    ) {
      return null;
    }
  }
  const root = resolve(rootDir);
  const target = resolve(root, ...segments);
  if (target !== root && !target.startsWith(`${root}${sep}`)) return null;
  return target;
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir);
  }

  private filePath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    const resolved = resolveLocalUploadPath(this.rootDir, segments);
    if (!resolved) {
      throw new Error(`Invalid storage path: ${path}`);
    }
    return resolved;
  }

  async putObject(path: string, body: Uint8Array, _contentType: string): Promise<void> {
    const target = this.filePath(path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async deleteObject(path: string): Promise<void> {
    try {
      await unlink(this.filePath(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }

  async deletePrefix(path: string): Promise<void> {
    const target = this.filePath(path);
    await rm(target, { recursive: true, force: true });
  }

  async purgeWildcard(_path: string): Promise<void> {
    // The local adapter serves straight from disk: nothing to purge.
  }

  publicUrl(path: string): string {
    return withBase(`/api/local-uploads/${path.replace(/^\/+/, '')}`);
  }
}
