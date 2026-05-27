
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { versionPlugin } from './scripts/vite-version-plugin';

export default defineConfig({
  plugins: [react(), versionPlugin()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'recharts': ['recharts'],
          'katex': ['katex'],
        }
      }
    }
  }
});
