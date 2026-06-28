import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Served from https://hohoyo234.github.io/worship-ppt-maker/ (GitHub Pages project site).
  base: '/worship-ppt-maker/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Keep the heavy pptx engine in its own cacheable chunk so the app
        // shell loads fast and only pulls it in when a deck is generated.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('pptxgenjs')) return 'vendor-pptx';
            if (id.includes('pinyin-pro')) return 'vendor-pinyin';
          }
        },
      },
    },
  },
});
