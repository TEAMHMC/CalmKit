import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      base: '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // Do NOT bake API keys into the client bundle here. All AI calls go through
      // the Cloud Run proxy at /api/calmkit. Google Maps key is injected at runtime
      // by nginx via public/config.js (Cloud Run) or left empty for GitHub Pages
      // (map shows watermark; coaching audio still works). No secrets in the bundle.
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
