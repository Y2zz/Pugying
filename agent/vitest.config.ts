import path from 'path';
import { defineConfig } from 'vitest/config';

/**
 * Unit-test config. Runs in a plain Node environment; the `electron` module
 * is aliased to an inert mock so main-process modules load without a real
 * Electron instance. UI components are smoke-tested via react-dom/server
 * SSR, which needs no DOM (jsdom stays available for opt-in via a
 * `@vitest-environment jsdom` docblock).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
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
      'src/**/*.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['electron/**/*.ts', 'shared/**/*.ts', 'src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.*',
        'electron/preload/**',
        'src/components/ui/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'electron/env.d.ts',
      ],
    },
  },
});
