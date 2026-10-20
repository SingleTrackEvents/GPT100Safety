// Model check for the weather watch (tools/weather_watch.mjs): how each forecast model has been doing against
// the BOM weather stations near the course.
//
// Each time the models are fetched, they're also fetched at the station sites and kept for a day and a half.
// Each hourly run, the station readings that have come in are compared with what each model said 6 to 30 hours
// earlier (the most recent forecast at least 6 hours old, so it's a real forecast and not the model catching up
// to the present). Errors are kept in daily buckets for the last W.verify.days days.
//
// The result weights the consensus: a model that has been further from the stations counts for less. A model
// with too few checked hours keeps a weight of 1, so nothing changes until there's evidence.
const HOUR = 3600;
const r1 = x => x == null ? null : Math.round(x * 10) / 10;
const r2 = x => x == null ? null : Math.round(x * 100) / 100;
const VARS = { t: 'temperature_2m', g: 'wind_gusts_10m', w: 'wind_speed_10m' };
const OBS = { t: 'temp', g: 'gust', w: 'wind' };   // the matching reading in obs.json
const LEAD_MIN = 6, LEAD_MAX = 30, KEEP_H = 36;    // hours

// Forecasts for every model at the station sites: { issued, t0, n, stations: [id], models: { m: { t, g, w: [hour][station] } } }
async function snapshot({ get, base, keyParam, tz, models, stations, now, sleep }) {
  const loc = 'latitude=' + stations.map(s => s.lat).join(',') + '&longitude=' + stations.map(s => s.lon).join(',') +
    (stations.every(s => s.height != null) ? '&elevation=' + stations.map(s => Math.round(s.height)).join(',') : '');
  const snap = { issued: now, t0: null, n: 0, stations: stations.map(s => s.id), models: {} };
  for (const m of models) {
    try {
      const js = await get(`${base}/v1/forecast?${loc}&hourly=${Object.values(VARS).join(',')}&models=${m}&forecast_days=3&timeformat=unixtime&timezone=${encodeURIComponent(tz)}${keyParam}`);
      const arr = Array.isArray(js) ? js : [js];
      const time = arr[0].hourly.time;
      // Keep from the issue hour on, for KEEP_H hours.
      const first = Math.max(0, time.findIndex(t => t >= now - HOUR));
      const hours = time.slice(first, first + KEEP_H);
      if (!hours.length) continue;
      const d = {};
      for (const [k, v] of Object.entries(VARS)) d[k] = hours.map((_, i) => arr.map(l => { const x = l.hourly[v] && l.hourly[v][first + i]; return x == null ? null : x; }));
      if (d.t.every(row => row.every(x => x == null))) continue;   // nothing for this area
      snap.models[m] = d;
      if (snap.t0 == null) { snap.t0 = hours[0]; snap.n = hours.length; }
    } catch (e) { console.log(`  check ${m}: ${e.message.slice(0, 120)}`); }
    await sleep(1000);
  }
  return Object.keys(snap.models).length ? snap : null;
}

// Error buckets: days[model][station][localDay] = { n, ae, se, ng, aeg, seg, nw, aew, sew }
function addErr(b, k, err) {
  const suf = k === 't' ? '' : k;
  b['n' + suf] = (b['n' + suf] || 0) + 1;
  b['ae' + suf] = r2((b['ae' + suf] || 0) + Math.abs(err));
  b['se' + suf] = r2((b['se' + suf] || 0) + err);
}

export async function verifyModels({ get, base, keyParam, tz, models, obs, prev, now, W, sleep, fetchNow, localDate }) {
  const V = Object.assign({ days: 7, minHours: 48, minWeight: 0.4 }, W.verify || {});
  const out = { updated: now, stations: {}, snapshots: [], days: {}, matched: {}, skill: null };
  if (prev) { out.snapshots = prev.snapshots || []; out.days = prev.days || {}; out.matched = prev.matched || {}; }
  const sts = obs && obs.stations ? Object.values(obs.stations).filter(s => s.lat != null && s.lon != null).sort((a, b) => a.id.localeCompare(b.id)) : [];
  for (const s of sts) out.stations[s.id] = { name: s.name, height: s.height, courseKm: s.courseKm, fromCourseKm: s.fromCourseKm };

  // New forecasts at the stations whenever the models were fetched.
  if (fetchNow && sts.length) {
    const snap = await snapshot({ get, base, keyParam, tz, models, stations: sts, now, sleep });
    if (snap) out.snapshots.push(snap);
  }
  out.snapshots = out.snapshots.filter(s => s.issued > now - (LEAD_MAX + 2) * HOUR);

  // Match readings to the most recent forecast that was at least LEAD_MIN hours old at the time.
  let newHours = 0;
  for (const s of sts) {
    let last = out.matched[s.id] || 0;
    const readings = (s.series || []).filter(r => r.t > last && r.t <= now).sort((a, b) => a.t - b.t);
    for (const r of readings) {
      const hr = Math.round(r.t / HOUR) * HOUR;
      if (Math.abs(r.t - hr) > 10 * 60) { last = r.t; continue; }        // only readings on the hour
      // Later snapshots are issued later still, so if nothing covers this hour now, nothing ever will: skip it.
      const usable = out.snapshots.filter(sn => sn.issued <= hr - LEAD_MIN * HOUR && sn.issued > hr - LEAD_MAX * HOUR);
      if (!usable.length) { last = r.t; continue; }
      const sn = usable.reduce((a, b) => b.issued > a.issued ? b : a);
      const si = sn.stations.indexOf(s.id), hi = Math.round((hr - sn.t0) / HOUR);
      last = r.t;
      if (si < 0 || hi < 0 || hi >= sn.n) continue;
      const day = localDate(hr);
      let any = false;
      for (const [m, d] of Object.entries(sn.models)) {
        for (const k of Object.keys(VARS)) {
          const fc = d[k][hi] && d[k][hi][si], ob = r[OBS[k]];
          if (fc == null || ob == null) continue;
          const b = ((out.days[m] = out.days[m] || {})[s.id] = out.days[m][s.id] || {});
          addErr(b[day] = b[day] || {}, k, fc - ob);
          any = true;
        }
      }
      if (any) newHours++;
    }
    out.matched[s.id] = last;
  }

  // Drop old days.
  const keepFrom = localDate(now - V.days * 24 * HOUR);
  for (const m of Object.keys(out.days)) for (const id of Object.keys(out.days[m])) {
    for (const day of Object.keys(out.days[m][id])) if (day < keepFrom) delete out.days[m][id][day];
    if (!Object.keys(out.days[m][id]).length) delete out.days[m][id];
  }

  // Skill per model: over every station, and per station.
  const sum = buckets => {
    const a = { n: 0, ae: 0, se: 0, ng: 0, aeg: 0, seg: 0, nw: 0, aew: 0, sew: 0 };
    for (const b of buckets) for (const k of Object.keys(a)) a[k] += b[k] || 0;
    return { n: a.n, maeT: a.n ? r1(a.ae / a.n) : null, biasT: a.n ? r1(a.se / a.n) : null,
      nG: a.ng, maeG: a.ng ? r1(a.aeg / a.ng) : null, biasG: a.ng ? r1(a.seg / a.ng) : null,
      nW: a.nw, maeW: a.nw ? r1(a.aew / a.nw) : null, biasW: a.nw ? r1(a.sew / a.nw) : null };
  };
  const skill = { from: keepFrom, to: localDate(now), days: V.days, minHours: V.minHours, newHours, models: {} };
  for (const m of models) {
    const byS = out.days[m] || {};
    const all = sum(Object.values(byS).flatMap(d => Object.values(d)));
    all.stations = Object.fromEntries(Object.entries(byS).map(([id, d]) => [id, sum(Object.values(d))]));
    all.weight = 1;
    skill.models[m] = all;
  }
  // Weights: a model's temperature and gust errors against the best model's, floored at minWeight.
  const scored = Object.values(skill.models).filter(s => s.n >= V.minHours);
  if (scored.length >= 2) {
    const bestT = Math.min(...scored.map(s => s.maeT)), gs = scored.filter(s => s.nG >= V.minHours);
    const bestG = gs.length >= 2 ? Math.min(...gs.map(s => s.maeG)) : null;
    for (const s of scored) {
      const ratios = [s.maeT / Math.max(bestT, 0.3)];
      if (bestG != null && s.nG >= V.minHours) ratios.push(s.maeG / Math.max(bestG, 2));
      const ratio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      s.weight = r2(Math.max(V.minWeight, Math.min(1, 1 / ratio)));
    }
  }
  out.skill = skill;
  return out;
}
