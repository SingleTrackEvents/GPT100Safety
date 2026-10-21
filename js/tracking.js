// Live runner positions, shared by the staff and field apps, from two sources that cover for each other:
//   GPS trackers (the GPS-seuranta feed, tulospalvelu.fi): init.txt (competitors) and data.lst (positions), followed live.
//   Timing chips (the RaceResult feed, js/timing.js): the time each runner crossed each timing point.
// For every runner the newest hard fix wins, whichever source it came from. A fix older than a few minutes gets a
// projected "likely km now" at the runner's own pace (capped at the next timing point, which they'd have been read at),
// so the apps always hold the most up to date position, and say how it was worked out. A runner late at the next
// timing point is flagged. Without either source (config.tracking.gps / chip, or ?gps=… / ?chip=…) it does nothing.
(function () {
  const C = window.GPT100_CONFIG || {}, T = C.tracking || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const one = n => (Math.round(n * 10) / 10).toFixed(1);
  const dist = m => m >= 950 ? one(m / 1000) + ' km' : Math.round(m / 10) * 10 + ' m';
  const ago = ms => ms < 90e3 ? 'just now' : ms < 3600e3 ? Math.round(ms / 60e3) + ' min ago' : (ms / 3600e3).toFixed(1) + ' h ago';
  const mins = ms => { const m = Math.round(ms / 60e3), h = Math.floor(m / 60); return h ? `${h} h ${m % 60} min` : `${m} min`; };
  const hm = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const CHIP = () => window.GPTTiming && window.GPTTiming.on() ? window.GPTTiming : null;

  // Where the GPS feed comes from: ?gps=… overrides the config (an event id goes through the Worker relay, a full address is read as is).
  let src = null;
  try { const q = new URLSearchParams(location.search).get('gps'); if (q) src = q; } catch (e) { }
  src = src || T.gps || '';
  if (!src && !window.GPTTiming) { window.GPTTracking = null; return; }
  const GPS = !!src;
  const BASE = GPS ? (/^https?:\/\//.test(src) ? src.replace(/\/?$/, '/') : ((C.weather && C.weather.refreshUrl) || '').replace(/\/$/, '') + '/gps/' + src + '/') : '';
  const RELAY = GPS && !/^https?:\/\//.test(src);

  const EPOCH = Date.UTC(2006, 0, 1) / 1000;  // the GPS feed counts seconds from 1 January 2006 UTC
  const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const STALE_MIN = 15, STOPPED_MIN = 20, STOPPED_M = 60, KEEP = 40;  // last fixes kept per runner
  const EST_MIN = 3;        // a hard fix older than this gets a projected km
  const LATE_MIN = 20;      // late at the next timing point: this long (or a quarter of the leg) past their expected time

  const S = { ready: false, live: false, name: '', interval: 15, runners: new Map(), byBib: new Map(), bytes: -1, reset: -1, lastLine: 'undef', updated: 0, error: null, listeners: [], gps: GPS };

  // ---------- the GPS feed ----------
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
    recompute();
  }

  // ---------- pace model: how long the fastest and the slowest take between two course km ----------
  // The GPT100 uses the pacing table (fastest runner and cut-offs, data/pacing.js), so the terrain is in it.
  // Other courses use flat speeds. A runner's pace is where they sit between the two, from their chip reads.
  const modelCache = new Map();
  function model(E) {
    if (modelCache.has(E.id)) return modelCache.get(E.id);
    const P = window.GPT100_PACING;
    let m;
    if (E.main && P && P.miler) {
      const pts = P.miler.points.map(p => ({ km: p.km, f: Date.parse(p.fast + ':00+11:00'), s: Date.parse(p.slow + ':00+11:00') })).sort((a, b) => a.km - b.km);
      const at = (km, k) => { if (km <= pts[0].km) return pts[0][k] - (pts[0].km - km) * 3600e3 / 8; for (let i = 1; i < pts.length; i++) if (km <= pts[i].km) { const a = pts[i - 1], b = pts[i]; return a[k] + (b[k] - a[k]) * (km - a.km) / ((b.km - a.km) || 1); } const z = pts[pts.length - 1]; return z[k] + (km - z.km) * 3600e3 / 4; };
      m = { fast: (a, b) => at(b, 'f') - at(a, 'f'), slow: (a, b) => at(b, 's') - at(a, 's') };
    } else m = { fast: (a, b) => (b - a) * 3600e3 / 10, slow: (a, b) => (b - a) * 3600e3 / 4 };
    modelCache.set(E.id, m);
    return m;
  }
  // Time to go from km a to km b for a runner at pace fraction f (0 = the fastest, 1 = the cut-offs).
  const legMs = (E, a, b, f) => { const M = model(E), x = M.fast(a, b); return Math.max(0, x + f * (M.slow(a, b) - x)); };
  // A runner's pace fraction, from their last two chip reads (or their start), else mid-pack.
  function fracOf(chip) {
    if (!chip || chip.reads.length < 2) return 0.5;
    const R = chip.reads;
    let a = R[R.length - 2], b = R[R.length - 1];
    if (b.km - a.km < 2 && R.length > 2) a = R[0];
    if (b.km - a.km < 0.5) return 0.5;
    const M = model(chip.course), fast = M.fast(a.km, b.km), slow = M.slow(a.km, b.km);
    if (slow <= fast) return 0.5;
    return Math.min(1.5, Math.max(0, ((b.t - a.t) - fast) / (slow - fast)));
  }
  // The km a runner at pace f reaches `ms` after being at km a, no further than cap.
  function kmAfter(E, a, f, ms, cap) {
    let lo = a, hi = Math.min(cap, E.totalKm);
    if (legMs(E, a, hi, f) <= ms) return hi;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (legMs(E, a, mid, f) <= ms) lo = mid; else hi = mid; }
    return lo;
  }

  // ---------- merge the two sources and work out every runner's position ----------
  let courses = null;
  function recompute() {
    const G = window.GPT; if (!G) return;
    courses = courses || G.courses;
    const now = Date.now(), TC = CHIP();
    // Runners the chips know that the GPS feed doesn't get an entry of their own.
    for (const r of S.runners.values()) r.chip = null;
    if (TC) for (const c of TC.runners()) {
      let r = S.byBib.get(c.bib);
      if (!r) { r = { id: 'chip:' + c.bib, bib: c.bib, name: c.name, label: c.bib + ' ' + c.name, pts: [] }; S.runners.set(r.id, r); S.byBib.set(c.bib, r); }
      r.chip = c;
      if (!r.name && c.name) { r.name = c.name; r.label = c.bib + ' ' + c.name; }
    }
    for (const r of S.runners.values()) position(r, now, TC);
    S.listeners.forEach(fn => { try { fn(); } catch (e) { } });
  }
  function position(r, now, TC) {
    const p = r.pts[r.pts.length - 1];
    let gps = null;
    if (p) {
      let best = null;
      for (const E of courses) {
        const s = E.snap(p[1], p[2]);
        if (!best || s.offM < best.offM) best = { E, ic: s.ic, offM: s.offM };
        if (best.offM < 60) break;
      }
      const t = (p[0] + EPOCH) * 1000;
      // Moving: more than STOPPED_M from where they were STOPPED_MIN ago.
      const old = r.pts.find(q => (p[0] - q[0]) * 1000 <= STOPPED_MIN * 60e3) || r.pts[0];
      const moved = window.GPT.metres([old[1], old[2]], [p[1], p[2]]);
      const spanMin = (p[0] - old[0]) / 60;
      gps = { lat: p[1], lon: p[2], t, course: best.E, km: best.E.route[best.ic][2], ic: best.ic, offM: best.offM,
        stale: now - t > STALE_MIN * 60e3, stopped: spanMin >= STOPPED_MIN - 2 && moved < STOPPED_M && now - t <= STALE_MIN * 60e3 };
    }
    const c = r.chip, read = c && c.last;
    let chip = null;
    if (read) {
      const q = c.course.route[c.course.idxAtKm(read.km)];
      chip = { lat: q[0], lon: q[1], t: read.t, course: c.course, km: read.km, ic: c.course.idxAtKm(read.km), offM: 0, at: read.name };
    }
    if (!gps && !chip) { r.pos = null; return; }
    // Finished or out of the race: keep the last place, off the course lists.
    if (c && c.status) {
      const h = chip && (!gps || chip.t >= gps.t) ? chip : gps;
      r.pos = Object.assign({}, h, { src: h === chip ? 'chip' : 'gps', ageMs: now - h.t, onCourse: false, stale: false, quiet: false, stopped: false, done: c.status, chipAt: read || null, gpsT: gps ? gps.t : 0, est: null, next: null });
      return;
    }
    const hard = chip && (!gps || chip.t > gps.t) ? chip : gps, src = hard === chip ? 'chip' : 'gps';
    const pos = Object.assign({}, hard, {
      src, ageMs: now - hard.t, onCourse: hard.offM <= 150, done: '',
      stale: src === 'gps' && gps.stale,                       // the tracker has gone quiet and nothing newer from the chips
      quiet: !!(gps && gps.stale),                             // the tracker itself has gone quiet (the chips may still place them)
      stopped: src === 'gps' && gps.stopped,
      chipAt: read || null, gpsT: gps ? gps.t : 0, est: null, next: null
    });
    // Where they probably are now, and when they're due at the next timing point.
    const E = pos.course, f = fracOf(c);
    const nextPt = TC ? TC.pointsAfter(E, pos.km)[0] : null;
    const finKm = c ? c.finishKm : E.totalKm;
    const cap = nextPt ? Math.min(nextPt.km, finKm) : finKm;
    // At their pace they'd have reached the next timing point by now, but there's no read there: they're somewhere
    // on that leg, so the estimate sits in the middle of it and says so.
    if (pos.onCourse && !pos.stopped && pos.ageMs > EST_MIN * 60e3 && pos.km < cap - 0.05) {
      let km = kmAfter(E, pos.km, f, pos.ageMs, cap);
      const capped = km >= cap - 1e-6;
      if (capped) km = (pos.km + cap) / 2;
      const q = E.route[E.idxAtKm(km)];
      pos.est = { km, lat: q[0], lon: q[1], capped, frac: f, from: src === 'chip' ? read.name : 'GPS', fromKm: pos.km, toKm: cap, to: nextPt ? nextPt.name : 'the finish' };
    }
    // Due at the next timing point, counted from their last chip read (what the timing system knows), else the GPS fix.
    // Late only counts when nothing says they're still moving: no fresh GPS fix, or one that isn't moving.
    if (nextPt && pos.onCourse) {
      const a = chip && chip.km <= pos.km + 0.05 ? chip : hard;
      const due = a.t + legMs(E, a.km, nextPt.km, f), latest = a.t + legMs(E, a.km, nextPt.km, 1);
      const grace = Math.max(LATE_MIN * 60e3, (due - a.t) / 4), moving = !!(gps && !gps.stale && !gps.stopped);
      pos.next = { name: nextPt.name, km: nextPt.km, due, latest, late: now > due + grace && !moving, overdue: now > latest && !moving, lateMs: now - due };
    }
    r.pos = pos;
  }

  // ---------- reading the GPS feed ----------
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
      S.error = e.message; recompute();
      setTimeout(start, 60e3);
    }
  }
  function boot() {
    if (GPS) start();
    if (window.GPTTiming) GPTTiming.onUpdate(recompute);
    // Positions age even when nothing new arrives: refresh the estimates every minute.
    setInterval(() => { if (ready()) recompute(); }, 60e3);
  }
  if (window.GPT) boot(); else addEventListener('load', boot);

  // ---------- answers ----------
  const ready = () => S.ready || !!(CHIP() && CHIP().ready());
  const list = () => [...S.runners.values()].filter(r => r.pos && !r.pos.done);
  const cur = r => r.pos.est ? r.pos.est.km : r.pos.km;  // the km they're most likely at now
  // Runners on a course, nearest first to a km (along the course), within maxKm.
  function near(E, km, maxKm, n) {
    return list().filter(r => r.pos.course === E && r.pos.onCourse && Math.abs(cur(r) - km) <= (maxKm || 5))
      .sort((a, b) => Math.abs(cur(a) - km) - Math.abs(cur(b) - km)).slice(0, n || 6);
  }
  const byBib = bib => S.byBib.get(String(bib).replace(/^#|^bib\s*/i, '').trim()) || null;
  // Runners on course between two km, by course.
  function between(E, k0, k1) { return list().filter(r => r.pos.course === E && r.pos.onCourse && !r.pos.stale && cur(r) >= Math.min(k0, k1) && cur(r) < Math.max(k0, k1)); }
  // The runners to keep an eye on: not moving, off the course, late at the next timing point, or a tracker gone quiet
  // with nothing from the chips since.
  function watch() {
    const on = list().filter(r => r.pos.onCourse);
    const recent = on.filter(r => !r.pos.stale).length;
    return {
      stopped: on.filter(r => r.pos.stopped).sort((a, b) => b.pos.km - a.pos.km),
      // A recent GPS fix more than 150 m from any course (the chips can't place anyone off the course).
      off: list().filter(r => !r.pos.onCourse && r.pos.src === 'gps' && !r.pos.stale).sort((a, b) => b.pos.offM - a.pos.offM),
      late: on.filter(r => r.pos.next && r.pos.next.late).sort((a, b) => b.pos.next.lateMs - a.pos.next.lateMs),
      quiet: recent >= 3 || CHIP() ? on.filter(r => r.pos.stale && r.pos.ageMs < 6 * 3600e3).sort((a, b) => a.pos.ageMs - b.pos.ageMs) : []
    };
  }
  const leaders = E => list().filter(r => r.pos.course === E && r.pos.onCourse && !r.pos.stale).sort((a, b) => cur(b) - cur(a));

  function status() {
    const TC = CHIP(), chipLine = TC ? TC.status() : '';
    if (GPS) {
      if (S.error && !S.ready) return `GPS tracking: can't reach the feed (${S.error}).` + (chipLine ? ' ' + chipLine : '');
      if (!S.ready) return 'GPS tracking: loading…' + (chipLine ? ' ' + chipLine : '');
    }
    const on = list().filter(r => r.pos.onCourse && !r.pos.stale), byChip = on.filter(r => r.pos.src === 'chip').length;
    let s = `${!GPS ? 'Timing chips only' : S.live ? 'Live tracking' : 'Tracking (replay)'}: ${on.length} runner${on.length === 1 ? '' : 's'} on course`;
    if (GPS && TC) s += ` (${on.length - byChip} placed by GPS, ${byChip} by the chips)`;
    if (GPS) s += `, GPS updated ${ago(Date.now() - S.updated)}${S.error ? ' (last fetch failed)' : ''}`;
    return s + '.' + (chipLine ? ' ' + chipLine : '') + (T.credit && T.credit.name ? ` Timing and tracking by ${T.credit.name}.` : '');
  }
  const who = r => `<b>Bib ${esc(r.bib || '?')}</b> ${esc(r.name)}`;
  // How the position was worked out, in a few words: "GPS fix 2 min ago", "chip read at Halls Gap 12:40, likely km 52.3 now".
  function where(r) {
    const p = r.pos;
    if (p.done) {
      const w = { finished: 'finished', dnf: 'withdrew', dns: 'did not start', dsq: 'disqualified' }[p.done] || p.done;
      return p.done === 'dns' ? w : `${w}${p.chipAt ? ` (${p.chipAt.name} ${hm.format(p.chipAt.t)})` : ''}`;
    }
    let s = p.src === 'chip' ? `chip read at ${p.chipAt.name} ${hm.format(p.chipAt.t)} (${ago(p.ageMs)})` : `GPS fix ${ago(p.ageMs)}`;
    if (p.est) s += p.est.capped ? `, somewhere between km ${one(p.est.fromKm)} and ${esc(p.est.to)} (km ${one(p.est.toKm)}): due there by now at their pace, no read yet` : `, likely about km ${one(p.est.km)} now`;
    if (p.stopped) s += ', not moving';
    if (p.quiet && p.src === 'chip') s += `. Tracker quiet since ${hm.format(p.gpsT)}`;
    else if (p.stale) s += '. The tracker has gone quiet and the chips have nothing newer, so they may have moved on';
    if (p.next && p.next.late) s += `. <b>${p.next.overdue ? 'Overdue' : 'Late'} at ${esc(p.next.name)}</b>: expected ${hm.format(p.next.due)}, ${mins(p.next.lateMs)} ago`;
    return s;
  }
  const seen = r => r.pos.stale ? `<span class="trk-stale">${where(r)}</span>` : where(r);
  const lateTag = r => r.pos.next && r.pos.next.late ? `, <b>${r.pos.next.overdue ? 'overdue' : 'late'} at ${esc(r.pos.next.name)}</b>` : '';

  // Find: the runners near a spot on the course, either side.
  function nearHTML(E, km, lat, lon) {
    if (!ready()) return '';
    const rs = near(E, km, 5, 8);
    if (!rs.length) return `<div class="card trk"><h3>Runners near this spot</h3><p class="muted">No tracked runners within 5 km along the course. ${esc(status())}</p></div>`;
    return `<div class="card trk"><h3>Runners near this spot</h3>` + rs.map(r => {
      const d = (cur(r) - km) * 1000;
      return `<div class="row"><span>${who(r)}<span class="sub">km ${one(cur(r))}${r.pos.est ? ' (estimated)' : ''}, ${Math.abs(d) < 60 ? 'right here' : dist(Math.abs(d)) + (d < 0 ? ' back' : ' ahead')}${r.pos.offM > 60 ? ', ' + dist(r.pos.offM) + ' off the course' : ''}${r.pos.stopped ? ', <b>not moving</b>' : ''}${lateTag(r)}. ${seen(r)}</span></span><button class="btn small trk-go" type="button" data-bib="${esc(r.bib)}">Find</button></div>`;
    }).join('') + `<p class="trk-src">${esc(status())}</p></div>`;
  }
  // One line for messages: the nearest runners' bibs.
  function nearLine(E, km) {
    if (!ready()) return '';
    const rs = near(E, km, 3, 4);
    return rs.length ? 'Tracked runners nearby: ' + rs.map(r => `bib ${r.bib} (km ${one(cur(r))}${r.pos.est ? ' est.' : ''})`).join(', ') + '.' : '';
  }

  // Map markers for the runners on this course, within a km window (or all). Solid: a fix in the last few minutes.
  // Dashed: estimated from an older fix or chip read. Grey: tracker quiet. Amber: late at the next timing point. Red: not moving.
  function draw(layer, E, k0, k1, opts) {
    if (!window.L || !ready()) return;
    opts = opts || {};
    for (const r of list()) {
      const p = r.pos, km = cur(r);
      if (p.course !== E || (k0 != null && (km < k0 - 1 || km > k1 + 1))) continue;
      const cls = 'trk-mk' + (p.est ? ' est' : '') + (p.stale ? ' stale' : '') + (p.next && p.next.late ? (p.next.overdue ? ' overdue' : ' late') : '') + (p.stopped ? ' stopped' : '') + (!p.onCourse && p.src === 'gps' && !p.stale ? ' off' : '');
      const icon = L.divIcon({ className: '', html: `<div class="${cls}">${esc(r.bib || '?')}</div>`, iconSize: [30, 18], iconAnchor: [15, 9] });
      const at = p.est ? [p.est.lat, p.est.lon] : [p.lat, p.lon];
      const mk = L.marker(at, { icon, zIndexOffset: 400 }).bindPopup(`${who(r)}<br>km ${one(km)}${p.est ? ' (estimated)' : ''}${p.offM > 60 ? ', ' + dist(p.offM) + ' off the course' : ''}<br>${where(r)}${opts.find ? `<br><button class="btn small trk-go" type="button" data-bib="${esc(r.bib)}">Find</button>` : ''}`);
      mk.addTo(layer);
    }
  }

  function onUpdate(fn) { S.listeners.push(fn); if (ready()) fn(); }
  window.GPTTracking = { state: S, ready, byBib, near, between, watch, leaders, list, cur, status, where, nearHTML, nearLine, draw, onUpdate, ago, dist, who, seen, hm, base: BASE, relay: RELAY, gps: GPS, chip: () => !!CHIP() };
})();
