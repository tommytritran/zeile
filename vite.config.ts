import { defineConfig } from 'vite';
export default defineConfig({
  root: 'webview', base: './',
  build: { outDir: '../dist/webview', emptyOutDir: true, rollupOptions: {
    output: { entryFileNames: 'app.js', chunkFileNames: 'chunk-[hash].js', assetFileNames: 'app.[ext]' }
  } }
});
