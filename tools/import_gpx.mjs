// Adds a race course from a GPX file to the runner app (data/runner-courses.js).
// Usage: node tools/import_gpx.mjs <id> <name> <file.gpx>     e.g. node tools/import_gpx.mjs 5k "Dunkeld Family 5k" 5k.gpx
// The route gets km and height along it; GPX waypoints (e.g. "U Turn") become stops. Re-run to replace a course.
// Then set the race's course to the same id in tools/import_races.mjs and re-run that.
import fs from 'fs';

const [id, name, file] = process.argv.slice(2);
if (!id || !name || !file) { console.error('Usage: node tools/import_gpx.mjs <id> <name> <file.gpx>'); process.exit(1); }
const xml = fs.readFileSync(file, 'utf8');
if (/<!DOCTYPE|<!ENTITY/i.test(xml)) { console.error('GPX with a DTD is not accepted.'); process.exit(1); }
if (!/<gpx[\s>]/.test(xml)) { console.error('Not a GPX file (the website currently serves empty placeholders: export from Strava instead).'); process.exit(1); }

const attr = (tag, a) => { const m = new RegExp(`\\b${a}="([-\\d.]+)"`).exec(tag); return m ? +m[1] : NaN; };
const pts = [...xml.matchAll(/<(?:trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/(?:trkpt|rtept)>/g)].map(m => {
  const e = /<ele>([-\d.]+)<\/ele>/.exec(m[2]);
  return [attr(m[1], 'lat'), attr(m[1], 'lon'), e ? +e[1] : 0];
}).filter(p => isFinite(p[0]) && isFinite(p[1]));
if (pts.length < 2) { console.error('No track points found.'); process.exit(1); }

const R = 6371e3, rad = Math.PI / 180;
const metres = (a, b) => { const dl = (b[0] - a[0]) * rad, dn = (b[1] - a[1]) * rad, x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
// [lat, lon, km, height], like the main course data.
let km = 0;
const route = pts.map((p, i) => { if (i) km += metres(pts[i - 1], p) / 1000; return [+p[0].toFixed(5), +p[1].toFixed(5), +km.toFixed(3), +p[2].toFixed(1)]; });
// Waypoints become stops at the nearest point along the route.
const stops = [{ name: 'Start', kind: 'start', km: 0, lat: route[0][0], lon: route[0][1] }];
for (const m of xml.matchAll(/<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/g)) {
  const w = [attr(m[1], 'lat'), attr(m[1], 'lon')], label = (/<name>([^<]*)<\/name>/.exec(m[2]) || [])[1] || 'Waypoint';
  let best = 0; route.forEach((p, i) => { if (metres(w, p) < metres(w, route[best])) best = i; });
  stops.push({ name: label.trim().replace(/^u turn$/i, 'Turnaround'), kind: 'turn', km: route[best][2], lat: route[best][0], lon: route[best][1] });
}
const end = route[route.length - 1];
stops.push({ name: 'Finish', kind: 'finish', km: end[2], lat: end[0], lon: end[1] });
stops.sort((a, b) => a.km - b.km);

const out = 'data/runner-courses.js';
let all = {};
if (fs.existsSync(out)) { const t = fs.readFileSync(out, 'utf8'); all = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); }
all[id] = { id, name, total_km: end[2], stops, route };
fs.writeFileSync(out, `// Race courses for the runner app that aren't in the safety app's course data (tools/import_gpx.mjs).
window.GPT_RUNNER_COURSES = ${JSON.stringify(all)};
`);
console.log(`${id}: ${name}, ${route.length} points, ${end[2].toFixed(2)} km, stops: ${stops.map(s => s.name + ' ' + s.km.toFixed(2)).join(', ')}`);
