import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

/** content hash per model (render/Assets.ts adds it to the model's URL) */
function modelHashes() {
  const dir = 'public/assets/models';
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.glb')) out[f.slice(0, -4)] = createHash('sha1').update(fs.readFileSync(`${dir}/${f}`)).digest('hex').slice(0, 10);
  }
  return out;
}

export default defineConfig({
  base: './',
  define: { __MODEL_HASHES__: JSON.stringify(modelHashes()) },
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
