const VERSION = 'v4';
const SHELL = `shell-${VERSION}`;
const MEDIA = 'media-v1';
const MEDIA_MAX = 24;
const SHELL_FILES = [
  './', 'index.html',
  'css/style.css?v=4', 'css/style.css',
  'js/app.js?v=4', 'js/app.js',
  'js/seasons.js', 'js/engine.js', 'js/stretch-worker.js',
  'manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(SHELL_FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('SW install', err))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k !== SHELL && k !== MEDIA) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  const media = /\/(audio\/seg|score)\/[^/]+\.(flac|png)$/.test(url.pathname);
  if (media) {
    e.respondWith((async () => {
      const cache = await caches.open(MEDIA);
      const hit = await cache.match(e.request);
      if (hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      } catch {
        return hit || Response.error();
      }
    })());
    return;
  }

  // Network-first for shell so Android sees updates
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request, { cache: 'no-store' });
      const cache = await caches.open(SHELL);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      const cache = await caches.open(SHELL);
      return (await cache.match(e.request)) || (await cache.match('./')) || Response.error();
    }
  })());
});
