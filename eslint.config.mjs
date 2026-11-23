import js from '@eslint/js';
import next from 'eslint-config-next';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'data/**',
      'next-env.d.ts',
      'playgrounds/**',
      'public/**',
      'openspec/**',
    ],
  },
  js.configs.recommended,
  ...next,
  {
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];

export default config;
