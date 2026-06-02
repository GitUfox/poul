const CACHE = 'poul-v12';

// App shell — cache-first, never stale
const SHELL = [
  './poul-v1.5.html',
  './poul-icon.svg',
  './manifest.json',
];

// Pack data — pre-cached, stale-while-revalidate
const PACKS = [
  './packs/index.json',
  './packs/phoenix.json',
  './packs/nyc.json',
  './packs/istanbul.json',
  './packs/brussels.json',
  './packs/hamptons.json',
  './packs/paris.json',
  './packs/oslo.json',
  './packs/baltimore.json',
  './packs/ocean-city.json',
  './packs/dc.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll([...SHELL, ...PACKS]))
  );
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
  if (!e.request.url.startsWith(self.location.origin)) return;

  const url = new URL(e.request.url);

  // Stale-while-revalidate for pack JSON files
  // Serve cached version immediately, update cache in background for next visit
  if (url.pathname.includes('/packs/')) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const network = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => null);
          return cached || network;
        })
      )
    );
    return;
  }

  // Cache-first for app shell
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (e.request.method === 'GET' && res.ok) {
          caches.open(CACHE).then(cache => cache.put(e.request, res.clone()));
        }
        return res;
      });
    }).catch(() => caches.match('./poul-v1.5.html'))
  );
});
