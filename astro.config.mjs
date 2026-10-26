// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Glyph is a fully static, client-rendered site (PRD §9.1): no adapter, no SSR.
export default defineConfig({
  integrations: [react()],
  build: {
    // Small stylesheets are inlined into the HTML: one less request before first paint.
    inlineStylesheets: 'auto',
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // three.js is large by nature; it is split into its own long-lived, cacheable chunk
      // and loaded in parallel with the UI, so the warning threshold is raised for it only.
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three/')) return 'three';
          },
        },
      },
    },
  },
});
