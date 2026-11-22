import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { execSync } from 'node:child_process';

// build tag shown in the menus: the commit (on GitHub Actions) or the local checkout's, with the build date
const sha = (process.env.GITHUB_SHA || (() => { try { return execSync('git rev-parse HEAD').toString().trim(); } catch { return 'dev'; } })()).slice(0, 7);
const BUILD = `${sha} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

// Relative base so the production build can be hosted from any sub-path (or opened via a static server).
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [preact()],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 0 },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
  server: { port: 5173 },
});
