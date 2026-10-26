// Offline support. App files use network first (so updates land), falling back to the cache, or to the cache straight
// away when the network hasn't answered in a few seconds (weak signal).
// Leaflet, fonts and map tiles are cached as they're used; the topo map can also be saved whole (js/basemap.js).
const VERSION = 'gpt100-v67';
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/engine.js', 'js/app.js',
  'data/config.js', 'data/course.js', 'data/courses.js', 'data/course-w3w.js', 'data/access-edits.js', 'data/medplan.enc.js', 'data/safety-officers.js', 'js/medplan.js',
  'data/pacing.js', 'data/splits.js', 'js/weather-core.js', 'js/weather.js', 'js/rc.js', 'js/basemap.js', 'js/intro.js', 'js/viewport.js', 'js/races.js', 'js/profile.js', 'data/tiles.js', 'data/helipads.js', 'js/helipads.js', 'data/track-grades.js', 'js/track.js', 'js/timing.js', 'js/tracking.js', 'js/fullscreen.js', 'js/demo.js', 'data/demo-runners.js', 'map.html', 'js/map.js',
  'manifest.webmanifest', 'field.html', 'js/field.js', 'css/field.css', 'manifest-field.webmanifest', 'runner.html', 'js/runner.js', 'css/runner.css', 'data/races.js', 'data/runner-courses.js', 'data/runner-info.js', 'data/safety-cards.js', 'manifest-runner.webmanifest', 'admin.html', 'icons/mark.png', 'icons/logo.png', 'icons/icon-48.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/layers.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;600;700&display=swap'
];
const TILES = 'gpt100-tiles';
const OFFLINE_MAP = 'gpt100-offline-map'; // the saved topo map (js/basemap.js); kept across updates
const WX_CACHE = 'gpt100-weather';
const MAX_TILES = 2500;
const WAIT = 3500; // ms to wait for the network before answering from the cache

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

// Network first, but on a stalled connection answer from the cache after WAIT; the network answer, when it
// lands, still updates the cache (net does that itself). With nothing saved, wait on the network after all.
// Once the network has kept us waiting, the rest of the page comes from the cache after half a second, until it answers again.
let stalled = 0;
function netFirst(e, net, saved, fallback) {
  e.waitUntil(net.then(() => { stalled = 0; }, () => { }));
  e.respondWith(new Promise(done => {
    let over = false;
    const finish = r => { if (!over) { over = true; done(r); } };
    const t = setTimeout(() => { stalled = Date.now(); saved().then(r => { if (r) finish(r); }); }, Date.now() - stalled < 60e3 ? 500 : WAIT);
    net.then(res => { clearTimeout(t); finish(res); }, () => { clearTimeout(t); saved().then(r => finish(r || fallback())); });
  }));
}
const offline = (status, html) => new Response(html || '', { status, headers: html ? { 'Content-Type': 'text/html; charset=utf-8' } : {} });

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
    // A missing page falls back to the staff app; a missing script or file gets an error, never a page in its place.
    const nav = req.mode === 'navigate';
    netFirst(e, fetch(req, nav ? undefined : { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }), () => caches.match(req, { ignoreSearch: true }).then(r => r || (nav && !/admin\.html$/.test(url.pathname) ? caches.match('index.html') : null)),
    () => !nav ? offline(504) : offline(503, '<!DOCTYPE html><meta name="viewport" content="width=device-width, initial-scale=1"><title>GPT100 Safety</title><p style="font:16px sans-serif;margin:24px">This page isn\'t saved on this device and there\'s no signal. Try again with signal, or <a href="./">open the staff app</a>.</p>'));
    return;
  }

  // Weather data from the hourly watch: network first, the last copy when offline.
  if (url.hostname === 'raw.githubusercontent.com') {
    // Stored without the ?t= cache buster, so the last copy is found offline.
    const key = url.origin + url.pathname;
    netFirst(e, fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(WX_CACHE).then(c => c.put(key, copy)); }
      return res;
    }), () => caches.open(WX_CACHE).then(c => c.match(key)), () => offline(504));
    return;
  }

  if (/unpkg\.com|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    // Fonts are only looks: on a stalled connection give up on them after WAIT rather than hold up the page.
    const font = /fonts\./.test(url.hostname);
    e.respondWith(caches.match(req).then(hit => hit || new Promise((done, fail) => {
      if (font) setTimeout(() => done(offline(504)), WAIT);
      fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        done(res);
      }, err => font ? done(offline(504)) : fail(err));
    })));
  }
});
