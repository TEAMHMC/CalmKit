import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Stamps a unique build id into dist/sw.js so the service worker cache name
// changes on every deploy. Previously the cache name was a hand-edited date
// string; it went unchanged across 13 deploys, so installed PWAs kept serving
// a stale app shell and long-fixed bugs reappeared for users.
function stampSwBuildId() {
  return {
    name: 'stamp-sw-build-id',
    closeBundle() {
      const swPath = path.resolve(__dirname, 'dist/sw.js');
      if (!fs.existsSync(swPath)) {
        throw new Error('stamp-sw-build-id: dist/sw.js not found after build');
      }
      const src = fs.readFileSync(swPath, 'utf8');
      if (!src.includes('__BUILD_ID__')) {
        throw new Error('stamp-sw-build-id: __BUILD_ID__ placeholder missing from sw.js');
      }
      const buildId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
      fs.writeFileSync(swPath, src.replace(/__BUILD_ID__/g, buildId));
      console.log(`stamp-sw-build-id: service worker cache set to calmkit-${buildId}`);
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), stampSwBuildId()],
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
