// Timing chip reads from the timing team's RaceResult feed (a Simple API list), shared by the staff and field apps.
// It reads the list (through the Worker's /timing/ relay, which holds the link, or a full address for a rehearsal),
// works out the course km of every timing point, and keeps each runner's reads in time order.
// js/tracking.js merges these with the GPS tracker positions, so whichever source is newer gives the position.
// Without a source (config.tracking.chip, ?chip=…, or a ?gps= folder holding timing.json) it does nothing.
// Setup and what to ask the timing team for: tools/TIMING.md.
(function () {
  const C = window.GPT100_CONFIG || {}, T = C.tracking || {};
  let src = null, auto = false;
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('chip')) src = q.get('chip');
    else if (/^https?:\/\//.test(q.get('gps') || '')) { src = q.get('gps').replace(/\/?$/, '/') + 'timing.json'; auto = true; }
  } catch (e) { }
  src = src || T.chip || '';
  if (!src) { window.GPTTiming = null; return; }
  const URL_ = /^https?:\/\//.test(src) ? src : ((C.weather && C.weather.refreshUrl) || '').replace(/\/$/, '') + '/timing/';
  // Seconds between reads of the feed: at least 15 through the relay (RaceResult caches it for 10 to 30 s); a feed read
  // straight from an address of our own (the demo, a rehearsal folder) can go faster.
  const EVERY = Math.max(/^https?:\/\//.test(src) ? 2 : 15, +T.chipEvery || 30);
  const MEL = 11 * 3600e3;  // Melbourne in November (daylight saving), for times of day in the feed

  const S = { ready: false, off: false, error: null, updated: 0, runners: new Map(), points: [], unmatched: [], rows: 0, listeners: [] };
  const G = window.GPT;

  // ---------- names: timing points matched to the course stops ----------
  // Names come squashed from RaceResult ("CopperMineTrack", "MTDifficultRd", "BainggugCPIN"): split the words out first.
  const unsquash = s => String(s || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([A-Z]{2,})(IN|OUT)$/, '$1 $2');
  const norm = s => unsquash(s).toLowerCase().replace(/\bmount\b/g, 'mt').replace(/car\s*park\b|\bcp\b/g, 'carpark').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const STOP = new Set(['aid', 'station', 'water', 'point', 'checkpoint', 'tp', 'timing', 'the', 'of', 'at', 'in', 'out', 'arrive', 'arrival', 'depart', 'departure', 'emergency', 'split', 'and', 'gpt100', 'gpt']);
  // "HallsGapIn" and "HallsGapOut" are the same spot: the base name, and which read it is.
  const inOut = label => { const m = norm(label).match(/^(.*?)\s*(in|out|arrive|arrival|depart|departure)$/); return m ? { base: m[1], dir: /^(in|arr)/.test(m[2]) ? 'in' : 'out' } : { base: norm(label), dir: '' }; };
  const toks = s => norm(s).split(' ').filter(w => w && !STOP.has(w));
  // How alike two names are: shared words, or one squashed name inside the other ("GAR" in "GAR Trailhead").
  function score(a, b) {
    const ta = toks(a), tb = toks(b);
    if (!ta.length || !tb.length) return 0;
    const inter = ta.filter(w => tb.includes(w)).length, jac = inter / new Set(ta.concat(tb)).size;
    const sa = ta.join(''), sb = tb.join(''), short = Math.min(sa.length, sb.length), long = Math.max(sa.length, sb.length);
    const sub = short >= 3 && (sa.includes(sb) || sb.includes(sa)) ? 0.6 + 0.4 * short / long : 0;
    return Math.max(jac, sub);
  }
  // The stops the feed's names can match: each course's aid stations and water points, plus the pacing table's
  // extra points on the GPT100 (Stockyard Track), plus any overrides from the config.
  let cands = null;
  function candidates(E) {
    cands = cands || new Map();
    if (cands.has(E.id)) return cands.get(E.id);
    const out = E.AID.map(a => ({ name: a.name, km: a.trail_km }));
    const P = window.GPT100_PACING;
    if (E.main && P && P.miler) for (const p of P.miler.points) if (!out.some(o => Math.abs(o.km - p.km) < 0.4)) out.push({ name: p.name, km: p.km });
    cands.set(E.id, out);
    return out;
  }
  // Every km where the course passes a stop (the out and back to Jimmy Creek passes it twice), lowest first.
  const kmsAt = (E, km) => [km].concat(E.revisits(E.idxAtKm(km), 60).map(i => E.route[i][2])).sort((a, b) => a - b);
  const pointCache = new Map();
  function pointFor(label, E, race) {
    const key = E.id + '|' + (race ? race.id : '') + '|' + label;
    if (pointCache.has(key)) return pointCache.get(key);
    const n = norm(label);
    let hit = null;
    const over = T.chipPoints && Object.entries(T.chipPoints).find(([k]) => norm(k) === n);
    if (over) { const o = over[1]; const EE = o.course ? G.course(o.course) : E; hit = { name: label, km: +o.km, kms: kmsAt(EE, +o.km) }; }
    else if (/^(start|starttime|start time)$/.test(n)) hit = { name: 'Start', km: startKm(E, race), kms: [startKm(E, race)] };
    else if (/^finish/.test(n)) hit = { name: 'Finish', km: finishKm(E, race), kms: [finishKm(E, race)] };
    else {
      let best = null;
      for (const c of candidates(E)) { const s = score(label, c.name); if (s >= 0.6 && (!best || s > best.s)) best = { c, s }; }
      if (best) hit = { name: best.c.name, km: best.c.km, kms: kmsAt(E, best.c.km) };
    }
    pointCache.set(key, hit);
    return hit;
  }
  // Which course a contest runs on: the 14k course for the 14k and 6k, the GPT100 for the rest, none for the Dunkeld fun runs.
  // RaceResult may give the contest as a number: tracking.chipContests in the config names them, e.g. { 5: 'GPT100 Miler' }.
  const contestName = c => { const s = String(c == null ? '' : c).trim(); const m = T.chipContests && (T.chipContests[s] || T.chipContests[+s]); return m ? String(m) : s; };
  let numericContests = false;
  function courseOf(contest) {
    const n = norm(contest);
    if (/^\d+$/.test(n)) { numericContests = true; return G; }
    if (/\b(14|6) ?k\b/.test(n)) return G.course('14k');
    if (/\b(5|2) ?k\b|family|kids/.test(n)) return null;
    return G;
  }
  // The race in the config (start and finish aid stations) whose label fits the contest name, e.g. "Stage 2".
  function raceOf(contest) {
    const ct = toks(contest);
    for (const r of C.races || []) for (const part of norm(r.label).split(' or ')) {
      const need = part.split(' ').filter(w => w && !STOP.has(w));
      if (need.length && need.every(w => ct.includes(w))) return r;
    }
    return null;
  }
  const stopKm = (E, name, fallback) => { let best = null; for (const a of E.AID) { const s = score(name, a.name); if (s >= 0.6 && (!best || s > best.s)) best = { a, s }; } return best ? best.a.trail_km : fallback; };
  const startKm = (E, race) => race && E.main ? stopKm(E, race.from, 0) : E.AID[0].trail_km;
  const finishKm = (E, race) => race && E.main ? stopKm(E, race.to, E.totalKm) : E.AID[E.AID.length - 1].trail_km;

  // ---------- the feed's rows and columns ----------
  // Takes the shapes RaceResult produces: a plain array of rows (objects, or arrays with column names in the config
  // or a header row), or { list: { Fields: [...] }, data: [...] or { "#1_Contest": [...] } } as my.raceresult.com sends.
  function rowsOf(j) {
    let rows = [], labels = null;
    if (Array.isArray(j)) rows = j;
    else if (j && typeof j === 'object') {
      const d = j.data != null ? j.data : j.rows != null ? j.rows : Array.isArray(j.list) ? j.list : null;
      if (Array.isArray(d)) rows = d;
      else if (d && typeof d === 'object') for (const v of Object.values(d)) if (Array.isArray(v)) rows = rows.concat(v);
      const F = j.list && Array.isArray(j.list.Fields) ? j.list.Fields : Array.isArray(j.fields) ? j.fields : null;
      if (F) labels = F.map(f => typeof f === 'string' ? f : (f.Label || f.label || f.Expression || f.expression || '')).map(s => String(s).replace(/^\[|\]$/g, ''));
    }
    if (!rows.length) return [];
    if (Array.isArray(rows[0])) {
      if (!labels && Array.isArray(T.chipFields)) labels = T.chipFields;
      if (!labels && rows[0].some(v => /^(bib|startno|number)/i.test(String(v)))) { labels = rows[0].map(String); rows = rows.slice(1); }
      if (!labels) throw new Error('the list has no column names (set tracking.chipFields in the config)');
      rows = rows.map(r => { const skip = r.length === labels.length + 1 ? 1 : 0, o = {}; labels.forEach((l, i) => { if (l) o[l] = r[i + skip]; }); return o; });
    }
    return rows.filter(r => r && typeof r === 'object');
  }
  function role(label) {
    const n = norm(label).replace(/ /g, '');
    if (/^(bib|bibno|bibnumber|startno|startnumber|number|no|racenumber|racenno)$/.test(n)) return 'bib';
    if (/^(name|fullname|displayname|runner|participant|athlete)$/.test(n)) return 'name';
    if (/^(firstname|first|givenname|forename)$/.test(n)) return 'first';
    if (/^(lastname|last|surname|familyname)$/.test(n)) return 'last';
    if (/^(contest|contestname|race|event|distance|category|course)$/.test(n)) return 'contest';
    if (/^(status|state)$/.test(n)) return 'status';
    if (/^(time|nettime|chiptime|guntime|racetime|rank|place|pos|position|gender|sex|age|agegroup|agegrp|club|team|city|nation|country|id|pid|rrid|email|phone|comment|diff|behind|gap to leader)$/.test(n)) return 'skip';
    return 'point';
  }
  // A time from the feed, in ms: a full date and time, a Unix time, or a Melbourne time of day
  // (taken as the most recent such moment, up to 10 minutes ahead of now).
  function when(v, now) {
    if (v == null) return 0;
    if (typeof v === 'number') return v > 1e12 ? v : v > 1e9 ? v * 1000 : 0;
    const s = String(v).trim();
    if (!s || s === '-' || /^[0:.,]+$/.test(s)) return 0;
    let m = s.match(/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d?):(\d\d)(?::(\d\d))?/);
    if (m) { const t = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - MEL; return /(Z|[+-]\d\d:?\d\d)$/.test(s) ? (Date.parse(s) || t) : t; }
    m = s.match(/^(\d\d?)[./](\d\d?)[./](\d{4})[ T](\d\d?):(\d\d)(?::(\d\d))?/);
    if (m) return Date.UTC(+m[3], m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)) - MEL;
    m = s.match(/^(\d\d?):(\d\d)(?::(\d\d))?(?:[.,]\d+)?$/);
    if (m) {
      const d = new Date(now + MEL), base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), +m[1], +m[2], +(m[3] || 0)) - MEL;
      return base > now + 10 * 60e3 ? base - 86400e3 : base;
    }
    return 0;
  }
  function statusOf(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (!s || s === '0' || s === 'ok' || s === 'normal' || s === 'started' || s === 'running') return '';
    if (/dnf|withdr|retir|pulled|drop/.test(s) || s === '2') return 'dnf';
    if (/dns|not started|no show|no-show/.test(s) || s === '1') return 'dns';
    if (/dsq|disq/.test(s) || s === '3') return 'dsq';
    if (/fin/.test(s)) return 'finished';
    return '';
  }

  function handle(j, now) {
    const rows = rowsOf(j);
    const runners = new Map(), pts = new Map(), unmatched = new Set();
    for (const row of rows) {
      let bib = '', name = '', first = '', last = '', contest = '', status = '';
      const reads = [];
      for (const [l, v] of Object.entries(row)) {
        const ro = role(l);
        if (ro === 'bib') bib = String(v == null ? '' : v).trim();
        else if (ro === 'name') name = String(v || '').trim();
        else if (ro === 'first') first = String(v || '').trim();
        else if (ro === 'last') last = String(v || '').trim();
        else if (ro === 'contest') contest = contest || String(v || '').trim();
        else if (ro === 'status') status = String(v == null ? '' : v).trim();
        else if (ro === 'point') reads.push({ label: l, t: when(v, now) });
      }
      if (!bib || !/^\d+$/.test(bib)) continue;
      name = name || (first + ' ' + last).trim();
      const lf = name.match(/^([^,]+),\s*(.+)$/); if (lf) name = lf[2].trim() + ' ' + lf[1].trim();
      contest = contestName(contest);
      const E = courseOf(contest);
      if (!E) continue;
      const race = raceOf(contest);
      // Every timing point in the list is a place the runner will be read (so the app knows the next one), read or not yet.
      const pointOf = rd => { const p = pointFor(rd.label, E, race); if (!p) unmatched.add(rd.label); else { const key = E.id + '|' + p.name; if (!pts.has(key)) pts.set(key, { name: p.name, course: E, km: p.kms[0], n: 0, lastT: 0 }); } return p; };
      reads.filter(rd => !rd.t).forEach(pointOf);
      const out = [], kmOfBase = new Map();
      let lastKm = -1;
      for (const rd of reads.filter(rd => rd.t).sort((a, b) => a.t - b.t)) {
        const p = pointOf(rd);
        if (!p) continue;
        // An In and an Out read at the same aid station are the same spot. Otherwise, a stop the course passes
        // twice (the out and back at Jimmy Creek) is the first passing not yet behind them.
        const io = inOut(rd.label);
        let km = io.dir && kmOfBase.has(io.base) ? kmOfBase.get(io.base) : (p.kms.find(k => k > lastKm + 0.2) ?? p.kms[p.kms.length - 1]);
        if (io.dir) kmOfBase.set(io.base, km);
        lastKm = Math.max(lastKm, km);
        out.push({ name: p.name + (io.dir === 'out' ? ' (out)' : ''), km, t: rd.t });
        const q = pts.get(E.id + '|' + p.name); q.n++; q.lastT = Math.max(q.lastT, rd.t);
      }
      let st = statusOf(status);
      const fin = finishKm(E, race);
      if (!st && out.length && out[out.length - 1].km >= fin - 0.05 && fin > 0) st = 'finished';
      runners.set(bib, { bib, name, contest, course: E, race, status: st, reads: out, last: out[out.length - 1] || null, startKm: startKm(E, race), finishKm: fin });
    }
    S.runners = runners;
    S.points = [...pts.values()].sort((a, b) => a.course.id === b.course.id ? a.km - b.km : a.course.main ? -1 : 1);
    S.unmatched = [...unmatched];
    S.rows = rows.length;
    S.numericContests = numericContests;
  }

  // ---------- reading the feed ----------
  let timer = null;
  async function poll() {
    try {
      const res = await fetch(URL_, { cache: 'no-store' });
      if (res.status === 404 && auto) { S.off = true; S.listeners.forEach(fn => { try { fn(); } catch (e) { } }); return; }
      if (!res.ok) throw new Error('feed ' + res.status + (res.status === 503 ? ' (the Worker has no TIMING_URL secret yet)' : ''));
      const txt = await res.text();
      let j;
      try { j = JSON.parse(txt); } catch (e) { throw new Error('the feed is not JSON'); }
      if (j && !Array.isArray(j) && j.error) throw new Error(String(j.error));
      handle(j, Date.now());
      S.ready = true; S.error = null; S.updated = Date.now();
    } catch (e) { S.error = e.message; }
    S.listeners.forEach(fn => { try { fn(); } catch (e) { } });
    timer = setTimeout(poll, EVERY * 1000);
  }
  if (window.GPT) poll(); else addEventListener('load', poll);

  // ---------- answers ----------
  const ago = ms => ms < 90e3 ? 'just now' : ms < 3600e3 ? Math.round(ms / 60e3) + ' min ago' : (ms / 3600e3).toFixed(1) + ' h ago';
  const hm = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const byBib = bib => S.runners.get(String(bib).replace(/^#|^bib\s*/i, '').trim()) || null;
  // The timing points on a course after a km, nearest first (for "the next checkpoint").
  const pointsAfter = (E, km) => S.points.filter(p => p.course === E && p.km > km + 0.2).sort((a, b) => a.km - b.km);
  function status() {
    if (S.off) return '';
    if (S.error && !S.ready) return `Timing chips: can't reach the feed (${S.error}).`;
    if (!S.ready) return 'Timing chips: loading…';
    const on = [...S.runners.values()].filter(r => r.last && !r.status).length;
    return `Timing chips: ${on} runner${on === 1 ? '' : 's'} between checkpoints, ${S.points.length} timing point${S.points.length === 1 ? '' : 's'} matched to the course, updated ${ago(Date.now() - S.updated)}` +
      (S.error ? ', last fetch failed' : '') + (S.unmatched.length ? `. Not matched to the course: ${S.unmatched.join(', ')} (add them to tracking.chipPoints)` : '') +
      (S.numericContests ? '. The feed gives contests as numbers, so every runner is taken as on the GPT100 course (name them in tracking.chipContests)' : '') + '.';
  }
  function onUpdate(fn) { S.listeners.push(fn); if (S.ready || S.off) fn(); }
  window.GPTTiming = { state: S, ready: () => S.ready, on: () => !S.off, byBib, runners: () => [...S.runners.values()], points: () => S.points, pointsAfter, status, onUpdate, hm, when, score, norm };
})();
