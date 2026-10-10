// One-off: save the OpenTopoMap tiles 2 km either side of both courses (zoom 8 to 15) into tiles/topo/,
// and write data/tiles.js (the list the apps use to save the map for offline).
// Phones then save the map from our own site, so OpenTopoMap's free servers are only asked once.
// Polite: one tile at a time with a pause, identified, and tiles already saved are skipped.
// Run from the repo root: node tools/fetch_topo_tiles.mjs   (add --list to only rewrite data/tiles.js)
import fs from 'fs';
import path from 'path';

const BUF_KM = 2, ZMIN = 8, ZMAX = 15, OUT = 'tiles/topo';
globalThis.window = globalThis;
for (const f of ['data/config.js', 'data/course.js', 'data/courses.js', 'data/access-edits.js', 'js/engine.js']) (0, eval)(fs.readFileSync(f, 'utf8'));
const GPT = globalThis.GPT;

const lon2x = (lon, z) => (lon + 180) / 360 * 2 ** z;
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; };
const keys = new Set();
for (let z = ZMIN; z <= ZMAX; z++) GPT.courses.forEach(E => {
  for (let i = 0; i < E.route.length; i++) {
    const [lat, lon] = E.route[i];
    const dLat = BUF_KM / 111.32, dLon = BUF_KM / (111.32 * Math.cos(lat * Math.PI / 180));
    for (let x = Math.floor(lon2x(lon - dLon, z)); x <= Math.floor(lon2x(lon + dLon, z)); x++)
      for (let y = Math.floor(lat2y(lat + dLat, z)); y <= Math.floor(lat2y(lat - dLat, z)); y++) keys.add(`${z}/${x}/${y}`);
  }
});
const list = [...keys].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
console.log(`${list.length} tiles, zoom ${ZMIN} to ${ZMAX}, ${BUF_KM} km either side`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!process.argv.includes('--list')) {
  let got = 0, skipped = 0;
  for (const [n, k] of list.entries()) {
    const file = path.join(OUT, k + '.png');
    if (fs.existsSync(file) && fs.statSync(file).size > 0) { skipped++; continue; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (let tries = 0; ; tries++) {
      try {
        const res = await fetch(`https://${'abc'[n % 3]}.tile.opentopomap.org/${k}.png`, { headers: { 'User-Agent': 'GPT100Safety race safety app, one-off offline corridor (singletrack.com.au)' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        got++;
        break;
      } catch (e) {
        if (tries >= 4) { console.error(`failed ${k}: ${e.message}`); break; }
        await sleep(2000 * 2 ** tries);
      }
    }
    if ((got + skipped) % 100 === 0) console.log(`${got + skipped} / ${list.length}`);
    await sleep(250);
  }
  console.log(`downloaded ${got}, already had ${skipped}`);
}

// Only list what's actually saved, with the total size for the download button.
const have = list.filter(k => fs.existsSync(path.join(OUT, k + '.png')));
const bytes = have.reduce((s, k) => s + fs.statSync(path.join(OUT, k + '.png')).size, 0);
// Compact form: { z: { x: [y, y, ...] } }.
const tree = {};
have.forEach(k => { const [z, x, y] = k.split('/').map(Number); ((tree[z] = tree[z] || {})[x] = tree[z][x] || []).push(y); });
const version = new Date().toISOString().slice(0, 10) + '-' + have.length;
fs.writeFileSync('data/tiles.js', `// Topo map tiles saved on this site for offline use (written by tools/fetch_topo_tiles.mjs).
// OpenTopoMap (CC-BY-SA), map data OpenStreetMap contributors and SRTM. ${BUF_KM} km either side of both courses, zoom ${ZMIN} to ${ZMAX}.
window.GPT_TILES = { version: '${version}', count: ${have.length}, bytes: ${bytes}, zmax: ${ZMAX}, tree: ${JSON.stringify(tree)} };
`);
console.log(`data/tiles.js: ${have.length} tiles, ${(bytes / 1e6).toFixed(1)} MB`);
