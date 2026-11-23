'use client';

/**
 * Cross-component mutable state shared between the instanced mat layer and the
 * `VisiblePrintPool` (which hides the instanced slot for prints it renders).
 * Kept outside React so per-frame visibility updates never trigger re-renders.
 */

const hiddenIds = new Set<string>();
let version = 0;

export function setHiddenInstancedPhotos(ids: Iterable<string>): void {
  const next = new Set(ids);
  let changed = next.size !== hiddenIds.size;
  if (!changed) {
    for (const id of next) {
      if (!hiddenIds.has(id)) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return;
  hiddenIds.clear();
  for (const id of next) hiddenIds.add(id);
  version += 1;
}

export function clearHiddenInstancedPhotos(): void {
  if (hiddenIds.size === 0) return;
  hiddenIds.clear();
  version += 1;
}

export function isInstancedPhotoHidden(id: string): boolean {
  return hiddenIds.has(id);
}

export function visibilityVersion(): number {
  return version;
}
