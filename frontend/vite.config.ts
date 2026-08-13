import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readProductVersion } = require('../scripts/release-identity');
const productVersion = readProductVersion();

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __SCRIPTCUT_PRODUCT_VERSION__: JSON.stringify(productVersion),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
