import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webDir = path.dirname(fileURLToPath(import.meta.url));

/** Bundle shared TS sources as ESM. Workspace `dist/` is CommonJS and breaks browser `import { API_NAME }`. */
export default defineConfig({
  // Default root is process.cwd(); npm -w may use monorepo root on CI, breaking outDir location.
  root: webDir,
  build: {
    // Absolute so output never follows an unexpected cwd; avoids root ./dist vs apps/web/dist.
    outDir: path.resolve(webDir, 'dist'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@foretrace/shared': path.resolve(webDir, '../../packages/shared/src/index.ts'),
    },
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/organizations': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
