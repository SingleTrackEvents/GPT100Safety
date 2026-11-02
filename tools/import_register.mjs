#!/usr/bin/env node
// Turn the GPT100 Risk Register and Risk Management Plan (Google Docs, as Markdown) into the encrypted data the
// Risk tab reads (data/register.enc.js). The register is the source of every risk, score and owner; the plan's
// Section 5 is the source of the trigger responses. Both stay behind the medical password in the app.
//
// Usage: MEDPLAN_PASSWORD='the medical password' node tools/import_register.mjs register.md plan.md
//   register.md  GPT100 Risk Register (File, Download, Markdown in Google Docs)
//   plan.md      GPT100 Risk Management Plan, the same way
//
// Writes out/register.json (not committed, see .gitignore) and data/register.enc.js (AES-256-GCM, a key from the
// password by PBKDF2-SHA256, as tools/encrypt_medplan.mjs does). Run it again whenever either document is reissued.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [regFile, planFile] = process.argv.slice(2);
const password = process.env.MEDPLAN_PASSWORD;
if (!regFile || !planFile || !password) {
  console.error("Usage: MEDPLAN_PASSWORD='...' node tools/import_register.mjs register.md plan.md");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');

// Google's Markdown escapes * and #, and puts line breaks in cells as &#10;.
const clean = s => s.replace(/\\\\\\_/g, '_').replace(/\\\\/g, '\\').replace(/\\\*/g, '*').replace(/\\#/g, '#').replace(/\\_/g, '_')
  .replace(/\*\*/g, '').replace(/&#10;/g, '\n').replace(/\\\[|\\\]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[ \t]+/g, ' ').trim();
const cells = line => line.replace(/^\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map(c => c.trim());
// "**H(17)**C3 · B" -> { band: 'H', score: 17, c: 3, l: 'B' }
const score = s => { const m = clean(s).match(/(VH|H|M|L)\((\d+)\)\s*C(\d)\s*·\s*([A-E])/); return m ? { band: m[1], score: +m[2], c: +m[3], l: m[4] } : null; };

function versionOf(text, what) { const m = clean(text).match(new RegExp(what + '\\s*Version ([\\d.]+[A-Z ]*?)\\s*·\\s*Issued ([^·]+)')); return m ? { version: m[1].trim(), issued: m[2].trim() } : {}; }

// ---------- the register ----------
const reg = readFileSync(regFile, 'utf8');
const risks = [], cats = [];
let cat = '';
for (const line of reg.split('\n')) {
  if (!line.startsWith('| ')) continue;
  const c = cells(line);
  const head = clean(c[0]).match(/^(\d+)\. (.+)$/);
  if (head && c.slice(1).every(x => !x)) { cat = head[2].toLowerCase().replace(/(^|[\s/&])\w/g, x => x.toUpperCase()); cats.push({ n: +head[1], name: cat }); continue; }
  if (c.length < 9 || !/^\d+$/.test(clean(c[0]))) continue;
  const ex = score(c[3]), tg = score(c[7]);
  if (!ex || !tg) continue;
  const name = clean(c[1]).replace(/(NEW|REVISED) \(v[\d.]+\)$/, '').trim();
  risks.push({
    n: +clean(c[0]), cat, name, desc: clean(c[2]), existing: ex, type: clean(c[4]),
    controls: clean(c[5]).split('\n').map(x => x.replace(/^-\s*/, '').trim()).filter(Boolean),
    sop: clean(c[6]), target: tg, owner: clean(c[8])
  });
}
if (risks.length < 50) { console.error('Only found ' + risks.length + ' risks in ' + regFile + '. Is it the register, as Markdown?'); process.exit(1); }

// ---------- the plan's Section 5 triggers ----------
const plan = readFileSync(planFile, 'utf8');
const KEYS = [[/fire/i, 'fire'], [/cold/i, 'cold'], [/wind/i, 'wind'], [/lightning/i, 'storm'], [/^heat/i, 'heat'], [/^rain/i, 'rain'],
  [/smoke/i, 'smoke'], [/missing/i, 'missing'], [/response gap/i, 'gap'], [/comms lost/i, 'comms'], [/medical capability/i, 'medcap']];
const triggers = [];
let inT = false;
for (const line of plan.split('\n')) {
  if (/CONDITION.*TRIGGER.*PRE-AGREED RESPONSE/.test(clean(line))) { inT = true; continue; }
  if (!inT) continue;
  if (!line.startsWith('|')) { if (triggers.length) break; continue; }
  const c = cells(line).map(clean);
  if (c.length < 3 || /^:?-+:?$/.test(c[0])) continue;
  const k = KEYS.find(([re]) => re.test(c[0]));
  triggers.push({ key: k ? k[1] : c[0].toLowerCase().replace(/\W+/g, '-'), condition: c[0], trigger: c[1], response: c[2] });
}
if (triggers.length < 5) { console.error('Only found ' + triggers.length + ' triggers in Section 5 of ' + planFile + '. Is it the Risk Management Plan, as Markdown?'); process.exit(1); }

const data = { register: Object.assign({ title: 'GPT100 Risk Register' }, versionOf(reg, 'RISK REGISTER')), plan: Object.assign({ title: 'GPT100 Risk Management Plan' }, versionOf(plan, 'RISK MANAGEMENT PLAN')), cats, risks, triggers };
mkdirSync(join(root, 'out'), { recursive: true });
writeFileSync(join(root, 'out', 'register.json'), JSON.stringify(data, null, 1));

const enc = new TextEncoder(), ITER = 250000;
const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data))));
const b64 = u => Buffer.from(u).toString('base64');
writeFileSync(join(root, 'data', 'register.enc.js'), '// GPT100 Risk Register and the Risk Management Plan triggers, encrypted. The Risk tab unlocks it with the medical password.\n' +
  '// Made by tools/import_register.mjs. Do not edit by hand.\n' +
  'window.GPT100_REGISTER_ENC = ' + JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) }) + ';\n');
console.log(`${data.register.title} ${data.register.version || ''}: ${risks.length} risks in ${cats.length} categories. ${data.plan.title} ${data.plan.version || ''}: ${triggers.length} triggers.`);
console.log('Wrote out/register.json (keep it off GitHub) and data/register.enc.js');
