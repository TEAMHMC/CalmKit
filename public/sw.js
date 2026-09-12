// CalmKit service worker.
//
// The cache name carries a build id that is stamped in automatically by the
// `stamp-sw-build-id` plugin in vite.config.ts at `npm run build`. It is NOT
// maintained by hand: the previous version required a human to edit a date
// string on every deploy, that was missed for 13 consecutive deploys, and the
// result was devices pinned to a months-old app shell.
const BUILD_ID = '__BUILD_ID__';
const CACHE = `calmkit-${BUILD_ID}`;
const PRECACHE = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

// Requests matching these substrings are always fetched from the network —
// never served from the SW cache. API responses, dynamic data, and CDN fonts
// must stay fresh; caching them causes stale coaching content or broken TTS.
const SKIP_CACHE = [
  'generativelanguage.googleapis.com',
  'openweathermap.org',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  // CalmKit backend (TTS, narrative, weather, air quality)
  'volunteer.healthmatters.clinic/api/calmkit',
  // Google Maps JS API and tile requests
  'maps.googleapis.com',
  'maps.gstatic.com',
];

// Unhashed, same-origin files whose contents change from build to build.
// These MUST be network-first: serving a stale copy of index.html points the
// browser at a previous build's hashed bundle, which is how fixed bugs
// (repeated coaching cues, broken route tracking, a rotated Maps key) come back.
const ALWAYS_REVALIDATE = ['/', '/index.html', '/config.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first: always try the network, fall back to cache only when offline.
function networkFirst(request) {
  return fetch(request)
    .then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
      }
      return res;
    })
    .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')));
}

// Cache-first: only safe for content-hashed files, whose URL changes when the
// bytes change, so a cache hit can never be stale.
function cacheFirst(request) {
  return caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
      }
      return res;
    });
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (SKIP_CACHE.some(h => e.request.url.includes(h))) return;

  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Page loads must never come from cache while the network is reachable.
  if (e.request.mode === 'navigate' || (sameOrigin && ALWAYS_REVALIDATE.includes(url.pathname))) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Vite emits /assets/<name>-<contenthash>.js — immutable, safe to serve from cache.
  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // Everything else (icons, images): cache-first, refreshed on the next build
  // because the cache name changes with BUILD_ID.
  e.respondWith(cacheFirst(e.request));
});
