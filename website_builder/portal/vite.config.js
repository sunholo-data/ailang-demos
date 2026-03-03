import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './', // relative paths for GitHub Pages deployment
  server: {
    port: 5174, // avoid colliding with other Vite instances on 5173
  },
  optimizeDeps: {
    exclude: ['firebase'] // firebase uses dynamic imports
  },
  build: {
    // Don't copy public/ into dist — WASM binary is large (>10MB) and served separately.
    // For GitHub Pages deploy: copy public/ alongside dist/ manually.
    copyPublicDir: false,
  }
});
