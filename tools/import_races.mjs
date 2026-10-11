// Turns the GPT Course Details sheet (exported as CSV) into data/races.js for the runner app.
// Only what runners and crews should see is kept: distances, climb, first runner and cut-off times,
// drop bags and crew access. Vehicles, power, connectivity, club rosters and named historical splits are left out.
// Usage: node tools/import_races.mjs path/to/course-details.csv
//   (in the sheet: File > Download > Comma separated values). Don't commit the CSV: it holds internal details.
import fs from 'fs';

const file = process.argv[2];
if (!file) { console.error('Usage: node tools/import_races.mjs course-details.csv'); process.exit(1); }

// Minimal CSV parser (quoted fields, commas and newlines inside quotes).
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.map(r => r.map(x => x.trim()));
}
const rows = parseCSV(fs.readFileSync(file, 'utf8'));

// "06/11/2026 08:37:00" → "2026-11-06T08:37" (Melbourne local time).
const when = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/.exec(s || ''); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}` : null; };
const num = s => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const crewOf = s => /shuttle/i.test(s) ? 'shuttle' : /^yes/i.test(s) ? 'yes' : 'no';
const kindOf = s => /emergency/i.test(s) ? 'emergency' : /water/i.test(s) ? 'water' : /safety/i.test(s) ? 'checkpoint' : 'aid';
// "#6 Mt William car park" → "Mt William car park"; "#3 START Halls Gap" → "Halls Gap".
const clean = s => s.replace(/^#[\d.]+\s*/, '').replace(/^(START|FINISH|Start|Finish)\s+/, '').trim();

// Each race table starts with its title row, then two header rows, then the points, ending at a totals or blank row.
const STAGES = { 'Miler': 'miler', 'Stage 1 / GPT50k': 's1', 'Stage 2': 's2', 'Stage 3': 's3', 'Stage 4 / GPT33k': 's4', 'GPT14k': '14k', 'GPT6k': '6k', '5k Family Race': '5k', '2k Kids Trail': '2k' };
const tables = {};
for (let i = 0; i < rows.length; i++) {
  const id = STAGES[rows[i][0]];
  if (!id || tables[id] || rows[i + 1]?.[0] !== 'Name') continue; // the first table of each name (later ones are named splits)
  const pts = [];
  for (let j = i + 3; j < rows.length && rows[j][0]; j++) {
    const r = rows[j];
    pts.push({
      name: clean(r[0]), kind: kindOf(r[1]), km: num(r[5]), up: num(r[6]), down: num(r[7]),
      first: when(r[10]), cutoff: when(r[12]), drop: /^yes/i.test(r[13] || ''), crew: crewOf(r[14] || '')
    });
  }
  pts[0].kind = 'start'; pts[pts.length - 1].kind = 'finish';
  tables[id] = pts;
}
const missing = Object.values(STAGES).filter(id => !tables[id]);
if (missing.length) { console.error('Not found in the sheet: ' + missing.join(', ')); process.exit(1); }

// The races runners pick from. A stage race runs all four stages; the 50k and 33k are one stage each.
const RACES = [
  { id: 'miler', label: 'GPT100 Miler', short: 'Miler', course: '100', stages: ['miler'] },
  { id: 'stage', label: 'Stage race (4 days)', short: 'Stage race', course: '100', stages: ['s1', 's2', 's3', 's4'] },
  { id: '50k', label: 'GPT50k', short: '50k', course: '100', stages: ['s1'] },
  { id: '33k', label: 'GPT33k', short: '33k', course: '100', stages: ['s4'] },
  { id: '14k', label: 'GPT14k', short: '14k', course: '14k', stages: ['14k'] },
  { id: '6k', label: 'GPT6k', short: '6k', course: null, stages: ['6k'] },
  { id: '5k', label: '5k Family Race', short: '5k', course: '5k', stages: ['5k'] },
  { id: '2k', label: '2k Kids Trail', short: '2k', course: '2k', stages: ['2k'] }
];
const STAGE_LABEL = { miler: 'Miler', s1: 'Stage 1', s2: 'Stage 2', s3: 'Stage 3', s4: 'Stage 4', '14k': '14k', '6k': '6k', '5k': '5k', '2k': '2k' };
const out = { stages: {}, races: RACES };
Object.entries(tables).forEach(([id, points]) => { out.stages[id] = { id, label: STAGE_LABEL[id], points }; });

fs.writeFileSync('data/races.js', `// Races for the runner app, from the GPT Course Details sheet (tools/import_races.mjs). Melbourne local time.
// km, up and down are the official race figures; the app maps them onto the course line by aid station.
window.GPT_RACES = ${JSON.stringify(out, null, 1)};
`);
Object.entries(tables).forEach(([id, p]) => console.log(`${id}: ${p.length} points, ${p[p.length - 1].km} km, start ${p[0].first}`));
