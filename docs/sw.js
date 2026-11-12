// Network-first shell + aggressive update so the installed PWA stays current.
const VERSION = 'v14';
const SHELL = `shell-${VERSION}`;
const MEDIA = 'media-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll([
        './',
        'index.html',
        'manifest.webmanifest',
        'css/style.css',
        'js/app.js',
        'js/art2d.js',
        'js/weeks.js',
        'js/seasons.js',
        'js/engine.js',
        'js/presence.js',
        'js/stretch-worker.js',
        'icons/icon.svg',
      ].map((f) => new Request(f, { cache: 'reload' }))))
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

// Let the page force an update cycle
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  const media = /\/(audio\/seg|score|images)\//.test(url.pathname);
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

  // Always try network first for app shell so updates land without hard refresh
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
