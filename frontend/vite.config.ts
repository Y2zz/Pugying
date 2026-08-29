import path from 'path';
import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backendPackage = JSON.parse(
  readFileSync(path.resolve(__dirname, '../backend/package.json'), 'utf8'),
) as { version: string };

// 统一发版：前端构建版本与 backend/package.json 对齐
process.env.VITE_PRODUCT_VERSION = backendPackage.version;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
