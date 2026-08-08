import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // Do NOT bake secrets into the client bundle. All AI calls go through the
      // Cloud Run proxy at /api/calmkit, so the Gemini key never ships.
      //
      // The Google Maps *browser* key is the one exception, and it is not a secret:
      // it is sent in the page by every Maps site on the web and cannot be hidden.
      // It is protected by HTTP referrer restrictions in GCP, not by omission.
      // Leaving it out did not make anything safer, it just loaded Maps unkeyed on
      // GitHub Pages, which is what produced the "development purposes only"
      // watermark. nginx envsubst into public/config.js only runs on Cloud Run.
      define: {
        'process.env.GOOGLE_MAPS_API_KEY': JSON.stringify(env.GOOGLE_MAPS_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
