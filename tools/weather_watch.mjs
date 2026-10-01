#!/usr/bin/env node
// GPT100 hourly weather watch. Run by .github/workflows/weather.yml every hour.
//
//   node tools/weather_watch.mjs --prev <last published data dir> --out <dir to publish> [--force-models] [--dry]
//
// Fetches every forecast model on Open-Meteo for points along the course (every 3 hours, as the models
// update), plus CFA fire ratings, BOM warnings and the air quality forecast (every hour). Works out the
// consensus at each point and hour, checks the risk triggers in data/config.js and sends a phone alert
// (ntfy, topic in the NTFY_TOPIC secret) when a trigger gets closer. The Weather tab reads the files it writes.
//
// Env: NTFY_TOPIC (phone alerts), OPEN_METEO_KEY (optional commercial licence key), APP_URL (link in alerts).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { fetchEnsembles, fetchObs, fetchPrecis, fetchIncidents, fetchEPA, fetchCloud } from './weather_extra.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const WX = require(path.join(ROOT, 'js', 'weather-core.js'));
const HOUR = 3600;

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const flag = k => args.includes(k);
const OUT = path.resolve(opt('--out') || 'wx-out');
const PREV = path.resolve(opt('--prev') || 'wx-prev');
const DRY = flag('--dry');
const NOW = opt('--now') ? WX.parseLocal(opt('--now')) : Math.floor(Date.now() / 1000);

// ---------- app data (the same files the app loads) ----------
const win = {};
for (const f of ['data/config.js', 'data/course.js', 'data/pacing.js']) vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { window: win });
const CFG = win.GPT100_CONFIG, W = CFG.weather, D = win.GPT100_DATA, PACE = win.GPT100_PACING.miler;
const MODELS = W.models;
const VARS = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'precipitation', 'wind_speed_10m', 'wind_gusts_10m', 'weather_code', 'cape', 'cloud_cover', 'uv_index'];
const REPLAY_VARS = VARS.filter(v => v !== 'uv_index'); // not in the ERA5 archive
const SHORT = { temperature_2m: 't', relative_humidity_2m: 'rh', apparent_temperature: 'at', precipitation: 'p', wind_speed_10m: 'w', wind_gusts_10m: 'g', weather_code: 'code', cape: 'cape', cloud_cover: 'cc', uv_index: 'uv' };

// ---------- forecast points along the course ----------
// The highest point in every 5 km (the worst case for wind and cold), plus every aid station.
function metres(a, b) {
  const R = 6371000, la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180, dla = la2 - la1, dlo = (b[1] - a[1]) * Math.PI / 180;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2));
}
function gridPoints() {
  const route = D.route, pts = [];
  // Aid stations, snapped by their course km (the course passes some places twice).
  const aid = D.access.filter(a => a.aid).map(a => {
    let bi = 0, bd = 1e18;
    route.forEach((r, i) => { const d = Math.abs(r[2] - a.trail_km); if (d < bd) { bd = d; bi = i; } });
    return { i: bi, name: a.name.replace(/\s*\(.*?\)\s*/g, ' ').trim() };
  });
  for (let km = 0; km < route[route.length - 1][2]; km += 5) {
    let best = null;
    route.forEach((r, i) => { if (r[2] >= km && r[2] < km + 5 && (best == null || r[3] > route[best][3])) best = i; });
    if (best != null && !aid.some(a => Math.abs(route[a.i][2] - route[best][2]) < 1.5)) pts.push({ i: best });
  }
  aid.forEach(a => pts.push(a));
  pts.sort((a, b) => route[a.i][2] - route[b.i][2]);
  return pts.map(p => {
    const r = route[p.i];
    return { km: Math.round(r[2] * 10) / 10, lat: r[0], lon: r[1], ele: Math.round(r[3]), name: p.name || '', ridge: r[3] >= W.ridgeMinEle };
  });
}

// ---------- fetching ----------
async function get(url, type = 'json', tries = 3) {
  for (let k = 1; ; k++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'GPT100Safety weather watch (singletrackevents.github.io/GPT100Safety)' }, signal: AbortSignal.timeout(90000) });
      if (res.status === 429 && k < tries) { console.log('  rate limited, waiting 65 s'); await sleep(65000); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
      return type === 'json' ? await res.json() : await res.text();
    } catch (e) {
      if (k >= tries) throw e;
      await sleep(5000 * k);
    }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = process.env.OPEN_METEO_KEY;
const OM = KEY ? 'https://customer-api.open-meteo.com' : 'https://api.open-meteo.com';
const ENS = KEY ? 'https://customer-ensemble-api.open-meteo.com' : 'https://ensemble-api.open-meteo.com';
const AQ = KEY ? 'https://customer-air-quality-api.open-meteo.com' : 'https://air-quality-api.open-meteo.com';
const ARCHIVE = KEY ? 'https://customer-archive-api.open-meteo.com' : 'https://archive-api.open-meteo.com';
const keyParam = KEY ? '&apikey=' + encodeURIComponent(KEY) : '';
function locParams(points) {
  return 'latitude=' + points.map(p => p.lat).join(',') + '&longitude=' + points.map(p => p.lon).join(',') + '&elevation=' + points.map(p => p.ele).join(',');
}

// Each model at every point: { t0, n, data: {short var: [hour][point]} }, or null when the model has nothing here.
async function fetchModel(model, points) {
  const url = `${OM}/v1/forecast?${locParams(points)}&hourly=${VARS.join(',')}&models=${model}&forecast_days=16&past_hours=6&timeformat=unixtime&timezone=${encodeURIComponent(WX.TZ)}${keyParam}`;
  const js = await get(url);
  const arr = Array.isArray(js) ? js : [js];
  const time = arr[0].hourly.time;
  const data = {};
  for (const v of VARS) data[SHORT[v]] = time.map((_, h) => arr.map(loc => { const x = loc.hourly[v] && loc.hourly[v][h]; return x == null ? null : x; }));
  // Drop hours past the model's range (all temperatures missing).
  let n = time.length;
  while (n > 0 && data.t[n - 1].every(x => x == null)) n--;
  if (!n) return null;
  for (const k in data) data[k] = data[k].slice(0, n);
  return { t0: time[0], n, data };
}

// Rolling 24 hour rain total ending at each hour.
function rolling24(p) {
  return p.map((row, h) => row.map((_, i) => {
    let s = 0, any = false;
    for (let k = Math.max(0, h - 23); k <= h; k++) if (p[k][i] != null) { s += p[k][i]; any = true; }
    return any ? s : null;
  }));
}

function consensus(models, points) {
  const ids = Object.keys(models);
  const t0 = Math.min(...ids.map(m => models[m].t0));
  const n = Math.max(...ids.map(m => (models[m].t0 - t0) / HOUR + models[m].n));
  const P = points.length;
  ids.forEach(m => { models[m].data.p24 = rolling24(models[m].data.p); });
  const at = (m, k, h, p) => { const M = models[m], hh = h - (M.t0 - t0) / HOUR; return hh >= 0 && hh < M.n ? M.data[k][hh][p] : null; };
  const out = {};
  const keys = ['t', 'tmax', 'at', 'atmin', 'wbgt', 'wbgtmax', 'g', 'gmax', 'w', 'p', 'pmax', 'pp', 'p24', 'p24max', 'cape', 'storm', 'n', 'cc', 'code', 'uv'];
  keys.forEach(k => { out[k] = []; });
  for (let h = 0; h < n; h++) {
    keys.forEach(k => out[k].push(new Array(P)));
    for (let p = 0; p < P; p++) {
      const v = k => ids.map(m => at(m, k, h, p));
      const t = v('t'), rh = v('rh'), live = t.map(x => x != null);
      const pick = a => a.filter((_, i) => live[i]);
      const wb = t.map((x, i) => live[i] ? WX.wbgt(x, rh[i]) : null);
      const pr = pick(v('p')), codes = pick(v('code')).filter(x => x != null);
      const set = (k, x, r) => { out[k][h][p] = x == null ? null : r(x); };
      set('t', WX.median(pick(t)), WX.r1); set('tmax', WX.max(pick(t)), WX.r1);
      set('at', WX.median(pick(v('at'))), WX.r1); set('atmin', WX.min(pick(v('at'))), WX.r1);
      set('wbgt', WX.median(pick(wb)), WX.r1); set('wbgtmax', WX.max(pick(wb)), WX.r1);
      set('g', WX.median(pick(v('g'))), WX.r0); set('gmax', WX.max(pick(v('g'))), WX.r0);
      set('w', WX.median(pick(v('w'))), WX.r0);
      set('p', WX.median(pr), WX.r1); set('pmax', WX.max(pr), WX.r1);
      const prn = pr.filter(x => x != null);
      set('pp', prn.length ? 100 * prn.filter(x => x >= 0.2).length / prn.length : null, WX.r0);
      set('p24', WX.median(pick(v('p24'))), WX.r1); set('p24max', WX.max(pick(v('p24'))), WX.r1);
      set('cape', WX.median(pick(v('cape'))), WX.r0);
      out.storm[h][p] = codes.filter(c => c >= 95).length;
      out.n[h][p] = live.filter(Boolean).length;
      set('cc', WX.median(pick(v('cc'))), WX.r0);
      set('uv', models[ids[0]].data.uv ? WX.median(pick(v('uv'))) : null, WX.r1);
      // Most common weather code (ties go to the more severe one).
      const cnt = {}; codes.forEach(c => { cnt[c] = (cnt[c] || 0) + 1; });
      const best = Object.keys(cnt).map(Number).sort((a, b) => cnt[b] - cnt[a] || b - a)[0];
      out.code[h][p] = best == null ? null : best;
    }
  }
  // Trim hours with no model at all.
  let m = n;
  while (m > 0 && out.n[m - 1].every(x => !x)) m--;
  for (const k in out) out[k] = out[k].slice(0, m);
  return { t0, n: m, cons: out };
}

function localHours(t0, n) { return Array.from({ length: n }, (_, h) => WX.localHour(t0 + h * HOUR)); }

async function fetchAirQuality(points) {
  const aqPts = points.filter(p => p.name);
  const url = `${AQ}/v1/air-quality?latitude=${aqPts.map(p => p.lat).join(',')}&longitude=${aqPts.map(p => p.lon).join(',')}&hourly=us_aqi_pm2_5,pm2_5&forecast_days=5&past_hours=6&timeformat=unixtime&timezone=${encodeURIComponent(WX.TZ)}${keyParam}`;
  const js = await get(url);
  const arr = Array.isArray(js) ? js : [js];
  const time = arr[0].hourly.time;
  let n = time.length;
  const aqi = time.map((_, h) => arr.map(l => l.hourly.us_aqi_pm2_5[h]));
  const pm = time.map((_, h) => arr.map(l => l.hourly.pm2_5[h] == null ? null : WX.r1(l.hourly.pm2_5[h])));
  while (n > 0 && aqi[n - 1].every(x => x == null)) n--;
  return { t0: time[0], n, points: aqPts.map(p => ({ km: p.km, name: p.name, lat: p.lat, lon: p.lon })), aqi: aqi.slice(0, n), pm25: pm.slice(0, n) };
}

const CFA_FEEDS = { Wimmera: 'wimmera-firedistrict', 'South West': 'southwest-firedistrict' };
async function fetchFire() {
  const days = {};
  for (const dist of W.districts) {
    const xml = await get(`https://www.cfa.vic.gov.au/cfa/rssfeed/${CFA_FEEDS[dist]}_rss.xml`, 'text');
    for (const d of WX.parseCFA(xml, dist)) (days[d.date] = days[d.date] || { date: d.date, districts: {} }).districts[dist] = { rating: d.rating, tfb: d.tfb };
  }
  return { updated: NOW, days: Object.values(days).sort((a, b) => a.date < b.date ? -1 : 1) };
}

// BOM warnings come from the Bureau's free anonymous FTP service (their website blocks automated access).
// Each Victorian warning in force is a file there; the CAP version (standard alert format) has its headline,
// event type and area.
const FTP = 'ftp://ftp.bom.gov.au/anon/gen/fwo/';
function curl(url) { return execFileSync('curl', ['-sS', '--max-time', '60', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function fetchWarnings() {
  const names = execFileSync('curl', ['-sS', '-l', '--max-time', '60', FTP], { encoding: 'utf8' }).split(/\s+/)
    .filter(n => /^IDV\d+\.cap\.xml$/.test(n));
  const re = new RegExp('\\b(' + W.warningWords.join('|') + ')\\b', 'i');
  const tag = (x, t) => { const m = x.match(new RegExp('<(?:cap:)?' + t + '[^>]*>([\\s\\S]*?)</(?:cap:)?' + t + '>')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
  const items = [];
  for (const n of names) {
    let x;
    try { x = curl(FTP + n); } catch (e) { continue; }
    if (/<(cap:)?msgType>\s*Cancel/i.test(x)) continue;
    const event = tag(x, 'event'), head = tag(x, 'headline') || event, area = (x.match(/<(?:cap:)?areaDesc>([\s\S]*?)<\/(?:cap:)?areaDesc>/g) || []).join(' ').replace(/<[^>]+>/g, ' ');
    const txt = head + ' ' + event;
    const kind = /thunderstorm/i.test(txt) ? 'thunderstorm' : /severe weather/i.test(txt) ? 'severe' : /fire weather/i.test(txt) ? 'fire'
      : /flood/i.test(txt) ? 'flood' : /sheep graziers/i.test(txt) ? 'graziers' : 'other';
    items.push({ id: n.replace('.cap.xml', ''), title: head, link: tag(x, 'web') || 'https://www.bom.gov.au/vic/warnings/', date: tag(x, 'sent'), kind,
      relevant: re.test(head + ' ' + area + ' ' + tag(x, 'description').slice(0, 3000)) });
  }
  return { updated: NOW, items };
}

// Past weather (ERA5 reanalysis) on the race dates of earlier years, for the simulator before forecasts reach the race.
async function fetchReplay(year, points) {
  const s = W.event.start.slice(5, 10), e = W.event.end.slice(5, 10);
  const url = `${ARCHIVE}/v1/archive?${locParams(points)}&start_date=${year}-${s}&end_date=${year}-${e}&hourly=${REPLAY_VARS.join(',')}&timeformat=unixtime&timezone=${encodeURIComponent(WX.TZ)}${keyParam}`;
  const js = await get(url);
  const arr = Array.isArray(js) ? js : [js];
  const time = arr[0].hourly.time, data = {};
  for (const v of REPLAY_VARS) data[SHORT[v]] = time.map((_, h) => arr.map(l => l.hourly[v] ? l.hourly[v][h] : null));
  const g = consensus({ era5: { t0: time[0], n: time.length, data } }, points);
  return Object.assign({ year, source: 'era5', points, lh: localHours(g.t0, g.n) }, g);
}

// ---------- phone alerts ----------
const NTFY = process.env.NTFY_TOPIC;
const APP = process.env.APP_URL || 'https://singletrackevents.github.io/GPT100Safety/#weather';
async function notify(title, body, priority, tags) {
  console.log(`ALERT [${priority}] ${title}\n  ${body.replace(/\n/g, '\n  ')}`);
  if (DRY || !NTFY) return;
  try {
    await fetch('https://ntfy.sh/' + encodeURIComponent(NTFY), {
      method: 'POST', body,
      headers: { Title: title.replace(/[^\x20-\x7e]/g, ''), Priority: String(priority), Tags: tags || 'cloud', Click: APP }
    });
  } catch (e) { console.log('  ntfy failed: ' + e.message); }
}
const WORD = { met: 'MET', close: 'getting close', ok: 'clear', nodata: 'no data' };

async function alerts(tr, state, warnings, incidents) {
  const from = WX.parseLocal(W.alertsFrom), end = WX.parseLocal(W.event.end) + 24 * HOUR;
  const live = NOW >= from && NOW <= end;
  state.notified = state.notified || {};
  for (const [sk, scope] of Object.entries(tr)) {
    if (sk === 'next48' && !live) continue;
    for (const key of WX.ORDER) {
      const r = scope.triggers[key], id = sk + '.' + key;
      if (r.status === 'nodata') continue;
      const prev = state.notified[id] || 'ok';
      if (r.status === prev) continue;
      const up = WX.RANK[r.status] > WX.RANK[prev];
      const where = r.worst ? ` ${r.worst.km != null ? 'km ' + r.worst.km + (r.worst.place ? ' ' + r.worst.place : '') + ', ' : ''}${WX.fmtTime(r.worst.at)}.` : '';
      await notify(`${r.label}: ${up ? '' : 'eased to '}${WORD[r.status]} (${scope.label.toLowerCase()})`,
        `${r.text || ''}.${where}${r.worst && r.worst.runners ? ' Runners on course there.' : ''}\nTrigger: ${r.rule}.`,
        up ? (r.status === 'met' ? 5 : 4) : 2, up ? (r.status === 'met' ? 'rotating_light' : 'warning') : 'white_check_mark');
      state.notified[id] = r.status;
    }
  }
  if (live && warnings && warnings.items) {
    state.warnings = state.warnings || [];
    for (const w of warnings.items.filter(x => x.relevant && !state.warnings.includes(x.id + x.title))) {
      await notify('BOM warning near the course', w.title + (w.link ? '\n' + w.link : ''), 4, 'warning');
      state.warnings.push(w.id + w.title);
    }
    state.warnings = state.warnings.slice(-50);
  }
  // New fires and planned burns near the course.
  if (live && incidents && incidents.items) {
    state.incidents = state.incidents || [];
    for (const it of incidents.items.filter(x => (x.kind === 'fire' || x.kind === 'burn') && x.dist <= W.fireNearKm * 1.5 && !state.incidents.includes(x.id))) {
      await notify(`${it.kind === 'fire' ? 'Bushfire' : 'Planned burn'} ${it.dist} km from the course`,
        `${it.title}${it.location ? ', ' + it.location : ''}${it.status ? ' (' + it.status + ')' : ''}. Nearest course point km ${it.km}.\nhttps://emergency.vic.gov.au/respond/`,
        it.kind === 'fire' ? 5 : 4, it.kind === 'fire' ? 'fire' : 'warning');
      state.incidents.push(it.id);
    }
    state.incidents = state.incidents.slice(-100);
  }
  // Morning summary at 6 am each day from course marking to the end of the race.
  const today = WX.localDate(NOW);
  if (live && WX.localHour(NOW) >= 6 && state.digest !== today) {
    const lines = Object.values(tr).map(s => `${s.label}: ` + WX.ORDER.map(k => s.triggers[k]).filter(r => r.status === 'met' || r.status === 'close')
      .map(r => `${r.label} ${WORD[r.status]}`).join(', ') || `${s.label}: all clear`);
    await notify('GPT100 weather this morning', lines.map(l => l.replace(/^(.*?): \1: /, '$1: ')).join('\n'), 3, 'sunrise');
    state.digest = today;
  }
}

// ---------- main ----------
function readJSON(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }
function writeJSON(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const points = gridPoints();
  const prevLatest = readJSON(path.join(PREV, 'latest.json'), null);
  const sources = {};
  let grid = readJSON(path.join(PREV, 'grid.json'), null);
  const samePoints = grid && JSON.stringify(grid.points) === JSON.stringify(points);
  const due = flag('--force-models') || !grid || !samePoints || NOW - (grid.modelsRun || 0) > W.modelEveryHours * HOUR - 600;

  let cloudByModel = null;
  if (due) {
    const models = {}, perModel = {};
    for (const m of MODELS) {
      try {
        const r = await fetchModel(m, points);
        if (r) { models[m] = r; perModel[m] = r; sources[m] = { ok: true, hours: r.n }; console.log(`${m}: ${r.n} hours`); }
        else { sources[m] = { ok: false, error: 'No data for this area' }; console.log(`${m}: no data`); }
      } catch (e) { sources[m] = { ok: false, error: e.message.slice(0, 200) }; console.log(`${m}: ${e.message}`); }
      await sleep(1500);
    }
    if (Object.keys(models).length >= 2) {
      const g = consensus(models, points);
      grid = Object.assign({ v: 1, modelsRun: NOW, models: Object.keys(models), points, lh: localHours(g.t0, g.n) }, g);
      // Cloud on the high ground: share of models in cloud, and the median cloud base, at each high point.
      const CL = W.triggers.cloud, hi = points.map((p, i) => i).filter(i => points[i].ele >= CL.minEle && WX.cloudZone(CL, points[i].km));
      const cloud = await fetchCloud({ get, base: OM, keyParam, tz: WX.TZ, models: Object.keys(models), pts: hi.map(i => points[i]), rh: CL.rh, sleep });
      grid.cons.cloud = grid.cons.t.map(() => points.map(() => null));
      grid.cons.cbase = grid.cons.t.map(() => points.map(() => null));
      for (let h = 0; h < grid.n; h++) hi.forEach((pi, j) => {
        const ins = [], bs = [];
        for (const C of Object.values(cloud)) {
          const hh = h - (C.t0 - grid.t0) / HOUR;
          if (hh < 0 || hh >= C.n || C.inCloud[hh][j] == null) continue;
          ins.push(C.inCloud[hh][j]);
          bs.push(C.base[hh][j] == null ? 3000 : C.base[hh][j]); // no cloud below 1,500 m counts as a high base
        }
        if (ins.length) { grid.cons.cloud[h][pi] = Math.round(100 * ins.reduce((a, b) => a + b, 0) / ins.length); grid.cons.cbase[h][pi] = WX.median(bs); }
      });
      cloudByModel = { hi, cloud };
      console.log('cloud: ' + Object.keys(cloud).length + ' models at ' + hi.length + ' high points');
      // One file per point with every model, for the model comparison.
      points.forEach((pt, i) => {
        const o = { t0: grid.t0, n: grid.n, point: pt, models: {} };
        for (const [m, M] of Object.entries(perModel)) {
          const off = (M.t0 - grid.t0) / HOUR, d = {};
          for (const k of ['t', 'at', 'rh', 'p', 'w', 'g', 'code', 'cape', 'cc', 'uv']) {
            d[k] = Array.from({ length: grid.n }, (_, h) => { const hh = h - off; return hh >= 0 && hh < M.n ? M.data[k][hh][i] : null; });
            while (d[k].length && d[k][d[k].length - 1] == null) d[k].pop();
          }
          const j = cloudByModel ? cloudByModel.hi.indexOf(i) : -1, CM = j >= 0 && cloudByModel.cloud[m];
          if (CM) {
            const off2 = (CM.t0 - grid.t0) / HOUR;
            d.cbase = Array.from({ length: grid.n }, (_, h) => { const hh = h - off2; return hh >= 0 && hh < CM.n ? CM.base[hh][j] : null; });
            while (d.cbase.length && d.cbase[d.cbase.length - 1] == null) d.cbase.pop();
          }
          o.models[m] = d;
        }
        writeJSON(path.join(OUT, 'models', 'p' + i + '.json'), o);
      });
    } else {
      console.log('Too few models answered; keeping the previous forecast.');
      if (grid && samePoints) copyDir(path.join(PREV, 'models'), path.join(OUT, 'models'));
      else grid = null;
    }
  } else {
    console.log('Models fetched ' + Math.round((NOW - grid.modelsRun) / 60) + ' min ago; reusing them.');
    Object.assign(sources, (prevLatest && prevLatest.sources) || {});
    for (const k of ['air', 'fire', 'warnings', 'ensembles', 'obs', 'precis', 'incidents', 'epa']) delete sources[k];
    copyDir(path.join(PREV, 'models'), path.join(OUT, 'models'));
  }
  if (grid) writeJSON(path.join(OUT, 'grid.json'), grid);

  let aq = null, fire = null, warnings = null;
  try { aq = await fetchAirQuality(points); sources.air = { ok: true, hours: aq.n }; } catch (e) { sources.air = { ok: false, error: e.message.slice(0, 200) }; aq = prevLatest && prevLatest.aq; }
  try { fire = await fetchFire(); sources.fire = { ok: true }; } catch (e) { sources.fire = { ok: false, error: e.message.slice(0, 200) }; fire = prevLatest && prevLatest.fire; }
  try { warnings = fetchWarnings(); sources.warnings = { ok: true }; } catch (e) { sources.warnings = { ok: false, error: String(e.message).slice(0, 200) }; }
  console.log('air quality: ' + (sources.air.ok ? aq.n + ' hours' : sources.air.error) + '; CFA: ' + (sources.fire.ok ? fire.days.length + ' days' : sources.fire.error) + '; BOM warnings: ' + (sources.warnings.ok ? warnings.items.length + ' in Victoria, ' + warnings.items.filter(w => w.relevant).length + ' near the course' : sources.warnings.error));

  // Ensembles every few hours (they update a few times a day); kept from the last run in between.
  let ens = readJSON(path.join(PREV, 'ens.json'), null);
  const ensPts = ens && JSON.stringify(ens.points) === JSON.stringify(points.filter((p, i) => i % 2 === 0 || p.name).map(p => ({ km: p.km, ele: p.ele, ridge: p.ridge, name: p.name })));
  if (flag('--force-models') || !ens || !ensPts || NOW - (ens.run || 0) > W.ensembles.everyHours * HOUR - 600) {
    try {
      const e = await fetchEnsembles({ get, base: ENS, keyParam, tz: WX.TZ, points, W, sleep });
      if (e) { ens = Object.assign({ run: NOW, lh: localHours(e.t0, e.n) }, e); sources.ensembles = { ok: true, hours: e.n, members: e.members }; }
    } catch (err) { sources.ensembles = { ok: false, error: err.message.slice(0, 200) }; if (!ensPts) ens = null; }
  } else sources.ensembles = (prevLatest && prevLatest.sources && prevLatest.sources.ensembles) || { ok: true };
  if (ens) writeJSON(path.join(OUT, 'ens.json'), ens);

  let obs = null, precis = null, incidents = null, epa = null;
  const prevObs = readJSON(path.join(PREV, 'obs.json'), null);
  try { obs = fetchObs({ route: D.route, W, prev: prevObs, now: NOW }); sources.obs = { ok: true, stations: Object.keys(obs.stations).length }; }
  catch (e) { sources.obs = { ok: false, error: String(e.message).slice(0, 300) }; obs = prevObs; }
  if (obs) writeJSON(path.join(OUT, 'obs.json'), obs);
  try { precis = fetchPrecis({ W, now: NOW }); sources.precis = { ok: true }; }
  catch (e) { sources.precis = { ok: false, error: String(e.message).slice(0, 300) }; precis = prevLatest && prevLatest.precis; }
  try { incidents = await fetchIncidents({ get, route: D.route, W, now: NOW }); sources.incidents = { ok: true }; }
  catch (e) { sources.incidents = { ok: false, error: e.message.slice(0, 200) }; incidents = prevLatest && prevLatest.incidents; }
  if (process.env.EPA_KEY) {
    try { epa = await fetchEPA({ route: D.route, W, now: NOW, key: process.env.EPA_KEY }); sources.epa = { ok: true }; }
    catch (e) { sources.epa = { ok: false, error: e.message.slice(0, 200) }; epa = prevLatest && prevLatest.epa; }
  }
  console.log('ensembles: ' + JSON.stringify(sources.ensembles) + '; observations: ' + JSON.stringify(sources.obs) + '; BOM forecasts: ' + JSON.stringify(sources.precis) +
    '; VicEmergency: ' + (incidents ? incidents.items.length + ' near the course' : JSON.stringify(sources.incidents)) + (sources.epa ? '; EPA: ' + JSON.stringify(sources.epa) : ''));

  const triggers = WX.evaluate(grid, { config: CFG, now: NOW, pace: PACE, fire, warnings, aq, ens, incidents });
  const latest = { v: 1, updated: NOW, modelsRun: grid && grid.modelsRun, ensRun: ens && ens.run, models: grid ? grid.models : [], sources, fire, warnings, aq, precis, incidents, epa, triggers, hours: grid ? { t0: grid.t0, n: grid.n } : null };
  writeJSON(path.join(OUT, 'latest.json'), latest);

  // History: how the race weekend forecast has moved, one entry per run.
  const hist = readJSON(path.join(PREV, 'history.json'), []);
  const peak = (sk, k) => { const r = triggers[sk].triggers[k]; return r.worst ? r.worst.value : null; };
  hist.push({
    t: NOW, m: grid && grid.modelsRun,
    s: Object.fromEntries(Object.entries(triggers).map(([sk, s]) => [sk, Object.fromEntries(WX.ORDER.map(k => [k, s.triggers[k].status]))])),
    race: { heat: peak('race', 'heat'), wind: peak('race', 'wind'), rain: peak('race', 'rain'), cold: peak('race', 'cold') === 99 ? null : peak('race', 'cold') }
  });
  writeJSON(path.join(OUT, 'history.json'), hist.slice(-24 * 45));

  // Past years on the race dates, a few at a time until all are stored.
  let made = 0;
  for (const y of W.replayYears) {
    const f = path.join('replay', y + '.json'), prevF = path.join(PREV, f);
    const old = readJSON(prevF, null);
    if (old && JSON.stringify(old.points) === JSON.stringify(points)) { fs.mkdirSync(path.join(OUT, 'replay'), { recursive: true }); fs.copyFileSync(prevF, path.join(OUT, f)); continue; }
    if (made >= 3) continue;
    try { writeJSON(path.join(OUT, f), await fetchReplay(y, points)); made++; console.log('replay ' + y + ' stored'); await sleep(3000); } catch (e) { console.log('replay ' + y + ': ' + e.message); }
  }
  writeJSON(path.join(OUT, 'replay', 'index.json'), W.replayYears.filter(y => fs.existsSync(path.join(OUT, 'replay', y + '.json'))));

  const state = readJSON(path.join(PREV, 'state.json'), {});
  await alerts(triggers, state, warnings, incidents);
  if (flag('--test-alert')) {
    const s = triggers.next48;
    await notify('GPT100 weather: test alert', 'Phone alerts are working. Next 48 hours: ' + (WX.ORDER.map(k => s.triggers[k]).filter(r => r.status === 'met' || r.status === 'close')
      .map(r => r.label + ' ' + WORD[r.status]).join(', ') || 'all clear') + '.', 3, 'white_check_mark');
    if (!NTFY) console.log('No NTFY_TOPIC secret set, so nothing was sent.');
  }
  // Race week: the draft of the 10 am weather update, to the phone at 9 am, ready to check and send.
  const U = W.dailyUpdate, today = WX.localDate(NOW);
  if (U && (NOW >= WX.parseLocal(U.from) && NOW <= WX.parseLocal(W.event.end) + 24 * HOUR && WX.localHour(NOW) >= U.hour && state.updateDraft !== today || flag('--test-update'))) {
    const text = WX.updateText({ grid, triggers, fire, warnings, incidents, config: CFG, now: NOW, url: APP });
    await notify('Draft 10 am weather update', text.replace(/\*/g, '') + '\n\nTap to open the Weather tab, then Share weather update to edit and send it.', 3, 'memo');
    if (!flag('--test-update')) state.updateDraft = today;
  }
  writeJSON(path.join(OUT, 'state.json'), state);

  for (const [sk, s] of Object.entries(triggers)) console.log(`${s.label}: ${s.status}${s.note ? ' (' + s.note + ')' : ''}  ` + WX.ORDER.map(k => k + '=' + s.triggers[k].status).join(' '));
}
function copyDir(a, b) { if (fs.existsSync(a)) fs.cpSync(a, b, { recursive: true }); }

main().catch(e => { console.error(e); process.exit(1); });
