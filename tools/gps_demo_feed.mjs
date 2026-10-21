#!/usr/bin/env node
// Makes a rehearsal feed for the live runner positions, with made-up runners spread along the GPT100 course as if
// the Miler were under way: the GPS tracking provider's files (init.txt and data.lst) and the timing team's list
// (timing.json, the shape RaceResult publishes) for the same runners. For testing the live features before the real
// links exist, and for training. Some runners show the handover between the two feeds:
//   every 11th runner has no tracker (chip reads only), every 23rd has a tracker that went quiet 40 minutes ago
//   (the chips carry on), every 17th has stopped 35 minutes ago (tracker fine, late at the next checkpoint),
//   every 29th withdrew at their last checkpoint, every 31st was missed by the last checkpoint's chip reader,
//   every 19th lost their tracker and stopped 3 hours ago (so they're overdue at the next checkpoint).
//
//   node tools/gps_demo_feed.mjs out/demo-gps [runners] [hours into the race]
//   python3 -m http.server 8765      (from the repo root)
//   open index.html?gps=http://localhost:8765/out/demo-gps/      (timing.json in the folder is picked up too)
//
// The GPS feed is a replay (LIVE:0) ending now, positions every 60 seconds for the last 2 hours. The timing list
// gives each runner's time of day at every checkpoint they've passed, as the real feed will.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const [outDir = 'out/demo-gps', nRunners = '60', hoursIn = '9'] = process.argv.slice(2);
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../data/course.js', import.meta.url), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(new URL('../data/pacing.js', import.meta.url), 'utf8'), ctx);
const route = ctx.window.GPT100_DATA.route;  // [lat, lon, km, ele]
const total = route[route.length - 1][2];
// The checkpoints, named the way a timing team might name them (not quite the app's names, to exercise the matching).
const CHECKPOINTS = ctx.window.GPT100_PACING.miler.points.map(p => ({ km: p.km, name: p.name }));
CHECKPOINTS[0].name = 'Start'; CHECKPOINTS[CHECKPOINTS.length - 1].name = 'Finish';

const EPOCH = Date.UTC(2006, 0, 1) / 1000;
const now = Math.floor(Date.now() / 1000);
const N = +nRunners, H = +hoursIn;
const startT = now - H * 3600;  // when the race started, for the chip times
const atKm = km => { let lo = 0, hi = route.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (route[m][2] < km) lo = m + 1; else hi = m; } return route[lo]; };
const names = ['Alex Tan', 'Sam Reid', 'Priya Nair', 'Jordan Lee', 'Casey Walsh', 'Morgan Hill', 'Riley Chen', 'Taylor Brooks', 'Jamie Singh', 'Drew Kelly', 'Harper Dunn', 'Quinn Fox', 'Rowan Blake', 'Avery Shaw', 'Blake Moore'];
const tod = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

let init = `VERSIO:3\nRACENAME:GPT100 rehearsal feed\nTIMEZONE:660\nGRABINTERVAL:15\nDASHLIMIT:60\nLIVEBUFFER:150\nMINBEFORESTART:3\nNUMBEROFLOGOS:1\nLIVE:0\nMAPSYSTEM:OTM\nCENTERPOINT:142.52|-37.3\nMAXTIMEMINS:2600\n`;
const lines = [], rows = [];
let noTracker = 0, quietN = 0, stoppedN = 0, dnfN = 0, missedN = 0, lostN = 0;
for (let i = 0; i < N; i++) {
  const id = 'au' + String(i + 1).padStart(2, '0'), bib = 1001 + i, name = names[i % names.length];
  // Speed between 4 and 9 km/h, so after H hours the field is spread out.
  const speed = 4 + 5 * ((i * 7919) % 100) / 100;
  const lost = i % 19 === 9, stopped = i % 17 === 5 || lost, quiet = i % 23 === 7, noGps = i % 11 === 3 || lost, dnf = i % 29 === 11, missed = i % 31 === 13;
  const STOP_S = (lost ? 180 : 35) * 60;  // the stopped runner stopped this long ago
  const kmAt = s => { const hoursRun = H - s / 3600; return Math.min(total, Math.max(0, hoursRun * speed - (stopped ? Math.max(0, (STOP_S - s) / 3600) * speed : 0))); };
  const kmNow = kmAt(0);
  // GPS: a fix every minute for the last 2 hours.
  if (!noGps) {
    init += `COMPETITOR:${id}|20261106|600|${bib} ${name}|${bib} ${name.split(' ')[1]}|A=${bib} ${name}|\n`;
    const pts = [];
    for (let s = 120 * 60; s >= 0; s -= 60) {
      const t = now - s;
      if (quiet && s < 40 * 60) break;
      if (dnf && kmAt(s) >= kmNow - 0.01) break;  // the tracker was switched off when they withdrew
      const p = atKm(kmAt(s));
      // A little GPS wobble, about 10 m
      const lat = p[0] + (Math.sin(t / 37 + i) * 0.00009), lon = p[1] + (Math.cos(t / 41 + i) * 0.00011);
      pts.push([t - EPOCH, Math.round(lon * 5e4), Math.round(lat * 1e5)]);
    }
    if (pts.length) {
      let line = `${id}.${pts[0][0]}_${pts[0][1]}_${pts[0][2]}_B90_S0`;
      for (let k = 1; k < pts.length; k++) line += `.${pts[k][0] - pts[k - 1][0]}_${pts[k][1] - pts[k - 1][1]}_${pts[k][2] - pts[k - 1][2]}`;
      lines.push(line);
    }
  } else if (!lost) noTracker++;
  // Chips: the time of day at every checkpoint they've reached (the stopped runner stopped where they are).
  const passed = CHECKPOINTS.filter(c => c.km <= kmNow + 1e-6);
  const times = CHECKPOINTS.map(c => c.km <= kmNow + 1e-6 ? tod.format(new Date((startT + c.km / speed * 3600) * 1000)) : '');
  if (missed && passed.length > 1) { times[passed.length - 1] = ''; missedN++; }
  let status = '';
  if (dnf && passed.length > 1) { status = 'DNF'; dnfN++; }
  if (quiet) quietN++; if (lost) lostN++; else if (stopped) stoppedN++;
  rows.push([String(bib), name, 'GPT100 Miler', status].concat(times));
}
const timing = {
  list: { ListName: 'GPT100 Safety timing list', Fields: [{ Label: 'Bib' }, { Label: 'Name' }, { Label: 'Contest' }, { Label: 'Status' }].concat(CHECKPOINTS.map(c => ({ Label: c.name }))) },
  data: { '#1_GPT100 Miler': rows }
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'init.txt'), init);
fs.writeFileSync(path.join(outDir, 'data.lst'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(outDir, 'timing.json'), JSON.stringify(timing));
console.log(`Wrote ${outDir}/init.txt, data.lst and timing.json: ${rows.length} runners (${lines.length} with a tracker), ${H} hours into the race.`);
console.log(`Handover cases: ${noTracker} with no tracker, ${quietN} tracker gone quiet, ${stoppedN} stopped, ${lostN} tracker lost and stopped 3 hours ago, ${dnfN} withdrew, ${missedN} missed by a chip reader.`);
