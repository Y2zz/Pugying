import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Temporary shim for shadcn CLI framework detection.
// electron-vite continues to use electron.vite.config.ts.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "frontend"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
