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

  const S = { ready: false, off: false, error: null, updated: 0, runners: new Map(), points: [], unmatched: [], badContests: [], odd: [], future: [], undated: 0, tests: 0, rows: 0, listeners: [] };
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
  // ---------- contests: the feed's contest name to a race, its course and its start day ----------
  // Each race: [race in config.races (start and finish aid stations), stage in data/races.js (start day), label, course].
  // The 14k and 6k run on the 14k course; the Dunkeld fun runs (5k, 2k) aren't tracked.
  const RACE = { miler: ['miler', 'miler', 'Miler'], '50k': ['50k', 's1', '50k'], s1: ['50k', 's1', 'Stage 1'], s2: ['s2', 's2', 'Stage 2'], s3: ['s3', 's3', 'Stage 3'],
    s4: ['s4', 's4', 'Stage 4'], '33k': ['s4', 's4', '33k'], '14k': ['', '14k', '14k', '14k'], '6k': ['', '6k', '6k', '14k'], '5k': null, '2k': null, fun: null };
  // The race a contest name means: "GPT100 Solo/Pairs" the Miler, "GPT50K" the 50k, "Stage 2" or "GPT Stage 2" stage 2,
  // "GPT33K", "GPT14K", "GPT6K" and so on. '' when it can't tell (shown in the status line, never taken as the Miler).
  function keyOf(name) {
    const s = String(name || '').toLowerCase().replace(/(\d)(?=[a-z])|([a-z])(?=\d)/g, '$1$2 ').replace(/[^a-z0-9]+/g, ' ').replace(/\b20\d\d\b/g, ' ').trim();
    let m;
    if ((m = s.match(/\b(?:stage|day|leg|st|s) ?([1-4])\b/))) return 's' + m[1];
    if (/\bstage/.test(s)) return 'stage';
    if (/\b(100|160|163|miler?|miles)\b/.test(s)) return 'miler';
    if ((m = s.match(/\b(50|33|14|6|5|2) ?(k|km)?\b/))) return m[1] + 'k';
    if (/\b(fun|family|kids?|junior|mini)\b/.test(s)) return 'fun';
    return '';
  }
  // tracking.chipContests overrides: the feed's contest name or number to a race ('GPT100 Miler', '50k', 'Stage 2', '14k'),
  // or 'none' for a contest that isn't tracked.
  function contestOf(raw, now) {
    const s = String(raw == null ? '' : raw).trim(), O = T.chipContests || {}, o = O[s] != null ? O[s] : O[s.toLowerCase()];
    let key = o != null ? (/^(none|skip|ignore|-)?$/i.test(String(o).trim()) ? 'fun' : keyOf(o)) : keyOf(s);
    if (key === 'stage') key = stageNow(now);
    const d = RACE[key];
    if (d === undefined || key === '') return { key: '', name: s };
    if (!d) return { key, name: s, off: true };
    const R = window.GPT_RACES, st = R && R.stages && R.stages[d[1]], first = st && st.points && st.points[0] && st.points[0].first;
    return { key, name: s, label: d[2], race: d[0] ? (C.races || []).find(r => r.id === d[0]) || raceOf(d[2]) : null, course: d[3] ? G.course(d[3]) : G, day: dayOf(first) };
  }
  // A stage race contest with no stage number: the stage under way (the last to have started, or about to).
  function stageNow(now) {
    const R = window.GPT_RACES, S_ = R && R.stages;
    let k = 's1';
    for (const s of ['s1', 's2', 's3', 's4']) { const f = S_ && S_[s] && S_[s].points[0].first; if (f && Date.parse(f + ':00+11:00') <= now + 3 * 3600e3) k = s; }
    return k;
  }
  // Midnight (Melbourne) at the start of a day, from '2026-11-06' or '2026-11-06T08:00'; tracking.chipDay ('YYYY-MM-DD'
  // or 'today') anchors every contest to one day instead, for a rehearsal with test reads made before race week.
  function dayOf(first, today) {
    const cd = today ? 'today' : String(T.chipDay || '').trim();
    if (cd === 'today') { const d = new Date((today || Date.now()) + MEL); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - MEL; }
    const m = (cd || String(first || '')).match(/^(\d{4})-(\d\d)-(\d\d)/);
    return m ? Date.UTC(+m[1], m[2] - 1, +m[3]) - MEL : null;
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
    // The contest name, from the best column there is: Contest, else Race or Event, else Distance, Category or Course.
    if (/^(contest|contestname)$/.test(n)) return 'contest2';
    if (/^(race|racename|event|eventname)$/.test(n)) return 'contest1';
    if (/^(distance|category|course)$/.test(n)) return 'contest0';
    if (/^(status|state|statusname)$/.test(n)) return 'status';
    if (/^(place|rank|pos|position|overall|overallplace|overallrank)$/.test(n)) return 'place';
    // Not timing points: elapsed race time and gaps (Time, Diff), and the runner's details.
    if (/^(time|nettime|chiptime|guntime|racetime|elapsed|elapsedtime|totaltime|duration|pace|speed|diff|difference|behind|gaptoleader|gender|sex|age|agegroup|agegrp|club|team|city|nation|nationality|country|id|pid|rrid|email|phone|comment)$/.test(n) || /(rank|place|diff|behind)$/.test(n)) return 'skip';
    return 'point';
  }
  // A time from the feed: a full date and time or a Unix time ({ t }, in ms), or a Melbourne time of day ({ sec }):
  // HH:MM:SS, or D:HH:MM:SS for D days past the start day (1:02:00:00 is 2 am the next day; pre: the day is given).
  function clock(v) {
    if (v == null) return null;
    if (typeof v === 'number') return v > 1e12 ? { t: v } : v > 1e9 ? { t: v * 1000 } : null;
    const s = String(v).trim();
    if (!s || /^[-–.\s]+$/.test(s) || /^[0:.,]+$/.test(s)) return null;
    if (/^\d{10}$|^\d{13}$/.test(s)) return clock(+s);
    let m = s.match(/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d?):(\d\d)(?::(\d\d))?/);
    if (m) { const t = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - MEL; return { t: /(Z|[+-]\d\d:?\d\d)$/.test(s) ? (Date.parse(s) || t) : t }; }
    m = s.match(/^(\d\d?)[./](\d\d?)[./](\d{4})[ T](\d\d?):(\d\d)(?::(\d\d))?/);
    if (m) return { t: Date.UTC(+m[3], m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)) - MEL };
    m = s.match(/^(\d{1,2})(?::|\.|d ?| )(\d\d?):(\d\d):(\d\d)(?:[.,]\d+)?$/);
    if (m) return { sec: +m[1] * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4], pre: true };
    m = s.match(/^(\d\d?):(\d\d)(?::(\d\d))?(?:[.,]\d+)?$/);
    if (m) return { sec: +m[1] * 3600 + +m[2] * 60 + +(m[3] || 0), pre: +m[1] >= 24 };
    return null;
  }
  // A time of day with no start day to hang it on: the most recent such moment, up to 10 minutes ahead of now.
  function recent(sec, now) {
    const d = new Date(now + MEL);
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - MEL + (sec % 86400) * 1000;
    return t > now + 10 * 60e3 ? t - 86400e3 : t;
  }
  const when = (v, now) => { const c = clock(v); return !c ? 0 : c.t || recent(c.sec, now); };
  // A runner's status: DNF, DNS, DSQ, OTL (cut off) or finished; '' running; null for a value it doesn't know.
  function statusOf(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (!s || s === '0' || s === 'ok' || s === 'normal' || s === 'started' || s === 'running' || s === 'active' || s === 'registered') return '';
    if (/dnf|withdr|retir|pulled|drop|abandon/.test(s) || s === '2') return 'dnf';
    if (/dns|not start|no show|no-show|scratch/.test(s) || s === '1') return 'dns';
    if (/dsq|disq/.test(s) || s === '3') return 'dsq';
    if (/otl|over time|cut ?off|\bcut\b|time ?limit/.test(s)) return 'cut off';
    if (/fin/.test(s)) return 'finished';
    return null;
  }
  const AHEAD = 5 * 60e3;  // a chip time more than this ahead of now can't have happened yet: not trusted

  function handle(j, now) {
    const rows = rowsOf(j);
    const runners = new Map(), pts = new Map(), unmatched = new Set(), matched = new Set(), badContests = new Map(), odd = new Set(), tests = new Set(), future = [];
    let undated = 0;
    for (const row of rows) {
      let bib = '', name = '', first = '', last = '', contest = '', cp = -1, status = '', place = '', m;
      const reads = [];
      for (const [l, v] of Object.entries(row)) {
        const ro = role(l), sv = String(v == null ? '' : v).trim();
        if (ro === 'bib') bib = sv;
        else if (ro === 'name') name = sv;
        else if (ro === 'first') first = sv;
        else if (ro === 'last') last = sv;
        else if ((m = /^contest(\d)$/.exec(ro))) { if (sv && +m[1] > cp) { contest = sv; cp = +m[1]; } }
        else if (ro === 'status') status = sv;
        else if (ro === 'place') place = sv;
        else if (ro === 'point') reads.push({ label: l, c: clock(v), t: 0 });
      }
      if (!bib || !/^\d+$/.test(bib)) continue;
      name = name || (first + ' ' + last).trim();
      const lf = name.match(/^([^,]+),\s*(.+)$/); if (lf) name = lf[2].trim() + ' ' + lf[1].trim();
      const ct = contestOf(contest, now);
      if (!ct.key) { badContests.set(ct.name || '(blank)', (badContests.get(ct.name || '(blank)') || 0) + 1); continue; }
      if (ct.off) continue;
      const E = ct.course, race = ct.race;
      // Times of day hang off the contest's start day. The columns run in course order, so a time of day more than
      // 12 hours earlier than the read before it, with no day given, has gone past midnight: the next day.
      // Before the race's day they can only be the timing team's test reads: hung off today instead, and moved back
      // a day if that puts them ahead of the clock.
      const early = ct.day != null && !T.chipDay && now < ct.day, day = early ? dayOf('', now) : ct.day;
      let prev = 0, top = 0;
      for (const rd of reads) {
        const c = rd.c;
        if (!c) continue;
        if (c.t) rd.t = c.t;
        else if (day == null) { rd.t = recent(c.sec, now); undated++; }
        else { rd.t = day + c.sec * 1000; if (!c.pre && prev) while (rd.t < prev - 12 * 3600e3) rd.t += 86400e3; if (early) { tests.add(bib); top = Math.max(top, rd.t); } }
        prev = rd.t;
      }
      const back = top > now + AHEAD ? Math.ceil((top - now - AHEAD) / 86400e3) * 86400e3 : 0;
      for (const rd of reads) {
        if (back && rd.c && !rd.c.t) rd.t -= back;
        if (rd.t > now + AHEAD) { future.push({ bib, label: rd.label, t: rd.t }); rd.t = 0; }
      }
      // Every timing point in the list is a place the runner will be read (so the app knows the next one), read or not yet.
      // (One list holds every course: a column counts as not matched only if it matches no runner's course.)
      const pointOf = rd => { const p = pointFor(rd.label, E, race); if (!p) unmatched.add(rd.label); else { matched.add(rd.label); const key = E.id + '|' + p.name; if (!pts.has(key)) pts.set(key, { name: p.name, course: E, km: p.kms[0], n: 0, lastT: 0 }); } return p; };
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
      // The Status column first; else the Place column when it holds a status (DNF, DNS, DSQ, OTL) instead of a place.
      let st = statusOf(status);
      if (st == null) { odd.add(status); st = ''; }
      if (!st && /[a-z]/i.test(place)) { st = statusOf(place); if (st == null) { odd.add(place); st = ''; } }
      const fin = finishKm(E, race);
      if (!st && out.length && out[out.length - 1].km >= fin - 0.05 && fin > 0) st = 'finished';
      runners.set(bib, { bib, name: name + ' (' + ct.label + ')', contest: ct.name, raceKey: ct.key, raceLabel: ct.label, course: E, race, day: ct.day, status: st, reads: out, last: out[out.length - 1] || null, startKm: startKm(E, race), finishKm: fin });
    }
    S.runners = runners;
    S.points = [...pts.values()].sort((a, b) => a.course.id === b.course.id ? a.km - b.km : a.course.main ? -1 : 1);
    S.unmatched = [...unmatched].filter(l => !matched.has(l));
    S.rows = rows.length;
    S.badContests = [...badContests];
    S.odd = [...odd];
    S.future = future.sort((a, b) => a.t - b.t);
    S.undated = undated;
    S.tests = tests.size;
  }

  // ---------- reading the feed ----------
  // The race start days (data/races.js) anchor the feed's times of day. The staff app and the map page don't load
  // that file, so it's added here (the same build's copy, saved for offline like every other file).
  const VER = ((document.currentScript && document.currentScript.src || '').match(/\?v=[\w.]+/) || [''])[0];
  let racesP = null;
  const races = () => racesP = racesP || new Promise(done => {
    const go = () => {
      if (window.GPT_RACES) return done();
      const el = document.createElement('script'); el.src = 'data/races.js' + VER; el.onload = el.onerror = () => done();
      document.head.appendChild(el); setTimeout(done, 8000);
    };
    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', go); else go();
  });
  let timer = null;
  async function poll() {
    try {
      await races();
      const res = await fetch(URL_, { cache: 'no-store' });
      if (res.status === 404 && auto) { S.off = true; S.listeners.forEach(fn => { try { fn(); } catch (e) { } }); return; }
      if (!res.ok) throw new Error('feed ' + res.status + (res.status === 503 ? ' (the Worker has no TIMING_URL secret yet)' : ''));
      const txt = await res.text();
      let j;
      try { j = JSON.parse(txt); } catch (e) { throw new Error('the feed is not JSON'); }
      if (j && !Array.isArray(j) && j.error) throw new Error(String(j.error));
      if (j && !Array.isArray(j) && j.about) throw new Error('the Worker has no /timing/ relay yet (paste in the current tools/refresh-worker.js)');
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
  const dhm = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
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
      (S.badContests.length ? `. Contest not recognised, so these runners aren't placed: ${S.badContests.map(([n, k]) => `"${n}" (${k})`).join(', ')} (name them in tracking.chipContests)` : '') +
      (S.future.length ? `. ${S.future.length} chip time${S.future.length === 1 ? '' : 's'} ahead of the clock ignored: ${S.future.slice(0, 3).map(f => `bib ${f.bib} ${f.label} ${dhm.format(f.t)}`).join(', ')}${S.future.length > 3 ? '…' : ''}` : '') +
      (S.odd.length ? `. Status not recognised (taken as still running): ${S.odd.join(', ')}` : '') +
      (S.tests ? `. ${S.tests} runner${S.tests === 1 ? ' has' : 's have'} chip times before their race's day (test reads?), taken as today's` : '') +
      (S.undated ? `. The race start days didn't load, so times of day are taken as the latest such time` : '') + '.';
  }
  function onUpdate(fn) { S.listeners.push(fn); if (S.ready || S.off) fn(); }
  window.GPTTiming = { state: S, ready: () => S.ready, on: () => !S.off, byBib, runners: () => [...S.runners.values()], points: () => S.points, pointsAfter, status, onUpdate, hm, when, clock, keyOf, contestOf, score, norm };
})();
