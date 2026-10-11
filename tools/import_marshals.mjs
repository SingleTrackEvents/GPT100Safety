// Course marshal points from the Google My Maps management map, for the field app (data/marshals.js).
// Usage: node tools/import_marshals.mjs <map id or map link> [layer name]     (layer defaults to "Course Marshals")
// The map must be viewable by anyone with the link. The map id isn't stored in the repo.
import fs from 'fs';

const arg = process.argv[2], layer = process.argv[3] || 'Course Marshals';
const mid = arg && (/[?&]mid=([\w-]+)/.exec(arg) || [, arg])[1];
if (!mid) { console.error('Usage: node tools/import_marshals.mjs <map id or link> [layer name]'); process.exit(1); }

const res = await fetch(`https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`);
if (!res.ok) { console.error(`Couldn't download the map (HTTP ${res.status}). Is it shared as "anyone with the link"?`); process.exit(1); }
const kml = await res.text();
if (/<!DOCTYPE|<!ENTITY/i.test(kml) || !/<kml[\s>]/.test(kml)) { console.error('Not a KML map.'); process.exit(1); }

const ent = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// Descriptions are HTML: keep the words and line breaks only.
const text = s => ent(ent(s)).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

const folders = [...kml.matchAll(/<Folder>\s*<name>([\s\S]*?)<\/name>([\s\S]*?)<\/Folder>/g)];
const f = folders.find(m => ent(m[1]).trim().toLowerCase() === layer.toLowerCase());
if (!f) { console.error(`No layer "${layer}". Layers: ${folders.map(m => ent(m[1]).trim()).join(', ')}`); process.exit(1); }

const points = [...f[2].matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)].map(m => {
  const p = m[1], c = /<Point>\s*<coordinates>\s*([-\d.]+),([-\d.]+)/.exec(p);
  if (!c) return null;
  const name = (/<name>([\s\S]*?)<\/name>/.exec(p) || [])[1] || 'Marshal';
  const desc = (/<description>([\s\S]*?)<\/description>/.exec(p) || [])[1] || '';
  return { name: text(name), lat: +(+c[2]).toFixed(6), lon: +(+c[1]).toFixed(6), note: text(desc) };
}).filter(Boolean);

fs.writeFileSync('data/marshals.js', `// Course marshal points from the management map ("${layer}" layer), by tools/import_marshals.mjs.
window.GPT_MARSHALS = ${JSON.stringify(points, null, 1)};
`);
console.log(`${points.length} marshal points from "${layer}":\n` + points.map(p => ` ${p.name}  ${p.lat}, ${p.lon}`).join('\n'));
