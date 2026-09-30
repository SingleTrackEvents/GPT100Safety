// Offline support. App files use network first (so updates land), falling back to the cache.
// Leaflet, fonts and map tiles are cached as they're used.
const VERSION = 'gpt100-v8';
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/engine.js', 'js/app.js',
  'data/config.js', 'data/course.js', 'data/courses.js', 'data/access-edits.js', 'data/medplan.enc.js', 'js/medplan.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];
const TILES = 'gpt100-tiles';
const MAX_TILES = 2500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trimTiles() {
  const c = await caches.open(TILES), keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trimTiles(); }
        return res;
      } catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }

  if (url.origin === location.origin) {
    // Ask the server each time (it answers "not modified" when nothing changed), so updates land straight away.
    e.respondWith(fetch(req, req.mode === 'navigate' ? undefined : { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }

  if (/unpkg\.com|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
    })));
  }
});
