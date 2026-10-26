// Race Control board: the live incident log, unit status and radio log, shared between race control devices.
// Kept in the D1 database on the GPT100 Safety Worker (tools/RACE_CONTROL.md). Unlocked with the medical password.
(function () {
  let runnerLayer = null;
  const G = window.GPT, C = window.GPT100_CONFIG, W = C.weather || {};
  const $ = id => document.getElementById(id);
  if (!$('rcBody')) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // The Worker, or ?rcapi=, or the demo's own board (js/demo.js), which also opens without the password.
  // A test link (?rcapi= or ?wxrefresh=) may only point at this computer, so a link can't send the password elsewhere.
  const DEMO = !!(window.GPTDemo && window.GPTDemo.rcBase), Q = new URLSearchParams(location.search);
  const local = u => { try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(u).hostname); } catch (e) { return false; } };
  const linked = u => (u === Q.get('rcapi') || u === Q.get('wxrefresh')) && !local(u);
  const BASE = ([Q.get('rcapi'), DEMO ? window.GPTDemo.rcBase : '', W.refreshUrl].find(u => u && !linked(u)) || '').replace(/\/$/, '');
  const unlocked = () => DEMO || !!(window.MedPlan && window.MedPlan.unlocked());
  const LSQ = 'gpt100_rc_queue', LSN = 'gpt100_rc_name';
  const SEV = { urgent: ['Urgent', '#c62828'], priority: ['Priority', '#e8710a'], routine: ['Routine', '#1d7f45'] };
  const UNIT_ST = { available: 'Available', tasked: 'Tasked', onscene: 'On scene', returning: 'Returning', unavailable: 'Unavailable' };
  const OUTCOMES = ['Treated, continued', 'Treated, withdrew (DNF)', 'Walked out with crew', 'Carried out', 'Ambulance', 'Air evacuation', 'Other'];
  const STEPS = [['dispatched', 'Dispatched'], ['onScene', 'On scene'], ['leaving', 'Leaving scene']];

  // ---------- state ----------
  const incidents = new Map(), units = new Map();
  let log = [], since = 0, lastOk = 0, lastErr = '', built = false, shown = false, timer = null, map = null, layer = null, editing = null, draft = null, orig = null, held = false;
  const closing = new Map(); // incident id: outcome picked in its open Close box
  // The queue is shared by every tab on the device, so it's read fresh from storage before each change. Bad or blocked storage falls back to memory.
  // Once a write fails (storage full or blocked) the queue stays in memory, so an older copy in storage can't replace it, and the board says so.
  let mem = [], memOnly = false;
  const readQ = () => {
    if (memOnly) return mem;
    try { const v = JSON.parse(localStorage.getItem(LSQ) || '[]'); mem = Array.isArray(v) ? v.filter(x => x && x.path) : []; } catch (e) { return mem; }
    if (mem.some(x => !x.qid)) { mem.forEach(x => { x.qid = x.qid || newId(); }); saveQ(mem); }
    return mem;
  };
  const saveQ = q => { mem = q; try { localStorage.setItem(LSQ, JSON.stringify(q)); memOnly = false; } catch (e) { memOnly = true; } const w = $('rcStoreWarn'); if (w) w.hidden = !memOnly; };
  const who = () => { try { return localStorage.getItem(LSN) || ''; } catch (e) { return ''; } };
  const now = () => Date.now();

  // ---------- time helpers (Melbourne) ----------
  const tf = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const df = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const hm = t => t ? tf.format(new Date(t)) : '';
  const dhm = t => t ? df.format(new Date(t)) : '';
  const mins = (a, b) => Math.max(0, Math.round(((b || now()) - a) / 60000));
  const dur = m => m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');

  // ---------- server ----------
  async function api(path, body) {
    const r = await fetch(BASE + path, {
      method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: Object.assign({ 'X-RC-Password': (!DEMO && window.MedPlan && window.MedPlan.pw()) || '' }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'HTTP ' + r.status); e.status = r.status; throw e; }
    return j;
  }
  // Changes go in a queue (kept on the device), so nothing is lost without signal; they send in order.
  function send(path, body) { saveQ(readQ().concat({ qid: newId(), path, body: Object.assign({ who: who() }, body) })); flush(); }
  const drop = x => saveQ(readQ().filter(y => y.qid !== x.qid));
  // One tab sends at a time (Web Locks where the browser has them), so two tabs don't send the same change twice.
  let flushing = false;
  async function flush() {
    if (flushing || !readQ().length || !ready()) return;
    flushing = true;
    const run = async () => {
      let x;
      try {
        while ((x = readQ()[0])) {
          const j = await api(x.path, x.body);
          if (j.incident) incidents.set(j.incident.id, j.incident);
          if (j.unit) units.set(j.unit.id, j.unit);
          drop(x);
        }
        lastErr = '';
      } catch (e) { lastErr = e.message; if (e.status === 400 || e.status === 413) drop(x); }
    };
    try { await (navigator.locks ? navigator.locks.request('gpt100_rc_send', run) : run()); } catch (e) { lastErr = e.message; }
    flushing = false;
    status();
  }
  async function sync() {
    if (!ready()) return;
    try {
      await flush();
      const j = await api('/rc/state?since=' + since);
      if (!Array.isArray(j.incidents)) throw new Error('Race Control isn\'t set up on the Worker yet (paste the latest Worker code into Cloudflare)');
      j.incidents.forEach(i => { const cur = incidents.get(i.id); if (!cur || (cur.version || 0) <= i.version) incidents.set(i.id, i); if (i.status === 'closed') closing.delete(i.id); });
      j.units.forEach(u => units.set(u.id, u));
      if (j.log.length) { const ids = new Set(log.map(l => l.id)); log = j.log.filter(l => !ids.has(l.id)).concat(log).sort((a, b) => b.id - a.id).slice(0, 500); }
      if (!readQ().length) log = log.filter(l => !l.pending);
      since = j.now - 3000; lastOk = now(); lastErr = '';
      if (j.incidents.length || j.units.length || j.log.length) render(); else { tick(); status(); }
      reconcile(j.now);
    } catch (e) { lastErr = e.message; status(); if (e.status === 401 || e.status === 503) render(); }
  }
  const ready = () => BASE && (DEMO || (window.MedPlan && window.MedPlan.unlocked() && window.MedPlan.pw()));

  // ---------- local changes ----------
  function newId() { return 'i' + now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function patchIncident(id, patch, note) {
    const cur = incidents.get(id) || { id, created: now(), status: 'open', version: 0, local: true };
    const merged = Object.assign({}, cur, patch, { times: Object.assign({}, cur.times, patch.times) });
    incidents.set(id, merged);
    send('/rc/incident', { id, patch, note });
    render();
  }
  function patchUnit(id, patch, note) {
    units.set(id, Object.assign({}, units.get(id), patch, { id }));
    send('/rc/unit', { id, patch, note });
    render();
  }

  // ---------- where things are ----------
  function placeAt(km) {
    const A = G.AID; let a = A[0], b = A[A.length - 1];
    for (let i = 1; i < A.length; i++) if (A[i].trail_km >= km) { a = A[i - 1]; b = A[i]; break; }
    if (Math.abs(a.trail_km - km) < 0.3) return 'at ' + a.name;
    if (Math.abs(b.trail_km - km) < 0.3) return 'at ' + b.name;
    return 'between ' + a.name + ' and ' + b.name;
  }
  function courseOf(inc) { return G.course ? G.course(inc.course || G.id) : G; }
  function assess(inc) {
    if (inc.km == null || isNaN(inc.km)) return null;
    const E = courseOf(inc);
    try { return E.assess(E.idxAtKm(inc.km)); } catch (e) { return null; }
  }
  // Expected time to reach the casualty for the unit sent (a base team), or the fastest team before one is sent. Null when not known.
  function eta(inc) {
    const r = assess(inc); if (!r || !r.results.length) return null;
    const team = inc.unit ? r.results.find(x => 'team-' + x.base.key === inc.unit) : r.results[0];
    return team ? Math.round(team.total) : null;
  }
  // The unit is free, or on this incident (not busy on another open one).
  const freeFor = (uid, id) => { const u = units.get(uid), o = u && u.incident && incidents.get(u.incident); return !u || !u.incident || u.incident === id || !o || o.status === 'closed'; };
  // Where a unit goes once it's off incident id: on to the latest other open incident that still has it, else Available.
  function freed(uid, id) {
    const o = [...incidents.values()].filter(i => i.id !== id && i.status !== 'closed' && i.unit === uid).sort((a, b) => b.created - a.created)[0];
    if (!o) return { status: 'available', incident: null };
    const t = o.times || {};
    return { status: t.leaving ? 'returning' : t.onScene ? 'onscene' : 'tasked', incident: o.id };
  }
  // Every unit still pointing at incident id, other than its unit now (keep), is released.
  function release(id, keep) { units.forEach(u => { if (u.incident === id && u.id !== keep) patchUnit(u.id, freed(u.id, id)); }); }
  // On each refresh: a unit left on an incident that's closed or has another unit (two operators changing it at once) is
  // put right. Only once nothing is waiting to send and both have been still for 15 s, so a change still on its way isn't
  // undone, and only once per unit change, so two boards don't keep writing over each other.
  const fixed = new Map();
  function reconcile(at) {
    if (readQ().length || !at) return;
    units.forEach(u => {
      const i = u.incident && incidents.get(u.incident);
      if (!i || i.local || u.status === 'available' || u.status === 'unavailable' || (i.status !== 'closed' && i.unit === u.id)) return;
      if (!(u.updated < at - 15000 && i.updated < at - 15000) || fixed.get(u.id) === u.updated) return;
      fixed.set(u.id, u.updated);
      patchUnit(u.id, freed(u.id, i.id));
    });
  }

  // ---------- units ----------
  function unitList() {
    const list = C.bases.map(b => ({ id: 'team-' + b.key, label: b.name + ' team', kind: 'Response teams', color: b.color }));
    if (window.MedPlan && window.MedPlan.unlocked()) window.MedPlan.vehicles().forEach(v => list.push({ id: 'veh-' + v.id, label: v.label.replace(/^RDM /, ''), kind: 'Medical vehicles', where: v.where }));
    if (window.MedPlan) window.MedPlan.soOnPost().forEach(s => list.push({ id: 'so-' + s.name.replace(/[^A-Za-z0-9]+/g, '-'), label: s.name, kind: 'Safety Officers on post', where: s.posts.map(p => p.label).join(', ') }));
    units.forEach(u => { if (u.custom && !list.some(x => x.id === u.id)) list.push({ id: u.id, label: u.label || u.id, kind: 'Other units' }); });
    return list.map(x => Object.assign(x, { st: (units.get(x.id) || {}).status || 'available', inc: (units.get(x.id) || {}).incident || null }));
  }
  const unitLabel = id => { const u = unitList().find(x => x.id === id); return u ? u.label : id || ''; };

  // ---------- layout ----------
  function build() {
    if (map) { map.remove(); map = null; layer = null; }
    $('rcBody').innerHTML = `<div class="rc-layout">
      <div class="rc-top">
        <div class="rc-clock"><b id="rcClock"></b><span id="rcCounts"></span></div>
        <div id="rcWx" class="rc-wx"></div>
        <div class="rc-tools"><span id="rcSync" class="rc-sync"></span>
          <label class="rc-who">You <input id="rcWho" type="text" maxlength="40" placeholder="Your name" value="${esc(who())}"></label>
          <button id="rcNew" class="btn primary small" type="button">New incident</button>
          ${C.tracking && C.tracking.url ? `<a class="btn small" href="${esc(C.tracking.url)}" target="_blank" rel="noopener" title="${C.tracking.credit && C.tracking.credit.name ? 'Timing and tracking by ' + esc(C.tracking.credit.name) : ''}">${esc(C.tracking.label || 'Live tracking')}</a>` : ''}
          <button id="rcExport" class="btn small" type="button">Export</button></div>
      </div>
      <div class="rc-col rc-incs"><p id="rcStoreWarn" class="notice warn"${memOnly ? '' : ' hidden'}>This device won't save Race Control entries, so the ones waiting to send are only kept in this tab. Keep this tab open until they've sent.</p><div id="rcForm"></div><div id="rcOpen"></div><details class="rc-closed"><summary id="rcClosedSum">Closed</summary><div id="rcClosed"></div></details></div>
      <div class="rc-col rc-mid"><div class="rc-mapbox"><div id="rcMap"></div></div>
        <div class="rc-logbox"><h3>Radio log</h3><form id="rcLogForm" class="rc-logform"><input id="rcLogText" type="text" maxlength="500" placeholder="Add a log entry (Enter to save)"><button class="btn small" type="submit">Log</button></form><ol id="rcLog" class="rc-log"></ol></div></div>
      <div class="rc-col rc-units"><h3>Units</h3><div id="rcUnits"></div>
        <form id="rcAddUnit" class="rc-logform"><input id="rcUnitName" type="text" maxlength="40" placeholder="Add a unit, e.g. Sweep 3"><button class="btn small" type="submit">Add</button></form>
        <div id="rcWatch" class="rc-watch"></div></div>
    </div>`;
    $('rcWho').addEventListener('change', e => { try { localStorage.setItem(LSN, e.target.value.trim()); } catch (x) { } });
    $('rcNew').addEventListener('click', () => openForm({}));
    $('rcExport').addEventListener('click', exportCSV);
    $('rcLogForm').addEventListener('submit', e => {
      e.preventDefault();
      const t = $('rcLogText').value.trim(); if (!t) return flash($('rcLogText'));
      if (!needName()) return;
      log.unshift({ id: 1e15 + now(), t: now(), text: t, who: who(), kind: 'note', pending: true });
      send('/rc/log', { text: t }); $('rcLogText').value = ''; renderLog();
    });
    $('rcAddUnit').addEventListener('submit', e => {
      e.preventDefault();
      const el = $('rcUnitName'), n = el.value.trim(); if (!n) return flash(el);
      el.value = '';
      if (unitList().some(u => u.label.toLowerCase() === n.toLowerCase())) { el.placeholder = n + ' is already on the board'; return flash(el); }
      el.placeholder = 'Add a unit, e.g. Sweep 3';
      // Ids keep the name's letters; a name with other characters (e.g. non-Latin) gets a short code so names never share an id.
      const h = [...n].reduce((a, c) => Math.imul(a ^ c.codePointAt(0), 16777619) >>> 0, 2166136261);
      patchUnit('u-' + n.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 40) + (/[^A-Za-z0-9 _-]/.test(n) ? '.' + h.toString(36) : ''), { custom: true, label: n, status: 'available' }, 'Unit added: ' + n);
    });
    if (window.L) {
      map = L.map('rcMap', { zoomControl: true });
      GPTBaseMap(map);
      if (window.GPTFullscreen) GPTFullscreen(map, $('rcMap').parentNode);
      L.polyline(G.route.map(p => [p[0], p[1]]), { color: '#d9531e', weight: 3, opacity: .7 }).addTo(map);
      if (window.GPTHelipads) GPTHelipads.overlay(map, true);
      layer = L.layerGroup().addTo(map);
      runnerLayer = L.layerGroup().addTo(map);
      map.fitBounds(L.latLngBounds(G.route.map(p => [p[0], p[1]])).pad(0.04));
    }
    // A redraw skips a list while one of its menus is in use (so it doesn't snap shut), and catches up when it's left (after any click).
    ['rcOpen', 'rcUnits'].forEach(k => $(k).addEventListener('focusout', () => { if (!held) return; held = false; if (pressing) addEventListener('pointerup', () => setTimeout(render, 0), { once: true }); else setTimeout(render, 0); }));
    built = true;
    renderWatch();
  }
  // Live tracking: every runner on the board's map, and a watch list of anyone not moving or whose tracker has gone quiet.
  function renderWatch() {
    const TR = window.GPTTracking, el = $('rcWatch');
    if (!TR || !el) return;
    if (runnerLayer) { runnerLayer.clearLayers(); G.courses.forEach(E => TR.draw(runnerLayer, E, null, null, { find: true })); }
    if (!TR.ready()) { el.innerHTML = `<p class="rc-live">${esc(TR.status())}</p>`; return; }
    const w = TR.watch();
    const row = (r, why) => `<div class="row"><span>${TR.who(r)}<span class="sub">${why}, km ${TR.cur(r).toFixed(1)}${r.pos.est ? ' (estimated)' : ''}${r.pos.course !== G ? ' (' + esc(r.pos.course.label) + ')' : ''}. ${TR.where(r)}</span></span><button class="btn small trk-go" type="button" data-bib="${esc(r.bib)}">Find</button></div>`;
    el.innerHTML = `<h3>Runner watch</h3><p class="rc-live">${esc(TR.status())}</p>` +
      (w.stopped.length ? `<h4>Not moving for 20 min</h4>` + w.stopped.slice(0, 10).map(r => row(r, 'Not moving')).join('') : '') +
      (w.off.length ? `<h4>Off the course</h4>` + w.off.slice(0, 10).map(r => row(r, TR.dist(r.pos.offM) + ' off the course')).join('') : '') +
      (w.late.length ? `<h4>Late at the next checkpoint</h4>` + w.late.slice(0, 10).map(r => row(r, (r.pos.next.overdue ? 'Overdue' : 'Late') + ' at ' + esc(r.pos.next.name))).join('') : '') +
      (w.quiet.length ? `<h4>Tracker gone quiet</h4>` + w.quiet.slice(0, 10).map(r => row(r, 'No fix')).join('') : '') +
      (!w.stopped.length && !w.off.length && !w.late.length && !w.quiet.length ? '<p class="rc-live">Everyone on course is moving and accounted for.</p>' : '');
  }
  if (window.GPTTracking) GPTTracking.onUpdate(() => { if (built) { renderWatch(); render(); } });
  // Flash a missing required field red (and focus the first one).
  function flash(...els) {
    els = els.filter(Boolean);
    els.forEach(el => { el.classList.remove('rc-flash'); void el.offsetWidth; el.classList.add('rc-flash'); el.addEventListener('input', () => el.classList.remove('rc-flash'), { once: true }); el.addEventListener('change', () => el.classList.remove('rc-flash'), { once: true }); clearTimeout(el._flashT); el._flashT = setTimeout(() => el.classList.remove('rc-flash'), 2600); });
    if (els[0]) els[0].focus();
    return false;
  }
  function needName() {
    if (who()) return true;
    const el = $('rcWho');
    el.placeholder = 'Your name first';
    return flash(el);
  }

  // ---------- rendering ----------
  function render() {
    if (!shown) return;
    if (!BASE) { $('rcBody').innerHTML = '<div class="rc-msg"><h2>Race Control</h2><p>Race Control needs the GPT100 Safety Worker. See tools/RACE_CONTROL.md.</p></div>'; built = false; return; }
    if (!unlocked()) {
      built = false; if (map) { map.remove(); map = null; layer = null; }
      $('rcBody').innerHTML = '<div class="rc-msg"><h2>Race Control</h2><p>Race Control uses the medical password. Unlock the Medical tab on this device, then come back.</p><p><button class="btn primary" id="rcGoMed" type="button">Go to Medical</button></p></div>';
      $('rcGoMed').addEventListener('click', () => { location.hash = 'medical'; });
      return;
    }
    if (lastErr && /set up/.test(lastErr) && !incidents.size) {
      built = false; if (map) { map.remove(); map = null; layer = null; }
      $('rcBody').innerHTML = `<div class="rc-msg"><h2>Race Control</h2><p>${esc(lastErr)}.</p><p>Setup steps are in tools/RACE_CONTROL.md.</p></div>`;
      return;
    }
    if (!built) build();
    const all = [...incidents.values()];
    const open = all.filter(i => i.status !== 'closed').sort((a, b) => sevRank(a) - sevRank(b) || a.created - b.created);
    const closed = all.filter(i => i.status === 'closed').sort((a, b) => (b.times && b.times.closed || 0) - (a.times && a.times.closed || 0));
    if (!hold($('rcOpen'))) { $('rcOpen').innerHTML = open.length ? open.map(card).join('') : '<p class="rc-empty">No open incidents.</p>'; bindCards($('rcOpen')); }
    $('rcClosed').innerHTML = closed.map(card).join('');
    $('rcClosedSum').textContent = `Closed (${closed.length})`;
    bindCards($('rcClosed'));
    renderUnits(); renderLog(); renderMap(); tick(); status(); renderForm();
  }
  let pressing = false;
  addEventListener('pointerdown', () => { pressing = true; }, true);
  addEventListener('pointerup', () => setTimeout(() => { pressing = false; }, 0), true);
  const hold = el => { const a = document.activeElement; return !!(a && a.tagName === 'SELECT' && el.contains(a)) && (held = true); };
  const sevRank = i => ({ urgent: 0, priority: 1, routine: 2 }[i.severity] ?? 3);
  function card(i) {
    const t = i.times || {}, sev = SEV[i.severity] || ['Unrated', '#777'], e = eta(i), closed = i.status === 'closed';
    const next = STEPS.find(([k]) => !t[k]);
    const loc = i.km != null ? `km ${(+i.km).toFixed(1)} <span>${esc(placeAt(+i.km))}</span>` : esc(i.where || 'Location not given');
    return `<div class="rc-card${closed ? ' closed' : ''}" data-id="${i.id}" style="--sev:${sev[1]}">
      <div class="rc-card-top"><b>#${i.num || '…'}</b><span class="rc-sev">${sev[0]}</span><span class="rc-loc">${loc}</span>
        <span class="rc-timer" data-t0="${t.call || i.created}" data-due="${t.dispatched && e != null && !t.onScene ? t.dispatched + e * 60000 : ''}"></span></div>
      <p class="rc-what">${esc(i.desc || '')}${i.bib || i.name ? ` <span class="rc-runner">${esc([i.bib ? 'Bib ' + i.bib : '', i.name, i.race].filter(Boolean).join(', '))}</span>` : ''}</p>
      ${liveBib(i)}
      <p class="rc-times">${[['call', 'Call'], ['dispatched', 'Sent'], ['onScene', 'On scene'], ['leaving', 'Left'], ['closed', 'Closed']].filter(([k]) => t[k]).map(([k, l]) => `${l} <b>${hm(t[k])}</b>`).join(' · ')}
        ${i.unit ? ` · <b>${esc(unitLabel(i.unit))}</b>` : ''}${closed ? '' : e != null ? ` · ETA ${dur(e)}` : i.unit && !t.onScene ? ' · ETA unknown' : ''}${i.outcome ? ` · ${esc(i.outcome)}` : ''}</p>
      ${closed ? '<div class="rc-actions"><button class="btn small" data-act="reopen" type="button">Reopen</button></div>' : `<div class="rc-actions">
        ${next ? `<button class="btn small primary" data-step="${next[0]}" type="button">${next[1]}</button>` : ''}
        <button class="btn small" data-act="close" type="button">Close</button>
        <button class="btn small" data-act="edit" type="button">Edit</button>
        ${i.km != null ? '<button class="btn small" data-act="find" type="button">Find</button>' : ''}</div>
      ${closing.has(i.id) ? `<div class="rc-closebox"><label>Outcome <select>${OUTCOMES.map(o => `<option${o === closing.get(i.id) ? ' selected' : ''}>${o}</option>`).join('')}</select></label><button class="btn small primary" data-act="closeit" type="button">Close incident</button><button class="btn small" data-act="keep" type="button">Cancel</button></div>` : ''}`}
    </div>`;
  }
  // Where the incident's runner is now, from the GPS tracker or the timing chips, whichever is newer.
  function liveBib(i) {
    const TR = window.GPTTracking;
    if (!TR || !i.bib || i.status === 'closed') return '';
    const r = TR.byBib(i.bib);
    if (!r || !r.pos) return '';
    const km = TR.cur(r);
    return `<p class="trk-bib">${r.pos.src === 'chip' ? 'Chips' : 'Tracker'}: km ${km.toFixed(1)}${r.pos.est ? ' (estimated)' : ''}${r.pos.offM > 60 ? ', ' + TR.dist(r.pos.offM) + ' off the course' : ''}. ${TR.where(r)}${i.km != null && !r.pos.done && Math.abs(km - i.km) > 0.3 ? ` <b>(${TR.dist(Math.abs(km - i.km) * 1000)} from the logged km)</b>` : ''} <button class="btn small trk-go" type="button" data-bib="${esc(r.bib)}">Find</button></p>`;
  }
  function bindCards(root) {
    root.querySelectorAll('.rc-card').forEach(el => {
      const id = el.dataset.id, sel = el.querySelector('.rc-closebox select');
      if (sel) sel.addEventListener('change', () => closing.set(id, sel.value));
      el.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => step(incidents.get(id), b.dataset.step)));
      el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.act, i = incidents.get(id);
        if (a === 'edit') openForm(i);
        if (a === 'close' && needName()) { closing.set(id, closing.get(id) || OUTCOMES[0]); render(); }
        if (a === 'keep') { closing.delete(id); render(); }
        if (a === 'closeit') closeIncident(i, sel.value);
        if (a === 'reopen' && needName()) reopen(i);
        if (a === 'find' && window.GPT_UI) window.GPT_UI.openKm(+i.km);
      }));
      el.addEventListener('mouseenter', () => focusMarker(id));
    });
  }
  function step(i, k) {
    if (!needName()) return;
    const label = STEPS.find(s => s[0] === k)[1];
    if (k === 'dispatched' && !i.unit) { openForm(i, 'Choose the unit sent, then save.'); flash($('rcForm').querySelector('select[name=unit]')); return; }
    const patch = { times: { [k]: now() } };
    patchIncident(i.id, patch, `${label}${i.unit ? ' (' + unitLabel(i.unit) + ')' : ''}`);
    if (i.unit && freeFor(i.unit, i.id)) patchUnit(i.unit, { status: k === 'onScene' ? 'onscene' : k === 'leaving' ? 'returning' : 'tasked', incident: i.id });
  }
  // Releases any unit still on this incident (one on another open incident too goes on to that one).
  function closeIncident(i, outcome) {
    if (!needName()) return;
    closing.delete(i.id);
    patchIncident(i.id, { status: 'closed', outcome, times: { closed: now() } }, 'Closed: ' + outcome);
    release(i.id, null);
  }
  // Re-tasks the incident's unit if it's free; if it's busy, the incident is left without a unit and the form says so.
  function reopen(i) {
    closing.delete(i.id);
    const u = i.unit && units.get(i.unit), label = i.unit && unitLabel(i.unit);
    const free = !u || u.status === 'available' || (u.status !== 'unavailable' && u.incident && freeFor(i.unit, i.id));
    const busy = i.unit && !free;
    patchIncident(i.id, Object.assign({ status: 'open', outcome: null, times: { closed: null } }, busy ? { unit: null } : {}), 'Reopened' + (busy ? ', ' + label + ' is busy so no unit is assigned' : i.unit ? ', ' + label + ' tasked' : ''));
    if (i.unit && !busy) patchUnit(i.unit, { status: 'tasked', incident: i.id });
    if (busy) openForm(incidents.get(i.id), `Reopened. ${label} is busy, so no unit is assigned. Choose a unit if one is going.`);
  }
  function renderUnits() {
    if (hold($('rcUnits'))) return;
    const list = unitList(), groups = {};
    list.forEach(u => (groups[u.kind] = groups[u.kind] || []).push(u));
    $('rcUnits').innerHTML = Object.entries(groups).map(([k, us]) => `<h4>${esc(k)}</h4>` + us.map(u => {
      const inc = u.inc && incidents.get(u.inc);
      return `<div class="rc-unit st-${u.st}"><span class="rc-unit-name">${u.color ? `<i style="background:${u.color}"></i>` : ''}${esc(u.label)}${u.where ? `<small>${esc(u.where)}</small>` : ''}</span>
        <select data-unit="${esc(u.id)}" aria-label="${esc(u.label)} status">${Object.entries(UNIT_ST).map(([v, l]) => `<option value="${v}"${v === u.st ? ' selected' : ''}>${l}</option>`).join('')}</select>
        ${inc && inc.status !== 'closed' && u.st !== 'available' ? `<small class="rc-unit-inc">#${inc.num || '…'} km ${inc.km != null ? (+inc.km).toFixed(1) : '?'}</small>` : ''}</div>`;
    }).join('')).join('');
    $('rcUnits').querySelectorAll('select[data-unit]').forEach(s => s.addEventListener('change', () => {
      s.blur();
      if (!needName()) { renderUnits(); return; }
      const label = unitLabel(s.dataset.unit);
      patchUnit(s.dataset.unit, Object.assign({ status: s.value, label }, s.value === 'available' || s.value === 'unavailable' ? { incident: null } : {}), `${label}: ${UNIT_ST[s.value]}`);
    }));
  }
  function renderLog() {
    if (!$('rcLog')) return;
    $('rcLog').innerHTML = log.slice(0, 200).map(l => {
      const inc = l.incident && incidents.get(l.incident);
      return `<li class="${l.pending ? 'pending' : ''}"><time>${hm(l.t)}</time> ${inc && !/^#\d/.test(l.text) ? `<b>#${inc.num}</b> ` : ''}${esc(l.text)}${l.who ? ` <span>${esc(l.who)}</span>` : ''}</li>`;
    }).join('') || '<li class="rc-empty">Nothing logged yet.</li>';
  }
  function renderMap() {
    if (!layer) return;
    layer.clearLayers();
    incidents.forEach(i => {
      if (i.status === 'closed') return;
      const ll = i.lat != null ? [i.lat, i.lon] : i.km != null ? (p => [p[0], p[1]])(courseOf(i).route[courseOf(i).idxAtKm(+i.km)]) : null;
      if (!ll) return;
      const sev = SEV[i.severity] || ['', '#777'];
      L.marker(ll, { icon: L.divIcon({ className: '', html: `<div class="rc-pin" style="background:${sev[1]}">${i.num || '…'}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
        .bindTooltip(`#${i.num || '…'} ${esc(i.desc || '')}`).on('click', () => { const el = document.querySelector(`.rc-card[data-id="${i.id}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }).addTo(layer);
    });
  }
  function focusMarker() { }
  // Timers and the clock, every second.
  function tick() {
    if (!$('rcClock')) return;
    $('rcClock').textContent = tf.format(new Date());
    const open = [...incidents.values()].filter(i => i.status !== 'closed');
    $('rcCounts').innerHTML = ['urgent', 'priority', 'routine'].map(k => { const n = open.filter(i => i.severity === k).length; return n ? `<span class="rc-count" style="background:${SEV[k][1]}">${n} ${SEV[k][0].toLowerCase()}</span>` : ''; }).join('') || '<span class="rc-count ok">No open incidents</span>';
    document.querySelectorAll('#rcBody .rc-timer').forEach(el => {
      const card = el.closest('.rc-card'); if (card.classList.contains('closed')) { el.textContent = ''; return; }
      const t0 = +el.dataset.t0, due = +el.dataset.due || 0, n = now();
      el.textContent = dur(mins(t0)) + (due ? (n > due ? ` · ${dur(mins(due))} past ETA` : ` · due ${hm(due)}`) : '');
      el.classList.toggle('late', !!due && n > due);
    });
  }
  function status() {
    const el = $('rcSync'); if (!el) return;
    const age = lastOk ? Math.round((now() - lastOk) / 1000) : null;
    el.className = 'rc-sync ' + (lastErr ? 'bad' : age != null && age < 20 ? 'ok' : 'warn');
    el.textContent = (lastErr ? 'Not syncing: ' + lastErr : age == null ? 'Connecting…' : 'Live') + (readQ().length ? ` · ${readQ().length} waiting to send` : '');
  }
  async function renderWx() {
    const box = $('rcWx'); if (!box || !window.WeatherTab || !window.WeatherTab.peek) return;
    const L2 = await window.WeatherTab.peek().catch(() => null);
    if (!L2 || !L2.triggers) return;
    const t = L2.triggers.next48.triggers;
    const hot = Object.values(t).filter(r => r.status === 'met' || r.status === 'close');
    box.innerHTML = '<span class="rc-wx-h">Weather 48 h</span> ' + (hot.length ? hot.map(r => `<span class="wx-pill st-${r.status}">${esc(r.label)}</span>`).join(' ') : '<span class="wx-pill st-ok">All clear</span>');
  }

  // ---------- new and edit form ----------
  function openForm(inc, note) { editing = inc && inc.id ? inc.id : null; orig = Object.assign({}, inc); draft = Object.assign({}, inc); draft.note = note || ''; renderForm(true); }
  // Km as typed ("87.3", "87,3" or "87.3 km"), checked against the course. NaN if it isn't a km on the course.
  // Race distances run up to 0.5 km past the course line's finish (Miler 163 against 162.6), as in Find, so those are taken as the finish.
  function kmOf(v, d) {
    v = String(v).trim().replace(/\s*km$/i, '').replace(',', '.');
    const km = /^(\d+\.?\d*|\.\d+)$/.test(v) ? +v : NaN, total = courseOf(d).totalKm;
    return km >= 0 && km <= total + 0.5 ? Math.min(km, total) : NaN;
  }
  function badKm(f) {
    let p = f.querySelector('.rc-kmmsg');
    if (!p) { p = document.createElement('p'); p.className = 'notice warn rc-kmmsg'; f.querySelector('h3').after(p); }
    p.textContent = `Km must be a number between 0 and ${courseOf(draft).totalKm.toFixed(1)}.`;
    flash(f.km);
  }
  function renderForm(scroll) {
    const box = $('rcForm'); if (!box) return;
    if (!draft) { box.innerHTML = ''; return; }
    if (box.querySelector('form') && !scroll) return; // don't wipe a form being typed in
    const d = draft;
    const races = (C.races || []).map(x => x.label);
    box.innerHTML = `<form class="rc-form" autocomplete="off"><h3>${editing ? 'Edit #' + (d.num || '…') : 'New incident'}</h3>
      ${d.note ? `<p class="notice warn">${esc(d.note)}</p>` : ''}
      <div class="rc-sevs">${Object.entries(SEV).map(([k, [l, c]]) => `<label style="--c:${c}"><input type="radio" name="sev" value="${k}"${(d.severity || 'priority') === k ? ' checked' : ''}> ${l}</label>`).join('')}</div>
      <div class="rc-grid">
        <label><span>Km on ${esc((courseOf(d).name) || 'course')} <em class="rc-req">*</em></span><input name="km" inputmode="decimal" value="${d.km != null ? (+d.km).toFixed(1) : ''}" placeholder="e.g. 87.3"></label>
        <label><span>Or where <em class="rc-req">*</em></span><input name="where" value="${esc(d.where || '')}" placeholder="Description or what3words"></label>
        <label>Bib<input name="bib" value="${esc(d.bib || '')}"></label>
        <label>Runner<input name="name" value="${esc(d.name || '')}"></label>
        <label>Race<select name="race"><option></option>${races.map(x => `<option${x === d.race ? ' selected' : ''}>${esc(x)}</option>`).join('')}<option${d.race === '14k or 6k' ? ' selected' : ''}>14k or 6k</option></select></label>
        <label>Reported by<input name="reporter" value="${esc(d.reporter || '')}" placeholder="e.g. Aid station, runner, SO"></label>
      </div>
      <label class="rc-full"><span>What happened <em class="rc-req">*</em></span><textarea name="desc" rows="2" placeholder="Injury or illness, condition, what they need">${esc(d.desc || '')}</textarea></label>
      <label class="rc-full">Unit sent<select name="unit"><option value="">Not sent yet</option>${unitList().map(u => `<option value="${esc(u.id)}"${u.id === d.unit ? ' selected' : ''}>${esc(u.label)}${u.st !== 'available' ? ' (' + UNIT_ST[u.st].toLowerCase() + ')' : ''}</option>`).join('')}</select></label>
      <p class="rc-suggest"${suggest(d) ? '' : ' hidden'}>${suggest(d)}</p>
      <p class="rc-reqnote"><em class="rc-req">*</em> Required: a km or where, and what happened.</p>
      <div class="rc-actions"><button class="btn primary small" type="submit">${editing ? 'Save' : 'Log incident'}</button><button class="btn small" type="button" data-cancel>Cancel</button></div></form>`;
    const f = box.querySelector('form');
    // A new km only updates the suggestion, and not until a press in progress ends: leaving the box by clicking
    // Log incident used to rebuild or move the form under the click, so the click was lost.
    f.km.addEventListener('change', () => {
      const v = kmOf(f.km.value, draft); if (f.km.value.trim() && isNaN(v)) return badKm(f);
      draft.km = isNaN(v) ? null : v;
      if (draft.km != null) f.km.value = (Math.round(draft.km * 10) / 10).toFixed(1);
      const upd = () => {
        if (!draft) return;
        const m = f.querySelector('.rc-kmmsg'); if (m) m.remove();
        const sg = f.querySelector('.rc-suggest'); sg.innerHTML = suggest(draft); sg.hidden = !sg.innerHTML;
      };
      if (pressing) addEventListener('pointerup', () => setTimeout(upd, 0), { once: true }); else upd();
    });
    f.querySelector('[data-cancel]').addEventListener('click', () => { draft = null; editing = null; orig = null; renderForm(); });
    f.addEventListener('submit', e => { e.preventDefault(); save(f); });
    if (scroll) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // The fastest team to the km, and a backup.
  function suggest(d) {
    const r = assess(d), best = r && r.results[0];
    return best ? `Suggested: <b>${esc(best.base.name)} team</b>, ETA ${G.fmt(best.total)} via ${esc(G.cleanName(best.a))}${r.results[1] ? `; backup ${esc(r.results[1].base.name)}, ${G.fmt(r.results[1].total)}` : ''}.` : '';
  }
  function keep(f) { ['where', 'bib', 'name', 'race', 'reporter', 'desc', 'unit'].forEach(k => { draft[k] = f[k].value; }); draft.severity = f.sev.value; }
  function save(f) {
    if (!needName()) return;
    keep(f);
    // Required: a location (km or where) and what happened. Missing ones flash red.
    const missing = [];
    if (!f.km.value.trim() && !f.where.value.trim()) missing.push(f.km, f.where);
    if (!f.desc.value.trim()) missing.push(f.desc);
    if (missing.length) { flash(...missing); return; }
    const km = kmOf(f.km.value, draft);
    if (f.km.value.trim() && isNaN(km)) return badKm(f);
    const p = { severity: draft.severity, km: isNaN(km) ? null : Math.round(km * 10) / 10, where: draft.where.trim(), bib: draft.bib.trim(), name: draft.name.trim(), race: draft.race, reporter: draft.reporter.trim(), desc: draft.desc.trim(), unit: draft.unit || null };
    if (draft.course) p.course = draft.course;
    if (draft.lat != null) { p.lat = draft.lat; p.lon = draft.lon; }
    if (draft.w3w) p.w3w = draft.w3w;
    if (editing) {
      // Only what this operator changed since opening the form, so a stale form can't undo someone else's change.
      const old = incidents.get(editing), patch = {}, n = v => v == null ? '' : String(v);
      Object.keys(p).forEach(k => { if (n(p[k]) !== n(k === 'severity' ? orig[k] || 'priority' : orig[k])) patch[k] = p[k]; });
      const sent = 'unit' in patch && p.unit !== old.unit;
      if (sent && p.unit && !(old.times || {}).dispatched) patch.times = { dispatched: now() };
      if (Object.keys(patch).length) patchIncident(editing, patch, 'Updated' + (sent && p.unit ? ': ' + unitLabel(p.unit) + ' sent' : ''));
      if (sent) release(editing, p.unit);
      if (sent && p.unit) patchUnit(p.unit, { status: 'tasked', incident: editing });
    } else {
      const id = newId();
      p.times = Object.assign({ call: now() }, p.unit ? { dispatched: now() } : {});
      patchIncident(id, p, `Logged: ${SEV[p.severity][0]}${p.km != null ? ', km ' + p.km : ''}${p.desc ? ', ' + p.desc.slice(0, 80) : ''}`);
      if (p.unit) patchUnit(p.unit, { status: 'tasked', incident: id });
    }
    draft = null; editing = null; orig = null; renderForm();
  }

  // ---------- export ----------
  function exportCSV() {
    // A leading = + - @ tab or return is a formula to a spreadsheet, so those cells get a ' first.
    const q = v => '"' + String(v == null ? '' : v).replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""') + '"';
    const rows = [['Number', 'Status', 'Severity', 'Km', 'Where', 'Bib', 'Runner', 'Race', 'What happened', 'Reported by', 'Unit', 'Call', 'Sent', 'On scene', 'Left scene', 'Closed', 'Outcome']];
    [...incidents.values()].sort((a, b) => (a.num || 0) - (b.num || 0)).forEach(i => {
      const t = i.times || {};
      rows.push([i.num, i.status, i.severity, i.km, i.km != null ? placeAt(+i.km) : i.where, i.bib, i.name, i.race, i.desc, i.reporter, unitLabel(i.unit), dhm(t.call), dhm(t.dispatched), dhm(t.onScene), dhm(t.leaving), dhm(t.closed), i.outcome]);
    });
    rows.push([], ['Radio log'], ['Time', 'Incident', 'Entry', 'By']);
    log.slice().reverse().forEach(l => rows.push([dhm(l.t), l.incident && incidents.get(l.incident) ? '#' + incidents.get(l.incident).num : '', l.text, l.who]));
    const blob = new Blob([rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'GPT100-race-control-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- start ----------
  let clock = null;
  function onShow() {
    shown = true;
    render();
    if (map) setTimeout(() => { if (map) map.invalidateSize(); }, 0);
    sync(); renderWx();
    clearInterval(timer); timer = setInterval(sync, 5000);
    clearInterval(clock); clock = setInterval(tick, 1000);
  }
  function onHide() {
    shown = false;
    clearInterval(clock);
    clearInterval(timer); timer = setInterval(sync, 30000); // keep up to date in the background, more slowly
  }
  // From Find: start a new incident at the casualty, with the course, km, coordinates, what3words and the runner's race.
  function newFromFind(r) {
    openForm({ course: r.course, km: Math.round(r.km * 10) / 10, lat: r.q && r.q.lat != null ? r.q.lat : r.lat, lon: r.q && r.q.lat != null ? r.q.lon : r.lon, w3w: r.casW3w || '', where: r.casW3w ? '///' + r.casW3w : '', race: r.race || '' });
  }
  // Rebuild only when the device locks or unlocks (the medical plan also calls this every minute when live).
  let authState = null;
  function onAuth() {
    const st = unlocked();
    if (st === authState) return;
    authState = st;
    if (shown) { built = false; render(); sync(); }
  }
  addEventListener('online', flush);
  window.RaceControl = { onShow, onHide, onAuth, newFromFind, available: () => !!BASE };
})();
