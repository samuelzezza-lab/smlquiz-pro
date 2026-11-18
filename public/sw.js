const CACHE_NAME = 'smlquiz-pwa-v27';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.svg',
  '/icon-512.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
];

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
  // Non intercettare API Supabase, pagamenti o risorse di altri domini.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Mostra subito l'ultima app shell disponibile; aggiorna la cache in
    // background, così il ritorno da un'altra app non resta in attesa della rete.
    const cachePromise = caches.open(CACHE_NAME);
    const networkPromise = fetch(request, { cache: 'no-store' }).then(async response => {
      if (response.ok) {
        const cache = await cachePromise;
        await cache.put('/', response.clone());
      }
      return response;
    });
    event.waitUntil(networkPromise.then(() => undefined).catch(() => undefined));
    event.respondWith(cachePromise.then(async cache => {
      const cached = await cache.match('/');
      if (cached) return cached;
      try {
        return await networkPromise;
      } catch {
        return (await cache.match(request)) ||
          (await cache.match('/offline.html')) ||
          new Response('Connessione non disponibile', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    }));
    return;
  }

  // Le risorse statiche con nome versionato restano disponibili offline.
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
