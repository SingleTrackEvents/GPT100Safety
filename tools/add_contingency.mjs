// Adds the Miler's contingency course (a different way between two aid stations) from its GPX, for Find (as a course
// of its own, built by js/engine.js), the safety map and the field app. Writes data/contingency.js: only the part that differs from the GPT100 course, plus where it
// leaves and rejoins (GPT100 km, at aid stations), so the maps can show the GPT100, the contingency or both.
// Usage: node tools/add_contingency.mjs path/to/contingency.gpx [leave aid station] [rejoin aid station]
// e.g.   node tools/add_contingency.mjs "GPT100 Miler 2026 - Contingency Course.gpx" "Mt William Carpark" "Jimmy Creek Camp"
// With no names given, it works out the stretch where the GPX is more than 150 m from the course, and picks the
// aid stations either side of it.
import fs from 'fs';
import { execFileSync } from 'child_process';

const [file, leaveName, rejoinName] = process.argv.slice(2);
if (!file) { console.error('Usage: node tools/add_contingency.mjs <file.gpx> [leave aid station] [rejoin aid station]'); process.exit(1); }
const xml = fs.readFileSync(file, 'utf8');
if (/<!DOCTYPE|<!ENTITY/i.test(xml)) { console.error('GPX with a DTD is not accepted.'); process.exit(1); }
const title = ((/<metadata>[\s\S]*?<name>([^<]*)<\/name>/.exec(xml) || [])[1] || 'Contingency course').trim();

globalThis.window = globalThis;
(0, eval)(fs.readFileSync('data/course.js', 'utf8'));
const D = globalThis.GPT100_DATA, route = D.route;

const attr = (tag, a) => { const m = new RegExp(`\\b${a}="([-\\d.]+)"`).exec(tag); return m ? +m[1] : NaN; };
const pts = [...xml.matchAll(/<(?:trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/(?:trkpt|rtept)>/g)].map(m => {
  const e = /<ele>([-\d.]+)<\/ele>/.exec(m[2]);
  return [attr(m[1], 'lat'), attr(m[1], 'lon'), e ? +e[1] : 0];
}).filter(p => isFinite(p[0]) && isFinite(p[1]));
if (pts.length < 2) { console.error('No track points found.'); process.exit(1); }

const R = 6371e3, rad = Math.PI / 180;
const metres = (a, b) => { const dl = (b[0] - a[0]) * rad, dn = (b[1] - a[1]) * rad, x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const offCourse = p => { let b = Infinity; for (const q of route) { const d = metres(p, q); if (d < b) b = d; } return b; };

// Aid stations on the GPT100 course, by name.
const aids = D.access.filter(a => a.aid);
const aid = name => {
  const a = aids.find(x => x.name.toLowerCase().startsWith(name.toLowerCase()));
  if (!a) { console.error(`No aid station called "${name}". Aid stations: ${aids.map(x => x.name).join(', ')}`); process.exit(1); }
  return a;
};
let leave, rejoin;
if (leaveName && rejoinName) { leave = aid(leaveName); rejoin = aid(rejoinName); }
else {
  // The longest run of GPX points more than 150 m from the course.
  const off = pts.map(p => offCourse(p) > 150);
  let best = [0, -1], s = -1;
  off.forEach((o, i) => { if (o && s < 0) s = i; if ((!o || i === off.length - 1) && s >= 0) { if (i - s > best[1] - best[0]) best = [s, i]; s = -1; } });
  if (best[1] < 0) { console.error('The GPX follows the GPT100 course all the way.'); process.exit(1); }
  // The last aid station the GPX passes (within 100 m) before that, and the first after it.
  const pass = (a, from, to) => { let b = null; for (let i = from; i < to; i++) { const d = metres(pts[i], [a.lat, a.lon]); if (d <= 100 && (!b || d < b.d)) b = { d, i }; } return b; };
  const before = aids.map(a => ({ a, p: pass(a, 0, best[0]) })).filter(x => x.p).sort((x, y) => y.p.i - x.p.i)[0];
  const after = aids.map(a => ({ a, p: pass(a, best[1], pts.length) })).filter(x => x.p).sort((x, y) => x.p.i - y.p.i)[0];
  if (!before || !after) { console.error('No aid station either side of the change: name them on the command line.'); process.exit(1); }
  leave = before.a; rejoin = after.a;
}
// The GPX point nearest each aid station (the first pass for the leave, the last for the rejoin).
const nearest = (a, from, to, step) => {
  let bi = -1, bd = Infinity;
  for (let i = from; i !== to; i += step) { const d = metres(pts[i], [a.lat, a.lon]); if (d < bd - 1) { bd = d; bi = i; } }
  if (bd > 100) { console.error(`The GPX doesn't pass ${a.name} (nearest ${Math.round(bd)} m).`); process.exit(1); }
  return bi;
};
const i0 = nearest(leave, 0, pts.length, 1), i1 = nearest(rejoin, pts.length - 1, i0, -1);
if (i1 <= i0) { console.error(`The GPX reaches ${rejoin.name} before ${leave.name}.`); process.exit(1); }

// The contingency section, with km along it from the leave aid station and its height.
let km = 0, up = 0;
const sect = pts.slice(i0, i1 + 1).map((p, i, a) => {
  if (i) { km += metres(a[i - 1], p) / 1000; if (p[2] > a[i - 1][2]) up += p[2] - a[i - 1][2]; }
  return [+p[0].toFixed(5), +p[1].toFixed(5), +km.toFixed(3), +p[2].toFixed(1)];
});
// The GPT100 stretch it replaces.
const m0 = leave.trail_km, m1 = rejoin.trail_km;
let mainUp = 0;
route.forEach((q, i) => { if (i && q[2] > m0 && q[2] <= m1 && q[3] > route[i - 1][3]) mainUp += q[3] - route[i - 1][3]; });
const skipped = aids.filter(a => a.trail_km > m0 + 0.05 && a.trail_km < m1 - 0.05).map(a => a.name);
const maxOff = Math.max(...sect.filter((_, i) => i % 10 === 0).map(p => offCourse(p)));

const out = {
  id: 'contingency', name: title, label: 'Contingency',
  leave: { name: leave.name, km: m0 }, rejoin: { name: rejoin.name, km: m1 },
  section_km: +km.toFixed(3), section_ascent_m: Math.round(up),
  main_km: +(m1 - m0).toFixed(3), main_ascent_m: Math.round(mainUp),
  // GPT100 km after the rejoin, plus this, is the Miler km on the contingency course.
  extra_km: +(km - (m1 - m0)).toFixed(3),
  total_km: +(D.total_km + km - (m1 - m0)).toFixed(3),
  skipped, max_off_m: Math.round(maxOff),
  route: sect
};
fs.writeFileSync('data/contingency.js', `// The Miler's contingency course: the stretch that differs from the GPT100 course, between two aid stations
// (tools/add_contingency.mjs, from "${title}"). route: [lat, lon, km from the leave aid station, height].
window.GPT100_CONTINGENCY = ${JSON.stringify(out)};
`);
console.log(`${title}: leaves at ${leave.name} (km ${m0}), rejoins at ${rejoin.name} (km ${m1}).`);
console.log(`Contingency ${km.toFixed(1)} km and ${Math.round(up)} m up, instead of ${(m1 - m0).toFixed(1)} km and ${Math.round(mainUp)} m up (up to ${(maxOff / 1000).toFixed(1)} km from the course). Miler ${out.total_km.toFixed(1)} km.`);
if (skipped.length) console.log('Not on the contingency: ' + skipped.join(', '));
// The walks from the access points to the contingency stretch (OpenStreetMap), for the response times.
try { execFileSync('python3', ['tools/contingency_joins.py'], { stdio: 'inherit' }); }
catch (e) { console.error('Walks to the contingency not worked out (needs signal): run python3 tools/contingency_joins.py'); }
