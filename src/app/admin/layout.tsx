import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './studio.css';

export const metadata: Metadata = {
  title: 'Curator Studio — Chiaroscuro Gallery',
  robots: { index: false, follow: false },
};

/**
 * Studio shell. `src/proxy.ts` is the fail-closed gate; this layout only owns
 * the noindex metadata and the Studio stylesheet. Request-time checks live in
 * `page.tsx` / `login/page.tsx` behind `<Suspense>` + `connection()`.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin-root">{children}</div>;
}
