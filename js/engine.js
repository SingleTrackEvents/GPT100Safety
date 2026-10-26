// GPT100 response engine. Works fully offline from data/course.js, data/courses.js, data/access-edits.js
// and data/config.js. One engine per course: the main GPT100 course, plus any extra courses (e.g. the 14k).
(function () {
  const D = window.GPT100_DATA;
  const C = window.GPT100_CONFIG;
  const EDITS = window.GPT100_EDITS || { custom: [], hidden: [] };
  const EXTRA = window.GPT100_COURSES || [];

  function metres(a, b) {
    const R = 6371000, la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180;
    const dla = (b[0] - a[0]) * Math.PI / 180, dlo = (b[1] - a[1]) * Math.PI / 180;
    const x = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function fmt(m) {
    if (!isFinite(m)) return 'n/a';
    m = Math.round(m);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), x = m % 60;
    return x ? h + ' h ' + (x < 10 ? '0' : '') + x : h + ' h';
  }
  function isGated(a) { return !!a.gated || /GATED/i.test(a.name); }
  function cleanName(a) { return a.name.replace(/\s*\((POSSIBLE )?GATED ACCESS\)?/i, '').trim(); }
  function rating(min) { return min > C.redMin ? 'red' : (min > C.amberMin ? 'amber' : 'green'); }

  // The app's clock: the demo's race time when the demo is running (js/demo.js, ?demo=sat09:30), else the real time.
  function now() {
    const D = window.GPTDemo, R = window.GPT100_DEMO;
    if (D && D.on && D.simNow && R && R.contests && R.contests['GPT100 Miler']) return Date.parse(R.contests['GPT100 Miler'].start + ':00+11:00') + D.simNow();
    return Date.now();
  }
  // Sunrise and sunset (ms) at the course (-37.2, 142.5) on the day around time t: the sunrise equation, to a minute or two.
  function sun(t) {
    const r = Math.PI / 180, lat = -37.2, lon = 142.5;
    const n = Math.round(t / 864e5 + 2440587.5 - 2451545 + lon / 360), J = n - lon / 360;
    const M = (357.5291 + 0.98560028 * J) % 360, Cc = 1.9148 * Math.sin(M * r) + 0.02 * Math.sin(2 * M * r) + 0.0003 * Math.sin(3 * M * r);
    const L = (M + Cc + 282.9372) % 360, tr = 2451545 + J + 0.0053 * Math.sin(M * r) - 0.0069 * Math.sin(2 * L * r);
    const dec = Math.asin(Math.sin(L * r) * Math.sin(23.4397 * r));
    const w = Math.acos((Math.sin(-0.833 * r) - Math.sin(lat * r) * Math.sin(dec)) / (Math.cos(lat * r) * Math.cos(dec))) / r;
    const ms = j => (j - 2440587.5) * 864e5;
    return { rise: ms(tr - w / 360), set: ms(tr + w / 360) };
  }
  // Between sunset and sunrise: walk-in and carry-out times are multiplied by config.nightFactor.
  function isNight(t) { const s = sun(t); return t < s.rise || t > s.set; }

  // Access points (shared by every course): built-in minus hidden, plus custom edits.
  const hidden = new Set(EDITS.hidden || []);
  const ALL_ACCESS = D.access.filter(a => !hidden.has(a.name + '|' + a.trail_km)).concat(EDITS.custom || []);
  const BASES = C.bases.map(b => {
    const ll = D.bases[b.key];
    return Object.assign({}, b, { lat: ll[1], lon: ll[0] });
  });

  function driveMin(a, key) {
    const s = a['drive_' + key + '_s'];
    if (s == null || isNaN(s)) return null;
    // Valhalla times already allow for winding and gravel roads, and hand-set times are real drive times,
    // so both skip the road factor.
    const src = a.drive_src && a.drive_src[key];
    const factor = src === 'valhalla' || src === 'manual' ? 1 : C.driveFactor;
    return (s / 60) * factor;
  }

  // Stored drive lines link an access point to one base, in either direction. Only use them for that base.
  function driveLine(a, key) {
    // Checked routes from each base (tools/drive_routes.py) come first.
    if (a.drive_geoms && a.drive_geoms[key] && a.drive_geoms[key].length > 1) return a.drive_geoms[key];
    const g = a.drive_geom, b = BASES.find(x => x.key === key);
    if (!g || g.length < 2 || !b) return null;
    const near = p => metres(p, [b.lat, b.lon]) < 1500;
    if (near(g[g.length - 1])) return g;
    if (near(g[0])) return g.slice().reverse();
    return null;
  }

  // Build the engine for one course.
  // def: { id, name, label, route: [[lat, lon, km, ele]], total_km, main (true for GPT100), stops (extra courses) }
  function makeCourse(def) {
    const route = def.route, N = route.length;

    // Cumulative climb/descent so ascent between any two points is O(1).
    const cumAsc = new Array(N), cumDesc = new Array(N);
    cumAsc[0] = 0; cumDesc[0] = 0;
    for (let i = 1; i < N; i++) {
      const d = route[i][3] - route[i - 1][3];
      cumAsc[i] = cumAsc[i - 1] + (d > 0 ? d : 0);
      cumDesc[i] = cumDesc[i - 1] + (d < 0 ? -d : 0);
    }
    // Metres climbed travelling along the course from index a to index b.
    function climb(a, b) { return a <= b ? cumAsc[b] - cumAsc[a] : cumDesc[a] - cumDesc[b]; }

    function idxAtKm(km) {
      let lo = 0, hi = N - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (route[mid][2] < km) lo = mid + 1; else hi = mid; }
      if (lo > 0 && Math.abs(route[lo - 1][2] - km) <= Math.abs(route[lo][2] - km)) return lo - 1;
      return lo;
    }
    function snap(lat, lon) {
      let best = 1e18, bi = 0; const k = Math.cos(lat * Math.PI / 180);
      for (let i = 0; i < N; i++) {
        const dy = route[i][0] - lat, dx = (route[i][1] - lon) * k, d = dy * dy + dx * dx;
        if (d < best) { best = d; bi = i; }
      }
      return { ic: bi, offM: Math.round(metres([lat, lon], [route[bi][0], route[bi][1]])) };
    }

    // what3words of each course point, stored in data/course-w3w.js (tools/add_course_w3w.py) so the apps can
    // show three words with no signal. storedW3w(i): the words of route point i. nearW3w(lat, lon): the words
    // of the nearest course point and how far away it is, or null when it's further than maxM (30 m).
    const STORED_W3W = (window.GPT100_COURSE_W3W || {})[def.main ? 'gpt100' : def.id] || [];
    function storedW3w(i) { return STORED_W3W[i] || null; }
    function nearW3w(lat, lon, maxM) {
      const s = snap(lat, lon), w = storedW3w(s.ic);
      return w && s.offM <= (maxM || 30) ? { words: w, m: s.offM, ic: s.ic } : null;
    }

    // Other places the course passes the same spot (an out and back, or a loop's start and finish).
    function revisits(ic, maxM) {
      maxM = maxM || 40;
      const here = [route[ic][0], route[ic][1]], km = route[ic][2], out = [];
      let group = null;
      for (let i = 0; i < N; i++) {
        if (Math.abs(route[i][2] - km) < 0.5) continue;
        const d = metres(here, [route[i][0], route[i][1]]);
        if (d > maxM) continue;
        if (group && route[i][2] - route[group.i][2] < 0.5) { if (d < group.d) { group.i = i; group.d = d; } }
        else { group = { i, d }; out.push(group); }
      }
      return out.map(g => g.i);
    }

    // Where each access point joins this course ("joins": one per pass of the course nearby).
    // The main course uses the measured trail_km and walking track. Other courses use real walks along
    // OpenStreetMap paths, worked out by tools/add_course.py; a point without one only joins if it is
    // right beside the course.
    function passes(lat, lon, maxM) {
      const d = route.map(p => metres([lat, lon], [p[0], p[1]])), out = [];
      for (let i = 0; i < N; i++) {
        if (d[i] > maxM) continue;
        let min = true;
        for (let j = i - 1; min && j >= 0 && route[i][2] - route[j][2] < 0.5; j--) if (d[j] < d[i]) min = false;
        for (let j = i + 1; min && j < N && route[j][2] - route[i][2] < 0.5; j++) if (d[j] <= d[i]) min = false;
        if (min) out.push({ i, d: d[i] });
      }
      return out;
    }
    // Climb carrying back up the walk from the course to the parking: its climb in, less the height gained (heights known, over 50 m long).
    function connBack(a, idx, m, up) { return a.ele != null && m > 50 ? Math.max(0, Math.round((up || 0) - (route[idx][3] - a.ele))) : 0; }
    // An access point can be limited to some courses ("courses": ["14k"]); otherwise it serves them all.
    const serves = a => !a.courses || a.courses.includes(def.id);
    let ACCESS;
    if (def.main) {
      ACCESS = ALL_ACCESS.filter(serves);
      ACCESS.forEach(a => {
        a.idx = idxAtKm(a.trail_km);
        a.joins = [a.idx].concat(revisits(a.idx)).map(idx => ({ idx, conn_m: a.conn_m || 0, conn_ascent: a.conn_ascent || 0, conn_back: connBack(a, idx, a.conn_m, a.conn_ascent) }));
      });
    } else {
      ACCESS = [];
      ALL_ACCESS.filter(serves).forEach(a => {
        const pre = def.joins && def.joins[a.name + '|' + a.lat + '|' + a.lon];
        const joins = pre ? pre.map(j => ({ idx: j.idx, conn_m: j.conn_m, conn_ascent: j.conn_ascent, conn_back: connBack(a, j.idx, j.conn_m, j.conn_ascent), geom: j.geom }))
          : passes(a.lat, a.lon, 60).map(p => ({ idx: p.i, conn_m: Math.round(p.d), conn_ascent: 0, conn_back: 0 }));
        if (!joins.length) return;
        const first = joins.slice().sort((x, y) => x.conn_m - y.conn_m)[0];
        ACCESS.push(Object.assign(Object.create(a), {
          joins, idx: first.idx, trail_km: route[first.idx][2], conn_m: first.conn_m, conn_geom: null, conn_ascent: first.conn_ascent
        }));
      });
    }

    // Stops are the "nearest help": aid stations and water points on the main
    // course, the listed checkpoints on other courses.
    let STOPS;
    if (def.main) STOPS = ACCESS.filter(a => a.aid).sort((x, y) => x.trail_km - y.trail_km);
    else {
      STOPS = (def.stops || []).map(s => {
        const idx = s.km != null ? idxAtKm(s.km) : snap(s.lat, s.lon).ic;
        return Object.assign({}, s, { idx, trail_km: route[idx][2] });
      }).sort((x, y) => x.trail_km - y.trail_km);
    }

    // Stretcher carry-out time between two course km, plus extraKm off the course and the climb (10 min per 100 m).
    // On the GPT100, Hard and Not yet assessed track (data/track-grades.js) slow it by config.carryFactor. f: the night factor.
    function carryMin(k0, k1, extraKm, up, f) {
      const lo = Math.min(k0, k1), hi = Math.max(k0, k1), T = window.GPT100_TRACK, F = C.carryFactor || {};
      let min = extraKm * C.evacPace;
      if (def.main && T && hi > lo) {
        let covered = 0;
        for (const [a, b, g] of T.segments) {
          const o = Math.min(b, hi) - Math.max(a, lo);
          if (o > 0) { min += o * C.evacPace * (F[g] || 1); covered += o; }
        }
        min += Math.max(0, hi - lo - covered) * C.evacPace;
      } else min += (hi - lo) * C.evacPace;
      return (min + up * C.climbPenalty) * (f || 1);
    }

    // Best way for one base to reach course index ic. f: the night factor on the walk and carry (1 by day).
    function bestFor(key, ic, f) {
      f = f || 1;
      const km = route[ic][2];
      let best = null;
      for (const a of ACCESS) {
        const drive = driveMin(a, key);
        if (drive == null) continue;
        // Join the course wherever it passes this access point (twice on an out and back or a loop).
        for (const jn of a.joins) {
          const j = jn.idx, conn = jn.conn_m / 1000;
          const along = Math.abs(route[j][2] - km);
          const up = climb(j, ic) + jn.conn_ascent;
          const walk = ((conn + along) * C.walkPace + up * C.climbPenalty) * f;
          const total = drive + walk;
          if (!best || total < best.total) {
            best = { key, a, idx: j, joinKm: route[j][2], drive, walk, total, walkKm: conn + along, climb: up, connM: jn.conn_m, connBack: jn.conn_back || 0, connGeom: jn.geom || null };
          }
        }
      }
      if (best) {
        // Carry-out back to the same access point at stretcher pace.
        best.carry = carryMin(route[best.idx][2], km, best.connM / 1000, climb(ic, best.idx) + best.connBack, f);
      }
      return best;
    }

    // Fastest stretcher carry-out from course index ic to any access point a vehicle can reach (not just the team's parking).
    const EXITS = ACCESS.filter(a => BASES.some(b => driveMin(a, b.key) != null));
    function exitFor(ic, f) {
      const km = route[ic][2];
      let best = null;
      for (const a of EXITS) for (const jn of a.joins) {
        const carry = carryMin(route[jn.idx][2], km, jn.conn_m / 1000, climb(ic, jn.idx) + (jn.conn_back || 0), f);
        if (!best || carry < best.carry) best = { a, idx: jn.idx, joinKm: route[jn.idx][2], carry };
      }
      return best;
    }

    function aidAround(ic, f) {
      f = f || 1;
      const km = route[ic][2];
      let prev = null, next = null;
      for (const a of STOPS) {
        if (a.trail_km <= km) prev = a;
        if (a.trail_km > km && !next) next = a;
      }
      const info = a => a && {
        a, distKm: Math.abs(a.trail_km - km),
        walk: (Math.abs(a.trail_km - km) * C.walkPace + climb(a.idx, ic) * C.climbPenalty) * f,
        carry: carryMin(a.trail_km, km, 0, climb(ic, a.idx), f)
      };
      return { prev: info(prev), next: info(next) };
    }

    // t (ms, optional): the time of the estimate. Between sunset and sunrise the walk and carry take config.nightFactor longer.
    // Without t the times are daytime ones (the danger overlay, the sections table and callers that don't pass one).
    function assess(ic, t) {
      const night = t != null && C.nightFactor > 1 && isNight(t), f = night ? C.nightFactor : 1;
      const results = BASES.map(b => Object.assign(bestFor(b.key, ic, f) || { key: b.key, total: Infinity }, { base: b }))
        .filter(r => isFinite(r.total)).sort((x, y) => x.total - y.total);
      const best = results[0];
      return {
        course: def.id, ic, km: route[ic][2], lat: route[ic][0], lon: route[ic][1], ele: route[ic][3],
        alsoKm: revisits(ic).map(i => route[i][2]),
        climbSoFar: cumAsc[ic], results, best, backup: results[1] || null,
        aid: aidAround(ic, f), exit: exitFor(ic, f), rating: rating(best.total), night, nightFactor: f, t
      };
    }

    // Fastest response at every course point (for the danger overlay).
    let bestAll = null;
    function bestAtAll() {
      if (bestAll) return bestAll;
      bestAll = new Array(N);
      for (let i = 0; i < N; i++) {
        let b = null;
        for (const base of BASES) { const r = bestFor(base.key, i); if (r && (!b || r.total < b.total)) b = r; }
        bestAll[i] = b;
      }
      return bestAll;
    }

    function sections() {
      const all = bestAtAll(), out = [];
      for (let s = 0; s < STOPS.length - 1; s++) {
        const from = STOPS[s], to = STOPS[s + 1];
        const i0 = from.idx, i1 = to.idx;
        let worst = null;
        for (let i = i0; i <= i1; i++) if (all[i] && (!worst || all[i].total > worst.r.total)) worst = { i, r: all[i] };
        const access = ACCESS.filter(a => !(def.main && a.aid) && a.trail_km > from.trail_km && a.trail_km < to.trail_km)
          .sort((x, y) => x.trail_km - y.trail_km);
        // A row every whole km inside the section, plus the worst point.
        const rows = [];
        for (let k = Math.ceil(from.trail_km); k < to.trail_km; k++) rows.push(idxAtKm(k));
        if (worst && !rows.includes(worst.i)) rows.push(worst.i);
        rows.sort((x, y) => x - y);
        out.push({
          n: s + 1, from, to, startKm: from.trail_km, endKm: to.trail_km,
          lengthKm: to.trail_km - from.trail_km, climb: climb(i0, i1),
          worst: worst && { km: route[worst.i][2], ic: worst.i, r: worst.r },
          rating: worst ? rating(worst.r.total) : 'green',
          access, rows: rows.map(i => ({ ic: i, km: route[i][2], r: all[i], worst: worst && i === worst.i }))
        });
      }
      return out;
    }

    return {
      id: def.id, name: def.name, label: def.label, note: def.note || '', main: !!def.main,
      data: D, config: C, route, ACCESS, AID: STOPS, BASES, crossings: def.main ? D.crossings : [],
      idxAtKm, snap, storedW3w, nearW3w, metres, climb, carryMin, exitFor, driveLine, revisits, assess, bestAtAll, sections, rating, fmt, isGated, cleanName, now, sun, isNight,
      totalKm: def.total_km
    };
  }

  const main = makeCourse({ id: '100', name: 'GPT100', label: 'GPT100 and stage races', main: true, route: D.route, total_km: D.total_km });
  const courses = [main].concat(EXTRA.map(c => makeCourse(c)));
  // window.GPT is the main course engine; every course engine is in GPT.courses.
  courses.forEach(c => { c.courses = courses; c.course = id => courses.find(x => x.id === id) || main; });
  window.GPT = main;
})();
