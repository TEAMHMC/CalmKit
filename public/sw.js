// Cache version — increment this string whenever the app shell changes so
// users get fresh assets on next install instead of serving stale content.
// Format: calmkit-vYYYYMMDD — update date on each production deploy.
const CACHE = 'calmkit-v20260711';
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

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (SKIP_CACHE.some(h => e.request.url.includes(h))) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached); // offline fallback
      // Return cache immediately if available, update in background
      return cached || networkFetch;
    })
  );
});
