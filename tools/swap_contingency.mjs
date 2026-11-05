// Swaps the GPT100 course and the alternative route in data/contingency.js: the alternative becomes the course, and
// the stretch it replaced becomes the alternative (still a course of its own in Find, with its own access points,
// walks, track grades and what3words). Used on 5 November 2026, when the Miler contingency became the course.
// Usage: node tools/swap_contingency.mjs <id> <name> <switch label> <switch label for the new course>
// e.g.   node tools/swap_contingency.mjs original "Original course" Original Contingency
// Rewrites data/course.js (route, km of every access point, crossings), data/track-grades.js (grades by km, the road
// grade keys, each marker's km and distance off the course), data/course-w3w.js (the GPT100's words, with gaps on the
// new stretch for tools/add_course_w3w.py to fill) and data/contingency.js (the old stretch).
// Access points that only reached the old stretch get "courses": [<id>]. Points that join the new stretch (from
// tools/contingency_joins.py) move to it; access points for the new stretch only ("courses": ["contingency"]) join
// the course and become a water point (the course sheet's new point). Then run python3 tools/add_course_w3w.py
// --course gpt100 for the new stretch's words. (Don't run tools/contingency_joins.py after this: the old stretch keeps
// the GPT100's own walks.)
import fs from 'fs';

const [id, name, label, mainLabel] = process.argv.slice(2);
if (!id || !name || !label || !mainLabel) { console.error('Usage: node tools/swap_contingency.mjs <id> <name> <switch label> <switch label for the new course>'); process.exit(1); }
globalThis.window = globalThis; globalThis.innerWidth = 1000;
const read = f => fs.readFileSync(f, 'utf8');
// Replaces the JSON object assigned to window.<name> in a data file.
function writeVar(file, v, obj, head) {
  const s = read(file), at = s.indexOf(`window.${v} = `), a = s.indexOf('{', at);
  let depth = 0, b = a, q = false;
  for (; b < s.length; b++) { const c = s[b]; if (q) { if (c === '\\') b++; else if (c === '"') q = false; } else if (c === '"') q = true; else if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') { if (--depth === 0) break; } }
  fs.writeFileSync(file, (head != null ? head + s.slice(at, a) : s.slice(0, a)) + JSON.stringify(obj) + s.slice(b + 1));
}
for (const f of ['data/config.js', 'data/course.js', 'data/courses.js', 'data/course-w3w.js', 'data/access-edits.js', 'data/contingency.js', 'js/engine.js', 'data/track-grades.js']) (0, eval)(read(f));
const G = globalThis.GPT, X = globalThis.GPT100_CONTINGENCY, A = G.courses.find(c => c.alt);
if (!A) { console.error('No alternative route in data/contingency.js'); process.exit(1); }
const D = globalThis.GPT100_DATA, T = globalThis.GPT100_TRACK, W = globalThis.GPT100_COURSE_W3W;
if ((globalThis.GPT100_EDITS.custom || []).length || (globalThis.GPT100_EDITS.hidden || []).length) { console.error('data/access-edits.js has edits: publish them into data/course.js first.'); process.exit(1); }

const R = G.route, NR = A.route, kA = A.leaveKm, kB = A.rejoinKm, shift = A.shift;
const iA = G.idxAtKm(X.leave.km), iB = G.idxAtKm(X.rejoin.km), oldB = R[iB][2];
const r3 = x => +x.toFixed(3);
// An old GPT100 km on the new course (null on the stretch that goes).
const kmNew = k => k <= R[iA][2] + 1e-6 ? k : k >= oldB - 1e-6 ? r3(k + shift) : null;
const snapNew = (lat, lon) => { const s = A.snap(lat, lon); return { km: NR[s.ic][2], off: s.offM }; };

// ---------- the old stretch, as the new alternative ----------
const oldSect = R.slice(iA, iB + 1).map(p => [p[0], p[1], r3(p[2] - R[iA][2]), p[3]]);
let up = 0, down = 0; NR.forEach((p, i) => { if (i && p[2] > kA && p[2] <= kB) { const d = p[3] - NR[i - 1][3]; if (d > 0) up += d; else down -= d; } });
let oup = 0; R.forEach((p, i) => { if (i > iA && i <= iB && p[3] > R[i - 1][3]) oup += p[3] - R[i - 1][3]; });
const inOld = idx => idx > iA && idx < iB;
const oldJoins = {};  // walks from each access point to the old stretch (old engine's joins, revisits too)
G.ACCESS.forEach(a => {
  const js = a.joins.filter(j => inOld(j.idx)).map(j => ({ idx: j.idx - iA, conn_m: j.conn_m, conn_ascent: j.conn_ascent, geom: j.idx === a.idx ? a.conn_geom || null : null }));
  if (js.length) oldJoins[a.name + '|' + a.lat + '|' + a.lon] = { a, js };
});
const oldStops = G.AID.filter(a => inOld(a.idx)).map(a => ({ name: a.name, lat: a.lat, lon: a.lon, km: r3(a.trail_km - R[iA][2]), w3w: a.w3w }));
const oldTrack = T.segments.flatMap(([a, b, g]) => { const lo = Math.max(a, R[iA][2]), hi = Math.min(b, oldB); return hi > lo ? [[r3(lo - R[iA][2]), r3(hi - R[iA][2]), g]] : []; });
const oldW3w = (W.gpt100 || []).slice(iA, iB + 1);

// ---------- access points ----------
const cj = X.joins || {}, key = a => a.name + '|' + a.lat + '|' + a.lon;
const trackAccess = {};
const moved = [], onlyOld = [];
D.access.forEach(a => {
  const k0 = key(a), oldKey = a.name + '|' + a.trail_km, grade = T.access && T.access[oldKey];
  if (a.courses && a.courses.includes('contingency')) {
    // Access to the new stretch only: now on the course.
    const j = (cj[k0] || []).slice().sort((x, y) => x.conn_m - y.conn_m)[0];
    if (!j) { console.error(`${a.name} has no walk to the new stretch: run python3 tools/contingency_joins.py first.`); process.exit(1); }
    delete a.courses;
    Object.assign(a, { trail_km: r3(kA + X.route[j.idx][2]), conn_m: j.conn_m, conn_geom: j.geom || null, conn_ascent: j.conn_ascent || 0,
      aid: true, name: /water point/i.test(a.name) ? a.name : a.name + ' (water point)', note: (a.note || '').replace(/^[^:]*only: /, '') });
    moved.push(a.name);
  } else if (a.courses && !a.courses.includes('100')) {
    // Another course's own point (the 14k): unchanged.
  } else {
    const k = kmNew(a.trail_km);
    if (k != null) a.trail_km = k;
    else {
      const j = (cj[k0] || []).slice().sort((x, y) => x.conn_m - y.conn_m)[0];
      if (j && j.conn_m <= 2500) { Object.assign(a, { trail_km: r3(kA + X.route[j.idx][2]), conn_m: j.conn_m, conn_geom: j.geom || null, conn_ascent: j.conn_ascent || 0 }); moved.push(a.name); }
      else { a.courses = [id]; onlyOld.push(a.name); }
    }
  }
  if (grade) trackAccess[a.name + '|' + a.trail_km] = grade;
});
// New keys for the old stretch's walks (names and places don't change).
const altJoins = {};
Object.values(oldJoins).forEach(({ a, js }) => { altJoins[key(a)] = js; });

// ---------- the course ----------
let asc = 0; NR.forEach((p, i) => { if (i && p[3] > NR[i - 1][3]) asc += p[3] - NR[i - 1][3]; });
D.route = NR.map(p => p.slice());
D.total_km = +NR[NR.length - 1][2].toFixed(1);
D.total_ascent_m = Math.round(asc);
D.crossings = (D.crossings || []).filter(c => kmNew(c.km) != null).map(c => Object.assign({}, c, { km: kmNew(c.km) }));
writeVar('data/course.js', 'GPT100_DATA', D);

// ---------- track grades and markers ----------
const segs = [];
T.segments.forEach(([a, b, g]) => {
  if (a < R[iA][2]) segs.push([a, Math.min(b, R[iA][2]), g]);
  if (b > oldB) segs.push([r3(Math.max(a, oldB) + shift), r3(b + shift), g]);
});
segs.push([kA, kB, 'unassessed']);
segs.sort((x, y) => x[0] - y[0]);
T.segments = segs.map(([a, b, g]) => [+(+a).toFixed(2), +(+b).toFixed(2), g]);
T.access = trackAccess;
T.points.forEach(p => { const s = snapNew(p.lat, p.lon); p.km = +s.km.toFixed(2); p.off_m = s.off; });
writeVar('data/track-grades.js', 'GPT100_TRACK', T);

// ---------- what3words along the course ----------
const jB = iA + (X.route.length - 1);
W.gpt100 = (W.gpt100 || []).slice(0, iA + 1).concat(new Array(jB - iA - 1).fill(null), (W.gpt100 || []).slice(iB));
if (W.gpt100.length !== NR.length) { console.error('what3words list length is off'); process.exit(1); }
writeVar('data/course-w3w.js', 'GPT100_COURSE_W3W', W);

// ---------- the old stretch as data/contingency.js ----------
const out = {
  id, name, label, mainLabel,
  leave: { name: X.leave.name, km: kA }, rejoin: { name: X.rejoin.name, km: r3(kB) },
  section_km: oldSect[oldSect.length - 1][2], section_ascent_m: Math.round(oup),
  main_km: r3(kB - kA), main_ascent_m: Math.round(up),
  extra_km: r3(-shift), total_km: G.totalKm,
  skipped: D.access.filter(a => a.aid && !a.courses && a.trail_km > kA + 0.05 && a.trail_km < kB - 0.05).map(a => a.name),
  max_off_m: X.max_off_m,
  route: oldSect, stops: oldStops, track: oldTrack, w3w: oldW3w, joins: altJoins
};
fs.writeFileSync('data/contingency.js', `// The other way between two aid stations, shown on the maps and as a course of its own in Find: here the original
// GPT100 route over the Major Mitchell Plateau, from Mt William Carpark to Jimmy Creek Camp (tools/swap_contingency.mjs,
// 5 November 2026, when the Miler contingency became the course). route: [lat, lon, km from the leave aid station,
// height]. stops, track (grades) and w3w are along it; joins are the walks from the access points to it.
window.GPT100_CONTINGENCY = ${JSON.stringify(out)};
`);

console.log(`Course: ${D.total_km} km, ${D.total_ascent_m} m up (was ${G.totalKm} km). ${name}: ${out.section_km} km from ${X.leave.name} to ${X.rejoin.name}.`);
console.log('Moved onto the new stretch: ' + (moved.join(', ') || 'none'));
console.log(`Only on the ${name.toLowerCase()}: ` + (onlyOld.join(', ') || 'none'));
console.log(`${Object.keys(altJoins).length} access points join the ${name.toLowerCase()}; ${oldStops.length} stops on it (${oldStops.map(s => s.name).join(', ')}).`);
