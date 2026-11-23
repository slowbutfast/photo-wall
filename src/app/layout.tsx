import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chiaroscuro Gallery',
  description:
    'A continuous 3D plaster photo wall with overhead track lighting, beveled glass standoff placards, and circadian New York lighting.',
};

/**
 * `100px = 1 world unit` lives in `globals.css` (`--world-scale: 0.01`) and
 * `src/lib/layout/islandLayout.ts`. The default mood matches the chiaroscuro
 * wall base; the SSR `suncalc` mood pass (task 4.5) sets `data-mood` per
 * request in the public page.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-mood="chiaroscuro">
      <body className="gallery-root">{children}</body>
    </html>
  );
}
