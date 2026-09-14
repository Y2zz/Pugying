import path from 'path';
import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const serverPackage = JSON.parse(
  readFileSync(path.resolve(__dirname, '../server/package.json'), 'utf8'),
) as { version: string };
process.env.VITE_PRODUCT_VERSION = serverPackage.version;
// 桌面端 loadFile / custom protocol 统一用 Hash 路由
process.env.VITE_ROUTER_MODE = 'hash';

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
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'electron/preload/index.ts'),
          app: path.resolve(__dirname, 'electron/preload/app.ts'),
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
        '@': path.resolve(__dirname, 'frontend'),
        '@shell': path.resolve(__dirname, 'shell'),
        '@shared': path.resolve(__dirname, 'shared'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'index.html'),
          shell: path.resolve(__dirname, 'shell.html'),
        },
      },
    },
  },
});
