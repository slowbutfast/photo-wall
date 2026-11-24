/**
 * Placard materials (Curator Settings), mapped to the playground's real CSS
 * classes (`playgrounds/photo_wall_playground.html`, `dcc7a048`).
 *
 * The values are the class suffixes used by `.museum-placard.mat-*`; the labels
 * are the visitor-facing Curator Settings names.
 */

export type PlacardMaterial = 'acrylic' | 'aluminum' | 'foamcore';

export const DEFAULT_PLACARD_MATERIAL: PlacardMaterial = 'acrylic';

export const PLACARD_MATERIAL_OPTIONS: ReadonlyArray<{
  value: PlacardMaterial;
  label: string;
  hint: string;
}> = [
  { value: 'acrylic', label: 'Beveled Glass', hint: 'Translucent standoff glass (default)' },
  { value: 'aluminum', label: 'Brushed Aluminum', hint: 'Linear metal grain + 3mm black core' },
  { value: 'foamcore', label: 'Archival Foamcore', hint: 'Matte black board + white ink' },
];

export function isPlacardMaterial(value: unknown): value is PlacardMaterial {
  return PLACARD_MATERIAL_OPTIONS.some((option) => option.value === value);
}

const STORAGE_KEY = 'photo-wall:placard-material';

/** Previous client-local keys (`beveled-glass`, `matte-black`, `rag-paper`). */
const LEGACY_ALIASES: Record<string, PlacardMaterial> = {
  'beveled-glass': 'acrylic',
  'brushed-aluminum': 'aluminum',
  'matte-black': 'foamcore',
  'rag-paper': 'foamcore',
};

export function readStoredPlacardMaterial(): PlacardMaterial {
  if (typeof window === 'undefined') return DEFAULT_PLACARD_MATERIAL;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isPlacardMaterial(stored)) return stored;
    if (stored && LEGACY_ALIASES[stored]) return LEGACY_ALIASES[stored];
    return DEFAULT_PLACARD_MATERIAL;
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
