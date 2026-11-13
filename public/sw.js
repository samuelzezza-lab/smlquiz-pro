const CACHE_NAME = 'smlquiz-pwa-v19';
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
    // Prima la versione online: evita che il sito installato mostri una vecchia
    // schermata dopo una pubblicazione. La cache serve soltanto se manca rete.
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
          const copy = response.clone();
          await caches.open(CACHE_NAME).then(cache => cache.put('/', copy));
        }
        return response;
      } catch {
        return (await caches.match('/')) ||
          (await caches.match(request)) ||
          (await caches.match('/offline.html')) ||
          new Response('Connessione non disponibile', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
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
