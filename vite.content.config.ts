import { defineConfig } from 'vite'

// The content script injected into web pages. Content scripts cannot be ES modules, so it is bundled
// on its own as a single classic script, appended to the popup build in dist/.
// It must stay small: certificate parsing happens in the background service worker.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/content/index.ts',
      formats: ['iife'],
      name: 'CertToolContent',
      fileName: () => 'content.js',
    },
  },
})
