// Offline support. App files use network first (so updates land), falling back to the cache when the network
// hasn't answered in a few seconds (weak signal). A page that opens from the cache takes the rest of its files
// from the cache too, so one page load never mixes files from two versions of the app.
// Leaflet, fonts and map tiles are cached as they're used; the topo map can also be saved whole (js/basemap.js).
const VERSION = 'gpt100-v68';
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
const LIB = 'gpt100-lib'; // Leaflet and fonts (fixed versions); kept across updates
const KEEP = [VERSION, TILES, OFFLINE_MAP, WX_CACHE, LIB];
const MAX_TILES = 2500;
const WAIT = 3500; // ms to wait for the network before answering from the cache
const SHORT = 1000; // ... for a page while the last request got no answer
const GIVE_UP = 20000; // ms after which a request still going is dropped, so a stalled one never keeps the worker busy

// The app's own files must all save, fresh from the server (not the browser's own cache), so the saved set
// is one version. Leaflet and fonts are saved if they can be (or kept from before), so a slow or failed
// download of them never stops the app working offline.
self.addEventListener('install', e => {
  e.waitUntil(Promise.all([
    caches.open(VERSION).then(c => c.addAll(SHELL.filter(u => !u.startsWith('http')).map(u => new Request(u, { cache: 'reload' })))),
    caches.open(LIB).then(c => Promise.all(SHELL.filter(u => u.startsWith('http')).map(u => caches.match(u).then(hit => hit ? c.put(u, hit) : c.add(u)).catch(() => { }))))
  ]).then(() => self.skipWaiting()));
});
// Only this version's files stay, so a fallback to the cache is always one matching set.
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trimTiles() {
  const c = await caches.open(TILES), keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

// fetch, dropped after GIVE_UP (or sooner with stop()).
function timed(req, init) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), GIVE_UP);
  const p = fetch(req, Object.assign({ signal: ac.signal }, init));
  p.then(() => clearTimeout(t), () => clearTimeout(t));
  p.stop = () => { clearTimeout(t); ac.abort(); };
  return p;
}
// timed(), giving up after ms.
function within(net, ms) {
  return new Promise((done, fail) => {
    const t = setTimeout(() => { fail(new Error('timeout')); net.stop(); }, ms);
    net.then(r => { clearTimeout(t); done(r); }, err => { clearTimeout(t); fail(err); });
  });
}
// down: the last request got no answer (timed out or failed); any answer clears it. heard: when the network last answered.
let down = false, heard = 0;
// Pages that opened from the cache (by client id): their files come from the cache too. Pages that came new
// from the network (changed since saved, so likely a new version): their files wait longer for the network
// before an older saved copy is used, as old and new files may not work together.
const fromCache = new Set(), changed = new Set();
const remember = (set, id) => { set.add(id); if (set.size > 50) set.delete(set.values().next().value); };

// Network first, but answer from the cache when the network hasn't answered in `wait` ms. With nothing saved,
// wait on the network after all. patient (a page's files): keep waiting while other answers are still coming
// in (a slow but working network), until the network has been quiet for `wait` ms, and let a late answer
// land (it updates the cache); otherwise a late answer is dropped.
function netFirst(e, net, saved, fallback, wait, patient) {
  e.waitUntil(net.then(() => { down = false; heard = Date.now(); }, () => { }));
  return new Promise(done => {
    let over = false;
    const t0 = Date.now();
    const finish = (r, cached) => { if (!over) { over = true; done(r); if (cached && !patient) net.stop(); } };
    const check = () => {
      const quiet = Date.now() - heard;
      if (patient && quiet < wait && Date.now() - t0 < GIVE_UP) { t = setTimeout(check, wait - quiet); return; }
      down = true; saved().then(r => { if (r) finish(r, true); });
    };
    let t = setTimeout(check, wait);
    net.then(res => { clearTimeout(t); finish(res); }, () => { clearTimeout(t); down = true; saved().then(r => finish(r || fallback(), true)); });
  });
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
        const res = await within(timed(req), 8000);
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
        const res = await within(timed(req), 8000);
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
    const mine = () => caches.open(VERSION).then(c => c.match(req, { ignoreSearch: true }).then(r => r || (nav && !/admin\.html$/.test(url.pathname) ? c.match('index.html') : null)));
    const none = () => !nav ? offline(504) : offline(503, '<!DOCTYPE html><meta name="viewport" content="width=device-width, initial-scale=1"><title>GPT100 Safety</title><p style="font:16px sans-serif;margin:24px">This page isn\'t saved on this device and there\'s no signal. Try again with signal, or <a href="./">open the staff app</a>.</p>');
    // A page that opened from the cache: its saved files straight away, the network only for one not saved.
    if (!nav && fromCache.has(e.clientId)) {
      e.respondWith(mine().then(r => r || within(timed(req), WAIT).catch(() => null).then(res => res || none())));
      return;
    }
    // A page answered late (after it opened from the cache) isn't saved, so the saved page keeps its own files.
    let late = false;
    // (A page's own request can't be copied with changes, so it's asked again by its address.)
    const net = nav ? timed(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' }) : timed(req, { cache: 'no-cache' }), kept = net.then(res => {
      if (!res.ok || (nav && late)) return res;
      const copy = res.clone();
      if (!nav) { caches.open(VERSION).then(c => c.put(req, copy)); return res; }
      return caches.open(VERSION).then(async c => {
        const old = await c.match(req, { ignoreSearch: true }), h = r => r.headers.get('etag') + ' ' + r.headers.get('last-modified');
        if (!old || h(old) !== h(res)) remember(changed, e.resultingClientId);
        await c.put(req, copy);
        return res;
      }, () => res);
    });
    kept.stop = net.stop;
    const saved = () => mine().then(r => {
      if (r && nav) { late = true; remember(fromCache, e.resultingClientId); }
      return r;
    });
    e.respondWith(netFirst(e, kept, saved, none, nav ? (down ? SHORT : WAIT) : changed.has(e.clientId) ? 3 * WAIT : WAIT, !nav));
    return;
  }

  // Weather data from the hourly watch: network first, the last copy when offline.
  if (url.hostname === 'raw.githubusercontent.com') {
    // Stored without the ?t= cache buster, so the last copy is found offline.
    const key = url.origin + url.pathname;
    const net = timed(req), kept = net.then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(WX_CACHE).then(c => c.put(key, copy)); }
      return res;
    });
    kept.stop = net.stop;
    e.respondWith(netFirst(e, kept, () => caches.open(WX_CACHE).then(c => c.match(key)), () => offline(504), WAIT, true));
    return;
  }

  if (/unpkg\.com|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    // Fixed versions, so a saved copy is used as it is. Otherwise the network (asked with CORS, so a failed
    // download can be told apart and isn't saved), giving up on a stalled connection rather than hold up
    // the page: fonts and images after WAIT, the map library after longer.
    const lim = req.destination === 'script' || req.destination === 'style' ? 8000 : WAIT;
    e.respondWith(caches.match(req).then(hit => hit || within(timed(req.url, { mode: 'cors', credentials: 'omit' }), lim).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(LIB).then(c => c.put(req, copy)); }
      return res;
    }, () => offline(504))));
  }
});
