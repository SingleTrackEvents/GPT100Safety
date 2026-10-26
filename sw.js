// Offline support. Each build of the app is saved whole, in its own cache. The pages ask for their scripts and styles
// with the build number (js/app.js?v=69), so a page never gets another build's file in its place: after an update a
// page shows new only once all its new files are in, and until then the saved page runs with its own saved files.
// tools/bump_version.mjs moves BUILD and every ?v= in the pages together (README, Hosting).
// Pages use the network first (so updates land), falling back to the saved copy when the network hasn't answered in a
// few seconds (weak signal). Leaflet, fonts and map tiles are cached as they're used; the topo map can also be saved
// whole (js/basemap.js).
const BUILD = '69';
const VERSION = 'gpt100-v' + BUILD;
const NEXT = 'gpt100-next-v'; // + a newer build: files for its pages, fetched before that build's worker is in
// Pages, manifests and icons, saved by their own address.
const PAGES = ['./', 'index.html', 'field.html', 'runner.html', 'map.html', 'admin.html', 'manifest.webmanifest', 'manifest-field.webmanifest', 'manifest-runner.webmanifest',
  'icons/mark.png', 'icons/logo.png', 'icons/icon-48.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
// Scripts and styles, saved as the pages ask for them (with ?v=BUILD).
const FILES = [
  'css/app.css', 'css/field.css', 'css/runner.css', 'js/engine.js', 'js/app.js', 'js/medplan.js', 'js/weather-core.js', 'js/weather.js', 'js/rc.js', 'js/basemap.js', 'js/intro.js',
  'js/viewport.js', 'js/races.js', 'js/profile.js', 'js/helipads.js', 'js/track.js', 'js/timing.js', 'js/tracking.js', 'js/fullscreen.js', 'js/demo.js', 'js/map.js', 'js/field.js', 'js/runner.js',
  'data/config.js', 'data/course.js', 'data/courses.js', 'data/course-w3w.js', 'data/access-edits.js', 'data/medplan.enc.js', 'data/safety-officers.js', 'data/pacing.js', 'data/splits.js',
  'data/tiles.js', 'data/helipads.js', 'data/track-grades.js', 'data/demo-runners.js', 'data/races.js', 'data/runner-courses.js', 'data/runner-info.js', 'data/safety-cards.js'
];
const LIBS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/layers.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;600;700&display=swap'
];
const SHELL = PAGES.concat(FILES.map(u => u + '?v=' + BUILD));
const TILES = 'gpt100-tiles';
const OFFLINE_MAP = 'gpt100-offline-map'; // the saved topo map (js/basemap.js); kept across updates
const WX_CACHE = 'gpt100-weather';
const LIB = 'gpt100-lib'; // Leaflet and fonts (fixed versions); kept across updates
const KEEP = [VERSION, TILES, OFFLINE_MAP, WX_CACHE, LIB];
const MAX_TILES = 2500;
const WAIT = 3500; // ms to wait for the network before answering from the cache
const SHORT = 1000; // ... for a page while the last request got no answer
const QUICK = 1000; // ... for a saved file of this build (a late answer still updates the saved copy)
const GIVE_UP = 20000; // ms after which a request still going is dropped, so a stalled one never keeps the worker busy

// The app's own files must all save, fresh from the server (not the browser's own cache), so the saved set
// is one build. Files a page of this build already fetched under the older worker are taken from there.
// Leaflet and fonts are saved if they can be (or kept from before), so a slow or failed download of them
// never stops the app working offline.
self.addEventListener('install', e => {
  e.waitUntil(Promise.all([
    caches.open(VERSION).then(async c => {
      const pre = await caches.open(NEXT + BUILD), miss = [];
      for (const u of SHELL) { const hit = await pre.match(u); if (hit) await c.put(u, hit); else miss.push(u); }
      await c.addAll(miss.map(u => new Request(u, { cache: 'reload' })));
      // A stale copy of a page (an old CDN copy mid-deploy) would ask for another build's files: try again later instead.
      for (const u of PAGES.filter(u => /(\/|\.html)$/.test(u))) {
        const r = await c.match(u), b = r && buildOf(await r.text());
        if (b && b !== BUILD) {
          // Marked, so the worker in charge keeps to its own saved files meanwhile (the server already has this build's).
          await caches.delete(VERSION); await pre.put(STALE, new Response(String(Date.now())));
          throw new Error('page ' + u + ' is build ' + b);
        }
      }
    }),
    caches.open(LIB).then(c => Promise.all(LIBS.map(u => caches.match(u).then(hit => hit ? c.put(u, hit) : c.add(u)).catch(() => { }))))
  ]).then(() => self.skipWaiting()));
});
// Only this build's files stay (and any newer build's, fetched ahead), so a fallback to the cache is always one set.
const ahead = k => k.startsWith(NEXT) && +k.slice(NEXT.length) > +BUILD;
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !KEEP.includes(k) && !ahead(k)).map(k => caches.delete(k))))
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
// Pages that opened from the cache (by client id): their files come from the cache too. Pages of a newer build
// than this worker's (client id -> build): their files come from that build's files only.
const fromCache = new Set(), built = new Map();
const remember = (s, id, v) => { s instanceof Map ? s.set(id, v) : s.add(id); if (s.size > 50) s.delete(s.keys().next().value); };
// Once the server has a newer build, its answers for this build's addresses are the newer files, so this
// build's files then come from the cache only. (Found again from the caches when the worker restarts.)
let newer = caches.keys().then(ks => ks.some(ahead));
// Also true as soon as a newer build's worker starts installing (it opens its cache first), even before a page of it is seen.
const isNewer = () => newer.then(n => n || caches.keys().then(ks => ks.some(ahead)));
// When a newer build's install last found stale pages (see install).
const STALE = '/__stale', staleSince = () => caches.keys().then(ks => Promise.all(ks.filter(ahead).map(k => caches.open(k).then(c => c.match(STALE)).then(r => r ? r.text() : 0)))).then(v => Math.max(0, ...v.map(Number)));
const buildOf = html => (html.match(/\?v=(\d+)"/) || [])[1];

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
const none = nav => !nav ? offline(504) : offline(503, '<!DOCTYPE html><meta name="viewport" content="width=device-width, initial-scale=1"><title>GPT100 Safety</title><p style="font:16px sans-serif;margin:24px">This page isn\'t saved on this device and there\'s no signal. Try again with signal, or <a href="./">open the staff app</a>.</p>');

// A page: from the network (asked each time, the server answers "not modified" when nothing changed), or the saved
// copy when the network hasn't answered in time. A missing page falls back to the staff app (not admin).
async function page(e, req, url) {
  const key = url.origin + url.pathname, id = e.resultingClientId, c = await caches.open(VERSION);
  const saved = async () => { const r = await c.match(key) || (/admin\.html$/.test(url.pathname) ? null : await c.match('index.html')); if (r) remember(fromCache, id); return r; };
  // (A page's own request can't be copied with changes, so it's asked again by its address.)
  const net = timed(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' });
  let t, res = await Promise.race([net.catch(() => null), new Promise(r => t = setTimeout(r, down ? SHORT : WAIT, 'late'))]);
  clearTimeout(t);
  if (!res || res === 'late') {
    down = true;
    const r = await saved();
    if (r) { net.stop(); return r; }
    if (!(res && (res = await net.catch(() => null)))) return none(true);
  }
  down = false; heard = Date.now();
  if (!res.ok) return res;
  // The body can stall after the headers: the saved page then, as for a stalled answer.
  let html = await Promise.race([res.clone().text(), new Promise(r => t = setTimeout(r, down ? SHORT : WAIT, null))]);
  clearTimeout(t);
  if (html == null) {
    down = true;
    const r = await saved();
    if (r) { net.stop(); return r; }
    html = await res.clone().text().catch(() => '');
  }
  const b = buildOf(html) || BUILD;
  if (b === BUILD) {
    // The server is on this build (a newer one was taken back): files fetched ahead for that one go.
    // Not while a newer build's worker is still waiting on stale pages (a half-finished deploy), for up to an hour.
    if (await newer && !(await staleSince() > Date.now() - 3600e3)) { newer = Promise.resolve(false); await caches.keys().then(ks => Promise.all(ks.filter(ahead).map(k => caches.delete(k)))); }
    await c.put(key, res.clone());
    return res;
  }
  // An older build than this worker's (a stale copy on the way): the saved page.
  if (+b < +BUILD) return await saved() || res;
  // A newer build: shown once all its files are in, else the saved page with its own files (the rest still land, for next time).
  newer = Promise.resolve(true);
  if (await fetchBuild(e, b, html, key)) { await (await caches.open(NEXT + b)).put(key, res.clone()); remember(built, id, b); return res; }
  const r = await saved();
  if (!r) remember(built, id, b);
  return r || res;
}
// Fetch every file a page of build b asks for into that build's cache; true when all are in within WAIT.
const pending = new Map();
function fetchBuild(e, b, html, base) {
  const urls = [...new Set([...html.matchAll(/(?:src|href)="([^"]+\?v=[^"]+)"/g)].map(m => new URL(m[1], base)).filter(u => u.origin === location.origin).map(u => u.href))];
  return caches.open(NEXT + b).then(c => new Promise(done => {
    const t = setTimeout(done, WAIT, false);
    Promise.all(urls.map(u => {
      if (!pending.has(u)) {
        const p = c.match(u).then(hit => hit || timed(u, { cache: 'no-cache' }).then(r => { if (!r.ok) throw r; return c.put(u, r); }));
        pending.set(u, p); p.then(() => pending.delete(u), () => pending.delete(u)); e.waitUntil(p.catch(() => { }));
      }
      return pending.get(u);
    })).then(() => done(true), () => done(false)).then(() => clearTimeout(t));
  }));
}
// A script, style or other file. Its build is its ?v=, else its page's.
async function file(e, req, url) {
  const v = url.searchParams.get('v'), b = v || built.get(e.clientId) || BUILD;
  const look = async name => await caches.match(req, { cacheName: name }) || (!v && await caches.match(req, { cacheName: name, ignoreSearch: true }));
  if (b !== BUILD) {
    // Another build's file: that build's copy or the network, never this build's copy in its place.
    const hit = await look(NEXT + b) || await look('gpt100-v' + b);
    if (hit) return hit;
    try {
      const res = await timed(req, { cache: 'no-cache' });
      if (res.ok && +b > +BUILD && await caches.has(NEXT + b)) { const copy = res.clone(); e.waitUntil(caches.open(NEXT + b).then(c => c.put(req, copy))); }
      return res;
    } catch (err) { return none(); }
  }
  const hit = await look(VERSION);
  if (hit && (fromCache.has(e.clientId) || await isNewer())) return hit;
  // This build's file: the network if it answers quickly (an update without a new build lands straight away), else
  // the saved copy, which a late answer still updates. With nothing saved, the network after all.
  const net = timed(req, { cache: 'no-cache' }), got = net.then(res => {
    down = false; heard = Date.now();
    if (res.ok) { const copy = res.clone(); e.waitUntil(isNewer().then(n => n || caches.open(VERSION).then(c => c.put(req, copy)))); }
    return res;
  });
  e.waitUntil(got.catch(() => { }));
  if (!hit) { got.stop = net.stop; return (fromCache.has(e.clientId) ? within(got, WAIT) : got).catch(() => none()); }
  return new Promise(done => {
    const t = setTimeout(done, QUICK, hit);
    got.then(res => done(res.ok ? res : hit), () => done(hit)).then(() => clearTimeout(t));
  });
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
    e.respondWith(req.mode === 'navigate' ? page(e, req, url) : file(e, req, url));
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
