// Live runner tracking from the GPS-seuranta feed (tulospalvelu.fi), shared by the staff and field apps.
// Reads the event's init.txt (competitors) and data.lst (positions), follows the live file during a race,
// snaps every runner to the course, and answers: where is bib X, who is near this spot, how many are in each section.
// Without a tracking source (config.tracking.gps or ?gps=…) it does nothing and the apps stay as they are.
(function () {
  const C = window.GPT100_CONFIG || {}, T = C.tracking || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const one = n => (Math.round(n * 10) / 10).toFixed(1);
  const dist = m => m >= 950 ? one(m / 1000) + ' km' : Math.round(m / 10) * 10 + ' m';
  const ago = ms => ms < 90e3 ? 'just now' : ms < 3600e3 ? Math.round(ms / 60e3) + ' min ago' : (ms / 3600e3).toFixed(1) + ' h ago';

  // Where the feed comes from: ?gps=… overrides the config (an event id goes through the Worker relay, a full address is read as is).
  let src = null;
  try { const q = new URLSearchParams(location.search).get('gps'); if (q) src = q; } catch (e) { }
  src = src || T.gps || '';
  if (!src) { window.GPTTracking = null; return; }
  const BASE = /^https?:\/\//.test(src) ? src.replace(/\/?$/, '/') : ((C.weather && C.weather.refreshUrl) || '').replace(/\/$/, '') + '/gps/' + src + '/';
  const RELAY = !/^https?:\/\//.test(src);

  const EPOCH = Date.UTC(2006, 0, 1) / 1000;  // the feed counts seconds from 1 January 2006 UTC
  const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const STALE_MIN = 15, STOPPED_MIN = 20, STOPPED_M = 60, KEEP = 40;  // last fixes kept per runner

  const S = { ready: false, live: false, name: '', interval: 15, runners: new Map(), byBib: new Map(), bytes: -1, reset: -1, lastLine: 'undef', updated: 0, error: null, listeners: [] };

  function parseInit(txt) {
    for (const raw of txt.split('\n')) {
      const line = raw.replace(/\r$/, ''), i = line.indexOf(':');
      if (i < 0) continue;
      const k = line.slice(0, i), v = line.slice(i + 1);
      if (k === 'RACENAME') S.name = v.trim();
      else if (k === 'LIVE') S.live = v.trim() === '1';
      else if (k === 'GRABINTERVAL') S.interval = Math.max(10, +v || 15);
      else if (k === 'COMPETITOR') {
        // id|date|start|"1047 Jane Smith"|short name|...
        const f = v.split('|'), id = f[0], full = (f[3] || '').trim(), m = full.match(/^(\d+)\s*(.*)$/);
        if (!id) continue;
        const r = S.runners.get(id) || { id, pts: [] };
        r.bib = m ? m[1] : ''; r.name = m ? m[2] : full; r.label = full;
        S.runners.set(id, r);
        if (r.bib) S.byBib.set(r.bib, r);
      }
    }
  }

  // One line of data.lst: "<id>.<t>_<lon*5e4>_<lat*1e5>_B<batt>_S<speed>.<dt>_<dlon>_<dlat>.<3 chars: dt dlon dlat, each minus 31>…"
  function parseLine(line) {
    const c = line.split('.');
    if (c.length < 2 || c[1].indexOf('*') >= 0) return;
    const r = S.runners.get(c[0]);
    if (!r) return;
    const u = c[1].split('_');
    let t = +u[0], lon = +u[1], lat = +u[2];
    if (!isFinite(t) || !isFinite(lon) || !isFinite(lat)) return;
    const add = () => { if (lat && lon) r.pts.push([t, lat / 1e5, lon / 5e4]); };
    add();
    for (let k = 2; k < c.length; k++) {
      const tok = c[k];
      if (tok.length < 3) continue;
      const v = tok.split('_');
      if (v.length >= 3) { t += +v[0] || 0; lon += +v[1] || 0; lat += +v[2] || 0; }
      else { t += ALPHA.indexOf(tok[0]) - 31; lon += ALPHA.indexOf(tok[1]) - 31; lat += ALPHA.indexOf(tok[2]) - 31; }
      add();
    }
  }
  function handleData(txt) {
    const lines = txt.split('\n');
    for (const l of lines) if (l.length > 10) { parseLine(l); S.lastLine = l.slice(0, 29); }
    // Keep each runner's fixes in time order, drop duplicates and the oldest beyond KEEP.
    for (const r of S.runners.values()) {
      if (!r.pts.length) continue;
      r.pts.sort((a, b) => a[0] - b[0]);
      const out = [];
      for (const p of r.pts) if (!out.length || p[0] > out[out.length - 1][0]) out.push(p);
      r.pts = out.slice(-KEEP);
    }
    S.updated = Date.now();
    snapAll();
    S.listeners.forEach(fn => { try { fn(); } catch (e) { } });
  }

  // Snap every runner's latest fix to the course: GPT100 first, the other courses if that's far off.
  let courses = null;
  function snapAll() {
    const G = window.GPT; if (!G) return;
    courses = courses || G.courses;
    const now = Date.now();
    for (const r of S.runners.values()) {
      const p = r.pts[r.pts.length - 1];
      if (!p) { r.pos = null; continue; }
      let best = null;
      for (const E of courses) {
        const s = E.snap(p[1], p[2]);
        if (!best || s.offM < best.offM) best = { E, ic: s.ic, offM: s.offM };
        if (best.offM < 60) break;
      }
      const t = (p[0] + EPOCH) * 1000;
      // Moving: more than STOPPED_M from where they were STOPPED_MIN ago.
      const old = r.pts.find(q => (p[0] - q[0]) * 1000 <= STOPPED_MIN * 60e3) || r.pts[0];
      const moved = G.metres([old[1], old[2]], [p[1], p[2]]);
      const spanMin = (p[0] - old[0]) / 60;
      r.pos = {
        lat: p[1], lon: p[2], t, ageMs: now - t, course: best.E, km: best.E.route[best.ic][2], ic: best.ic, offM: best.offM,
        onCourse: best.offM <= 150, stale: now - t > STALE_MIN * 60e3,
        stopped: spanMin >= STOPPED_MIN - 2 && moved < STOPPED_M && now - t <= STALE_MIN * 60e3
      };
    }
  }

  async function get(path, extra) {
    const res = await fetch(BASE + path + (extra || ''), { cache: 'no-store' });
    if (!res.ok) throw new Error(path + ' ' + res.status);
    return res;
  }
  let timer = null;
  async function poll() {
    try {
      const q = S.bytes >= 0 ? `?offset=${S.bytes}&reset=${S.reset}` : `?data=${encodeURIComponent(S.lastLine)}`;
      const res = await get('data.php', q);
      const txt = await res.text();
      if (txt.slice(0, 6) !== '<HTML>' && txt.indexOf('DOCTYPE') < 0) {
        const fs = res.headers.get('X-GPS-Server-Filesize'), rs = res.headers.get('X-GPS-Server-Reset');
        if (fs) S.bytes = +fs; if (rs) S.reset = +rs;
        if (txt.trim()) handleData(txt);
      }
      S.error = null;
    } catch (e) { S.error = e.message; }
    timer = setTimeout(poll, S.interval * 1000);
  }
  async function start() {
    try {
      parseInit(await (await get('init.txt')).text());
      const res = await get('data.lst');
      const fs = res.headers.get('X-GPS-Server-Filesize'); if (fs) S.bytes = +fs;
      const txt = await res.text();
      S.ready = true; S.error = null;
      handleData(txt);
      if (S.live && !timer) timer = setTimeout(poll, S.interval * 1000);
    } catch (e) {
      S.error = e.message; S.listeners.forEach(fn => { try { fn(); } catch (x) { } });
      setTimeout(start, 60e3);
    }
  }
  if (window.GPT) start(); else addEventListener('load', start);

  // ---------- answers ----------
  const list = () => [...S.runners.values()].filter(r => r.pos);
  // Runners on a course, nearest first to a km (along the course), within maxKm.
  function near(E, km, maxKm, n) {
    return list().filter(r => r.pos.course === E && r.pos.onCourse && Math.abs(r.pos.km - km) <= (maxKm || 5))
      .sort((a, b) => Math.abs(a.pos.km - km) - Math.abs(b.pos.km - km)).slice(0, n || 6);
  }
  const byBib = bib => S.byBib.get(String(bib).replace(/^#|^bib\s*/i, '').trim()) || null;
  // Runners on course between two km, by course.
  function between(E, k0, k1) { return list().filter(r => r.pos.course === E && r.pos.onCourse && !r.pos.stale && r.pos.km >= Math.min(k0, k1) && r.pos.km < Math.max(k0, k1)); }
  // The runners to keep an eye on: not moving for a while, or a tracker gone quiet while others report.
  function watch() {
    const on = list().filter(r => r.pos.onCourse);
    const recent = on.filter(r => !r.pos.stale).length;
    return {
      stopped: on.filter(r => r.pos.stopped).sort((a, b) => b.pos.km - a.pos.km),
      quiet: recent >= 3 ? on.filter(r => r.pos.stale && r.pos.ageMs < 6 * 3600e3).sort((a, b) => a.pos.ageMs - b.pos.ageMs) : []
    };
  }
  const leaders = E => list().filter(r => r.pos.course === E && r.pos.onCourse && !r.pos.stale).sort((a, b) => b.pos.km - a.pos.km);

  function status() {
    if (S.error && !S.ready) return `Tracking: can't reach the feed (${S.error}).`;
    if (!S.ready) return 'Tracking: loading…';
    const n = list().filter(r => r.pos.onCourse && !r.pos.stale).length;
    return `${S.live ? 'Live tracking' : 'Tracking (replay)'}: ${n} runner${n === 1 ? '' : 's'} on course, updated ${ago(Date.now() - S.updated)}${S.error ? ', last fetch failed' : ''}.`;
  }
  const who = r => `<b>Bib ${esc(r.bib || '?')}</b> ${esc(r.name)}`;
  const seen = r => r.pos.stale ? `<span class="trk-stale">last seen ${ago(r.pos.ageMs)}</span>` : ago(r.pos.ageMs);

  // Find: the runners near a spot on the course, either side.
  function nearHTML(E, km, lat, lon) {
    if (!S.ready) return S.error ? '' : '';
    const rs = near(E, km, 5, 8);
    if (!rs.length) return `<div class="card trk"><h3>Runners near this spot</h3><p class="muted">No tracked runners within 5 km along the course. ${esc(status())}</p></div>`;
    return `<div class="card trk"><h3>Runners near this spot</h3>` + rs.map(r => {
      const d = (r.pos.km - km) * 1000;
      return `<div class="row"><span>${who(r)}<span class="sub">km ${one(r.pos.km)}, ${Math.abs(d) < 60 ? 'right here' : dist(Math.abs(d)) + (d < 0 ? ' back' : ' ahead')}${r.pos.offM > 60 ? ', ' + dist(r.pos.offM) + ' off the course' : ''}${r.pos.stopped ? ', <b>not moving</b>' : ''}. ${seen(r)}</span></span><button class="btn small trk-go" type="button" data-bib="${esc(r.bib)}">Find</button></div>`;
    }).join('') + `<p class="trk-src">${esc(status())}</p></div>`;
  }
  // One line for messages: the nearest runners' bibs.
  function nearLine(E, km) {
    if (!S.ready) return '';
    const rs = near(E, km, 3, 4);
    return rs.length ? 'Tracked runners nearby: ' + rs.map(r => `bib ${r.bib} (km ${one(r.pos.km)})`).join(', ') + '.' : '';
  }

  // Map markers for the runners on this course, within a km window (or all).
  function draw(layer, E, k0, k1, opts) {
    if (!window.L || !S.ready) return;
    opts = opts || {};
    for (const r of list()) {
      if (r.pos.course !== E || (k0 != null && (r.pos.km < k0 - 1 || r.pos.km > k1 + 1))) continue;
      const cls = 'trk-mk' + (r.pos.stale ? ' stale' : '') + (r.pos.stopped ? ' stopped' : '');
      const icon = L.divIcon({ className: '', html: `<div class="${cls}">${esc(r.bib || '?')}</div>`, iconSize: [30, 18], iconAnchor: [15, 9] });
      const mk = L.marker([r.pos.lat, r.pos.lon], { icon, zIndexOffset: 400 }).bindPopup(`${who(r)}<br>km ${one(r.pos.km)}${r.pos.offM > 60 ? ', ' + dist(r.pos.offM) + ' off the course' : ''}<br>${r.pos.stopped ? '<b>Not moving.</b> ' : ''}Last fix ${ago(r.pos.ageMs)}${opts.find ? `<br><button class="btn small trk-go" type="button" data-bib="${esc(r.bib)}">Find</button>` : ''}`);
      mk.addTo(layer);
    }
  }

  function onUpdate(fn) { S.listeners.push(fn); if (S.ready) fn(); }
  window.GPTTracking = { state: S, ready: () => S.ready, byBib, near, between, watch, leaders, list, status, nearHTML, nearLine, draw, onUpdate, ago, dist, who, seen, base: BASE, relay: RELAY };
})();
