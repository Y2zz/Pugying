import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Unit-test config. Runs in a plain Node environment; the `electron` module
 * is aliased to an inert mock so main-process modules load without a real
 * Electron instance. UI components are smoke-tested via react-dom/server
 * SSR, which needs no DOM (jsdom stays available for opt-in via a
 * `@vitest-environment jsdom` docblock).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend'),
      '@auth': path.resolve(__dirname, 'auth'),
      '@shared': path.resolve(__dirname, 'shared'),
      electron: path.resolve(__dirname, 'test/mocks/electron.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'electron/**/*.test.ts',
      'shared/**/*.test.ts',
      'frontend/**/*.test.{ts,tsx}',
      'auth/**/*.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: [
        'electron/**/*.ts',
        'shared/**/*.ts',
        'frontend/**/*.{ts,tsx}',
        'auth/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.test.*',
        'electron/preload/**',
        'frontend/components/ui/**',
        'auth/components/ui/**',
        'frontend/main.tsx',
        'auth/main.tsx',
        'frontend/vite-env.d.ts',
        'auth/vite-env.d.ts',
        'electron/env.d.ts',
      ],
    },
  },
});
