// Offline support. Bumped VERSION so clients drop the broken mixed cache.
const VERSION = 'v3-poster';
const SHELL = `shell-${VERSION}`;
const MEDIA = 'media-v1';
const MEDIA_MAX = 24;
const SHELL_FILES = [
  './', 'index.html', 'css/style.css',
  'js/app.js', 'js/seasons.js',
  'manifest.webmanifest', 'icons/icon.svg',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(SHELL_FILES.map(f => new Request(f, { cache: 'reload' }))))
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

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MEDIA_MAX; i++) await cache.delete(keys[i]);
}

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
        if (res.ok) {
          cache.put(e.request, res.clone());
          trim(cache);
        }
        return res;
      } catch {
        return hit || Response.error();
      }
    })());
    return;
  }

  // App shell: network first, fall back to cache
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      const cache = await caches.open(SHELL);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(e.request);
      return hit || cache.match('./') || Response.error();
    }
  })());
});
