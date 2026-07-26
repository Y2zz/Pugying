import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';

const shared = {
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
};

/**
 * The renderer CSP (`script-src 'self'`) blocks the inline react-refresh
 * preamble that @vitejs/plugin-react injects during dev. Strip the meta tag
 * in dev only — production builds keep the strict CSP.
 */
function dropCspInDev(): Plugin {
  return {
    name: 'drop-csp-in-dev',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        /<meta[^>]*http-equiv="Content-Security-Policy"[\s\S]*?\/>\s*/i,
        '',
      );
    },
  };
}

export default defineConfig({
  main: {
    ...shared,
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'electron/main/index.ts'),
        },
      },
    },
  },
  preload: {
    ...shared,
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'electron/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: '.',
    base: './',
    plugins: [react(), tailwindcss(), dropCspInDev()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, 'shared'),
      },
    },
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
      },
    },
  },
});
