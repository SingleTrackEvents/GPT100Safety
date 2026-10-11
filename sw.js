// Offline support. App files use network first (so updates land), falling back to the cache.
// Leaflet, fonts and map tiles are cached as they're used; the topo map can also be saved whole (js/basemap.js).
const VERSION = 'gpt100-v31';
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/engine.js', 'js/app.js',
  'data/config.js', 'data/course.js', 'data/courses.js', 'data/access-edits.js', 'data/medplan.enc.js', 'data/safety-officers.js', 'js/medplan.js',
  'data/pacing.js', 'js/weather-core.js', 'js/weather.js', 'js/rc.js', 'js/basemap.js', 'js/profile.js', 'data/tiles.js',
  'manifest.webmanifest', 'field.html', 'js/field.js', 'css/field.css', 'manifest-field.webmanifest', 'runner.html', 'js/runner.js', 'css/runner.css', 'data/races.js', 'data/runner-courses.js', 'data/runner-info.js', 'manifest-runner.webmanifest', 'icons/mark.png', 'icons/logo.png', 'icons/icon-48.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];
const TILES = 'gpt100-tiles';
const OFFLINE_MAP = 'gpt100-offline-map'; // the saved topo map (js/basemap.js); kept across updates
const WX_CACHE = 'gpt100-weather';
const MAX_TILES = 2500;

// The app's own files must all save; the map library from unpkg is saved if it can be, so a slow or
// failed download of it never stops the app working offline.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all([
    c.addAll(SHELL.filter(u => !u.startsWith('http'))),
    ...SHELL.filter(u => u.startsWith('http')).map(u => c.add(u).catch(() => { }))
  ])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== TILES && k !== WX_CACHE && k !== OFFLINE_MAP).map(k => caches.delete(k))))
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

  if (url.hostname.endsWith('tile.openstreetmap.org') || url.hostname.endsWith('tile.opentopomap.org')) {
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

  // Our own copy of the topo map: the saved map first, then tiles seen before, then the network.
  if (url.origin === location.origin && url.pathname.includes('/tiles/topo/')) {
    e.respondWith((async () => {
      const hit = await (await caches.open(OFFLINE_MAP)).match(req) || await (await caches.open(TILES)).match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        // A whole-map save stores its own copy, so it isn't kept twice.
        if (res.ok && !req.headers.get('X-Offline-Save')) { const copy = res.clone(); caches.open(TILES).then(c => { c.put(req, copy); trimTiles(); }); }
        return res;
      } catch (err) { return new Response('', { status: 504 }); }
    })());
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

  // Weather data from the hourly watch: network first, the last copy when offline.
  if (url.hostname === 'raw.githubusercontent.com') {
    e.respondWith(fetch(req).then(res => {
      // Stored without the ?t= cache buster, so the last copy is found offline.
      const key = url.origin + url.pathname;
      if (res.ok) { const copy = res.clone(); caches.open(WX_CACHE).then(c => c.put(key, copy)); }
      return res;
    }).catch(() => caches.open(WX_CACHE).then(c => c.match(url.origin + url.pathname)).then(r => r || new Response('', { status: 504 }))));
    return;
  }

  if (/unpkg\.com|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
    })));
  }
});
