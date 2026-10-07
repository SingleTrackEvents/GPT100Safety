// GPT100 Safety Worker (Cloudflare): the weather refresh relay and the Race Control incident log.
// It holds the GitHub key as a secret, so the key is never in the app or on anyone's device.
// Setup steps: tools/REFRESH_WORKER.md (weather) and tools/RACE_CONTROL.md (race control).
//
//   POST /refresh            start a quick refresh (warnings, observations, fires, CFA, air quality)
//   POST /refresh?models=1   start a full refresh, including fresh forecast models
//   GET  /status             the latest weather watch run (for the app's progress message)
//   Cron trigger             starts the watch every 15 minutes (GitHub's own timer misses most runs)
//
// Race Control (needs the D1 database bound as DB, and the RC_PASSWORD secret; every call sends the password):
//   GET  /rc/state?since=ms  incidents, units and log entries changed since then
//   POST /rc/incident        create or update an incident: { id?, patch, note?, who }
//   POST /rc/unit            update a unit's status: { id, patch, note?, who }
//   POST /rc/log             add a radio log entry: { text, incident?, who }
//
// Secret:    GITHUB_TOKEN   fine-grained key, this repository only, Actions read and write
// Optional:  REPO, WORKFLOW, BRANCH, ALLOWED_ORIGIN (defaults below)

const DEFAULTS = {
  REPO: 'SingleTrackEvents/GPT100Safety',
  WORKFLOW: 'weather.yml',
  BRANCH: 'main',
  ALLOWED_ORIGIN: 'https://singletrackevents.github.io'
};
const COOLDOWN_MIN = 10;        // no new run within 10 minutes of the last one
const MODELS_COOLDOWN_MIN = 30; // a full refresh at most every 30 minutes

function cfg(env) { return Object.assign({}, DEFAULTS, Object.fromEntries(Object.keys(DEFAULTS).filter(k => env[k]).map(k => [k, env[k]]))); }

async function gh(env, path, init) {
  const c = cfg(env);
  const res = await fetch(`https://api.github.com/repos/${c.REPO}${path}`, Object.assign({}, init, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gpt100-refresh-worker',
      'Content-Type': 'application/json'
    }
  }));
  return res;
}

async function latestRun(env) {
  const c = cfg(env);
  const res = await gh(env, `/actions/workflows/${c.WORKFLOW}/runs?per_page=1`);
  if (!res.ok) throw new Error('GitHub said ' + res.status);
  const r = (await res.json()).workflow_runs[0];
  return r ? { id: r.id, status: r.status, conclusion: r.conclusion, event: r.event, created: r.created_at, updated: r.updated_at } : null;
}

// Start the watch unless one is running or started recently.
async function maybeStart(env, models) {
  const c = cfg(env);
  const last = await latestRun(env);
  const ageMin = last ? (Date.now() - Date.parse(last.created)) / 60000 : 1e9;
  if (last && last.status !== 'completed') return { started: false, reason: 'running', last };
  if (ageMin < COOLDOWN_MIN) return { started: false, reason: 'recent', last, waitMin: Math.ceil(COOLDOWN_MIN - ageMin) };
  const full = !!models && ageMin >= MODELS_COOLDOWN_MIN;
  const res = await gh(env, `/actions/workflows/${c.WORKFLOW}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: c.BRANCH, inputs: full ? { force_models: true } : {} })
  });
  if (res.status !== 204) throw new Error('GitHub said ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return { started: true, full, last };
}

function cors(env, req) {
  const origin = req.headers.get('Origin') || '';
  const c = cfg(env);
  const ok = origin === c.ALLOWED_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': ok ? origin : c.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-RC-Password',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json'
    }
  };
}

// ---------- Race Control incident log (D1 database) ----------
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, num INTEGER, data TEXT NOT NULL, updated INTEGER NOT NULL, version INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS units (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, incident TEXT, kind TEXT, text TEXT, who TEXT, updated INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS incidents_updated ON incidents (updated)',
  'CREATE INDEX IF NOT EXISTS units_updated ON units (updated)',
  'CREATE INDEX IF NOT EXISTS log_updated ON log (updated)'
];
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map(q => db.prepare(q)));
  schemaReady = true;
}
function sameText(a, b) { // compare without leaking the length of the match
  a = String(a || ''); b = String(b || '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
const clip = (v, n) => v == null ? v : typeof v === 'string' ? v.slice(0, n || 2000) : v;
function cleanPatch(p) {
  const out = {};
  for (const [k, v] of Object.entries(p || {})) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = cleanPatch(v);
    else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = clip(v);
  }
  return out;
}
function merge(a, b) {
  const out = Object.assign({}, a);
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v;
  return out;
}
async function raceControl(req, env, url, c) {
  const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: c.headers });
  if (!c.ok) return json({ error: 'Not allowed from this site' }, 403);
  if (!env.DB || !env.RC_PASSWORD) return json({ error: 'Race Control isn\'t set up on the Worker yet (needs the DB database and the RC_PASSWORD secret)' }, 503);
  if (!sameText(req.headers.get('X-RC-Password'), env.RC_PASSWORD)) return json({ error: 'Wrong password' }, 401);
  const db = env.DB;
  await ensureSchema(db);
  const now = Date.now();
  if (url.pathname === '/rc/state' && req.method === 'GET') {
    const since = Math.max(0, +url.searchParams.get('since') || 0);
    const [inc, units, log] = await db.batch([
      db.prepare('SELECT id, num, data, updated, version FROM incidents WHERE updated > ?1 ORDER BY updated').bind(since),
      db.prepare('SELECT id, data, updated FROM units WHERE updated > ?1').bind(since),
      db.prepare('SELECT id, t, incident, kind, text, who FROM log WHERE updated > ?1 ORDER BY id DESC LIMIT 500').bind(since)
    ]);
    return json({
      now,
      incidents: inc.results.map(r => Object.assign(JSON.parse(r.data), { id: r.id, num: r.num, updated: r.updated, version: r.version })),
      units: units.results.map(r => Object.assign(JSON.parse(r.data), { id: r.id, updated: r.updated })),
      log: log.results
    });
  }
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404);
  const text = await req.text();
  if (text.length > 32000) return json({ error: 'Too big' }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: 'Bad request' }, 400); }
  const who = clip(String(body.who || ''), 60);
  const addLog = (incident, kind, t) => db.prepare('INSERT INTO log (t, incident, kind, text, who, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(now, incident, kind, clip(String(t), 1000), who, now);
  if (url.pathname === '/rc/incident') {
    const patch = cleanPatch(body.patch);
    let id = typeof body.id === 'string' && /^[A-Za-z0-9-]{4,40}$/.test(body.id) ? body.id : null;
    const old = id ? await db.prepare('SELECT num, data, version FROM incidents WHERE id = ?1').bind(id).first() : null;
    let num, data, version;
    if (old) { num = old.num; data = merge(JSON.parse(old.data), patch); version = old.version + 1; }
    else {
      id = id || 'i' + now.toString(36) + Math.random().toString(36).slice(2, 6);
      num = ((await db.prepare('SELECT MAX(num) AS n FROM incidents').first()) || {}).n + 1 || 1;
      data = Object.assign({ created: now, status: 'open' }, patch); version = 1;
    }
    const ops = [db.prepare('INSERT INTO incidents (id, num, data, updated, version) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET data = ?3, updated = ?4, version = ?5').bind(id, num, JSON.stringify(data), now, version)];
    if (body.note) ops.push(addLog(id, 'incident', '#' + num + ' ' + body.note));
    await db.batch(ops);
    return json({ ok: true, incident: Object.assign(data, { id, num, updated: now, version }) });
  }
  if (url.pathname === '/rc/unit') {
    if (typeof body.id !== 'string' || !/^[A-Za-z0-9 _.:-]{1,60}$/.test(body.id)) return json({ error: 'Bad unit' }, 400);
    const old = await db.prepare('SELECT data FROM units WHERE id = ?1').bind(body.id).first();
    const data = merge(old ? JSON.parse(old.data) : {}, cleanPatch(body.patch));
    const ops = [db.prepare('INSERT INTO units (id, data, updated) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET data = ?2, updated = ?3').bind(body.id, JSON.stringify(data), now)];
    if (body.note) ops.push(addLog(data.incident || null, 'unit', body.note));
    await db.batch(ops);
    return json({ ok: true, unit: Object.assign(data, { id: body.id, updated: now }) });
  }
  if (url.pathname === '/rc/log') {
    if (!body.text) return json({ error: 'Empty' }, 400);
    await addLog(typeof body.incident === 'string' ? body.incident.slice(0, 40) : null, 'note', body.text).run();
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), c = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c.headers });
    if (!env.GITHUB_TOKEN) return new Response(JSON.stringify({ error: 'The GITHUB_TOKEN secret is not set' }), { status: 500, headers: c.headers });
    try {
      if (url.pathname.startsWith('/rc/')) return await raceControl(req, env, url, c);
      if (url.pathname === '/status' && req.method === 'GET') {
        return new Response(JSON.stringify({ last: await latestRun(env) }), { headers: c.headers });
      }
      if (url.pathname === '/refresh' && req.method === 'POST') {
        // Only the GPT100 Safety site (or local testing) may ask for a refresh.
        if (!c.ok) return new Response(JSON.stringify({ error: 'Not allowed from this site' }), { status: 403, headers: c.headers });
        return new Response(JSON.stringify(await maybeStart(env, url.searchParams.get('models') === '1')), { headers: c.headers });
      }
      return new Response(JSON.stringify({ ok: true, about: 'GPT100 weather refresh relay' }), { headers: c.headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: c.headers });
    }
  },
  // Cron trigger (every 15 minutes): keep the weather fresh even when nobody presses the button.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(maybeStart(env, false).catch(e => console.log('refresh failed: ' + e.message)));
  }
};
