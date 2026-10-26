// GPT100 Safety demo: plays the race live in the browser, for training and rehearsal before the real feeds exist.
// Open any app with ?demo=1 (or ?demo=12h for 12 hours into the Miler, ?demo=sat09:30 for a day and time) and the
// made-up field in data/demo-runners.js runs the course at each runner's own pace, from the pacing table. The GPS
// trackers and the timing chips are both played: this file answers the apps' feed requests (init.txt, data.lst,
// data.php and timing.json) itself, in the same shapes the real feeds send, so js/tracking.js and js/timing.js run
// exactly as they will on race day. Nothing is fetched from the tracking or timing providers.
//
// The bar at the bottom shows the race time, pauses, runs at 1x, 10x or 60x, jumps ahead, and lists the runners
// with a case to find (a stopped runner, a lost tracker, a missed chip read). The clock carries on across the staff
// app, the map page and the field app in the same browser tab (sessionStorage). Exit takes the demo away again.
// A real feed (?gps=, ?chip=, or the config) always wins over the demo.
//
// Ages and the late / not moving / tracker quiet flags come from the real clock in js/tracking.js, so they're right
// at 1x. At 10x or 60x the runners move fast but a runner has to stand still for 20 real minutes to show as not moving.
(function () {
  let q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
  const want = q.get('demo');
  if (want == null || q.get('gps') || q.get('chip') || !window.fetch) return;
  const C = window.GPT100_CONFIG, R = window.GPT100_DEMO;
  if (!C || !R) return;
  const T = C.tracking = C.tracking || {};
  const ORIGIN = 'https://demo.gpt100.invalid', BASE = ORIGIN + '/feed/';  // never fetched: window.fetch answers it below
  T.gps = BASE; T.chip = BASE + 'timing.json'; T.credit = null;
  // Read the demo feeds every few seconds (the real feeds keep their providers' cadence, 15 and 30 s), so the
  // runners move smoothly at 10x and 60x instead of jumping every 15 s.
  T.gpsEvery = 3; T.chipEvery = 5;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- the race clock ----------
  // The demo pretends the Miler started H hours ago, so race time runs on the real clock and the chip reads and GPS
  // fixes carry real times of day. Race time is kept as ms since the Miler start, in segments of real time each at
  // a speed (0 while paused): race time at real time t is s + v * (t - t0) of the segment in force. Kept in
  // sessionStorage so the race carries on when moving between the apps.
  const SS = 'gpt100_demo', MILER0 = Date.parse(R.contests['GPT100 Miler'].start + ':00+11:00');
  const SPEEDS = [0, 1, 10, 60];
  function startAt(v) {
    let m;
    if ((m = /^(\d+(?:\.\d+)?)h$/i.exec(v)) || ((m = /^(\d+(?:\.\d+)?)$/.exec(v)) && +v !== 1)) return (+m[1]) * 3600e3;
    if ((m = /^(thu|fri|sat|sun)\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(v))) {
      const day = { thu: 5, fri: 6, sat: 7, sun: 8 }[m[1].toLowerCase()];
      return Date.parse(`2026-11-0${day}T${String(+m[2]).padStart(2, '0')}:${m[3] || '00'}:00+11:00`) - MILER0;
    }
    return 9 * 3600e3;  // the default: 9 hours in, the Miler spread from Halls Gap back to the Mt Difficult ridge
  }
  let segs = null;
  try { const v = JSON.parse(sessionStorage.getItem(SS) || 'null'); if (v && v.key === want && Array.isArray(v.segs) && v.segs.length) segs = v.segs; } catch (e) { }
  if (!segs) {
    const sp = q.get('speed') == null ? 1 : +q.get('speed');
    segs = [{ t: Date.now(), s: startAt(want || ''), v: SPEEDS.includes(sp) ? sp : 1 }];
  }
  const save = () => { try { sessionStorage.setItem(SS, JSON.stringify({ key: want, segs: segs.slice(-60) })); } catch (e) { } };
  save();
  const seg = () => segs[segs.length - 1];
  const simNow = (t = Date.now()) => { let g = segs[0]; for (const x of segs) if (x.t <= t) g = x; return g.s + g.v * (t - g.t); };
  // The real moment a race time was reached, at the speed in force then (so ages stay right after a speed change).
  function realOf(s) {
    for (let i = segs.length - 1; i >= 0; i--) {
      const g = segs[i];
      if (s >= g.s) { const t = g.v > 0 ? g.t + (s - g.s) / g.v : g.t; return i < segs.length - 1 ? Math.min(t, segs[i + 1].t) : t; }
    }
    const g = segs[0]; return g.t - (g.s - s) / (g.v || 1);
  }
  function setSpeed(v) { if (!SPEEDS.includes(v) || v === seg().v) return; segs.push({ t: Date.now(), s: simNow(), v }); save(); drawBar(); }
  function jump(ms) { segs.push({ t: Date.now(), s: simNow() + ms, v: seg().v }); save(); drawBar(); }

  // ---------- the field ----------
  const EPOCH = Date.UTC(2006, 0, 1) / 1000;
  let G = null, PTS = null, RUN = null;
  // Time from course km a to km b for a runner at pace f (0 = the fastest runner, 1 = the cut-offs), from the pacing table.
  const at = (km, k) => { if (km <= PTS[0].km) return PTS[0][k]; for (let i = 1; i < PTS.length; i++) if (km <= PTS[i].km) { const a = PTS[i - 1], b = PTS[i]; return a[k] + (b[k] - a[k]) * (km - a.km) / (b.km - a.km); } return PTS[PTS.length - 1][k]; };
  const timeTo = (a, b, f) => { const x = at(b, 'f') - at(a, 'f'), y = at(b, 's') - at(a, 's'); return x + f * (y - x); };
  function kmAfter(k0, f, ms, k1) {
    let lo = k0, hi = k1;
    if (timeTo(k0, hi, f) <= ms) return hi;
    for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (timeTo(k0, m, f) <= ms) lo = m; else hi = m; }
    return lo;
  }
  const STOPS = { stopped: 1, lost: 1, off: 1, dnf: 1 };  // cases where the runner goes no further than their case km
  function setup() {
    if (RUN) return;
    G = window.GPT; const P = window.GPT100_PACING;
    PTS = P.miler.points.map(p => ({ km: p.km, name: p.name, f: Date.parse(p.fast + ':00+11:00'), s: Date.parse(p.slow + ':00+11:00') }));
    const kmOf = name => { const a = G.AID.find(x => x.name === name); return a ? a.trail_km : null; };
    RUN = [];
    for (const r of R.runners) {
      const ct = R.contests[r.contest]; if (!ct) continue;
      const k0 = kmOf(ct.from), k1 = kmOf(ct.to);
      if (k0 == null || k1 == null) continue;
      const T0 = Date.parse(ct.start + ':00+11:00') - MILER0;  // race time of this race's start
      const x = { id: 'd' + r.bib, bib: String(r.bib), name: r.name, contest: r.contest, f: r.pace, k0, k1, T0, kase: r.case || '', caseKm: r.km, gps: r.case !== 'nogps', lastSim: 0, bearing: (r.bib * 2.399) % (2 * Math.PI) };
      x.tCase = x.caseKm != null ? T0 + timeTo(k0, x.caseKm, x.f) : Infinity;
      x.tFinish = STOPS[x.kase] ? Infinity : T0 + timeTo(k0, k1, x.f);
      RUN.push(x);
    }
  }
  const kmAt = (r, s) => s < r.T0 ? null : Math.min(kmAfter(r.k0, r.f, s - r.T0, r.k1), STOPS[r.kase] ? r.caseKm : Infinity);
  // Where the runner is at sim time s: on the course, with a little GPS wobble; the off-course runner drifts 300 m over 15 minutes.
  function ll(r, s) {
    const p = G.route[G.idxAtKm(kmAt(r, s))];
    let lat = p[0], lon = p[1];
    if (r.kase === 'off' && s > r.tCase) {
      const d = Math.min(1, (s - r.tCase) / (15 * 60e3)) * 300;
      lat += d * Math.cos(r.bearing) / 111320; lon += d * Math.sin(r.bearing) / (111320 * Math.cos(lat * Math.PI / 180));
    }
    return [lat + Math.sin(s / 37e3 + r.bib) * 0.00009, lon + Math.cos(s / 41e3 + r.bib) * 0.00011];
  }
  // Whether the tracker is sending at sim time s.
  const sending = (r, s) => r.gps && s >= r.T0 && s <= r.tFinish + 60e3 && !((r.kase === 'quiet' || r.kase === 'lost' || r.kase === 'dnf') && s > r.tCase);

  // ---------- the GPS feed (GPS-seuranta shapes) ----------
  let dataText = '';
  function initText() {
    let s = 'VERSIO:3\nRACENAME:GPT100 demo\nTIMEZONE:660\nGRABINTERVAL:15\nDASHLIMIT:60\nLIVEBUFFER:150\nMINBEFORESTART:3\nLIVE:1\nMAPSYSTEM:OTM\nCENTERPOINT:142.52|-37.3\nMAXTIMEMINS:2600\n';
    for (const r of RUN) if (r.gps) s += `COMPETITOR:${r.id}|20261106|600|${r.bib} ${r.name}|${r.bib} ${r.name.split(' ').pop()}|A=${r.bib} ${r.name}|\n`;
    return s;
  }
  // Appends every fix made since the last call: one a minute of race time per runner, for the last 2 hours at first.
  function appendNew() {
    const now = simNow();
    for (const r of RUN) {
      if (!r.gps) continue;
      let from = r.lastSim ? r.lastSim + 60e3 : Math.ceil(Math.max(r.T0, now - 2 * 3600e3) / 60e3) * 60e3;
      const pts = [];
      for (let s = from; s <= now; s += 60e3) {
        r.lastSim = s;
        if (!sending(r, s)) continue;
        const p = ll(r, s);
        pts.push([Math.floor(realOf(s) / 1000) - EPOCH, Math.round(p[1] * 5e4), Math.round(p[0] * 1e5)]);
      }
      if (!pts.length) continue;
      let line = `${r.id}.${pts[0][0]}_${pts[0][1]}_${pts[0][2]}_B90_S0`;
      for (let k = 1; k < pts.length; k++) line += `.${pts[k][0] - pts[k - 1][0]}_${pts[k][1] - pts[k - 1][1]}_${pts[k][2] - pts[k - 1][2]}`;
      dataText += line + '\n';
    }
  }

  // ---------- the timing list (RaceResult shape) ----------
  const tod = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const stamp = ms => { const p = {}; tod.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; }); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`; };
  function timing() {
    const now = simNow();
    const cols = PTS.map((p, i) => i === 0 ? 'Start' : i === PTS.length - 1 ? 'Finish' : p.name);
    const data = {};
    RUN.forEach(r => {
      const km = kmAt(r, now);
      let status = '';
      if (r.kase === 'dnf' && now >= r.tCase) status = 'DNF';
      else if (now >= r.tFinish) status = 'Finished';
      const times = PTS.map(p => {
        if (km == null || p.km < r.k0 - 0.05 || p.km > r.k1 + 0.05 || p.km > km + 1e-6) return '';
        if (r.kase === 'missed' && Math.abs(p.km - r.caseKm) < 0.05) return '';
        const c = r.T0 + timeTo(r.k0, p.km, r.f);
        return c <= now ? stamp(realOf(c)) : '';
      });
      const key = `#${Object.keys(R.contests).indexOf(r.contest) + 1}_${r.contest}`;
      (data[key] = data[key] || []).push([r.bib, r.name, r.contest, status].concat(times));
    });
    return { list: { ListName: 'GPT100 Safety demo timing list', Fields: ['Bib', 'Name', 'Contest', 'Status'].concat(cols).map(l => ({ Label: l })) }, data };
  }

  // ---------- answering the apps' feed requests ----------
  const ready = new Promise(res => { if (document.readyState === 'complete') res(); else addEventListener('load', res); });
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    if (typeof url !== 'string' || !url.startsWith(ORIGIN + '/')) return realFetch(input, init);
    const path = url.slice(ORIGIN.length + 1);
    return path.startsWith('rc/') ? serveRC(path.slice(3), init) : serve(path.replace(/^feed\//, ''));
  };
  const resp = (body, h) => new Response(body, { status: 200, headers: Object.assign({ 'Content-Type': 'text/plain' }, h || {}) });
  async function serve(path) {
    await ready; setup();
    const [name, qs] = path.split('?');
    if (name === 'init.txt') return resp(initText());
    if (name === 'data.lst' || name === 'data.php') {
      appendNew();
      const off = name === 'data.php' ? +(new URLSearchParams(qs || '').get('offset') || 0) : 0;
      return resp(dataText.slice(Math.max(0, Math.min(off, dataText.length))), { 'X-GPS-Server-Filesize': String(dataText.length), 'X-GPS-Server-Reset': '0' });
    }
    if (name === 'timing.json') return resp(JSON.stringify(timing()), { 'Content-Type': 'application/json' });
    return new Response('', { status: 404 });
  }

  // ---------- the Race Control board ----------
  // The board's incidents follow a timeline in race time, so as the demo runs new calls come in, teams go on scene
  // and incidents close. Changes made on the board (new incidents, steps, units, log entries) are kept on top of the
  // timeline for this tab. The board opens without the medical password while the demo is on.
  const HMS = (h, m) => (h * 60 + m) * 60e3;  // race time, hours and minutes after the Miler start
  const STEPS = ['call', 'dispatched', 'onScene', 'leaving', 'closed'];
  const SEED = [
    { id: 'demo5', severity: 'routine', where: 'Mt Difficult Rd car park', reporter: 'Aid station lead', desc: 'Spectator 2WD bogged on the verge at the car park entrance, partly blocking the access road. Parks Victoria told, tow arranged.',
      at: { call: HMS(6, 50), closed: HMS(7, 30) }, outcome: 'Other' },
    { id: 'demo3', severity: 'routine', km: 35.3, bib: '1060', name: 'Sarah Young', race: 'GPT100 Miler', reporter: 'Mt Difficult Rd aid station', desc: 'Withdrew at Mt Difficult Rd, blisters both heels, dressed. Needs a lift back to Halls Gap.',
      at: { call: HMS(7, 5), closed: HMS(7, 40) }, outcome: 'Treated, withdrew (DNF)' },
    { id: 'demo1', severity: 'urgent', km: 36.3, bib: '1026', name: 'Casey Ward', race: 'GPT100 Miler', reporter: 'Runner, by phone', unit: 'team-hg', desc: 'Fell on the descent and slid off the track, right ankle, can\'t weight bear. Off the marked course, about 300 m below the track.',
      at: { call: HMS(8, 34), dispatched: HMS(8, 38), onScene: HMS(9, 22), leaving: HMS(9, 58), closed: HMS(10, 40) }, outcome: 'Carried out' },
    { id: 'demo2', severity: 'priority', km: 43.2, bib: '1015', name: 'Nina Russo', race: 'GPT100 Miler', reporter: 'Sweep 2, by radio', unit: 'u-Sweep-2', desc: 'Sitting at the trackside, vomiting and dizzy, can\'t keep fluids down. Sweep 2 with her, out of the wind.',
      at: { call: HMS(8, 47), dispatched: HMS(8, 47), onScene: HMS(8, 47), leaving: HMS(9, 35), closed: HMS(10, 5) }, outcome: 'Walked out with crew' },
    { id: 'demo4', severity: 'priority', km: 80.8, bib: '2211', name: 'Angus Burke', race: 'Stage 2', reporter: 'Race control, from the tracking', unit: 'u-Mt-William-SO', desc: 'Tracker shows no movement for 40 minutes on the summit track below Mt William, no answer on his phone. Mt William Safety Officers walking down to check.',
      at: { call: HMS(8, 58), dispatched: HMS(9, 3), onScene: HMS(9, 40), leaving: HMS(10, 5), closed: HMS(10, 30) }, outcome: 'Treated, continued' },
    { id: 'demo6', severity: 'urgent', km: 53.0, bib: '1033', name: 'Kate Murphy', race: 'GPT100 Miler', reporter: 'Another runner, by phone', unit: 'team-jc', desc: 'Collapsed near the Pinnacle track junction, conscious, chest pain and short of breath. Two runners with her.',
      at: { call: HMS(9, 12), dispatched: HMS(9, 16), onScene: HMS(10, 5), leaving: HMS(10, 50), closed: HMS(11, 30) }, outcome: 'Ambulance' },
    { id: 'demo7', severity: 'priority', km: 42.2, bib: '1042', name: 'Jamie Patel', race: 'GPT100 Miler', reporter: 'Race control, from the timing', unit: 'u-Sweep-1', desc: 'Overdue at Halls Gap, last chip read Mt Difficult Rd, tracker dead since then. Sweep 1 checking back along the track from Halls Gap.',
      at: { call: HMS(9, 31), dispatched: HMS(9, 33) } }
  ];
  const CUSTOM = { 'u-Sweep-1': 'Sweep 1', 'u-Sweep-2': 'Sweep 2', 'u-Mt-William-SO': 'Mt William SO pair' };
  const NOTES = [[HMS(8, 30), 'Halls Gap team back at base and restocked'], [HMS(9, 5), 'Weather: gusts 42 km/h on Mt William, under the trigger'], [HMS(9, 45), 'Mt William car park: 61 Stage 2 runners through']];
  const STEP_TEXT = { dispatched: 'Dispatched', onScene: 'On scene', leaving: 'Leaving scene' };
  const RCS = 'gpt100_demo_rc';
  let over = { inc: {}, units: {}, log: [], n: 0 };  // changes made on the board, on top of the timeline
  try { const v = JSON.parse(sessionStorage.getItem(RCS) || 'null'); if (v && v.key === want) over = v.over; } catch (e) { }
  const saveRC = () => { try { sessionStorage.setItem(RCS, JSON.stringify({ key: want, over })); } catch (e) { } };
  const merge = (a, b) => { const o = Object.assign({}, a); for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' ? merge(o[k], v) : v; return o; };
  // The board as it stands at race time s: the timeline up to now, with the board's own changes on top.
  function board() {
    const s = simNow(), incidents = [], log = [], units = {};
    let num = 0;
    const unitLabel = id => CUSTOM[id] || (C.bases.find(b => 'team-' + b.key === id) || {}).name + ' team';
    for (const d of SEED) {
      if (d.at.call > s) continue;
      num++;
      // Once the operator closes an incident, the timeline stops stepping it (the operator's actions win).
      const o = over.inc[d.id], cut = o && o.patch.status === 'closed' ? (o.patch.times && o.patch.times.closed) || o.t : Infinity;
      const times = {}; let updated = 0;
      STEPS.forEach((k, i) => { if (d.at[k] != null && d.at[k] <= s && realOf(d.at[k]) <= cut) { times[k] = realOf(d.at[k]); updated = Math.max(updated, times[k]); } });
      let inc = { id: d.id, num, created: times.call, status: times.closed ? 'closed' : 'open', severity: d.severity, km: d.km ?? null, where: d.where || '', bib: d.bib || '', name: d.name || '', race: d.race || '', reporter: d.reporter || '', desc: d.desc, unit: d.unit || null, times, version: Object.keys(times).length, updated };
      if (times.closed) inc.outcome = d.outcome;
      STEPS.forEach((k, i) => {
        if (!times[k]) return;
        const text = k === 'call' ? `#${num} Logged: ${d.severity[0].toUpperCase() + d.severity.slice(1)}${d.km != null ? ', km ' + d.km : ''}, ${d.desc.slice(0, 80)}` : k === 'closed' ? `#${num} Closed: ${d.outcome}` : `#${num} ${STEP_TEXT[k]}${d.unit ? ' (' + unitLabel(d.unit) + ')' : ''}`;
        log.push({ id: Math.round(times[k]) * 10 + i, t: times[k], updated: times[k], incident: d.id, kind: 'incident', text, who: 'Race control' });
      });
      if (d.unit && times.dispatched && cut === Infinity) {
        const st = times.closed ? 'available' : times.leaving ? 'returning' : times.onScene ? 'onscene' : 'tasked';
        units[d.unit] = { id: d.unit, status: st, incident: times.closed ? null : d.id, updated, custom: !!CUSTOM[d.unit], label: CUSTOM[d.unit] };
      }
      if (o) { inc = merge(inc, o.patch); inc.updated = Math.max(inc.updated, o.t); inc.version += o.n; }
      incidents.push(inc);
    }
    for (const [id, o] of Object.entries(over.inc)) if (!SEED.some(d => d.id === id)) incidents.push(Object.assign({ id }, o.patch, { updated: o.t, version: o.n }));
    for (const [id, label] of Object.entries(CUSTOM)) if (!units[id]) units[id] = { id, custom: true, label, status: 'available', incident: null, updated: realOf(0) };
    for (const [id, o] of Object.entries(over.units)) units[id] = Object.assign(units[id] || { id }, o.patch, { id, updated: o.t });
    NOTES.forEach(([at, text], i) => { if (at <= s) { const t = realOf(at); log.push({ id: Math.round(t) * 10 + 9, t, updated: t, incident: null, kind: 'note', text, who: 'Race control' }); } });
    over.log.forEach(l => log.push(l));
    return { incidents, units: Object.values(units), log: log.sort((a, b) => b.id - a.id) };
  }
  const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  async function serveRC(path, init) {
    await ready; setup();
    const [name, qs] = path.split('?'), now = Date.now();
    if (name === 'state') {
      const since = +(new URLSearchParams(qs || '').get('since') || 0), b = board();
      return json({ now, incidents: b.incidents.filter(i => i.updated > since), units: b.units.filter(u => u.updated > since), log: b.log.filter(l => l.updated > since).slice(0, 500) });
    }
    let body = {}; try { body = JSON.parse(init && init.body || '{}'); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const who = String(body.who || '').slice(0, 60);
    const addLog = (incident, kind, text) => { over.log.push({ id: now * 10 + 5, t: now, updated: now, incident, kind, text: String(text).slice(0, 1000), who }); };
    if (name === 'incident') {
      const b = board(); let id = typeof body.id === 'string' ? body.id : null, cur = id && b.incidents.find(i => i.id === id);
      if (cur) { const o = over.inc[id] || { patch: {}, t: 0, n: 0 }; o.patch = merge(o.patch, body.patch || {}); o.t = now; o.n++; over.inc[id] = o; }
      else { id = id || 'i' + now.toString(36); over.n++; over.inc[id] = { patch: Object.assign({ created: now, status: 'open', num: 20 + over.n }, body.patch || {}), t: now, n: 1 }; }
      const inc = board().incidents.find(i => i.id === id);
      if (body.note) addLog(id, 'incident', '#' + inc.num + ' ' + body.note);
      saveRC();
      return json({ ok: true, incident: inc });
    }
    if (name === 'unit') {
      if (typeof body.id !== 'string') return json({ error: 'Bad unit' }, 400);
      const o = over.units[body.id] || { patch: {}, t: 0 }; o.patch = merge(o.patch, body.patch || {}); o.t = now; over.units[body.id] = o;
      if (body.note) addLog(o.patch.incident || null, 'unit', body.note);
      saveRC();
      return json({ ok: true, unit: board().units.find(u => u.id === body.id) });
    }
    if (name === 'log') {
      if (!body.text) return json({ error: 'Empty' }, 400);
      addLog(typeof body.incident === 'string' ? body.incident : null, 'note', body.text); saveRC();
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  }

  // ---------- the demo bar ----------
  const HM = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const NOTE = { nogps: 'no tracker, placed by the chips', quiet: 'tracker went quiet', stopped: 'stopped, tracker still sending', lost: 'tracker lost and stopped', dnf: 'withdrew', missed: 'missed by the chip reader', off: 'wandered off the course' };
  const mins = ms => { const m = Math.round(Math.abs(ms) / 60e3), h = Math.floor(m / 60); return h ? `${h} h ${m % 60} min` : `${m} min`; };
  let bar = null, list = null;
  function build() {
    bar = document.createElement('div'); bar.className = 'demo-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Demo');
    const exit = new URLSearchParams(location.search); exit.delete('demo'); exit.delete('speed');
    const exitHref = location.pathname + (exit.toString() ? '?' + exit : '') + location.hash;
    bar.innerHTML = `<span class="demo-tag">Demo</span><span class="demo-time"><b id="demoClock"></b><span id="demoIn"></span></span>
      <span class="demo-ctl">${SPEEDS.map(v => `<button type="button" data-v="${v}">${v ? v + 'x' : 'Pause'}</button>`).join('')}<button type="button" data-jump="30">+30 min</button><button type="button" id="demoWhat">Who to find</button><a class="demo-exit" href="${esc(exitHref)}">Exit</a></span>`;
    list = document.createElement('div'); list.className = 'demo-list'; list.hidden = true;
    document.body.appendChild(bar); document.body.appendChild(list);
    document.documentElement.classList.add('demo-on');
    bar.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.v)));
    bar.querySelector('[data-jump]').addEventListener('click', () => jump(30 * 60e3));
    bar.querySelector('#demoWhat').addEventListener('click', () => { list.hidden = !list.hidden; if (!list.hidden) drawList(); });
    bar.querySelector('.demo-exit').addEventListener('click', () => { try { sessionStorage.removeItem(SS); } catch (e) { } });
    document.addEventListener('click', e => { if (!list.hidden && !list.contains(e.target) && !bar.contains(e.target)) list.hidden = true; });
    drawBar(); setInterval(drawBar, 1000);
  }
  function drawBar() {
    if (!bar) return;
    const s = simNow();
    bar.querySelector('#demoClock').textContent = s >= 0 ? `${mins(s)} into the Miler` : `${mins(-s)} before the Miler starts`;
    bar.querySelector('#demoIn').textContent = `Miler start ${HM.format(new Date(realOf(0)))}${seg().v !== 1 ? seg().v ? `, running at ${seg().v}x` : ', paused' : ''}`;
    bar.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', +b.dataset.v === seg().v));
    if (!list.hidden) drawList();
  }
  function drawList() {
    setup();
    const now = simNow(), canFind = !!(window.GPT_UI || window.GPTMapPage);
    const rows = RUN.filter(r => r.kase).sort((a, b) => a.tCase - b.tCase).map(r => {
      const when = r.tCase === Infinity ? '' : r.tCase <= now ? ` at km ${r.caseKm}, ${mins(now - r.tCase)} ago` : ` at km ${r.caseKm}, in ${mins(r.tCase - now)}`;
      return `<div class="row"><span><b>Bib ${r.bib}</b> ${esc(r.name)}${r.contest !== 'GPT100 Miler' ? ` (${esc(r.contest)})` : ''}<span class="sub">${NOTE[r.kase]}${when}</span></span>${canFind ? `<button class="btn small trk-go" type="button" data-bib="${r.bib}">Find</button>` : ''}</div>`;
    });
    list.innerHTML = `<h3>Who to find in the demo</h3><p class="muted">${R.runners.length} made-up runners (${Object.keys(R.contests).join(' and ')}). These ones have something going on; everyone else is running normally.</p>` + rows.join('') +
      '<p class="muted">The Control board has their incidents, and more come in as the race runs.</p>' +
      '<p class="muted">Not moving shows after 20 real minutes at the same spot; late at the next checkpoint once the runner is past their expected time there. Both count real minutes, so run at 1x to see them come up as they would on the day.</p>';
  }
  if (document.body) build(); else addEventListener('DOMContentLoaded', build);

  window.GPTDemo = { on: true, rcBase: ORIGIN, simNow, realOf, speed: () => seg().v, setSpeed, jump, runners: () => { setup(); return RUN; } };
})();
