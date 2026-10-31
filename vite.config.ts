import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Builds the popup and the background service worker (an ES module, see manifest.json).
// The content script needs a classic script and is built separately by vite.content.config.ts.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        background: 'src/background/index.ts',
      },
      output: {
        // manifest.json refers to the service worker by a fixed name.
        entryFileNames: chunk => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        // The parsing code both entries use; otherwise named after whichever of its modules Rollup picks.
        chunkFileNames: 'assets/shared-[hash].js',
      },
    },
  },
})
