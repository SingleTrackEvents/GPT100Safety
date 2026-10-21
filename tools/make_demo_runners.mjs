#!/usr/bin/env node
// Makes data/demo-runners.js: the made-up field for the in-app demo (js/demo.js), which plays the race live in the
// browser with no feed links, no Worker and no local server (open any app with ?demo=1). Every runner has a bib, a
// name, a race and a pace (0 = the fastest runner in the pacing table, 1 = the cut-offs), and a few have a case that
// shows the handover between the GPS trackers and the timing chips, or something the Runner watch should catch.
// The km each case happens at is chosen so it has just happened, or is about to, 9 hours into the Miler (the demo's
// default start), whatever time the demo is opened at.
//
//   node tools/make_demo_runners.mjs [miler runners] [stage 2 runners] [seed]
//
// The roster is deterministic for a seed, so a rehearsal can be repeated. Edit the file by hand if you want a
// particular runner, bib or case; the demo reads only the file.
import fs from 'node:fs';
import vm from 'node:vm';

const [nMiler = '70', nStage = '18', seedArg = '2026'] = process.argv.slice(2);
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../data/pacing.js', import.meta.url), 'utf8'), ctx);
const PTS = ctx.window.GPT100_PACING.miler.points.map(p => ({ km: p.km, name: p.name, f: Date.parse(p.fast + ':00+11:00'), s: Date.parse(p.slow + ':00+11:00') }));
const T0 = PTS[0].f;

// Seeded random numbers (mulberry32), so the same seed gives the same field.
let seed = +seedArg >>> 0;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];

// Time (ms from the Miler start) that a runner at pace fraction f reaches a course km, from the pacing table.
const at = (km, k) => { if (km <= PTS[0].km) return PTS[0][k]; for (let i = 1; i < PTS.length; i++) if (km <= PTS[i].km) { const a = PTS[i - 1], b = PTS[i]; return a[k] + (b[k] - a[k]) * (km - a.km) / (b.km - a.km); } return PTS[PTS.length - 1][k]; };
const timeTo = (k0, km, f) => { const x = at(km, 'f') - at(k0, 'f'), y = at(km, 's') - at(k0, 's'); return x + f * (y - x); };
// The km a runner at pace f, who started at course km k0, reaches `ms` after their start.
function kmAfter(k0, f, ms, k1) {
  let lo = k0, hi = k1;
  if (timeTo(k0, hi, f) <= ms) return hi;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (timeTo(k0, m, f) <= ms) lo = m; else hi = m; }
  return lo;
}
const kmRound = x => Math.round(x * 10) / 10;

const FIRST = ['Alex', 'Sam', 'Priya', 'Jordan', 'Casey', 'Morgan', 'Riley', 'Taylor', 'Jamie', 'Drew', 'Harper', 'Quinn', 'Rowan', 'Avery', 'Blake', 'Mia', 'Liam', 'Zoe', 'Ethan', 'Chloe', 'Noah', 'Ruby', 'Lucas', 'Isla', 'Oscar', 'Ava', 'Hugo', 'Freya', 'Kai', 'Nina', 'Tom', 'Bec', 'Josh', 'Emma', 'Ben', 'Sarah', 'Matt', 'Kate', 'Dan', 'Jess', 'Ollie', 'Hannah', 'Jack', 'Lily', 'Marcus', 'Elena', 'Fergus', 'Tess', 'Angus', 'Maeve'];
const LAST = ['Tan', 'Reid', 'Nair', 'Lee', 'Walsh', 'Hill', 'Chen', 'Brooks', 'Singh', 'Kelly', 'Dunn', 'Fox', 'Blake', 'Shaw', 'Moore', 'Nguyen', 'Taylor', 'Patel', 'Murphy', 'Wright', 'Hughes', 'Bell', 'Costa', 'Russo', 'Ward', 'Ferrari', 'Jensen', 'McLeod', 'Novak', 'Okafor', 'Ricci', 'Sato', 'Burke', 'Dale', 'Fraser', 'Gale', 'Hart', 'Iyer', 'King', 'Lowe', 'Mahoney', 'Pike', 'Quigley', 'Ross', 'Stone', 'Vance', 'Webb', 'Young', 'Zhang', 'Adler'];
const used = new Set();
function name() { for (; ;) { const n = pick(FIRST) + ' ' + pick(LAST); if (!used.has(n)) { used.add(n); return n; } } }
// Mostly mid-pack, with a few at the front and a few near the cut-offs.
const pace = () => Math.round(Math.min(0.97, Math.max(0.04, 0.08 + 0.86 * (rnd() + rnd()) / 2)) * 100) / 100;

const H = 9 * 3600e3;  // the demo's default time: 9 hours into the Miler
// The cases, with when (hours into the Miler) each one happens, so that at 9 hours in it has just happened or is due.
const CASES = [
  // [case, how many, hours in (null: not tied to a time), note for the file]
  ['nogps', 6, null, 'no tracker, the chips place them'],
  ['quiet', 3, 8.3, 'tracker went quiet, the chips carry on'],
  ['stopped', 3, 8.4, 'stopped, tracker still sending (not moving, then late at the next checkpoint)'],
  ['lost', 2, 6.0, 'tracker lost and stopped (overdue at the next checkpoint)'],
  ['dnf', 2, 7.0, 'withdrew at a checkpoint'],
  ['missed', 2, 7.5, 'missed by the chip reader at a checkpoint'],
  ['off', 1, 8.5, 'wandered off the course and stopped']
];
const NOTES = Object.fromEntries(CASES.map(c => [c[0], c[3]]));

function field(contest, n, bib0, k0, k1, startMs, cases) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ bib: bib0 + i, name: name(), contest, pace: pace(), case: '' });
  // Spread the cases over the field, never two on one runner.
  // A stride with no common factor with n visits every runner before repeating.
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  let stride = 7; while (gcd(stride, n) !== 1) stride++;
  let slot = 3;
  for (const [kind, count, hours] of cases) {
    for (let c = 0; c < count; c++) {
      while (out[slot % n].case) slot += stride;
      const r = out[slot % n]; slot += stride;
      r.case = kind;
      if (hours == null) continue;
      // The km this runner reaches at that hour (from their own start), on a checkpoint for the chip cases.
      let km = kmAfter(k0, r.pace, T0 + hours * 3600e3 - startMs, k1);
      if (kind === 'dnf' || kind === 'missed') {
        const cps = PTS.filter(p => p.km > k0 + 0.1 && p.km < k1 - 0.1);
        const cp = cps.filter(p => p.km <= km).pop() || cps[0];
        km = cp.km;
      }
      // A runner who hasn't got that far by then (a slow starter) gets the case nearer the start instead.
      if (km <= k0 + 0.5) km = k0 + 2 + rnd() * 4;
      if (km >= k1 - 0.5) km = k1 - 3 - rnd() * 4;
      r.km = kmRound(km);
    }
  }
  return out;
}

const HG = PTS.find(p => p.name === 'Halls Gap').km, MW = PTS.find(p => p.name === 'Mt William').km, END = PTS[PTS.length - 1].km;
const S2_START = Date.parse('2026-11-06T05:50:00+11:00');
const runners = field('GPT100 Miler', +nMiler, 1001, 0, END, T0, CASES)
  .concat(field('Stage 2', +nStage, 2201, HG, MW, S2_START, [['nogps', 1, null], ['stopped', 1, 8.6]]));

const lines = runners.map(r => `  { bib: ${r.bib}, name: ${JSON.stringify(r.name)}, contest: ${JSON.stringify(r.contest)}, pace: ${r.pace.toFixed(2)}${r.case ? `, case: '${r.case}'` : ''}${r.km != null ? `, km: ${r.km}` : ''} }`);
const head = `// The made-up field for the in-app demo (js/demo.js): open any app with ?demo=1 and the race plays live in the
// browser, GPS trackers and timing chips both, with no feed links, Worker or local server. Made by
// tools/make_demo_runners.mjs (seed ${seedArg}); edit by hand if you want, the demo reads only this file.
//
// pace: where the runner sits between the fastest runner (0) and the cut-offs (1) in data/pacing.js.
// case (and the course km it happens at), to show what the apps do when a feed drops out:
${CASES.map(c => `//   ${c[0].padEnd(8)} ${c[3]}`).join('\n')}
// Everyone else runs normally with a tracker and chips. The km for each case is chosen so that it has just happened,
// or is about to, 9 hours into the Miler (the demo's default time).
// contests: each race in the list, its start time (Melbourne) and its start and finish aid stations on the GPT100.
window.GPT100_DEMO = {
  contests: {
    'GPT100 Miler': { start: '2026-11-06T08:00', from: 'Mt Zero (Start)', to: 'Dunkeld (Finish)' },
    'Stage 2': { start: '2026-11-06T05:50', from: 'Halls Gap', to: 'Mt William Carpark' }
  },
  runners: [
`;
fs.writeFileSync(new URL('../data/demo-runners.js', import.meta.url), head + lines.join(',\n') + '\n  ]\n};\n');
const counts = {};
runners.forEach(r => { if (r.case) counts[r.case] = (counts[r.case] || 0) + 1; });
console.log(`Wrote data/demo-runners.js: ${runners.length} runners (${nMiler} Miler, ${nStage} Stage 2). Cases: ${Object.entries(counts).map(([k, v]) => `${v} ${k} (${NOTES[k]})`).join('; ')}.`);
