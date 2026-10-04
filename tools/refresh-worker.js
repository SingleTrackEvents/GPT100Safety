// GPT100 weather refresh relay: a Cloudflare Worker that starts the GitHub weather watch.
// It holds the GitHub key as a secret, so the key is never in the app or on anyone's device.
// Setup steps: tools/REFRESH_WORKER.md
//
//   POST /refresh            start a quick refresh (warnings, observations, fires, CFA, air quality)
//   POST /refresh?models=1   start a full refresh, including fresh forecast models
//   GET  /status             the latest weather watch run (for the app's progress message)
//   Cron trigger             starts the watch every 15 minutes (GitHub's own timer misses most runs)
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
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json'
    }
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), c = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c.headers });
    if (!env.GITHUB_TOKEN) return new Response(JSON.stringify({ error: 'The GITHUB_TOKEN secret is not set' }), { status: 500, headers: c.headers });
    try {
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
