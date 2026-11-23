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
    // Three.js is an imperative retained-mode renderer. `useFrame` callbacks
    // and `useMemo`-produced materials/geometries are intentionally mutated
    // outside React's render phase, which the React Compiler purity rules
    // cannot model. Keep the rules active everywhere else.
    files: ['src/components/wall/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
    },
  },
  {
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];

export default config;
