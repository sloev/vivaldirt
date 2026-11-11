// Offline support: the app shell is cached up front; score pages and audio
// segments are cached as they are used (they never change), keeping only the
// most recent ones so the cache stays small.
const VERSION = 'v3';
const SHELL = `shell-${VERSION}`;
const MEDIA = 'media-v1';
const MEDIA_MAX = 24;
const SHELL_FILES = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'js/engine.js', 'js/seasons.js',
  'js/stretch-worker.js', 'js/art.js', 'js/composition.js', 'js/presence.js',
  'vendor/trystero/trystero-nostr.min.js', 'audio/dynamics.json',
  'fonts/bodoni-moda.woff2', 'fonts/plex-mono-400.woff2', 'fonts/plex-mono-500.woff2', 'fonts/plex-sans.woff2', 'vendor/paulstretch/paulstretch.js', 'vendor/paulstretch/paulstretch.wasm',
  'vendor/paulstretch/paulstretch.nosimd.wasm', 'audio/manifest.json', 'audio/playlist.m3u8',
  'score/score.json', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== MEDIA) await caches.delete(k);
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
      const res = await fetch(e.request);
      if (res.ok) {
        await cache.put(e.request, res.clone());
        trim(cache);
      }
      return res;
    })());
    return;
  }
  // shell: network first (so updates land), cache as fallback
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    try {
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) || Response.error();
    }
  })());
});
