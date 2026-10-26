#!/usr/bin/env node
// Move the app to a new build number, so every device takes the new files as one set.
//
// Usage: node tools/bump_version.mjs        (the next number)
//        node tools/bump_version.mjs 75     (a given number)
//
// Sets BUILD in sw.js, and gives every script and stylesheet of our own in the pages the same ?v=<build>
// (adding it where it's missing). Then checks each of those files is in sw.js FILES, so it's saved for offline.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'field.html', 'runner.html', 'map.html', 'admin.html'];
const rd = f => readFileSync(join(ROOT, f), 'utf8');

let sw = rd('sw.js');
const cur = (sw.match(/^const BUILD = '(\d+)';/m) || [])[1];
if (!cur) { console.error("sw.js: no line like const BUILD = '69';"); process.exit(1); }
const next = process.argv[2] || String(+cur + 1);
if (!/^\d+$/.test(next)) { console.error('The build must be a whole number.'); process.exit(1); }
sw = sw.replace(/^const BUILD = '\d+';/m, `const BUILD = '${next}';`);
writeFileSync(join(ROOT, 'sw.js'), sw);

// Our own .js and .css (not https://...), with or without a ?v= already.
const REF = /\b(src|href)="(?![a-z]+:|\/\/)([^"?#]+\.(?:js|css))(?:\?v=[^"]*)?"/g;
const used = new Set();
for (const p of PAGES) {
  const html = rd(p).replace(REF, (m, a, f) => { used.add(f); return `${a}="${f}?v=${next}"`; });
  writeFileSync(join(ROOT, p), html);
}
const files = new Set([...(sw.match(/const FILES = \[([\s\S]*?)\];/) || ['', ''])[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
const missing = [...used].filter(f => !files.has(f)), extra = [...files].filter(f => !used.has(f));
console.log(`Build ${cur} -> ${next}: sw.js and ${PAGES.length} pages (${used.size} files).`);
if (missing.length) { console.error('Not in sw.js FILES, so not saved for offline: ' + missing.join(', ')); process.exitCode = 1; }
if (extra.length) console.error('In sw.js FILES but no page uses them: ' + extra.join(', '));
