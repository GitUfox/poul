const CACHE = 'poul-v39';

// App shell. Only the HTML is a hard requirement; the rest is best-effort.
const SHELL = [
  './poul-v1.5.html',
  './poul-icon.svg',
  './manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    // The HTML is the one file the app cannot run without — cache it first.
    await cache.add('./poul-v1.5.html');

    // EVERYTHING ELSE IS BEST-EFFORT. cache.addAll() is atomic: a single 404
    // (e.g. a pack that was renamed or removed) rejects the whole install, the
    // new service worker never activates, and the app silently freezes on a
    // stale version. That bug stranded users for several releases. Never again:
    // each non-critical asset is added independently with allSettled.
    await Promise.allSettled(
      SHELL.filter(u => u !== './poul-v1.5.html').map(u => cache.add(u))
    );

    // LAZY PACK CACHING: pre-cache only the pack index and the default deck.
    // Every other pack is cached on first fetch by the stale-while-revalidate
    // handler below. Pre-caching all packs stopped scaling — at 60 cards per
    // pack and dozens of packs, install-time downloads run into megabytes for
    // decks most users never open.
    await Promise.allSettled([
      cache.add('./packs/index.json'),
      cache.add('./packs/phoenix.json'),   // default deck — must work offline
    ]);

    await self.skipWaiting();
  })());
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
