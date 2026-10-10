// Race Control board: the live incident log, unit status and radio log, shared between race control devices.
// Kept in the D1 database on the GPT100 Safety Worker (tools/RACE_CONTROL.md). Unlocked with the medical password.
(function () {
  const G = window.GPT, C = window.GPT100_CONFIG, W = C.weather || {};
  const $ = id => document.getElementById(id);
  if (!$('rcBody')) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BASE = (new URLSearchParams(location.search).get('rcapi') || W.refreshUrl || '').replace(/\/$/, '');
  const LSQ = 'gpt100_rc_queue', LSN = 'gpt100_rc_name';
  const SEV = { urgent: ['Urgent', '#c62828'], priority: ['Priority', '#e8710a'], routine: ['Routine', '#1d7f45'] };
  const UNIT_ST = { available: 'Available', tasked: 'Tasked', onscene: 'On scene', returning: 'Returning', unavailable: 'Unavailable' };
  const OUTCOMES = ['Treated, continued', 'Treated, withdrew (DNF)', 'Walked out with crew', 'Carried out', 'Ambulance', 'Air evacuation', 'Other'];
  const STEPS = [['dispatched', 'Dispatched'], ['onScene', 'On scene'], ['leaving', 'Leaving scene']];

  // ---------- state ----------
  const incidents = new Map(), units = new Map();
  let log = [], since = 0, lastOk = 0, lastErr = '', built = false, shown = false, timer = null, map = null, layer = null, editing = null, draft = null;
  let queue = []; try { queue = JSON.parse(localStorage.getItem(LSQ) || '[]'); } catch (e) { queue = []; }
  const saveQ = () => { try { localStorage.setItem(LSQ, JSON.stringify(queue)); } catch (e) { } };
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
      headers: Object.assign({ 'X-RC-Password': (window.MedPlan && window.MedPlan.pw()) || '' }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'HTTP ' + r.status); e.status = r.status; throw e; }
    return j;
  }
  // Changes go in a queue (kept on the device), so nothing is lost without signal; they send in order.
  function send(path, body) { queue.push({ path, body: Object.assign({ who: who() }, body) }); saveQ(); flush(); }
  let flushing = false;
  async function flush() {
    if (flushing || !queue.length || !ready()) return;
    flushing = true;
    try {
      while (queue.length) {
        const j = await api(queue[0].path, queue[0].body);
        if (j.incident) incidents.set(j.incident.id, j.incident);
        if (j.unit) units.set(j.unit.id, j.unit);
        queue.shift(); saveQ();
      }
      lastErr = '';
    } catch (e) { lastErr = e.message; if (e.status === 400 || e.status === 413) { queue.shift(); saveQ(); } }
    flushing = false;
    status();
  }
  async function sync() {
    if (!ready()) return;
    try {
      await flush();
      const j = await api('/rc/state?since=' + since);
      if (!Array.isArray(j.incidents)) throw new Error('Race Control isn\'t set up on the Worker yet (paste the latest Worker code into Cloudflare)');
      j.incidents.forEach(i => { const cur = incidents.get(i.id); if (!cur || (cur.version || 0) <= i.version) incidents.set(i.id, i); });
      j.units.forEach(u => units.set(u.id, u));
      if (j.log.length) { const ids = new Set(log.map(l => l.id)); log = j.log.filter(l => !ids.has(l.id)).concat(log).sort((a, b) => b.id - a.id).slice(0, 500); }
      if (!queue.length) log = log.filter(l => !l.pending);
      since = j.now - 3000; lastOk = now(); lastErr = '';
      if (j.incidents.length || j.units.length || j.log.length) render(); else { tick(); status(); }
    } catch (e) { lastErr = e.message; status(); if (e.status === 401 || e.status === 503) render(); }
  }
  const ready = () => BASE && window.MedPlan && window.MedPlan.unlocked() && window.MedPlan.pw();

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
  // Expected time to reach the casualty for the unit sent (a base team), else the fastest team.
  function eta(inc) {
    const r = assess(inc); if (!r || !r.results.length) return null;
    const team = inc.unit && inc.unit.startsWith('team-') ? r.results.find(x => 'team-' + x.base.key === inc.unit) : null;
    return Math.round((team || r.results[0]).total);
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
          ${C.tracking && C.tracking.url ? `<a class="btn small" href="${esc(C.tracking.url)}" target="_blank" rel="noopener">${esc(C.tracking.label || 'Live tracking')}</a>` : ''}
          <button id="rcExport" class="btn small" type="button">Export</button></div>
      </div>
      <div class="rc-col rc-incs"><div id="rcForm"></div><div id="rcOpen"></div><details class="rc-closed"><summary id="rcClosedSum">Closed</summary><div id="rcClosed"></div></details></div>
      <div class="rc-col rc-mid"><div class="rc-mapbox"><div id="rcMap"></div></div>
        <div class="rc-logbox"><h3>Radio log</h3><form id="rcLogForm" class="rc-logform"><input id="rcLogText" type="text" maxlength="500" placeholder="Add a log entry (Enter to save)"><button class="btn small" type="submit">Log</button></form><ol id="rcLog" class="rc-log"></ol></div></div>
      <div class="rc-col rc-units"><h3>Units</h3><div id="rcUnits"></div>
        <form id="rcAddUnit" class="rc-logform"><input id="rcUnitName" type="text" maxlength="40" placeholder="Add a unit, e.g. Sweep 3"><button class="btn small" type="submit">Add</button></form></div>
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
      const n = $('rcUnitName').value.trim(); if (!n) return flash($('rcUnitName'));
      patchUnit('u-' + n.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40), { custom: true, label: n, status: 'available' }, 'Unit added: ' + n);
      $('rcUnitName').value = '';
    });
    if (window.L) {
      map = L.map('rcMap', { zoomControl: true });
      GPTBaseMap(map);
      L.polyline(G.route.map(p => [p[0], p[1]]), { color: '#d9531e', weight: 3, opacity: .7 }).addTo(map);
      layer = L.layerGroup().addTo(map);
      map.fitBounds(L.latLngBounds(G.route.map(p => [p[0], p[1]])).pad(0.04));
    }
    built = true;
  }
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
    if (!window.MedPlan || !window.MedPlan.unlocked()) {
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
    $('rcOpen').innerHTML = open.length ? open.map(card).join('') : '<p class="rc-empty">No open incidents.</p>';
    $('rcClosed').innerHTML = closed.map(card).join('');
    $('rcClosedSum').textContent = `Closed (${closed.length})`;
    bindCards();
    renderUnits(); renderLog(); renderMap(); tick(); status(); renderForm();
  }
  const sevRank = i => ({ urgent: 0, priority: 1, routine: 2 }[i.severity] ?? 3);
  function card(i) {
    const t = i.times || {}, sev = SEV[i.severity] || ['Unrated', '#777'], e = eta(i), closed = i.status === 'closed';
    const next = STEPS.find(([k]) => !t[k]);
    const loc = i.km != null ? `km ${(+i.km).toFixed(1)} <span>${esc(placeAt(+i.km))}</span>` : esc(i.where || 'Location not given');
    return `<div class="rc-card${closed ? ' closed' : ''}" data-id="${i.id}" style="--sev:${sev[1]}">
      <div class="rc-card-top"><b>#${i.num || '…'}</b><span class="rc-sev">${sev[0]}</span><span class="rc-loc">${loc}</span>
        <span class="rc-timer" data-t0="${t.call || i.created}" data-due="${t.dispatched && e && !t.onScene ? t.dispatched + e * 60000 : ''}"></span></div>
      <p class="rc-what">${esc(i.desc || '')}${i.bib || i.name ? ` <span class="rc-runner">${esc([i.bib ? 'Bib ' + i.bib : '', i.name, i.race].filter(Boolean).join(', '))}</span>` : ''}</p>
      <p class="rc-times">${[['call', 'Call'], ['dispatched', 'Sent'], ['onScene', 'On scene'], ['leaving', 'Left'], ['closed', 'Closed']].filter(([k]) => t[k]).map(([k, l]) => `${l} <b>${hm(t[k])}</b>`).join(' · ')}
        ${i.unit ? ` · <b>${esc(unitLabel(i.unit))}</b>` : ''}${e != null && !closed ? ` · ETA ${dur(e)}` : ''}${i.outcome ? ` · ${esc(i.outcome)}` : ''}</p>
      ${closed ? '' : `<div class="rc-actions">
        ${next ? `<button class="btn small primary" data-step="${next[0]}" type="button">${next[1]}</button>` : ''}
        <button class="btn small" data-act="close" type="button">Close</button>
        <button class="btn small" data-act="edit" type="button">Edit</button>
        ${i.km != null ? '<button class="btn small" data-act="find" type="button">Find</button>' : ''}</div>`}
    </div>`;
  }
  function bindCards() {
    document.querySelectorAll('#rcBody .rc-card').forEach(el => {
      const id = el.dataset.id, i = incidents.get(id);
      el.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => step(i, b.dataset.step)));
      el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'edit') openForm(i);
        if (a === 'close') closeIncident(i, el);
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
    if (i.unit) patchUnit(i.unit, { status: k === 'onScene' ? 'onscene' : k === 'leaving' ? 'returning' : 'tasked', incident: i.id });
  }
  function closeIncident(i, el) {
    if (!needName()) return;
    const box = document.createElement('div');
    box.className = 'rc-closebox';
    box.innerHTML = `<label>Outcome <select>${OUTCOMES.map(o => `<option>${o}</option>`).join('')}</select></label><button class="btn small primary" type="button">Close incident</button>`;
    el.appendChild(box);
    box.querySelector('button').addEventListener('click', () => {
      const outcome = box.querySelector('select').value;
      patchIncident(i.id, { status: 'closed', outcome, times: { closed: now() } }, 'Closed: ' + outcome);
      if (i.unit) patchUnit(i.unit, { status: 'available', incident: null });
    });
  }
  function renderUnits() {
    const list = unitList(), groups = {};
    list.forEach(u => (groups[u.kind] = groups[u.kind] || []).push(u));
    $('rcUnits').innerHTML = Object.entries(groups).map(([k, us]) => `<h4>${esc(k)}</h4>` + us.map(u => {
      const inc = u.inc && incidents.get(u.inc);
      return `<div class="rc-unit st-${u.st}"><span class="rc-unit-name">${u.color ? `<i style="background:${u.color}"></i>` : ''}${esc(u.label)}${u.where ? `<small>${esc(u.where)}</small>` : ''}</span>
        <select data-unit="${esc(u.id)}">${Object.entries(UNIT_ST).map(([v, l]) => `<option value="${v}"${v === u.st ? ' selected' : ''}>${l}</option>`).join('')}</select>
        ${inc && inc.status !== 'closed' && u.st !== 'available' ? `<small class="rc-unit-inc">#${inc.num || '…'} km ${inc.km != null ? (+inc.km).toFixed(1) : '?'}</small>` : ''}</div>`;
    }).join('')).join('');
    $('rcUnits').querySelectorAll('select[data-unit]').forEach(s => s.addEventListener('change', () => {
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
    el.textContent = (lastErr ? 'Not syncing: ' + lastErr : age == null ? 'Connecting…' : 'Live') + (queue.length ? ` · ${queue.length} waiting to send` : '');
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
  function openForm(inc, note) { editing = inc && inc.id ? inc.id : null; draft = Object.assign({}, inc); draft.note = note || ''; renderForm(true); }
  function renderForm(scroll) {
    const box = $('rcForm'); if (!box) return;
    if (!draft) { box.innerHTML = ''; return; }
    if (box.querySelector('form') && !scroll) return; // don't wipe a form being typed in
    const d = draft, r = assess(d), best = r && r.results[0];
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
      ${best ? `<p class="rc-suggest">Suggested: <b>${esc(best.base.name)} team</b>, ETA ${G.fmt(best.total)} via ${esc(G.cleanName(best.a))}${r.results[1] ? `; backup ${esc(r.results[1].base.name)}, ${G.fmt(r.results[1].total)}` : ''}.</p>` : ''}
      <p class="rc-reqnote"><em class="rc-req">*</em> Required: a km or where, and what happened.</p>
      <div class="rc-actions"><button class="btn primary small" type="submit">${editing ? 'Save' : 'Log incident'}</button><button class="btn small" type="button" data-cancel>Cancel</button></div></form>`;
    const f = box.querySelector('form');
    f.km.addEventListener('change', () => { const v = parseFloat(f.km.value); draft.km = isNaN(v) ? null : v; keep(f); renderForm(true); });
    f.querySelector('[data-cancel]').addEventListener('click', () => { draft = null; editing = null; renderForm(); });
    f.addEventListener('submit', e => { e.preventDefault(); save(f); });
    if (scroll) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function keep(f) { ['where', 'bib', 'name', 'race', 'reporter', 'desc', 'unit'].forEach(k => { draft[k] = f[k].value; }); draft.severity = f.sev.value; }
  function save(f) {
    if (!needName()) return;
    keep(f);
    // Required: a location (km or where) and what happened. Missing ones flash red.
    const missing = [];
    if (!f.km.value.trim() && !f.where.value.trim()) missing.push(f.km, f.where);
    if (!f.desc.value.trim()) missing.push(f.desc);
    if (f.km.value.trim() && isNaN(parseFloat(f.km.value))) missing.push(f.km);
    if (missing.length) { flash(...missing); return; }
    const km = parseFloat(f.km.value);
    const p = { severity: draft.severity, km: isNaN(km) ? null : Math.round(km * 10) / 10, where: draft.where.trim(), bib: draft.bib.trim(), name: draft.name.trim(), race: draft.race, reporter: draft.reporter.trim(), desc: draft.desc.trim(), unit: draft.unit || null };
    if (draft.course) p.course = draft.course;
    if (draft.lat != null) { p.lat = draft.lat; p.lon = draft.lon; }
    if (draft.w3w) p.w3w = draft.w3w;
    if (editing) {
      const old = incidents.get(editing), patch = Object.assign({}, p);
      if (p.unit && p.unit !== old.unit && !(old.times || {}).dispatched) patch.times = { dispatched: now() };
      patchIncident(editing, patch, 'Updated' + (p.unit && p.unit !== old.unit ? ': ' + unitLabel(p.unit) + ' sent' : ''));
      if (p.unit && p.unit !== old.unit) patchUnit(p.unit, { status: 'tasked', incident: editing });
    } else {
      const id = newId();
      p.times = Object.assign({ call: now() }, p.unit ? { dispatched: now() } : {});
      patchIncident(id, p, `Logged: ${SEV[p.severity][0]}${p.km != null ? ', km ' + p.km : ''}${p.desc ? ', ' + p.desc.slice(0, 80) : ''}`);
      if (p.unit) patchUnit(p.unit, { status: 'tasked', incident: id });
    }
    draft = null; editing = null; renderForm();
  }

  // ---------- export ----------
  function exportCSV() {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
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
  // From Find: start a new incident at the casualty, with the course, km, coordinates and what3words.
  function newFromFind(r) {
    openForm({ course: r.course, km: Math.round(r.km * 10) / 10, lat: r.q && r.q.lat != null ? r.q.lat : r.lat, lon: r.q && r.q.lat != null ? r.q.lon : r.lon, w3w: r.casW3w || '', where: r.casW3w ? '///' + r.casW3w : '' });
  }
  // Rebuild only when the device locks or unlocks (the medical plan also calls this every minute when live).
  let authState = null;
  function onAuth() {
    const st = !!(window.MedPlan && window.MedPlan.unlocked());
    if (st === authState) return;
    authState = st;
    if (shown) { built = false; render(); sync(); }
  }
  addEventListener('online', flush);
  window.RaceControl = { onShow, onHide, onAuth, newFromFind, available: () => !!BASE };
})();
