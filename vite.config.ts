import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Relative base so the production build can be hosted from any sub-path (or opened via a static server).
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 0 },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
  server: { port: 5173 },
});
