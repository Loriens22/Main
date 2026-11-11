import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // E2E_FS_ALLOW: the e2e runner's source snapshots link node_modules from the repository (fonts load from there)
  server: { host: true, port: 5173, ...(process.env.E2E_FS_ALLOW ? { fs: { allow: ['.', process.env.E2E_FS_ALLOW] } } : {}) },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as any);
