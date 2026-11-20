const CACHE_NAME = 'smlquiz-pwa-v29';
const APP_SHELL = [
  '/',
  '/app.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.svg',
  '/icon-512.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
];
const APP_PATHS = new Set([
  '/quiz', '/dashboard', '/account', '/account/', '/esperienze-esame',
  '/experiences', '/studio', '/review', '/progress', '/leaderboard',
  '/calculator', '/legal', '/settings', '/compra-quiz',
  '/semestre-filtro', '/semestre-filtro/'
]);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('smlquiz-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        const appRoute = APP_PATHS.has(url.pathname);
        const fallback = appRoute
          ? (await cache.match(request)) || (await cache.match('/app.html'))
          : (await cache.match(request)) || (await cache.match('/'));
        return fallback ||
          (await cache.match('/offline.html')) ||
          new Response('Connessione non disponibile', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
        }
        return response;
      }).catch(() => new Response('', { status: 503, statusText: 'Offline' }));
    })
  );
});
