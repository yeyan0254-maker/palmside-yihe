import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isSingleFile = process.env.SINGLE_FILE === 'true';

export default defineConfig({
  base: './',
  plugins: isSingleFile ? [viteSingleFile()] : [],
  build: {
    outDir: isSingleFile ? 'dist-single' : 'dist',
    emptyOutDir: true,
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        passes: 2,
        drop_debugger: true,
      },
      format: {
        comments: false,
      },
    },
    chunkSizeWarningLimit: 3200,
    rollupOptions: isSingleFile
      ? {}
      : {
          output: {
            manualChunks: {
              three: ['three'],
            },
          },
        },
  },
});
