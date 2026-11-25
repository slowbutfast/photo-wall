import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chiaroscuro Gallery',
  description:
    'A continuous 3D plaster photo wall with overhead track lighting, beveled glass standoff placards, and circadian New York lighting.',
};

/**
 * `viewport-fit=cover` is what makes `env(safe-area-inset-*)` non-zero on iOS;
 * the HUD's `max(…, env(…))` offsets depend on it. Zoom is deliberately left
 * alone (no `maximumScale` / `userScalable: false`), so visitors can still
 * magnify text.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * `100px = 1 world unit` lives in `globals.css` (`--world-scale: 0.01`) and
 * `src/lib/layout/islandLayout.ts`. The public page sets the playground mood
 * variables per request; the scoped `playground-wall.css` owns every wall/HUD
 * surface.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-mood="chiaroscuro">
      <body className="gallery-root">{children}</body>
    </html>
  );
}
