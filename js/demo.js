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
  const BASE = 'https://demo.gpt100.invalid/feed/';  // never fetched: window.fetch answers it below
  T.gps = BASE; T.chip = BASE + 'timing.json'; T.credit = null;
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
    if (typeof url !== 'string' || !url.startsWith(BASE)) return realFetch(input, init);
    return serve(url.slice(BASE.length));
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
      '<p class="muted">Not moving shows after 20 real minutes at the same spot; late at the next checkpoint once the runner is past their expected time there. Both count real minutes, so run at 1x to see them come up as they would on the day.</p>';
  }
  if (document.body) build(); else addEventListener('DOMContentLoaded', build);

  window.GPTDemo = { on: true, simNow, realOf, speed: () => seg().v, setSpeed, jump, runners: () => { setup(); return RUN; } };
})();
