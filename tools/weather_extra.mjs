// Extra free sources for the weather watch (tools/weather_watch.mjs):
//  - ensemble forecasts (ECMWF and GFS, 80 versions of the forecast) for the chance of each trigger
//  - live BOM observations and BOM town forecasts, from the Bureau's anonymous FTP service
//  - VicEmergency incidents, warnings and planned burns near the course
//  - EPA AirWatch live air quality (needs a free EPA API key in the EPA_KEY secret)
import { execFileSync } from 'node:child_process';

const HOUR = 3600;
export function metres(a, b) {
  const R = 6371000, la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180, dla = la2 - la1, dlo = (b[1] - a[1]) * Math.PI / 180;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2));
}
// Nearest course point (sampled) to lat/lon: { d metres, km }.
export function nearCourse(route, lat, lon) {
  let best = { d: 1e18, km: 0 };
  for (let i = 0; i < route.length; i += 10) {
    const d = metres([lat, lon], route[i]);
    if (d < best.d) best = { d, km: route[i][2] };
  }
  return best;
}
const pct = (a, q) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]; };
const r1 = x => x == null ? null : Math.round(x * 10) / 10;

// ---------- ensembles ----------
// Returns { run, t0, n, members, points, gi, v: { key: [hour][point] } } with percentages and percentiles.
export async function fetchEnsembles({ get, base, keyParam, tz, points, W, sleep }) {
  const E = W.ensembles, T = W.triggers;
  const gi = points.map((p, i) => i).filter(i => i % 2 === 0 || points[i].name);
  const pts = gi.map(i => points[i]);
  const loc = 'latitude=' + pts.map(p => p.lat).join(',') + '&longitude=' + pts.map(p => p.lon).join(',') + '&elevation=' + pts.map(p => p.ele).join(',');
  const vars = ['temperature_2m', 'apparent_temperature', 'wind_gusts_10m', 'precipitation'];
  const runs = [], members = {};
  for (const m of E.models) {
    const js = await get(`${base}/v1/ensemble?${loc}&hourly=${vars.join(',')}&models=${m}&forecast_days=15&timeformat=unixtime&timezone=${encodeURIComponent(tz)}${keyParam}`);
    const arr = Array.isArray(js) ? js : [js];
    const time = arr[0].hourly.time;
    // For each variable, every member's series at every point: data[var][member][point][hour]
    const keys = Object.keys(arr[0].hourly).filter(k => k.startsWith('temperature_2m'));
    const mem = keys.map(k => k.replace('temperature_2m', ''));
    members[m] = mem.length;
    runs.push({ t0: time[0], n: time.length, data: Object.fromEntries(vars.map(v => [v, mem.map(s => arr.map(l => l.hourly[v + s] || []))])) });
    await sleep(1500);
  }
  if (!runs.length) return null;
  const t0 = Math.min(...runs.map(r => r.t0));
  const n = Math.max(...runs.map(r => (r.t0 - t0) / HOUR + r.n));
  const keys = ['hm', 'hc', 'wm', 'wc', 'cm', 'rm', 'rc', 't10', 't50', 't90', 'at10', 'g50', 'g90', 'g10', 'p24_50', 'p24_90'];
  const v = Object.fromEntries(keys.map(k => [k, []]));
  // 24 hour rain per member, per point, ending at each hour.
  runs.forEach(r => {
    r.p24 = r.data.precipitation.map(m => m.map(series => series.map((_, h) => {
      let s = 0, any = false;
      for (let k = Math.max(0, h - 23); k <= h; k++) if (series[k] != null) { s += series[k]; any = true; }
      return any ? s : null;
    })));
  });
  let last = 0;
  for (let h = 0; h < n; h++) {
    keys.forEach(k => v[k].push(new Array(pts.length).fill(null)));
    for (let j = 0; j < pts.length; j++) {
      const t = [], at = [], g = [], p24 = [];
      for (const r of runs) {
        const hh = h - (r.t0 - t0) / HOUR;
        if (hh < 0 || hh >= r.n) continue;
        r.data.temperature_2m.forEach(m => { const x = m[j][hh]; if (x != null) t.push(x); });
        r.data.apparent_temperature.forEach(m => { const x = m[j][hh]; if (x != null) at.push(x); });
        r.data.wind_gusts_10m.forEach(m => { const x = m[j][hh]; if (x != null) g.push(x); });
        r.p24.forEach(m => { const x = m[j][hh]; if (x != null) p24.push(x); });
      }
      if (!t.length) continue;
      last = h;
      const share = (a, f) => a.length ? Math.round(100 * a.filter(f).length / a.length) : null;
      const set = (k, x) => { v[k][h][j] = x; };
      set('hm', share(t, x => x >= T.heat.met)); set('hc', share(t, x => x >= T.heat.close));
      set('wm', share(g, x => x > T.wind.met)); set('wc', share(g, x => x >= T.wind.close));
      set('cm', share(at, x => x <= T.cold.met));
      set('rm', share(p24, x => x > T.rain.met)); set('rc', share(p24, x => x >= T.rain.close));
      set('t10', r1(pct(t, 0.1))); set('t50', r1(pct(t, 0.5))); set('t90', r1(pct(t, 0.9)));
      set('at10', r1(pct(at, 0.1)));
      set('g10', Math.round(pct(g, 0.1) ?? 0)); set('g50', Math.round(pct(g, 0.5) ?? 0)); set('g90', Math.round(pct(g, 0.9) ?? 0));
      if (!g.length) { set('g10', null); set('g50', null); set('g90', null); }
      set('p24_50', r1(pct(p24, 0.5))); set('p24_90', r1(pct(p24, 0.9)));
    }
  }
  for (const k of keys) v[k] = v[k].slice(0, last + 1);
  return { t0, n: last + 1, members, points: pts.map(p => ({ km: p.km, ele: p.ele, ridge: p.ridge, name: p.name })), gi, v };
}

// ---------- BOM FTP ----------
const FTP = 'ftp://ftp.bom.gov.au/anon/gen/fwo/';
function curl(url) { return execFileSync('curl', ['-sS', '--max-time', '90', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64e6 }); }
const attr = (s, a) => { const m = s.match(new RegExp('\\b' + a + '="([^"]*)"')); return m ? m[1] : null; };
const el = (s, type) => { const m = s.match(new RegExp('<element[^>]*type="' + type + '"[^>]*>([^<]*)</element>')); return m ? m[1].trim() : null; };
const txt = (s, type) => { const m = s.match(new RegExp('<text[^>]*type="' + type + '"[^>]*>([\\s\\S]*?)</text>')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null; };
const num = x => x == null || x === '' || isNaN(+x) ? null : +x;

// Latest observations from Victorian weather stations near the course. Keeps 48 hours of readings.
export function fetchObs({ route, W, prev, now }) {
  const xml = curl(FTP + 'IDV60920.xml');
  const blocks = xml.match(/<station\b[\s\S]*?<\/station>/g) || [];
  if (!blocks.length) throw new Error('No stations in IDV60920.xml: ' + xml.slice(0, 200));
  const out = { updated: now, stations: {} };
  for (const b of blocks) {
    const head = b.slice(0, b.indexOf('>'));
    const lat = num(attr(head, 'lat')), lon = num(attr(head, 'lon'));
    if (lat == null || lon == null) continue;
    const nc = nearCourse(route, lat, lon);
    if (nc.d > W.obsRadiusKm * 1000) continue;
    const id = attr(head, 'bom-id') || attr(head, 'wmo-id');
    const per = (b.match(/<period\b[\s\S]*?<\/period>/) || [''])[0];
    const tl = attr(per, 'time-utc');
    const reading = {
      t: tl ? Math.floor(Date.parse(tl) / 1000) : now,
      temp: num(el(per, 'air_temperature')), at: num(el(per, 'apparent_temp')), rh: num(el(per, 'rel-humidity')),
      wind: num(el(per, 'wind_spd_kmh')), gust: num(el(per, 'gust_kmh')), dir: el(per, 'wind_dir'), rain: num(el(per, 'rainfall'))
    };
    const old = prev && prev.stations && prev.stations[id];
    const series = (old ? old.series : []).filter(r => r.t > now - 48 * HOUR && r.t !== reading.t);
    series.push(reading);
    series.sort((a, b2) => a.t - b2.t);
    out.stations[id] = { id, name: (attr(head, 'description') || attr(head, 'stn-name') || id).replace(/\s+/g, ' '), lat, lon,
      height: num(attr(head, 'stn-height')), courseKm: Math.round(nc.km * 10) / 10, fromCourseKm: Math.round(nc.d / 100) / 10, series };
  }
  return out;
}

// BOM town and district forecasts (precis) for places near the course.
export function fetchPrecis({ W, now }) {
  const xml = curl(FTP + 'IDV10753.xml');
  const areas = xml.match(/<area\b[\s\S]*?<\/area>|<area\b[^>]*\/>/g) || [];
  if (!areas.length) throw new Error('No areas in IDV10753.xml: ' + xml.slice(0, 200));
  const want = W.bomForecastPlaces;
  const out = { updated: now, issued: attr(xml.slice(0, 2000), 'issue-time-utc'), places: [] };
  for (const name of want) {
    const a = areas.find(x => (attr(x.slice(0, x.indexOf('>')), 'description') || '').toLowerCase() === name.toLowerCase());
    if (!a) continue;
    const days = (a.match(/<forecast-period\b[\s\S]*?<\/forecast-period>/g) || []).map(p => ({
      date: (attr(p, 'start-time-local') || '').slice(0, 10),
      min: num(el(p, 'air_temperature_minimum')), max: num(el(p, 'air_temperature_maximum')),
      precis: txt(p, 'precis'), rain: txt(p, 'probability_of_precipitation'), range: el(p, 'precipitation_range'), forecast: txt(p, 'forecast')
    }));
    out.places.push({ name, type: attr(a.slice(0, a.indexOf('>')), 'type'), days });
  }
  if (!out.places.length) throw new Error('None of ' + want.join(', ') + ' found. Areas include: ' + areas.slice(0, 40).map(x => attr(x, 'description')).join(', '));
  return out;
}

// ---------- VicEmergency ----------
// Fires, planned burns, incidents and warnings within W.incidentKm of the course.
export async function fetchIncidents({ get, route, W, now }) {
  const js = await get('https://emergency.vic.gov.au/public/events-geojson.json');
  const items = [];
  const pointsOf = g => !g ? [] : g.type === 'Point' ? [g.coordinates] : g.type === 'GeometryCollection' ? g.geometries.flatMap(pointsOf)
    : g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates.flatMap(p => p[0]) : g.type === 'LineString' ? g.coordinates : [];
  const polyOf = g => !g ? null : g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0]
    : g.type === 'GeometryCollection' ? g.geometries.map(polyOf).find(Boolean) || null : null;
  for (const f of js.features || []) {
    const P = f.properties || {};
    let best = null;
    for (const c of pointsOf(f.geometry)) {
      if (!Array.isArray(c) || c.length < 2) continue;
      const nc = nearCourse(route, c[1], c[0]);
      if (!best || nc.d < best.d) best = { d: nc.d, km: nc.km, lat: c[1], lon: c[0] };
    }
    if (!best || best.d > W.incidentKm * 1000) continue;
    let poly = polyOf(f.geometry);
    if (poly && poly.length > 120) { const step = Math.ceil(poly.length / 120); poly = poly.filter((_, i) => i % step === 0); }
    const kind = /planned burn/i.test(P.category1 + ' ' + P.category2) ? 'burn' : /fire/i.test(P.category1) && !/building|car|vehicle/i.test(P.category2) ? 'fire'
      : P.feedType === 'warning' ? 'warning' : 'incident';
    items.push({ id: String(P.id || P.sourceId), kind, type: P.feedType, title: [P.category1, P.category2].filter((x, i, a) => x && a.indexOf(x) === i).join(': '),
      name: P.name || P.sourceTitle || '', status: P.status || '', location: P.location || '', size: P.size || P.sizeFmt || null,
      updated: P.updated || P.created || '', action: P.action || '', km: Math.round(best.km * 10) / 10, dist: Math.round(best.d / 100) / 10,
      lat: best.lat, lon: best.lon, poly: poly ? poly.map(c => [Math.round(c[1] * 1e4) / 1e4, Math.round(c[0] * 1e4) / 1e4]) : null });
  }
  items.sort((a, b) => a.dist - b.dist);
  return { updated: now, items };
}

// ---------- EPA AirWatch ----------
// Live PM2.5 at the EPA monitoring sites nearest the course. Needs EPA_KEY (free, from the EPA API portal).
export async function fetchEPA({ route, W, now, key }) {
  const res = await fetch('https://gateway.api.epa.vic.gov.au/environmentMonitoring/v1/sites?environmentalSegment=air',
    { headers: { 'X-API-Key': key, 'User-Agent': 'GPT100Safety weather watch' }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const js = await res.json();
  const sites = [];
  for (const s of js.records || js.sites || []) {
    const c = (s.geometry && s.geometry.coordinates) || [];
    if (c.length < 2) continue;
    const [lat, lon] = c[0] < 0 ? [c[0], c[1]] : [c[1], c[0]]; // the EPA lists latitude first
    const nc = nearCourse(route, lat, lon);
    const pm = (s.parameters || []).find(p => /PM2\.?5/i.test(p.name || ''));
    const series = pm && (pm.timeSeriesReadings || []).find(r => /1HR/i.test(r.timeSeriesName || '')) || (pm && (pm.timeSeriesReadings || [])[0]);
    const r = series && series.readings && series.readings[0];
    if (!r) continue;
    sites.push({ name: s.siteName || s.name, lat, lon, dist: Math.round(nc.d / 100) / 10, km: Math.round(nc.km * 10) / 10,
      pm25: r.averageValue ?? r.value ?? null, unit: String(r.unit || 'µg/m³').replace(/&micro;/g, 'µ').replace(/&sup3;/g, '³').replace(/&[a-z]+;/g, ''), advice: r.healthAdvice || '', until: r.until || r.since || '' });
  }
  sites.sort((a, b) => a.dist - b.dist);
  // The nearest monitor, plus any others close enough to tell us about smoke on the course.
  return { updated: now, sites: sites.filter((x, i) => i === 0 || x.dist <= (W.epaMaxKm || 60)).slice(0, W.epaSites || 3) };
}

// ---------- cloud on the high ground ----------
// Is the course in cloud? From each model's humidity at fixed heights (925, 900 and 850 hPa, about 800 to
// 1,500 m), read at the height of each high-ground point; fog in the model or very low visibility also count.
// Returns per model { t0, n, inCloud: [hour][point] (1/0), base: [hour][point] (cloud base m) }.
const LEVELS = [925, 900, 850];
export async function fetchCloud({ get, base, keyParam, tz, models, pts, rh, sleep }) {
  const loc = 'latitude=' + pts.map(p => p.lat).join(',') + '&longitude=' + pts.map(p => p.lon).join(',') + '&elevation=' + pts.map(p => p.ele).join(',');
  const vars = LEVELS.flatMap(l => [`relative_humidity_${l}hPa`, `geopotential_height_${l}hPa`]).concat(['visibility', 'weather_code']);
  const out = {};
  for (const m of models) {
    try {
      const js = await get(`${base}/v1/forecast?${loc}&hourly=${vars.join(',')}&models=${m}&forecast_days=16&past_hours=6&timeformat=unixtime&timezone=${encodeURIComponent(tz)}${keyParam}`);
      const arr = Array.isArray(js) ? js : [js];
      const time = arr[0].hourly.time;
      const inCloud = [], cb = [];
      let any = false;
      for (let h = 0; h < time.length; h++) {
        inCloud.push(pts.map(() => null)); cb.push(pts.map(() => null));
        arr.forEach((l, j) => {
          const H = l.hourly;
          const lev = LEVELS.map(L => ({ r: H[`relative_humidity_${L}hPa`] && H[`relative_humidity_${L}hPa`][h], z: H[`geopotential_height_${L}hPa`] && H[`geopotential_height_${L}hPa`][h] }))
            .filter(x => x.r != null && x.z != null).sort((a, b) => a.z - b.z);
          if (lev.length < 2) return;
          any = true;
          const e = pts[j].ele;
          // Humidity at this point's height, between the levels either side.
          let r;
          if (e <= lev[0].z) r = lev[0].r;
          else if (e >= lev[lev.length - 1].z) r = lev[lev.length - 1].r;
          else for (let k = 1; k < lev.length; k++) if (e <= lev[k].z) { const f = (e - lev[k - 1].z) / (lev[k].z - lev[k - 1].z); r = lev[k - 1].r + f * (lev[k].r - lev[k - 1].r); break; }
          const code = H.weather_code && H.weather_code[h], vis = H.visibility && H.visibility[h];
          inCloud[h][j] = r >= rh || code === 45 || code === 48 || (vis != null && vis < 1000) ? 1 : 0;
          // Cloud base: the lowest height where humidity reaches the threshold.
          let b = null;
          if (lev[0].r >= rh) b = Math.round(lev[0].z);
          else for (let k = 1; k < lev.length; k++) if (lev[k].r >= rh) { const f = (rh - lev[k - 1].r) / (lev[k].r - lev[k - 1].r); b = Math.round(lev[k - 1].z + f * (lev[k].z - lev[k - 1].z)); break; }
          cb[h][j] = b;
        });
      }
      if (any) out[m] = { t0: time[0], n: time.length, inCloud, base: cb };
    } catch (e) { console.log('cloud ' + m + ': ' + e.message); }
    await sleep(1200);
  }
  return out;
}
