import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Two build targets from one source:
 *
 *   `vite build`               → apps/tablet/dist, a normal PWA you can host.
 *   `vite build --mode single` → apps/tablet/dist-single/index.html, one
 *                                self-contained file with every asset inlined,
 *                                for offline install and for publishing.
 */
export default defineConfig(({ mode }) => {
  const single = mode === 'single';

  return {
    plugins: [react(), ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      __ORNIGHT_SINGLE_FILE__: JSON.stringify(single),
      __ORNIGHT_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
    },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      target: 'es2022',
      // Inline every asset in single-file mode; the splash background and icon
      // must survive as data URIs with no network fetch.
      assetsInlineLimit: single ? 100 * 1024 * 1024 : 4096,
      cssCodeSplit: !single,
      chunkSizeWarningLimit: 4096,
    },
    server: {
      host: true,
      port: 5183,
    },
  };
});
