// Runway service worker: an offline shell. Session writes made offline are queued by the app
// itself (src/lib/offline.ts); this only makes sure the app opens without a connection.
//
//   pages       network first, falling back to the cached app shell
//   /assets/*   cache first (file names are content-hashed, so they never change)
//
// Everything else (Supabase, Spotify) goes straight to the network.

// Filled in at build time (vite.config.ts): a new build means a new cache, and the old one is deleted.
const CACHE = 'runway-__BUILD__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Every file in the build, so views that haven't been opened yet work offline too.
      await cache.addAll(['./', 'manifest.webmanifest', ...PRECACHE]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './'));
  } else if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req, fallbackKey) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(fallbackKey, res.clone());
    return res;
  } catch {
    return (await cache.match(fallbackKey, { ignoreVary: true, ignoreSearch: true })) ?? Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  // Vite's tags are crossorigin, so requests carry an Origin header; ignore Vary: Origin when matching.
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

// Tapping the "break's over" notification brings Runway back.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (all.length) return all[0].focus();
      return self.clients.openWindow('./#/focus');
    })(),
  );
});
