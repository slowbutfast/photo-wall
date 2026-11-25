/**
 * Warms the browser cache (and decoded-image cache) for full-resolution prints.
 *
 * Called on hover and for the neighbours of the focused print so Print Focus
 * can show the sharp image the moment the camera starts moving. Holding the
 * `HTMLImageElement`s keeps the decoded bitmaps alive for a short while.
 */

const MAX_HELD = 8;
const held = new Map<string, HTMLImageElement>();

export function prefetchPrintImage(url: string | null | undefined): void {
  if (!url || typeof Image === 'undefined') return;
  if (held.has(url)) {
    // Refresh recency.
    const existing = held.get(url)!;
    held.delete(url);
    held.set(url, existing);
    return;
  }
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  image.decode?.().catch(() => {
    /* a failed prefetch must never surface; the real <img> will retry */
  });
  held.set(url, image);
  while (held.size > MAX_HELD) {
    const oldest = held.keys().next().value;
    if (oldest === undefined) break;
    held.delete(oldest);
  }
}

/** Test helper. */
export function __heldPrefetchCount(): number {
  return held.size;
}

export function __resetPrefetch(): void {
  held.clear();
}
