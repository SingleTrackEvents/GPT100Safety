// Races, stages, cut-offs and expected times, shared by the runner and field apps.
// Race details come from data/races.js (tools/import_races.mjs, from the course sheet); courses that aren't in
// the safety app's data come from data/runner-courses.js (tools/import_gpx.mjs). Expected times at each point come
// from the splits fitted to last year's field (data/splits.js) where a race has them, else from the blend of the
// first runner's time and the cut-off.
(function () {
  const MAIN = window.GPT, R = window.GPT_RACES;

  // ---------- times (Melbourne; the race is in November, daylight saving, UTC+11) ----------
  const mel = s => s ? new Date(s + ':00+11:00') : null;
  const fmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const hm = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const when = d => d ? fmt.format(d).replace(',', '') : '';
  const dur = ms => { const m = Math.round(Math.abs(ms) / 60000), h = Math.floor(m / 60); return h ? `${h} h ${m % 60} min` : `${m} min`; };

  // ---------- races and stages, matched onto the course line ----------
  const STOP = new Set(['mt', 'mount', 'car', 'park', 'carpark', 'camp', 'rd', 'road', 'track', 'water', 'point', 'trailhead', 'fireline', 'the', 'aid', 'station', 'start', 'finish', 'gap', 'emergency', 'checkpoint']);
  // Sheet names that look like a course stop but aren't it (placed in proportion instead).
  const NOT_A_STOP = new Set(['wonderland trailhead']);
  const words = s => s.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
  // Courses from GPX (data/runner-courses.js, tools/import_gpx.mjs) get the few engine pieces the app uses.
  const MINI = {};
  function mini(def) {
    const route = def.route, asc = [0], desc = [0];
    for (let i = 1; i < route.length; i++) { const d = route[i][3] - route[i - 1][3]; asc.push(asc[i - 1] + Math.max(0, d)); desc.push(desc[i - 1] + Math.max(0, -d)); }
    const idxAtKm = km => { let lo = 0, hi = route.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (route[m][2] < km) lo = m + 1; else hi = m; } return lo; };
    const E = {
      id: def.id, name: def.name, main: false, route, metres: MAIN.metres, idxAtKm,
      AID: def.stops.map(s => ({ name: s.name, lat: s.lat, lon: s.lon, trail_km: s.km, kind: s.kind })),
      climb: (a, b) => a <= b ? asc[b] - asc[a] : desc[a] - desc[b],
      snap(lat, lon) { let bi = 0, bd = Infinity; route.forEach((p, i) => { const d = MAIN.metres([lat, lon], [p[0], p[1]]); if (d < bd) { bd = d; bi = i; } }); return { ic: bi, offM: Math.round(bd) }; }
    };
    E.courses = [E];
    return E;
  }
  const engineFor = stage => {
    if (stage.course === '100') return MAIN;
    if (stage.course === '14k') return MAIN.course('14k');
    const def = (window.GPT_RUNNER_COURSES || {})[stage.course];
    return def ? (MINI[def.id] = MINI[def.id] || mini(def)) : null;
  };
  // Each race point gets gk: its km on the course line. Aid stations are matched by name (in order);
  // points that don't match (a sheet point with no staffed point on the course) sit between their neighbours in proportion.
  function prepare(stage, course) {
    if (stage.ready) return stage;
    stage.course = course; stage.ready = true;
    const E = engineFor(stage), P = stage.points;
    // Races without a map: place the start by name.
    if (!E) { const a = MAIN.AID.find(a => words(P[0].name).some(w => !STOP.has(w) && words(a.name).includes(w))); P.forEach(p => { p.ft = mel(p.first); p.ct = mel(p.cutoff); if (a) { p.lat = a.lat; p.lon = a.lon; } }); return stage; }
    let from = 0;
    P.forEach((p, i) => {
      const w = words(p.name), key = w.filter(x => !STOP.has(x));
      if (NOT_A_STOP.has(w.join(' '))) return;
      let best = null;
      E.AID.forEach(a => {
        if (a.trail_km < from - 0.01) return;
        const aw = words(a.name), compact = aw.join('');
        if (!key.some(k => k.length >= 3 && compact.includes(k))) return;
        const score = w.filter(x => aw.includes(x)).length + (key.every(k => compact.includes(k)) ? 2 : 0);
        if (!best || score > best.score || (score === best.score && a.trail_km < best.a.trail_km)) best = { a, score };
      });
      if (best) { p.gk = best.a.trail_km; p.lat = best.a.lat; p.lon = best.a.lon; from = p.gk; }
    });
    const last = E.route[E.route.length - 1][2];
    if (P[0].gk == null) P[0].gk = 0;
    if (P[P.length - 1].gk == null) P[P.length - 1].gk = last;
    for (let i = 1; i < P.length - 1; i++) if (P[i].gk == null) {
      let a = i - 1, b = i + 1; while (P[b].gk == null) b++;
      P[i].gk = P[a].gk + (P[b].gk - P[a].gk) * (P[i].km - P[a].km) / ((P[b].km - P[a].km) || 1);
    }
    P.forEach(p => { if (p.lat == null) { const q = E.route[E.idxAtKm(p.gk)]; p.lat = q[0]; p.lon = q[1]; } p.ft = mel(p.first); p.ct = mel(p.cutoff); });
    // Out-and-back courses: the turnaround becomes a point too (its times are in proportion; no cut-off).
    E.AID.filter(a => a.kind === 'turn').forEach(a => {
      const i = P.findIndex(p => p.gk > a.trail_km); if (i < 1) return;
      const b = P[i - 1], c = P[i], f = (a.trail_km - b.gk) / ((c.gk - b.gk) || 1), at = (x, y) => new Date(x.getTime() + (y - x) * f);
      P.splice(i, 0, { name: a.name, kind: 'turn', km: b.km + (c.km - b.km) * f, gk: a.trail_km, lat: a.lat, lon: a.lon, ft: at(b.ft, c.ft), ct: at(b.ct, c.ct), noCut: true, crew: 'no', drop: false, up: Math.round(b.up + (c.up - b.up) * f), down: Math.round(b.down + (c.down - b.down) * f) });
    });
    fitSplits(stage);
    return stage;
  }
  // The splits fitted to last year's field (data/splits.js): each point gets sh = { a, b } (share of the finish time
  // = a + b × finish hours) and nk, the new km on the course before it. Points the fit doesn't name sit in
  // proportion by race km between the fitted ones, the start at 0 and the finish at 1.
  function fitSplits(stage) {
    const F = (window.GPT_SPLITS || {})[stage.id];
    if (!F) return;
    const P = stage.points, byName = {};
    Object.keys(F.points).forEach(k => { byName[k.toLowerCase().trim()] = F.points[k]; });
    let nk = 0;
    P.forEach((p, i) => {
      const f = byName[p.name.toLowerCase().trim()];
      if (f) { nk += f.newKm || 0; p.sh = { a: f.a, b: f.b }; }
      else if (i === 0) p.sh = { a: 0, b: 0 };
      else if (i === P.length - 1) p.sh = { a: 1, b: 0 };
      p.nk = nk;
    });
    for (let i = 1; i < P.length - 1; i++) if (!P[i].sh) {
      let a = i - 1, b = i + 1; while (!P[b].sh) b++;
      const f = (P[i].km - P[a].km) / ((P[b].km - P[a].km) || 1);
      P[i].sh = { a: P[a].sh.a + (P[b].sh.a - P[a].sh.a) * f, b: P[a].sh.b + (P[b].sh.b - P[a].sh.b) * f };
    }
    stage.fit = { minPerKm: F.flat ? F.flat.minPerKm : 0, leaderHours: F.flat ? F.flat.leaderHours : 1, newKm: nk };
  }
  // Course km and race km, through the matched aid stations.
  const interp = (P, x, from, to) => {
    if (x <= P[0][from]) return P[0][to] + (x - P[0][from]);
    for (let i = 1; i < P.length; i++) if (x <= P[i][from]) return P[i - 1][to] + (P[i][to] - P[i - 1][to]) * (x - P[i - 1][from]) / ((P[i][from] - P[i - 1][from]) || 1);
    return P[P.length - 1][to] + (x - P[P.length - 1][from]);
  };
  const toRace = (S, gk) => interp(S.points, gk, 'gk', 'km');
  const toCourse = (S, rk) => interp(S.points, rk, 'km', 'gk');
  // Expected time of day at a point for a pace p: 0 is the first runner, 1 is the cut-off. p sets the finish time,
  // between the first runner's and the final cut-off; with fitted splits (stage.fit) the time at each point is that
  // finish time times the point's share of it, plus the time for any new km on the course before the point.
  // Without them it's the same blend of the first runner's time and the cut-off at every point.
  // The fit is last year's finishers, and the early cut-offs are far more generous than any of them needed: it
  // can't put anyone on those cut-offs at all. So from pace FIT_TO the times move over to the blend, reaching it at
  // 1: a runner (or a sweep) on cut-off pace is due at each cut-off. The finish time is the same either way.
  const FIT_TO = 0.75;
  const pointTime = (S, k, p) => {
    const blend = k.ft.getTime() + p * (k.ct - k.ft);
    if (!S.fit) return blend;
    const P = S.points, start = P[0].ft.getTime(), fin = P[P.length - 1], T = fin.ft.getTime() + p * (fin.ct - fin.ft) - start, hours = T / 3600e3;
    const kmMs = S.fit.minPerKm * 60000 * (hours / S.fit.leaderHours);
    const fit = start + (k.sh.a + k.sh.b * hours) * (T - S.fit.newKm * kmMs) + k.nk * kmMs, w = Math.max(0, Math.min(1, (p - FIT_TO) / (1 - FIT_TO)));
    return fit + w * (blend - fit);
  };
  // Expected time of day at a race km for a pace p, in proportion between the points either side.
  const timeAt = (S, rk, p) => { const P = S.points; let i = 1; while (i < P.length - 1 && P[i].km < rk) i++; const a = P[i - 1], b = P[i], f = (rk - a.km) / ((b.km - a.km) || 1); const ta = pointTime(S, a, p), tb = pointTime(S, b, p); return ta + (tb - ta) * Math.max(0, Math.min(1, f)); };
  // Race km a mid-pack runner (p = 0.5) would be at, at time t.
  const interpKm = (S, t) => { const P = S.points; for (let i = 1; i < P.length; i++) { const a = pointTime(S, P[i - 1], 0.5), b = pointTime(S, P[i], 0.5); if (t <= b) return P[i - 1].km + (P[i].km - P[i - 1].km) * Math.max(0, (t - a) / ((b - a) || 1)); } return P[P.length - 1].km; };
  // The pace p that puts a runner at race km rk at time t (the inverse of timeAt; by halving, since the fitted
  // splits aren't a straight line in p).
  const paceAt = (S, rk, t) => {
    if (!S.fit) { const lo = timeAt(S, rk, 0), hi = timeAt(S, rk, 1); return hi > lo ? (t - lo) / (hi - lo) : 0; }
    // Past 4 the fitted times stop growing with p (and no one is that slow): 4 means "at least 4".
    let lo = -1, hi = 4;
    if (timeAt(S, rk, hi) <= timeAt(S, rk, lo)) return 0;
    if (timeAt(S, rk, hi) < t) return hi;
    for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; if (timeAt(S, rk, m) < t) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };

  // Your pace from where you are and the time, for a sweep or a runner. Not near the start (a few minutes or km in
  // tell nothing: early is set, with cut-off pace to go by), and no slower than SLOW (behind is set: well behind
  // cut-off pace, so a time would be a guess).
  const SLOW = 1.5, SNAP_KM = 0.1;
  const livePace = (S, rk, t) => {
    const P = S.points, start = P[0].ft.getTime(), fin = P[P.length - 1];
    if (t <= start) return null;
    const minT = Math.min(30 * 60e3, (fin.ft - start) / 10), p = t - start >= minT ? paceAt(S, rk, t) : null;
    if (p != null && p > SLOW) return { p: SLOW, behind: true };
    if (p == null || rk < Math.min(2, fin.km / 10)) return { p: 1, early: true };
    return { p };
  };
  // When you'd reach point k at your live pace, and how far ahead of its cut-off (margin, ms; null without one).
  // A GPS fix can put you 100 m short, so a time within that of the cut-off counts as on it (margin 0).
  const liveEta = (S, rk, t, k) => {
    const L = livePace(S, rk, t);
    if (!L || L.early || L.behind) return L;
    L.eta = timeAt(S, k.km, L.p);
    L.margin = k.ct && !k.noCut ? k.ct - L.eta : null;
    if (L.margin != null && L.margin <= -60e3 && k.ct - timeAt(S, k.km, paceAt(S, Math.min(k.km, rk + SNAP_KM), t)) > -60e3) L.margin = 0;
    return L;
  };

  const stagesOf = r => r.stages.map(id => prepare(R.stages[id], r.course));
  // A stage race opens on today's stage (or the next one).
  const currentStage = (r, now) => { const list = stagesOf(r); return list.find(s => s.points[s.points.length - 1].ct.getTime() > (now || Date.now())) || list[0]; };
  window.GPTRaces = { R, mel, fmt, hm, when, dur, words, engineFor, prepare, stagesOf, currentStage, toRace, toCourse, timeAt, interpKm, paceAt, livePace, liveEta };
})();
