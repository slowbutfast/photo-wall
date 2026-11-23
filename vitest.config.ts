import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL: 'file::memory:',
      ADMIN_PASSWORD: 'test-password',
      AUTH_SECRET: 'test-secret-that-is-long-enough-for-hs256-signing',
      STORAGE_DRIVER: 'local',
      LOCAL_UPLOAD_DIR: './data/test-uploads',
    },
  },
});
