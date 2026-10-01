#!/usr/bin/env node
// Encrypt the medical plan so it can sit in the public app without being readable.
//
// Usage: MEDPLAN_PASSWORD='the password' node tools/encrypt_medplan.mjs path/to/GPT100_MedicalPlan_Interactive.html
//        (a .json file with the plan's DATA object also works)
//
// Writes data/medplan.enc.js, and data/safety-officers.js: the Safety Officer posts and shift times only
// (no names), which the Find map shows without the password. Add --public-only to rewrite just that file.
// The plan is encrypted with AES-256-GCM, using a key derived from the
// password with PBKDF2-SHA256, the same Web Crypto the app uses to unlock it. Never commit the
// original plan file; only the encrypted output goes in the repository.
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ITER = 250000;
const src = process.argv[2];
const publicOnly = process.argv.includes('--public-only');
const password = process.env.MEDPLAN_PASSWORD;
if (!src || (!password && !publicOnly)) {
  console.error("Usage: MEDPLAN_PASSWORD='...' node tools/encrypt_medplan.mjs plan.html|plan.json");
  process.exit(1);
}

const raw = readFileSync(src, 'utf8');
let data;
if (src.endsWith('.json')) data = JSON.parse(raw);
else {
  const m = raw.match(/const DATA=(\{[\s\S]*?\});\n/);
  if (!m) { console.error('Could not find the plan data (const DATA=...) in ' + src); process.exit(1); }
  data = JSON.parse(m[1]);
}
for (const k of ['t0', 'n', 'arr', 'pos', 'st', 'stations', 'grades', 'races', 'mv', 'veh']) {
  if (!(k in data)) { console.error('Plan data is missing "' + k + '"'); process.exit(1); }
}

// Public Safety Officer posts: station, place and shift times. "Passage" rows are runners passing, not posts.
const posts = data.st.filter(p => !/passage/i.test(p.label)).map(p => ({ station: p.station, a: p.a, z: p.z, label: p.label }));
const used = new Set(posts.map(p => p.station));
const so = { t0: data.t0, n: data.n, stations: data.stations.filter(s => used.has(s.name)).map(s => ({ name: s.name, lat: s.lat, lon: s.lon })), posts };
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, '..', 'data', 'safety-officers.js'), '// Safety Officer posts for the Find map (no names). Made by tools/encrypt_medplan.mjs from the medical plan.\n' +
  'window.GPT100_SO = ' + JSON.stringify(so) + ';\n');
console.log(`Wrote ${posts.length} Safety Officer posts at ${so.stations.length} places to data/safety-officers.js`);
if (publicOnly) process.exit(0);

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data))));
const b64 = u => Buffer.from(u).toString('base64');

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'medplan.enc.js');
writeFileSync(out, '// GPT100 medical plan, encrypted. Unlock it in the app\'s Medical tab with the password.\n' +
  '// Made by tools/encrypt_medplan.mjs. Do not edit by hand.\n' +
  'window.GPT100_MEDPLAN_ENC = ' + JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) }) + ';\n');
console.log(`Encrypted ${data.pos.length} medical shifts, ${data.st.length} SingleTrack postings and ${data.mv.length} movements to ${out}`);
