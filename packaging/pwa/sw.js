/* eslint-disable no-restricted-globals */
/**
 * Ornight Plus service worker.
 *
 * Three caching strategies, chosen by what the request actually is:
 *
 *   navigation        network-first, falling back to the cached shell, then to
 *                     offline.html. Keeps the installed app current when there
 *                     is a network and instantly usable when there is not.
 *   hashed assets     cache-first and never revalidated — Vite fingerprints the
 *                     filename, so a changed file is a different URL.
 *   everything else   stale-while-revalidate.
 *
 * `__ORNIGHT_VERSION__` and `__ORNIGHT_PRECACHE__` are substituted by
 * packaging/build-dist.mjs at build time. Running this file unsubstituted is
 * safe: the version falls back to "dev" and the precache list to the shell.
 */

const VERSION = '__ORNIGHT_VERSION__';
const CACHE = `ornight-${VERSION === '__ORNIGHT_' + 'VERSION__' ? 'dev' : VERSION}`;

/** Injected at build time: every hashed asset plus the shell. */
const PRECACHE = /** @type {string[]} */ (
  (() => {
    const injected = '__ORNIGHT_PRECACHE__';
    if (injected.startsWith('[')) {
      try {
        return JSON.parse(injected);
      } catch {
        /* fall through to the minimal shell */
      }
    }
    return ['./', './index.html', './offline.html', './manifest.webmanifest'];
  })()
);

const OFFLINE_URL = './offline.html';
const SHELL_URL = './index.html';

/** Vite emits `name-<8+ hex/base64ish>.ext`; those are content-addressed. */
const HASHED = /\.[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpg|jpeg|webp|avif|svg|ico)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll is all-or-nothing; one 404 in a generated list would leave the
      // app permanently uninstallable, so add individually and tolerate misses.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('ornight-') && name !== CACHE).map((name) => caches.delete(name)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The daemon socket and its HTTP API must never be served from cache.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (HASHED.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function handleNavigation(event) {
  const cache = await caches.open(CACHE);
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(event.request));
    if (response && response.ok) cache.put(SHELL_URL, response.clone());
    return response;
  } catch {
    return (
      (await cache.match(SHELL_URL)) ||
      (await cache.match(event.request)) ||
      (await cache.match(OFFLINE_URL)) ||
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  const response = hit || (await network);
  if (response) return response;
  return (
    (await cache.match(OFFLINE_URL)) ||
    new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
  );
}
