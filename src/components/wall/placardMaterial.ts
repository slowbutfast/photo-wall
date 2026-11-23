/**
 * Placard materials (Curator Settings).
 *
 * `beveled-glass` is the default: translucent green-tinted glass over a frosted
 * backing, matching the playground's "Glass Standoff" placard. The other three
 * are the playground's alternative bases.
 */

export type PlacardMaterial =
  | 'beveled-glass'
  | 'brushed-aluminum'
  | 'matte-black'
  | 'rag-paper';

export const DEFAULT_PLACARD_MATERIAL: PlacardMaterial = 'beveled-glass';

export const PLACARD_MATERIAL_OPTIONS: ReadonlyArray<{
  value: PlacardMaterial;
  label: string;
  hint: string;
}> = [
  { value: 'beveled-glass', label: 'Beveled Glass', hint: 'Frosted standoff glass (default)' },
  { value: 'brushed-aluminum', label: 'Brushed Aluminum', hint: '135° grain, two screws' },
  { value: 'matte-black', label: 'Matte Black', hint: 'Acrylic, low reflectivity' },
  { value: 'rag-paper', label: 'Rag Paper', hint: 'Archival caption card' },
];

export function isPlacardMaterial(value: unknown): value is PlacardMaterial {
  return PLACARD_MATERIAL_OPTIONS.some((option) => option.value === value);
}

const STORAGE_KEY = 'photo-wall:placard-material';

export function readStoredPlacardMaterial(): PlacardMaterial {
  if (typeof window === 'undefined') return DEFAULT_PLACARD_MATERIAL;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isPlacardMaterial(stored) ? stored : DEFAULT_PLACARD_MATERIAL;
  } catch {
    return DEFAULT_PLACARD_MATERIAL;
  }
}

export function storePlacardMaterial(material: PlacardMaterial): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, material);
  } catch {
    // Storage may be unavailable (private mode); the in-memory value still applies.
  }
}
