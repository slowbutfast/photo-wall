/**
 * Minimal ambient typings for `troika-three-text@0.53` (the package ships
 * `.d.ts` files under `dist/types` but no package-level `types` entry, so a
 * module declaration is required for `strict` TypeScript).
 */

declare module 'troika-three-text' {
  import type { Mesh } from 'three';

  export class Text extends Mesh {
    text: string;
    anchorX: number | string;
    anchorY: number | string;
    font: string | null;
    fontSize: number;
    fontWeight: string | number;
    fontStyle: 'normal' | 'italic';
    letterSpacing: number;
    lineHeight: number | string;
    maxWidth: number;
    overflowWrap: 'normal' | 'break-word';
    textAlign: 'left' | 'center' | 'right' | 'justify';
    whiteSpace: 'normal' | 'nowrap';
    color: unknown;
    material: {
      depthWrite: boolean;
      transparent: boolean;
      toneMapped: boolean;
      [key: string]: unknown;
    };
    sync(callback?: () => void): void;
    dispose(): void;
  }
}
