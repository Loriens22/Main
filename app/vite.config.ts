import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // The mascot lab and icon renderer are dev tools; ship them only when asked.
      input: process.env.MASCOT_LAB
        ? { main: resolve(__dirname, 'index.html'), lab: resolve(__dirname, 'mascot-lab.html') }
        : { main: resolve(__dirname, 'index.html') },
    },
  },
  server: { port: 5173 },
});
