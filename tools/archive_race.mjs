#!/usr/bin/env node
// Download the race archive the Worker kept during the race (copies of the timing list and the GPS files, see
// tools/ARCHIVE.md) and turn it into one tidy file for the year, ready for fitting next year's predictions.
//
// Usage: MEDPLAN_PASSWORD='the medical password' node tools/archive_race.mjs [options]
//   --year 2026        the race year (default: this year). Files go in out/history/<year>/
//   --worker <url>     the Worker's address (default: weather.refreshUrl in data/config.js)
//   --now              ask the Worker to take a copy of everything first (the final copy, after the last cut-off)
//   --offline          don't download, just rebuild the tidy files from the copies already in out/history/<year>/raw/
//   --list             only list what the Worker holds
//
// Writes (all in out/, which is never committed, see .gitignore):
//   out/history/<year>/raw/...                 every copy, as the feeds sent it (downloaded once, then kept)
//   out/history/<year>/race-<year>.json        the tidy file: every runner's chip times and GPS fixes, with names.
//                                              Private: keep it off the public repository.
//   out/history/<year>/anon-<year>.json        the same with no names or bibs (a made-up id joins chips to GPS),
//                                              GPS fixes thinned to one a minute. Still a precise track per runner,
//                                              so it stays private too; only fitted figures go into the app.
// Run it as often as you like: copies already downloaded aren't fetched again.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const year = String(opt('year') || new Date().getFullYear());
const OUT = join(root, 'out', 'history', year), RAW = join(OUT, 'raw');

function configWorker() {
  try {
    const ctx = { window: {} };
    vm.runInNewContext(readFileSync(join(root, 'data', 'config.js'), 'utf8'), ctx);
    return ((ctx.window.GPT100_CONFIG || {}).weather || {}).refreshUrl || '';
  } catch (e) { return ''; }
}
const WORKER = String(opt('worker') || configWorker()).replace(/\/$/, '');
const PASSWORD = process.env.MEDPLAN_PASSWORD || process.env.RC_PASSWORD || '';

// ---------- download ----------
async function api(path, init) {
  const res = await fetch(WORKER + path, Object.assign({}, init, { headers: { 'X-RC-Password': PASSWORD } }));
  if (!res.ok) {
    let msg = res.status + '';
    try { msg += ' ' + (await res.json()).error; } catch (e) { }
    throw new Error(path + ': ' + msg);
  }
  return res;
}
// Where a copy lives on disk: raw/timing/<time>.json, raw/gps/<event>/init-<time>.txt or data-<time>.lst
const stamp = t => new Date(t).toISOString().replace(/[:.]/g, '');  // 2026-11-06T080000123Z
function fileFor(c) {
  if (c.kind === 'timing') return join(RAW, 'timing', stamp(c.t) + '.json');
  if (c.kind === 'gps-init') return join(RAW, 'gps', c.event, 'init-' + stamp(c.t) + '.txt');
  if (c.kind === 'gps-data') return join(RAW, 'gps', c.event, 'data-' + stamp(c.t) + '.lst');
  return join(RAW, 'other', c.kind + '-' + (c.event || '') + '-' + stamp(c.t));
}
async function download() {
  if (!WORKER) throw new Error('No Worker address: give --worker, or set weather.refreshUrl in data/config.js');
  if (!PASSWORD) throw new Error("Set the medical password first: MEDPLAN_PASSWORD='...' node tools/archive_race.mjs");
  if (opt('now')) {
    const r = await (await api('/archive/now', { method: 'POST' })).json();
    console.log('Copy taken now:');
    for (const c of r.copies || []) console.log('  ' + [c.kind, c.event, c.kept ? 'kept ' + kb(c.size) : c.same ? 'same as the last copy' : c.status ? 'feed said ' + c.status : c.error].filter(Boolean).join('  '));
  }
  const L = await (await api('/archive/list')).json();
  console.log(`The Worker holds ${L.copies.length} copies (${kb((L.stored || {}).bytes || 0)} gzipped). Race window ${L.window.from} to ${L.window.to}, GPS events ${L.gps}.`);
  if (opt('list')) {
    for (const c of L.copies) console.log(`  ${new Date(c.t).toISOString()}  ${c.kind.padEnd(9)} ${(c.event || '').padEnd(16)} ${kb(c.size)}`);
    process.exit(0);
  }
  let got = 0;
  for (const c of L.copies.filter(c => new Date(c.t).getUTCFullYear() === +year)) {
    const f = fileFor(c);
    if (existsSync(f)) continue;
    const parts = [];
    for (let i = 0; i < c.parts; i++) parts.push(Buffer.from(await (await api(`/archive/part?snap=${encodeURIComponent(c.snap)}&part=${i}`)).arrayBuffer()));
    const body = gunzipSync(Buffer.concat(parts));
    if (body.length !== c.size) throw new Error(`${c.snap}: expected ${c.size} bytes, got ${body.length}`);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, body);
    got++;
  }
  console.log(`Downloaded ${got} new copies to ${RAW}`);
}
const kb = n => n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' kB';

// ---------- the timing list ----------
// RaceResult sends a plain array of row objects (the GPT100 list), or arrays with a header row, or
// { list: { Fields }, data } as my.raceresult.com does. Rows come back as objects keyed by column name.
function rowsOf(j) {
  let rows = [], labels = null;
  if (Array.isArray(j)) rows = j;
  else if (j && typeof j === 'object') {
    const d = j.data != null ? j.data : j.rows != null ? j.rows : Array.isArray(j.list) ? j.list : null;
    if (Array.isArray(d)) rows = d;
    else if (d && typeof d === 'object') rows = Object.values(d).flat();
    const F = j.list && j.list.Fields;
    if (Array.isArray(F)) labels = F.map(f => (f && (f.Label || f.Expression)) || String(f));
  }
  if (rows.length && Array.isArray(rows[0]) && !labels && rows[0].every(x => typeof x === 'string' && !/^\d/.test(x))) labels = rows.shift();
  return rows.map(r => Array.isArray(r) ? Object.fromEntries((labels || r.map((_, i) => 'col' + i)).map((k, i) => [k, r[i]])) : r).filter(r => r && typeof r === 'object');
}
const pick = (row, re) => { const k = Object.keys(row).find(k => re.test(k.trim())); return k == null ? '' : String(row[k] == null ? '' : row[k]).trim(); };
// Columns that aren't timing points.
const NOT_POINT = /^(place|rank|pos(ition)?|status|bib|no|number|name|first ?name|last ?name|surname|contest|race|category|cat|gender|sex|age|age ?group|club|team|nation|country|time|diff|gap|id|pid|#?\d*_.*|.*place)$/i;
// "8:05:12", "1:02:00:00" (D:HH:MM:SS, D days past the start day), "26:00:00": seconds into the start day.
function daySecs(v) {
  const m = String(v || '').trim().match(/^(?:(\d+):)?(\d{1,3}):(\d\d):(\d\d(?:\.\d+)?)$/);
  if (!m) return null;
  return (+m[1] || 0) * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4];
}
// Each runner's times as seconds after their Start, in column order. A time of day more than 12 hours earlier than
// the column before it, with no D: in front, has gone past midnight (as js/timing.js reads it).
function elapsed(row, cols) {
  const out = {};
  let start = null, prev = null, add = 0;
  for (const c of cols) {
    const raw = String(row[c] == null ? '' : row[c]).trim();
    let s = daySecs(raw);
    if (s == null) {
      const d = Date.parse(raw);
      if (isNaN(d) || !/\d{4}-\d\d-\d\d|^\d{9,}$/.test(raw)) continue;
      s = (/^\d{9,}$/.test(raw) ? +raw * (raw.length > 11 ? 1 : 1000) : d) / 1000;  // full dates: absolute, fine for differences
    } else {
      if (!/^\d+:\d+:\d+:/.test(raw) && prev != null && s + add < prev - 12 * 3600) add += 86400;
      s += add;
    }
    prev = s;
    if (/^start/i.test(c.trim())) start = s;
    out[c] = s;
  }
  if (start == null) return { start: null, secs: {} };
  return { start, secs: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(v - start)])) };
}
// Every copy of the timing list, oldest first, merged per runner: the last value of each column wins, and the time of
// the copy where each value first showed up is kept too (how long the reads took to come through, roughly).
function timing() {
  const dir = join(RAW, 'timing');
  const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort() : [];
  const runners = new Map(), cols = [];
  let bad = 0;
  for (const f of files) {
    let rows;
    try { rows = rowsOf(JSON.parse(readFileSync(join(dir, f), 'utf8'))); } catch (e) { bad++; continue; }
    const t = Date.parse(f.replace(/^(\d{4}-\d\d-\d\d)T(\d\d)(\d\d)(\d\d)(\d{3})Z\.json$/, '$1T$2:$3:$4.$5Z'));
    for (const row of rows) {
      for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k);
      const bib = pick(row, /^(bib|no|number|startno)$/i);
      if (!bib) continue;
      const r = runners.get(bib) || { bib, row: {}, seen: {} };
      for (const [k, v] of Object.entries(row)) {
        const s = v == null ? '' : String(v).trim();
        if (s !== '' && r.row[k] !== s) { r.row[k] = s; r.seen[k] = new Date(t).toISOString(); }
        else if (s === '' && r.row[k] == null) r.row[k] = '';
      }
      r.last = new Date(t).toISOString();
      runners.set(bib, r);
    }
  }
  const points = cols.filter(c => !NOT_POINT.test(c.trim()));
  const list = [...runners.values()].map(r => {
    const row = r.row, name = pick(row, /^name$/i) || [pick(row, /^first ?name$/i), pick(row, /^(last ?name|surname)$/i)].filter(Boolean).join(' ');
    const e = elapsed(row, points), place = pick(row, /^place$/i);
    // Status from the Status column, or from Place when that holds one (as the app reads it, js/timing.js).
    const status = pick(row, /^status$/i) || (/^(dnf|dns|dsq|otl|dq)$/i.test(place) ? place.toUpperCase() : '');
    return {
      bib: r.bib, name, contest: pick(row, /^(contest|race)$/i), gender: pick(row, /^(gender|sex)$/i), status,
      place: pick(row, /^place$/i), time: pick(row, /^time$/i),
      splits: Object.fromEntries(points.filter(p => row[p]).map(p => [p, { raw: row[p], secs: e.secs[p] == null ? null : e.secs[p], seen: r.seen[p] }])),
      lastSeen: r.last
    };
  });
  return { copies: files.length, unreadable: bad, columns: cols, points, runners: list };
}

// ---------- the GPS files (GPS-seuranta, as js/tracking.js reads them) ----------
const EPOCH = Date.UTC(2006, 0, 1) / 1000;  // the feed counts seconds from 1 January 2006 UTC
const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function parseInit(txt) {
  const out = { name: '', competitors: new Map() };
  for (const raw of txt.split('\n')) {
    const line = raw.replace(/\r$/, ''), i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i), v = line.slice(i + 1);
    if (k === 'RACENAME') out.name = v.trim();
    else if (k === 'COMPETITOR') {
      const f = v.split('|'), full = (f[3] || '').trim(), m = full.match(/^(\d+)\s*(.*)$/);
      if (f[0]) out.competitors.set(f[0], { id: f[0], bib: m ? m[1] : '', name: m ? m[2] : full });
    }
  }
  return out;
}
// One line: "<id>.<t>_<lon*5e4>_<lat*1e5>_B<batt>_S<speed>.<dt>_<dlon>_<dlat>.<3 chars: dt dlon dlat, each minus 31>…"
function parseData(txt, fixes) {
  for (const line of txt.split('\n')) {
    if (line.length <= 10) continue;
    const c = line.split('.');
    if (c.length < 2 || c[1].indexOf('*') >= 0) continue;
    const u = c[1].split('_');
    let t = +u[0], lon = +u[1], lat = +u[2];
    if (!isFinite(t) || !isFinite(lon) || !isFinite(lat)) continue;
    const pts = fixes.get(c[0]) || new Map();
    const add = () => { if (lat && lon) pts.set(t, [t + EPOCH, +(lat / 1e5).toFixed(5), +(lon / 5e4).toFixed(5)]); };
    add();
    for (let k = 2; k < c.length; k++) {
      const tok = c[k];
      if (tok.length < 3) continue;
      const v = tok.split('_');
      if (v.length >= 3) { t += +v[0] || 0; lon += +v[1] || 0; lat += +v[2] || 0; }
      else { t += ALPHA.indexOf(tok[0]) - 31; lon += ALPHA.indexOf(tok[1]) - 31; lat += ALPHA.indexOf(tok[2]) - 31; }
      add();
    }
    fixes.set(c[0], pts);
  }
}
// Every copy of each event, merged: the latest competitor list, and every fix from every copy (so a fix the provider
// dropped from a later file is still kept).
function gps() {
  const dir = join(RAW, 'gps'), events = {};
  if (!existsSync(dir)) return events;
  for (const ev of readdirSync(dir).sort()) {
    const files = readdirSync(join(dir, ev)).sort();
    const comp = new Map(); let name = '';
    for (const f of files.filter(f => f.startsWith('init-'))) {
      const I = parseInit(readFileSync(join(dir, ev, f), 'utf8'));
      if (I.name) name = I.name;
      for (const [id, c] of I.competitors) comp.set(id, c);
    }
    const fixes = new Map();
    const data = files.filter(f => f.startsWith('data-'));
    for (const f of data) parseData(readFileSync(join(dir, ev, f), 'utf8'), fixes);
    const runners = [...comp.values()].map(c => ({ bib: c.bib, name: c.name, trackerId: c.id, fixes: [...(fixes.get(c.id) || new Map()).values()].sort((a, b) => a[0] - b[0]) }));
    events[ev] = { name, copies: data.length, runners };
  }
  return events;
}

// ---------- the tidy files ----------
function thin(fixes, sec) {
  const out = [];
  for (const p of fixes) if (!out.length || p[0] - out[out.length - 1][0] >= sec) out.push(p);
  return out;
}
function build() {
  const T = timing(), G = gps();
  const race = { year: +year, made: new Date().toISOString(), note: 'Private: names, bibs and GPS tracks. Do not commit.', timing: T, gps: G };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `race-${year}.json`), JSON.stringify(race));

  // No names or bibs: one made-up id per bib, the same in the chips and the GPS, so the two can still be joined.
  const ids = new Map(), idOf = bib => { if (!bib) return null; if (!ids.has(bib)) ids.set(bib, 'r' + randomBytes(4).toString('hex')); return ids.get(bib); };
  const anon = {
    year: +year, made: race.made, note: 'No names or bibs, but each runner\'s GPS track is still precise: keep it private.',
    timing: { copies: T.copies, points: T.points, runners: T.runners.map(r => ({ id: idOf(r.bib), contest: r.contest, gender: r.gender, status: r.status, place: r.place, time: r.time, splits: r.splits })) },
    gps: Object.fromEntries(Object.entries(G).map(([ev, E]) => [ev, { name: E.name, copies: E.copies, runners: E.runners.filter(r => r.fixes.length).map(r => ({ id: idOf(r.bib) || idOf('gps:' + ev + ':' + r.trackerId), fixes: thin(r.fixes, 60) })) }]))
  };
  writeFileSync(join(OUT, `anon-${year}.json`), JSON.stringify(anon));

  // What's in it.
  console.log(`\nTiming: ${T.copies} copies${T.unreadable ? ` (${T.unreadable} unreadable)` : ''}, ${T.runners.length} runners, timing points: ${T.points.join(', ') || 'none'}`);
  const by = {};
  for (const r of T.runners) { const k = r.contest || '(no contest)'; by[k] = by[k] || { n: 0, status: {} }; by[k].n++; const s = r.status || (r.splits.Finish ? 'finished' : 'no status'); by[k].status[s] = (by[k].status[s] || 0) + 1; }
  for (const [k, v] of Object.entries(by)) console.log(`  ${k}: ${v.n} (${Object.entries(v.status).map(([s, n]) => s + ' ' + n).join(', ')})`);
  for (const [ev, E] of Object.entries(G)) {
    const n = E.runners.filter(r => r.fixes.length).length, f = E.runners.reduce((s, r) => s + r.fixes.length, 0);
    console.log(`GPS ${ev}${E.name ? ' (' + E.name + ')' : ''}: ${E.copies} copies, ${E.runners.length} trackers, ${n} with fixes, ${f} fixes`);
  }
  console.log(`\nWrote ${join(OUT, `race-${year}.json`)} and anon-${year}.json (both private, in out/)`);
}

try {
  if (!opt('offline')) await download();
  build();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
