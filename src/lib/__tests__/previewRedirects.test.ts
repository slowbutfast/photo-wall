import { describe, expect, it } from 'vitest';

import { BASE_PATH } from '../basePath';
import { previewRootRedirects } from '../previewRedirects';

describe('previewRootRedirects', () => {
  it('registers temporary, base-path-free redirects into the base path on preview', () => {
    expect(previewRootRedirects('preview')).toEqual([
      { source: '/', destination: BASE_PATH, permanent: false, basePath: false },
      { source: '/admin', destination: `${BASE_PATH}/admin`, permanent: false, basePath: false },
      {
        source: '/admin/:path*',
        destination: `${BASE_PATH}/admin/:path*`,
        permanent: false,
        basePath: false,
      },
    ]);
  });

  it.each(['production', 'development', undefined, ''])(
    'registers nothing for VERCEL_ENV=%s',
    (env) => {
      expect(previewRootRedirects(env)).toEqual([]);
    },
  );
});
