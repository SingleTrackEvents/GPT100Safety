// GPT100 response engine. Works fully offline from data/course.js, data/access-edits.js and data/config.js.
(function () {
  const D = window.GPT100_DATA;
  const C = window.GPT100_CONFIG;
  const EDITS = window.GPT100_EDITS || { custom: [], hidden: [] };
  const route = D.route; // [lat, lon, km, ele]
  const N = route.length;

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
  function metres(a, b) {
    const R = 6371000, la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180;
    const dla = (b[0] - a[0]) * Math.PI / 180, dlo = (b[1] - a[1]) * Math.PI / 180;
    const x = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function snap(lat, lon) {
    let best = 1e18, bi = 0; const k = Math.cos(lat * Math.PI / 180);
    for (let i = 0; i < N; i++) {
      const dy = route[i][0] - lat, dx = (route[i][1] - lon) * k, d = dy * dy + dx * dx;
      if (d < best) { best = d; bi = i; }
    }
    return { ic: bi, offM: Math.round(metres([lat, lon], [route[bi][0], route[bi][1]])) };
  }

  // Other places the course passes the same spot (e.g. an out and back). Returns one route index per extra pass.
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

  // Access points: built-in minus hidden, plus custom edits.
  const hidden = new Set(EDITS.hidden || []);
  const ACCESS = D.access.filter(a => !hidden.has(a.name + '|' + a.trail_km)).concat(EDITS.custom || []);
  ACCESS.forEach(a => { a.idx = idxAtKm(a.trail_km); a.idxs = [a.idx].concat(revisits(a.idx)); });
  const AID = ACCESS.filter(a => a.aid).sort((x, y) => x.trail_km - y.trail_km);
  const BASES = C.bases.map(b => {
    const ll = D.bases[b.key];
    return Object.assign({}, b, { lat: ll[1], lon: ll[0] });
  });

  function driveMin(a, key) {
    const s = a['drive_' + key + '_s'];
    return (s == null || isNaN(s)) ? null : (s / 60) * C.driveFactor;
  }

  // Best way for one base to reach course index ic.
  function bestFor(key, ic) {
    const km = route[ic][2];
    let best = null;
    for (const a of ACCESS) {
      const drive = driveMin(a, key);
      if (drive == null) continue;
      const conn = (a.conn_m || 0) / 1000;
      // Join the course wherever it passes this access point (twice on an out and back).
      for (const j of a.idxs) {
        const along = Math.abs(route[j][2] - km);
        const up = climb(j, ic) + (a.conn_ascent || 0);
        const walk = (conn + along) * C.walkPace + up * C.climbPenalty;
        const total = drive + walk;
        if (!best || total < best.total) {
          best = { key, a, idx: j, joinKm: route[j][2], drive, walk, total, walkKm: conn + along, climb: up };
        }
      }
    }
    if (best) {
      // Carry-out back to the same access point at stretcher pace.
      best.carry = best.walkKm * C.evacPace + climb(ic, best.idx) * C.climbPenalty;
    }
    return best;
  }

  function aidAround(ic) {
    const km = route[ic][2];
    let prev = null, next = null;
    for (const a of AID) {
      if (a.trail_km <= km) prev = a;
      if (a.trail_km > km && !next) next = a;
    }
    const info = a => a && {
      a, distKm: Math.abs(a.trail_km - km),
      walk: Math.abs(a.trail_km - km) * C.walkPace + climb(a.idx, ic) * C.climbPenalty,
      carry: Math.abs(a.trail_km - km) * C.evacPace + climb(ic, a.idx) * C.climbPenalty
    };
    return { prev: info(prev), next: info(next) };
  }

  function rating(min) { return min > C.redMin ? 'red' : (min > C.amberMin ? 'amber' : 'green'); }

  function assess(ic) {
    const results = BASES.map(b => Object.assign(bestFor(b.key, ic) || { key: b.key, total: Infinity }, { base: b }))
      .filter(r => isFinite(r.total)).sort((x, y) => x.total - y.total);
    const best = results[0];
    return {
      ic, km: route[ic][2], lat: route[ic][0], lon: route[ic][1], ele: route[ic][3],
      alsoKm: revisits(ic).map(i => route[i][2]),
      climbSoFar: cumAsc[ic], results, best, backup: results[1] || null,
      aid: aidAround(ic), rating: rating(best.total)
    };
  }

  // Fastest response at every course point (for the danger overlay and run sheet).
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
    for (let s = 0; s < AID.length - 1; s++) {
      const from = AID[s], to = AID[s + 1];
      const i0 = from.idx, i1 = to.idx;
      let worst = null;
      for (let i = i0; i <= i1; i++) if (all[i] && (!worst || all[i].total > worst.r.total)) worst = { i, r: all[i] };
      const access = ACCESS.filter(a => !a.aid && a.trail_km > from.trail_km && a.trail_km < to.trail_km)
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

  // Stored drive lines link an access point to one base, in either direction. Only use them for that base.
  function driveLine(a, key) {
    const g = a.drive_geom, b = BASES.find(x => x.key === key);
    if (!g || g.length < 2 || !b) return null;
    const near = p => metres(p, [b.lat, b.lon]) < 1500;
    if (near(g[g.length - 1])) return g;
    if (near(g[0])) return g.slice().reverse();
    return null;
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

  window.GPT = {
    data: D, config: C, route, ACCESS, AID, BASES, crossings: D.crossings,
    idxAtKm, snap, metres, climb, driveLine, revisits, assess, bestAtAll, sections, rating, fmt, isGated, cleanName,
    totalKm: D.total_km
  };
})();
