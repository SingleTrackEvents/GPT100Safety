#!/usr/bin/env node
// Makes a rehearsal GPS feed in the tracking provider's format (init.txt and data.lst), with made-up runners
// spread along the GPT100 course as if the Miler were under way. For testing the live tracking features
// before the real event link exists, and for training.
//
//   node tools/gps_demo_feed.mjs out/demo-gps [runners] [hours into the race]
//   python3 -m http.server 8765      (from the repo root)
//   open index.html?gps=http://localhost:8765/out/demo-gps/
//
// The feed is a replay (LIVE:0) ending now. Positions are every 60 seconds for the last 2 hours.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const [outDir = 'out/demo-gps', nRunners = '60', hoursIn = '9'] = process.argv.slice(2);
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../data/course.js', import.meta.url), 'utf8'), ctx);
const route = ctx.window.GPT100_DATA.route;  // [lat, lon, km, ele]
const total = route[route.length - 1][2];

const EPOCH = Date.UTC(2006, 0, 1) / 1000;
const now = Math.floor(Date.now() / 1000);
const N = +nRunners, H = +hoursIn;
const atKm = km => { let lo = 0, hi = route.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (route[m][2] < km) lo = m + 1; else hi = m; } return route[lo]; };
const names = ['Alex Tan', 'Sam Reid', 'Priya Nair', 'Jordan Lee', 'Casey Walsh', 'Morgan Hill', 'Riley Chen', 'Taylor Brooks', 'Jamie Singh', 'Drew Kelly', 'Harper Dunn', 'Quinn Fox', 'Rowan Blake', 'Avery Shaw', 'Blake Moore'];

let init = `VERSIO:3\nRACENAME:GPT100 rehearsal feed\nTIMEZONE:660\nGRABINTERVAL:15\nDASHLIMIT:60\nLIVEBUFFER:150\nMINBEFORESTART:3\nNUMBEROFLOGOS:1\nLIVE:0\nMAPSYSTEM:OTM\nCENTERPOINT:142.52|-37.3\nMAXTIMEMINS:2600\n`;
const lines = [];
for (let i = 0; i < N; i++) {
  const id = 'au' + String(i + 1).padStart(2, '0'), bib = 1001 + i, name = names[i % names.length];
  init += `COMPETITOR:${id}|20261106|600|${bib} ${name}|${bib} ${name.split(' ')[1]}|A=${bib} ${name}|\n`;
  // Speed between 4 and 9 km/h, so after H hours the field is spread out; a few have stopped, one tracker has gone quiet.
  const speed = 4 + 5 * ((i * 7919) % 100) / 100;
  const stopped = i % 17 === 5, quiet = i % 23 === 7;
  const pts = [];
  for (let s = 120 * 60; s >= 0; s -= 60) {
    const t = now - s;
    if (quiet && s < 40 * 60) break;
    const hoursRun = H - s / 3600, kmNow = Math.min(total, Math.max(0, hoursRun * speed - (stopped ? Math.max(0, (35 * 60 - s) / 3600) * speed : 0)));
    const p = atKm(kmNow);
    // A little GPS wobble, about 10 m
    const lat = p[0] + (Math.sin(t / 37 + i) * 0.00009), lon = p[1] + (Math.cos(t / 41 + i) * 0.00011);
    pts.push([t - EPOCH, Math.round(lon * 5e4), Math.round(lat * 1e5)]);
  }
  if (!pts.length) continue;
  let line = `${id}.${pts[0][0]}_${pts[0][1]}_${pts[0][2]}_B90_S0`;
  for (let k = 1; k < pts.length; k++) line += `.${pts[k][0] - pts[k - 1][0]}_${pts[k][1] - pts[k - 1][1]}_${pts[k][2] - pts[k - 1][2]}`;
  lines.push(line);
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'init.txt'), init);
fs.writeFileSync(path.join(outDir, 'data.lst'), lines.join('\n') + '\n');
console.log(`Wrote ${outDir}/init.txt and data.lst: ${lines.length} runners, ${H} hours into the race.`);
