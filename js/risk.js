// Risk tab: the race-morning dynamic risk assessment (Risk Management Plan, Appendix A), run at the morning weather
// meeting, before every start, at each Event HQ shift change and at any significant change.
// The form is filled in from the app's own weather, fire and trigger data, scored on the register's 5x5 matrix,
// signed off (then locked) and turned into Today's Safety Briefing for WhatsApp. Assessments are shared between
// race control devices through the Worker (POST and GET /rc/ra, tools/RACE_CONTROL.md) and kept on the device
// without signal. The register and the plan's trigger responses (data/register.enc.js) unlock with the medical password.
(function () {
  const C = window.GPT100_CONFIG, W = C.weather || {}, WX = window.GPT_WX, ENC = window.GPT100_REGISTER_ENC;
  const $ = id => document.getElementById(id);
  if (!$('riskBody')) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const Q = new URLSearchParams(location.search);
  const local = u => { try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(u).hostname); } catch (e) { return false; } };
  // As js/rc.js: a test link (?rcapi=) may only point at this computer. The demo keeps assessments on the device.
  const DEMO = !!(window.GPTDemo && window.GPTDemo.rcBase);
  const BASE = DEMO ? '' : ((Q.get('rcapi') && local(Q.get('rcapi')) ? Q.get('rcapi') : W.refreshUrl) || '').replace(/\/$/, '');
  const LSQ = 'gpt100_ra_queue', LSC = 'gpt100_ra_cache', LSO = 'gpt100_ra_open', LSN = 'gpt100_rc_name';
  const unlocked = () => !!(window.MedPlan && window.MedPlan.unlocked());
  const now = () => Date.now();

  // ---------- the register's matrix (GPT100 Risk Register, Section 4) ----------
  const LIK = ['A', 'B', 'C', 'D', 'E'];
  const LNAME = { A: 'Almost certain', B: 'Likely', C: 'Possible', D: 'Unlikely', E: 'Rare' };
  const CNAME = { 1: 'Insignificant (first aid only)', 2: 'Minor (medical treatment)', 3: 'Moderate (short hospitalisation)', 4: 'Major (long-term impairment)', 5: 'Critical (death)' };
  const MATRIX = { A: [11, 16, 20, 23, 25], B: [7, 12, 17, 21, 24], C: [4, 8, 13, 18, 22], D: [2, 5, 9, 14, 19], E: [1, 3, 6, 10, 15] };
  const BANDS = { A: 'MHHVV', B: 'MMHHV', C: 'LMMHH', D: 'LLMMH', E: 'LLLMM' };
  const BAND = {
    VH: ['Very High', 'Act immediately. Eliminate, substitute or engineer the risk out. PPE or procedures alone are not acceptable.'],
    H: ['High', 'Act before the event. Elimination, substitution or engineering required; procedures must not be the permanent control.'],
    M: ['Medium', 'Take reasonable steps. Pursue engineering or elimination; procedural controls are temporary only.'],
    L: ['Low', 'Monitor and reduce at source. Procedural controls may be permanent.']
  };
  function rate(c, l) {
    if (!c || !LIK.includes(l)) return null;
    const b = BANDS[l][c - 1], band = b === 'V' ? 'VH' : b;
    return { c: +c, l, score: MATRIX[l][c - 1], band };
  }
  const chip = (r, pre) => r ? `<span class="ra-band b-${r.band}" title="${esc(BAND[r.band][0])}: C${r.c} ${esc(CNAME[r.c])}, ${r.l} ${esc(LNAME[r.l])}">${pre ? esc(pre) + ' ' : ''}${r.band}(${r.score}) <small>C${r.c} · ${r.l}</small></span>` : '<span class="ra-band">Not scored</span>';

  // ---------- Appendix A ----------
  const KINDS = { morning: 'Race morning, before a start', shift: 'Event HQ shift change', change: 'Significant change', prior: '4:00pm day-prior review', other: 'Other review' };
  const STARTS = ['Stage 1 and GPT50k, Thu 6:00am, Mt Zero', 'GPT14k 6:30am and GPT6k 7:15am, Thu, Halls Gap', 'Stage 2, Fri 5:50am, Halls Gap',
    '100 Miler, Fri 8:00am, Mt Zero', 'Stage 3, Sat 6:00am, Mt William', 'Stage 4 6:30am and GPT33 waves from 6:45am, Sun, Griffin Fireline', 'Dunkeld 5km 7:30am and 2km 8:30am, Sun'];
  // Positions in place: gap marks the ones whose absence is the "response gap uncovered" trigger.
  const POSITIONS = [['lp', 'Staged Safety Officer pair at Longpoint East', 1], ['fw', 'Staged Safety Officer pair at First Wannon Camp', 1], ['sru', 'Secondary Response Unit', 1],
    ['pin', 'Safety Officers at the Pinnacles'], ['dials', 'Safety Officers at Seven Dials'], ['stock', 'Safety Officers at Stockyard Saddle'],
    ['mv', 'Traffic Marshals at both Mt Victory Rd crossings'], ['cp', 'Traffic Marshals at the car parks'], ['pim', 'Thursday: public information marshals at Wonderland Car Park and the Halls Gap park entry']];
  const COMMS = [['tested', 'Every station and hazard point tested in and out'], ['starlink', 'Starlink live at every station'], ['wa', 'WhatsApp groups live, and the Race Manager on duty known to every station']];
  const STATE = { yes: 'Confirmed', no: 'Not yet', na: 'Not needed' };
  // Toggle options: [value, label, tone]; good shows green, bad red once picked.
  const T_POS = [['yes', 'Confirmed', 'good'], ['no', 'Not yet', 'bad'], ['na', 'Not needed', '']];
  const T_YES_GOOD = [['yes', 'Yes', 'good'], ['no', 'No', 'bad']], T_YES_BAD = [['no', 'No', 'good'], ['yes', 'Yes', 'bad']];
  const T_TRIG = [['no', 'Not reached', ''], ['yes', 'Reached', 'bad']];
  const DECISIONS = { proceed: 'PROCEED', modify: 'MODIFY', delay: 'DELAY', suspend: 'SUSPEND', cancel: 'CANCEL' };
  // Triggers the app can't see, from the plan's Section 5, answered at the meeting.
  const MANUAL = [['missing', 'Missing runner'], ['gap', 'Response gap uncovered'], ['comms', 'Comms lost at a station'], ['medcap', 'Medical capability short']];
  // Register risks to look at again when a trigger is getting close or met.
  const TRIG_RISKS = { fire: [30, 35, 39], wind: [31, 32, 46], storm: [32, 31], heat: [12, 32, 15, 17], rain: [34, 32, 11], cold: [13, 32, 18], smoke: [35], cloud: [7, 18],
    missing: [7, 8], gap: [69], comms: [9, 63], medcap: [73] };
  const RANK = { nodata: 0, ok: 1, close: 2, met: 3 };
  const WORD = { met: 'Met', close: 'Getting close', ok: 'Clear', nodata: 'No data' };
  const REVIEW_H = 6;  // the plan: every 6 hours through the Miler

  // ---------- time (Melbourne) ----------
  const tf = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', minute: '2-digit', hour12: true });
  const df = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', day: 'numeric', month: 'short' });
  const hm = t => t ? tf.format(new Date(t)).replace(/\s/g, '').toLowerCase() : '';
  const dhm = t => t ? df.format(new Date(t)).replace(',', '') + ', ' + hm(t) : '';
  const evStart = WX ? WX.parseLocal(W.event.start) * 1000 : 0, evEnd = WX ? WX.parseLocal(W.event.end) * 1000 : 0;

  // ---------- state ----------
  let REG = null, regErr = '', all = new Map(), openId = null, since = 0, lastOk = 0, lastErr = '', shown = false, timer = null, held = false, flash = '';
  const pending = new Map();  // field path: timer, for typing
  try { const c = JSON.parse(localStorage.getItem(LSC) || '{}'); Object.values(c).forEach(a => a && a.id && all.set(a.id, a)); since = +localStorage.getItem(LSC + '_since') || 0; } catch (e) { }
  try { openId = localStorage.getItem(LSO) || null; } catch (e) { }
  const who = () => { try { return localStorage.getItem(LSN) || ''; } catch (e) { return ''; } };
  const saveCache = () => { try { localStorage.setItem(LSC, JSON.stringify(Object.fromEntries(all))); localStorage.setItem(LSC + '_since', String(since)); } catch (e) { } };
  let mem = [];
  const readQ = () => { try { const v = JSON.parse(localStorage.getItem(LSQ) || '[]'); mem = Array.isArray(v) ? v : []; } catch (e) { } return mem; };
  const saveQ = q => { mem = q; try { localStorage.setItem(LSQ, JSON.stringify(q)); } catch (e) { } };
  const newId = p => p + now().toString(36) + Math.random().toString(36).slice(2, 6);
  const merge = (a, b) => { const o = Object.assign({}, a); for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' ? merge(o[k], v) : v; return o; };
  const live = o => Object.entries(o || {}).filter(([, v]) => v);  // objects stand in for lists (the Worker keeps no arrays); null is deleted
  const signed = a => !!(a && a.signed && a.signed.at);
  const byTime = () => [...all.values()].filter(a => a && a.created).sort((a, b) => b.created - a.created);

  // ---------- the register (encrypted) ----------
  async function loadRegister() {
    if (REG || !ENC || !unlocked()) return REG;
    try {
      const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(window.MedPlan.pw()), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(ENC.salt), iterations: ENC.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      REG = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(ENC.iv) }, key, b64d(ENC.ct))));
      REG.byN = Object.fromEntries(REG.risks.map(r => [r.n, r]));
      REG.trig = Object.fromEntries(REG.triggers.map(t => [t.key, t]));
      regErr = '';
    } catch (e) { regErr = 'The risk register didn\'t unlock with this device\'s medical password. Lock and unlock the Medical tab with the current password.'; }
    return REG;
  }

  // ---------- server ----------
  async function api(path, body) {
    const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: Object.assign({ 'X-RC-Password': window.MedPlan.pw() || '' }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'HTTP ' + r.status); e.status = r.status; e.body = j; throw e; }
    return j;
  }
  const ready = () => BASE && unlocked() && window.MedPlan.pw();
  // Every change is applied here at once, kept in a queue on the device, and sent in order when there's signal.
  function patch(id, p, note) {
    const cur = all.get(id) || { id, created: now() };
    all.set(id, merge(cur, p)); saveCache();
    if (BASE) { saveQ(readQ().concat({ qid: newId('q'), id, patch: p, note, who: who() })); flush(); }
    status();
  }
  let flushing = false;
  async function flush() {
    if (flushing || !readQ().length || !ready()) return;
    flushing = true;
    let x;
    try {
      while ((x = readQ()[0])) {
        try { const j = await api('/rc/ra', { id: x.id, patch: x.patch, note: x.note, who: x.who }); keep(j.ra); }
        catch (e) {
          if (e.status === 409 && e.body && e.body.ra) { keep(e.body.ra); flash = 'Someone signed this assessment off on another device, so it\'s locked. Your last change wasn\'t saved.'; }
          else if (e.status !== 400 && e.status !== 413) throw e;
        }
        saveQ(readQ().filter(y => y.qid !== x.qid));
      }
      lastErr = '';
    } catch (e) { lastErr = e.status === 404 ? 'The Worker needs the latest code for risk assessments (tools/RACE_CONTROL.md, step 1). Saved on this device until then.' : e.message; }
    flushing = false;
    status();
  }
  // A copy from the server, with this device's changes still waiting to send laid on top.
  function keep(a) {
    if (!a || !a.id) return;
    if (a.deleted) { all.delete(a.id); if (openId === a.id) openId = null; return; }  // a deleted draft goes from every device
    let m = a; readQ().filter(x => x.id === a.id).forEach(x => { m = merge(m, x.patch); });
    all.set(a.id, m);
  }
  async function sync() {
    if (!ready()) return status();
    try {
      await flush();
      const j = await api('/rc/ra?since=' + since);
      (j.ra || []).forEach(keep);
      since = j.now - 3000; lastOk = now(); if (!readQ().length) lastErr = '';
      saveCache();
      if ((j.ra || []).length) render(); else status();
    } catch (e) { lastErr = e.status === 404 ? 'The Worker needs the latest code for risk assessments (tools/RACE_CONTROL.md, step 1). Saved on this device until then.' : e.message; status(); }
  }

  // ---------- what the app knows now ----------
  let wx = null;
  async function weather() { try { wx = window.WeatherTab ? await window.WeatherTab.peek() : null; } catch (e) { } return wx; }
  function obsText() {
    const o = window.WeatherTab && window.WeatherTab.peekObs && window.WeatherTab.peekObs();
    const st = o && o.stations ? Object.values(o.stations).sort((a, b) => a.fromCourseKm - b.fromCourseKm).slice(0, 7) : [];
    if (!st.length) return 'BOM observations not loaded yet.';
    return st.map(s => { const r = s.series[s.series.length - 1] || {}; return `${s.name} ${WX.fmtTime(r.t, false)}: ${r.temp != null ? r.temp.toFixed(1) + '°C' : 'n/a'}, feels like ${r.at != null ? r.at.toFixed(1) + '°C' : 'n/a'}, wind ${r.wind != null ? Math.round(r.wind) : '-'} gusting ${r.gust != null ? Math.round(r.gust) : '-'} km/h${r.dir ? ' ' + r.dir : ''}, rain since 9am ${r.rain != null ? r.rain + ' mm' : '-'}`; }).join('\n');
  }
  function fireText(L) {
    if (!L) return 'Weather data not loaded.';
    const out = [];
    const fd = L.fire && L.fire.days ? L.fire.days.slice(0, 4) : [];
    if (fd.length) out.push('CFA: ' + fd.map(d => WX.fmtDay(WX.parseLocal(d.date)) + ' ' + Object.entries(d.districts).map(([k, r]) => `${k} ${WX.titleCase(r.rating || 'n/a')}${r.tfb ? ' TOTAL FIRE BAN' : ''}`).join(', ')).join('; '));
    else out.push('CFA ratings not coming through: check cfa.vic.gov.au.');
    const E = L.epa;
    if (E && E.sites && E.sites.length) out.push('EPA AirWatch: ' + E.sites.map(x => `${x.name} PM2.5 ${x.pm25 != null ? Math.round(x.pm25) + ' ' + x.unit : 'n/a'}${x.advice ? ' (' + x.advice + ')' : ''}`).join('; '));
    else out.push('EPA AirWatch: not in the app (check epa.vic.gov.au/airwatch).');
    const inc = L.incidents && L.incidents.items ? L.incidents.items.filter(x => x.kind === 'fire' || x.kind === 'burn' || x.kind === 'warning') : null;
    out.push(inc ? (inc.length ? 'VicEmergency: ' + inc.map(x => `${x.title || x.name} ${x.dist} km from the course${x.location ? ' (' + x.location + ')' : ''}`).join('; ') : `VicEmergency: nothing within ${W.incidentKm} km of the course.`) : 'VicEmergency not coming through: check emergency.vic.gov.au.');
    return out.join('\n');
  }
  const warnList = L => L && L.warnings && L.warnings.items ? L.warnings.items.filter(w => w.relevant).map(w => w.title) : null;
  const fireList = L => L && L.incidents && L.incidents.items ? L.incidents.items.filter(x => x.kind === 'fire' || x.kind === 'burn').map(x => (x.title || x.name) + ' ' + (x.location || '')) : [];
  // What the meeting saw, kept with the assessment (the record) and used to spot what has changed since.
  function snapshot(L) {
    const s = { at: now(), wxAt: L && L.updated ? L.updated * 1000 : 0, scopes: {}, warnings: (warnList(L) || []).join('\n'), fires: fireList(L).join('\n'), fire: fireText(L), obs: obsText() };
    if (L && L.triggers) for (const [sk, sc] of Object.entries(L.triggers)) {
      s.scopes[sk] = { label: sc.label, status: sc.status, t: {} };
      for (const k of WX.ORDER) { const r = sc.triggers[k]; if (r) s.scopes[sk].t[k] = { status: r.status, text: String(r.text || '').slice(0, 400), where: whereOf(r, k) }; }
    }
    return s;
  }
  function whereOf(r, k) { const w = r.worst; return w && w.at && r.status !== 'nodata' ? (w.km != null ? 'km ' + w.km + (w.place ? ' ' + w.place : '') + (k === 'fire' ? '' : ', ') : '') + (k === 'fire' ? '' : WX.fmtTime(w.at)) + (w.runners ? ', runners on course' : '') : ''; }
  // What has changed between two snapshots: triggers that moved, new BOM warnings, new fires and burns.
  function changes(from, to) {
    const out = [];
    if (!from || !to) return out;
    for (const sk of Object.keys(to.scopes || {})) {
      const a = (from.scopes || {})[sk], b = to.scopes[sk];
      if (!a) continue;
      for (const k of WX.ORDER) {
        const x = a.t[k], y = b.t[k];
        if (!x || !y || x.status === y.status || y.status === 'nodata' || x.status === 'nodata') continue;
        out.push({ worse: RANK[y.status] > RANK[x.status], text: `${b.label}: ${WX.LABELS[k]} now ${WORD[y.status]} (was ${WORD[x.status]})${y.text && y.status !== 'ok' ? '. ' + y.text : ''}` });
      }
    }
    const had = new Set(String(from.warnings || '').split('\n'));
    String(to.warnings || '').split('\n').filter(w => w && !had.has(w)).forEach(w => out.push({ worse: true, text: 'New BOM warning: ' + w }));
    const fh = new Set(String(from.fires || '').split('\n'));
    String(to.fires || '').split('\n').filter(f => f && !fh.has(f)).forEach(f => out.push({ worse: true, text: 'New on VicEmergency: ' + f }));
    return out;
  }

  // ---------- needs review? ----------
  // The latest signed-off assessment, measured against the weather now and the 6-hourly review in the plan.
  function reviewState() {
    const a = byTime().find(signed);
    if (!a) return null;
    const rv = live(a.reviews).map(([, r]) => r).sort((x, y) => y.at - x.at)[0];
    const base = rv && rv.snap ? rv.snap : a.snap, from = rv ? rv.at : a.signed.at;
    const reasons = wx && wx.triggers ? changes(base, snapshot(wx)).filter(c => c.worse).map(c => c.text) : [];
    const due = from + REVIEW_H * 3600e3, inEvent = now() >= evStart - 12 * 3600e3 && now() <= evEnd;
    if (inEvent && now() > due) reasons.unshift(`The ${REVIEW_H}-hourly review was due by ${dhm(due)} (Risk Management Plan, Section 5).`);
    return { a, from, due: inEvent ? due : null, reasons };
  }
  function badge() {
    const b = document.querySelector('.tab-btn[data-tab="risk"]');
    const s = unlocked() ? reviewState() : null;
    if (b) b.classList.toggle('ra-due', !!(s && s.reasons.length));
  }

  // ---------- a new assessment ----------
  async function create(kind) {
    const L = await weather();
    const prev = byTime().find(signed);
    const id = newId('r');
    const p = { created: now(), kind: kind || 'morning', by: { em: '', md: '', cm: '', others: '' }, snap: snapshot(L), prev: prev ? prev.id : '' };
    // Score the register risks that today's triggers point at, starting from their existing score (raised a step when the trigger is met).
    await loadRegister();
    if (REG && L && L.triggers && L.triggers.next48) {
      const risks = {};
      for (const k of WX.ORDER) {
        const st = (L.triggers.next48.triggers[k] || {}).status;
        if (st !== 'close' && st !== 'met') continue;
        (TRIG_RISKS[k] || []).forEach(n => { const r = REG.byN[n]; if (!r || risks[n]) return; const li = LIK.indexOf(r.existing.l); risks[n] = { c: r.existing.c, l: st === 'met' && li > 0 ? LIK[li - 1] : r.existing.l, why: WX.LABELS[k] + ' ' + WORD[st].toLowerCase() }; });
      }
      if (Object.keys(risks).length) p.risks = risks;
    }
    patch(id, p, 'Risk assessment started: ' + KINDS[p.kind]);
    open(id);
  }
  function open(id) { openId = id; try { if (id) localStorage.setItem(LSO, id); else localStorage.removeItem(LSO); } catch (e) { } render(); window.scrollTo(0, 0); }

  // ---------- rendering ----------
  function status() {
    const el = $('raSync'); if (!el) return;
    const q = readQ().length;
    let cls = 'warn', t;
    if (!BASE) t = DEMO ? 'Demo: saved on this device only' : 'Saved on this device only (no Worker set)';
    else if (lastErr) { cls = 'bad'; t = lastErr + (q ? ` ${q} change${q > 1 ? 's' : ''} waiting to send.` : ''); }
    else if (q) t = `${q} change${q > 1 ? 's' : ''} waiting to send`;
    else if (lastOk) { cls = 'ok'; t = 'Live, shared with race control'; }
    else t = 'Connecting…';
    el.className = 'rc-sync ' + cls; el.textContent = t;
  }
  function render() {
    const B = $('riskBody');
    if (!unlocked()) {
      B.innerHTML = '<div class="rc-msg"><h2>Risk assessment</h2><p>The risk assessment and the risk register use the medical password. Unlock the Medical tab on this device, then come back.</p><p><button class="btn primary" id="raGoMed" type="button">Go to Medical</button></p></div>';
      $('raGoMed').addEventListener('click', () => { location.hash = 'medical'; });
      return;
    }
    if (B.contains(document.activeElement) && document.activeElement.matches('input[type=text],textarea,input[type=time],input:not([type])')) { held = true; return; }
    held = false;
    const a = openId && all.get(openId);
    B.innerHTML = `<div class="ra-top"><h2>Risk assessment</h2><span id="raSync" class="rc-sync"></span>
      <label class="rc-who">You <input id="raWho" type="text" maxlength="40" placeholder="Your name" value="${esc(who())}"></label></div>
      ${regErr ? `<p class="notice warn">${esc(regErr)}</p>` : ''}
      ${flash ? `<p class="notice warn">${esc(flash)}</p>` : ''}
      <div id="raMain">${a ? formHTML(a) : listHTML()}</div>`;
    flash = '';
    $('raWho').addEventListener('change', e => { try { localStorage.setItem(LSN, e.target.value.trim()); } catch (x) { } });
    bind(a);
    status(); badge();
  }

  function listHTML() {
    const s = reviewState(), list = byTime();
    let h = '';
    if (s && s.reasons.length) h += `<div class="notice danger ra-review"><b>Review the ${esc(KINDS[s.a.kind] || 'assessment')} of ${esc(dhm(s.a.signed.at))}</b><ul>${s.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="rc-actions"><button class="btn small primary" data-act="new" data-kind="change" type="button">New assessment</button><button class="btn small" data-act="reviewed" data-id="${esc(s.a.id)}" type="button">Reviewed, no change</button></div></div>`;
    else if (s) h += `<p class="ra-ok">The ${esc(dhm(s.a.signed.at))} assessment still stands${s.due ? `. Next review due by ${esc(dhm(s.due))}` : ''}.</p>`;
    h += `<div class="ra-new"><h3>Start an assessment</h3><p class="muted">Fills in today's triggers, fire danger, BOM warnings and observations from the app, and the register risks they point at. Ten minutes before every start, at each Event HQ shift change, and at any significant change.</p>
      <div class="rc-actions">${Object.entries(KINDS).map(([k, v]) => `<button class="btn small${k === 'morning' ? ' primary' : ''}" data-act="new" data-kind="${k}" type="button">${esc(v)}</button>`).join('')}</div></div>`;
    // Open actions across every assessment.
    const acts = list.flatMap(a => live(a.actions).filter(([, x]) => !x.done && x.what).map(([k, x]) => ({ a, k, x })));
    h += `<h3 class="ra-h">Open actions</h3>` + (acts.length ? acts.map(({ a, k, x }) => actionRow(a, k, x, true)).join('') : '<p class="rc-empty">No open actions.</p>');
    h += `<h3 class="ra-h">Assessments</h3>` + (list.length ? list.map(a => {
      const d = a.decision && a.decision.d;
      return `<button class="ra-item" data-act="open" data-id="${esc(a.id)}" type="button"><b>${esc(dhm(a.created))}</b> <span>${esc(KINDS[a.kind] || '')}${a.forWhat ? ': ' + esc(a.forWhat) : ''}</span>
        ${d ? `<span class="ra-dec d-${d}">${DECISIONS[d]}</span>` : ''}${signed(a) ? `<span class="ra-signed">Signed off ${esc(hm(a.signed.at))}${a.signed.by ? ' by ' + esc(a.signed.by) : ''}</span>` : '<span class="ra-draft">Draft</span>'}</button>`;
    }).join('') : '<p class="rc-empty">No assessments yet.</p>');
    if (list.length) h += '<p><button class="btn small" data-act="export" type="button">Export (spreadsheet)</button></p>';
    if (REG) h += `<p class="wx-note">Scored on the ${esc(REG.register.title)} v${esc(REG.register.version)} (${esc(REG.register.issued)}, ${REG.risks.length} risks) matrix, with the ${esc(REG.plan.title)} v${esc(REG.plan.version)} triggers and responses.</p>`;
    return h;
  }

  // One field: data-f is its path in the assessment, so any input saves itself.
  const val = (a, path) => path.split('.').reduce((o, k) => o == null ? o : o[k], a);
  const txt = (a, path, ph, rows) => `<textarea data-f="${path}" rows="${rows || 2}" placeholder="${esc(ph || '')}">${esc(val(a, path) || '')}</textarea>`;
  const inp = (a, path, ph, list) => `<input type="text" data-f="${path}" placeholder="${esc(ph || '')}" value="${esc(val(a, path) || '')}"${list ? ` list="${list}"` : ''}>`;
  function tri(a, path, opts) {
    const v = val(a, path) || '';
    return `<span class="ra-tri">${(opts || T_POS).map(([k, l, tone]) => `<label class="${tone}"><input type="radio" name="${esc(path)}" data-f="${path}" value="${k}"${v === k ? ' checked' : ''}>${esc(l)}</label>`).join('')}</span>`;
  }
  const sec = (n, title, body, hint) => `<section class="ra-sec"><h3><span>${n}</span>${esc(title)}</h3>${hint ? `<p class="ra-hint">${esc(hint)}</p>` : ''}${body}</section>`;
  const auto = (t, at) => `<div class="ra-auto"><div class="ra-auto-h">From the app${at ? ', ' + esc(dhm(at)) : ''}</div><pre>${esc(t)}</pre></div>`;

  function formHTML(a) {
    // The form shows what was captured (on starting, on "Update from the app" and on sign-off), so the record
    // matches what the meeting saw.
    const S = a.snap || {}, prev = a.prev && all.get(a.prev);
    const newer = !signed(a) && wx && wx.updated && wx.updated * 1000 > (S.wxAt || 0) + 60e3;
    let h = `<div class="ra-bar"><button class="btn small" data-act="close" type="button">All assessments</button>
      ${!signed(a) ? '<button class="btn small" data-act="refresh" type="button">Update from the app</button>' : ''}
      ${newer ? `<span class="ra-newer">Newer weather is in (${esc(dhm(wx.updated * 1000))})</span>` : ''}
      ${signed(a) ? `<span class="ra-lock">Signed off ${esc(dhm(a.signed.at))}${a.signed.by ? ' by ' + esc(a.signed.by) : ''}. Locked: only actions can change.</span>` : '<span class="ra-draft">Draft, saves as you type</span>'}</div>`;
    h += `<fieldset class="ra-form"${signed(a) ? ' disabled' : ''}>`;
    h += sec(1, 'Event, date and time', `<div class="rc-grid"><label>Review<select data-f="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${a.kind === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label>For which start or shift ${inp(a, 'forWhat', 'e.g. Stage 3, Sat 6:00am, Mt William', 'raStarts')}</label><label>Started<input type="text" value="${esc(dhm(a.created))}" disabled></label></div>
      <datalist id="raStarts">${STARTS.map(s => `<option value="${esc(s)}">`).join('')}</datalist>`);
    h += sec(2, 'Completed by', `<div class="rc-grid"><label>Event Manager or Deputy ${inp(a, 'by.em', 'Name')}</label><label>Medical Director ${inp(a, 'by.md', 'Name')}</label><label>Course Manager ${inp(a, 'by.cm', 'Name')}</label><label>Others present ${inp(a, 'by.others', 'Names')}</label></div>`);
    h += sec(3, 'Current weather observations', auto(S.obs || 'Not loaded.', S.at) + txt(a, 'n.obs', 'What people are seeing: Mt Zero, the Mt Difficult ridgeline, Halls Gap, Mt William, the plateau and Dunkeld (wind, rain, fog, storms)'), 'Temperature, wind, rain, fog and storm activity at Mt Zero, the Mt Difficult ridgeline, Halls Gap, Mt William, the plateau and Dunkeld.');
    // Forecast changes since the last signed-off assessment.
    const ch = prev && prev.snap ? changes(prev.snap, S) : null;
    h += sec(4, 'Forecast changes since last review', (prev ? `<p class="ra-hint">Since the ${esc(KINDS[prev.kind] || 'review')} of ${esc(dhm(prev.signed ? prev.signed.at : prev.created))}:</p>` +
      (ch.length ? '<ul class="ra-changes">' + ch.map(c => `<li class="${c.worse ? 'worse' : 'better'}">${esc(c.text)}</li>`).join('') + '</ul>' : '<p class="ra-ok">No trigger has changed.</p>') : '<p class="ra-hint">No earlier signed-off assessment to compare with.</p>') +
      triggerTable(S) + txt(a, 'n.forecast', 'Anything else in the forecast: wind and cold on the ridges overnight in particular'), 'Checked against the Section 5 triggers.');
    h += sec(5, 'Fire danger and air quality today', auto(S.fire || 'Not loaded.', S.at) + txt(a, 'n.fire', 'Notes'), 'Fire danger rating for the Wimmera and South West districts, Total Fire Ban status, EPA AirWatch, VicEmergency warnings.');
    h += sec(6, 'Course condition changes', txt(a, 'n.course', 'Fallen limbs or trees, creek lines running, track damage, rock sections wet; Parks Victoria advice', 3));
    h += sec(7, 'Positions in place', '<div class="ra-checks">' + POSITIONS.map(([k, l, gap]) => `<div class="ra-check"><span>${esc(l)}${gap ? ' <em class="ra-gap" title="Not in place is the response gap trigger">gap trigger</em>' : ''}</span>${tri(a, 'pos.' + k)}</div>`).join('') + '</div>' + txt(a, 'n.pos', 'Notes'),
      'All confirmed in position and tested before the first runner enters their section.');
    h += sec(8, 'Staffing changes', `<div class="ra-checks"><div class="ra-check"><span>Any load-bearing position unfilled?</span>${tri(a, 'staff.unfilled', T_YES_BAD)}</div>
      <div class="ra-check"><span>Deputy Event Manager on duty and briefed?</span>${tri(a, 'staff.deputy', T_YES_GOOD)}</div></div>` + txt(a, 'n.staffing', 'Gaps against the roster and the medical roster, and how they are covered'));
    h += sec(9, 'Comms check', '<div class="ra-checks">' + COMMS.map(([k, l]) => `<div class="ra-check"><span>${esc(l)}</span>${tri(a, 'comms.' + k)}</div>`).join('') + `</div><div class="rc-grid"><label>Next Event HQ move ${inp(a, 'hqMove', 'e.g. Jimmy Creek, Fri 8:00pm')}</label></div>`);
    h += sec(10, 'New hazards identified', hazardsHTML(a));
    h += sec(11, 'Triggers reached?', reachedHTML(a, S), 'Which, if any, and the required response (Risk Management Plan, Section 5).');
    h += sec(12, 'Register risks reviewed today', risksHTML(a), 'Today\'s likelihood and consequence for the risks the triggers point at, and any others the meeting raises.');
    h += sec(13, 'Today\'s top 3 hazards for the safety briefing', `<div class="ra-top3">${[1, 2, 3].map(i => `<label>${i} ${inp(a, 'top.' + i, '')}</label>`).join('')}</div><button class="btn small" data-act="suggest" type="button">Suggest from today's scores</button>`);
    h += sec(14, 'Decision', `<div class="ra-decs">${Object.entries(DECISIONS).map(([k, l]) => `<label class="d-${k}"><input type="radio" name="dec" data-f="decision.d" value="${k}"${a.decision && a.decision.d === k ? ' checked' : ''}>${l}</label>`).join('')}</div>
      ${txt(a, 'decision.detail', 'Detail: what is modified, delayed to when, suspended where')}`, 'PROCEED, MODIFY (detail), DELAY, SUSPEND or CANCEL. The Event Manager or Deputy decides, after the Medical Director and Course Manager.');
    h += '</fieldset>';
    h += sec(15, 'Actions required', actionsHTML(a), 'No action leaves the room without a name on it: who, by when, how.');
    h += `<fieldset class="ra-form"${signed(a) ? ' disabled' : ''}>`;
    h += sec(16, 'Comms', `<label class="rc-full">Comms to teams (crew and volunteer WhatsApp groups), and who sends it ${txt(a, 'commsTeams', '')}</label>
      <label class="rc-full">Comms to runners, public and partners (approved by the Event Manager; Parks Victoria told of any course or schedule change) ${txt(a, 'commsPublic', '')}</label>
      <div class="rc-grid"><label>Minutes taken by ${inp(a, 'minutes', 'Name')}</label></div>`);
    h += '</fieldset>';
    h += sec(17, 'Sign off', signHTML(a));
    h += `<section class="ra-sec"><h3>Today's Safety Briefing</h3><p class="ra-hint">For the crew and volunteer WhatsApp groups. Edit it in WhatsApp before sending if needed.</p><pre class="ra-brief" id="raBrief">${esc(briefing(a))}</pre>
      <div class="rc-actions"><button class="btn small primary" data-act="wa" type="button">WhatsApp</button><button class="btn small" data-act="copy" data-what="brief" type="button">Copy</button><button class="btn small" data-act="copy" data-what="record" type="button">Copy the full record</button><button class="btn small" data-act="print" type="button">Print</button></div></section>`;
    if (!signed(a)) h += '<p><button class="btn small ra-del" data-act="delete" type="button">Delete this draft</button></p>';
    return h;
  }
  function triggerTable(S) {
    const sc = S.scopes || {};
    if (!Object.keys(sc).length) return '<p class="notice warn">The weather triggers haven\'t loaded. Check the Weather tab.</p>';
    return '<div class="wx-scroll"><table class="ra-trig"><thead><tr><th></th>' + Object.values(sc).map(s => `<th>${esc(s.label)}</th>`).join('') + '</tr></thead><tbody>' +
      WX.ORDER.map(k => `<tr><td>${esc(WX.LABELS[k])}</td>` + Object.values(sc).map(s => { const r = s.t[k] || { status: 'nodata' }; return `<td><span class="wx-pill st-${r.status}">${WORD[r.status]}</span>${r.status === 'close' || r.status === 'met' ? `<div class="ra-tt">${esc(r.text)}${r.where ? ' (' + esc(r.where) + ')' : ''}</div>` : ''}</td>`; }).join('') + '</tr>').join('') + '</tbody></table></div>';
  }
  // Every trigger reached: the weather ones from the app (next 48 hours), the others from the meeting.
  function reachedList(a, S) {
    const n = (S.scopes || {}).next48, out = [];
    if (n) for (const k of WX.ORDER) { const r = n.t[k]; if (r && (r.status === 'met' || r.status === 'close') && k !== 'cloud') out.push({ key: k, label: WX.LABELS[k], status: r.status, text: r.text, where: r.where }); }
    const pos = a.pos || {}, cm = a.comms || {};
    const auto = { gap: POSITIONS.filter(p => p[2] && pos[p[0]] === 'no').map(p => p[1] + ' not in place').join('; '), comms: COMMS.filter(c => cm[c[0]] === 'no').map(c => c[1] + ': not yet').join('; ') };
    for (const [k, l] of MANUAL) { const v = (a.trig || {})[k]; if (v === 'yes' || auto[k]) out.push({ key: k, label: l, status: 'met', text: auto[k] || 'Reached (meeting)' }); }
    return out;
  }
  function reachedHTML(a, S) {
    const list = reachedList(a, S);
    let h = '<div class="ra-checks">' + MANUAL.map(([k, l]) => `<div class="ra-check"><span>${esc(l)}${REG && REG.trig[k] ? `<br><small class="muted">${esc(REG.trig[k].trigger)}</small>` : ''}</span>${tri(a, 'trig.' + k, T_TRIG)}</div>`).join('') + '</div>';
    h += list.length ? list.map(r => {
      const t = REG && REG.trig[r.key];
      return `<div class="ra-reached st-${r.status}"><b>${esc(r.label)}: ${r.status === 'met' ? 'MET' : 'getting close'}</b>${r.text ? `<p>${esc(r.text)}${r.where ? ' (' + esc(r.where) + ')' : ''}</p>` : ''}
        ${t ? `<p class="ra-resp"><b>Pre-agreed response:</b> ${esc(t.response)}</p>` : ''}${txt(a, 'resp.' + r.key, 'What we are doing about it')}</div>`;
    }).join('') : '<p class="ra-ok">No trigger reached or getting close in the next 48 hours.</p>';
    return h;
  }
  function risksHTML(a) {
    if (!REG) return '<p class="notice warn">The register is still unlocking…</p>';
    const rows = live(a.risks).map(([n, x]) => ({ n: +n, x, r: REG.byN[n] })).filter(o => o.r).sort((p, q) => ((rate(q.x.c, q.x.l) || {}).score || 0) - ((rate(p.x.c, p.x.l) || {}).score || 0));
    let h = rows.map(({ n, x, r }) => {
      const today = rate(x.c, x.l);
      return `<div class="ra-risk"><div class="ra-risk-top"><b>${n}. ${esc(r.name)}</b><span class="muted">${esc(r.cat)} · ${esc(r.owner)}</span>${x.why ? `<span class="chip">${esc(x.why)}</span>` : ''}</div>
        <div class="ra-scores">${chip(rate(r.existing.c, r.existing.l), 'Existing')} ${chip(rate(r.target.c, r.target.l), 'Target')} <span class="ra-today">Today ${chip(today)}</span></div>
        <div class="rc-grid"><label>Consequence<select data-f="risks.${n}.c">${[1, 2, 3, 4, 5].map(c => `<option value="${c}"${+x.c === c ? ' selected' : ''}>${c} ${esc(CNAME[c])}</option>`).join('')}</select></label>
        <label>Likelihood<select data-f="risks.${n}.l">${LIK.map(l => `<option value="${l}"${x.l === l ? ' selected' : ''}>${l} ${esc(LNAME[l])}</option>`).join('')}</select></label></div>
        ${today ? `<p class="ra-hint b-${today.band}-t">${esc(BAND[today.band][0])}: ${esc(BAND[today.band][1])}</p>` : ''}
        ${txt(a, 'risks.' + n + '.note', 'Controls in place today, and any change from the register')}
        <details><summary>Register controls (${r.controls.length})</summary><p class="muted">${esc(r.desc)}</p><ul>${r.controls.map(c => `<li>${esc(c)}</li>`).join('')}</ul>${r.sop ? `<p class="muted">Covered by ${esc(r.sop)}</p>` : ''}</details>
        <button class="btn small ra-x" data-act="unrisk" data-n="${n}" type="button">Remove</button></div>`;
    }).join('');
    if (!rows.length) h += '<p class="rc-empty">No register risks added yet.</p>';
    // Suggestions from what's reached, then any risk by number or name.
    const have = new Set(rows.map(o => o.n)), reached = reachedList(a, a.snap || {});
    const sug = [...new Set(reached.flatMap(r => TRIG_RISKS[r.key] || []))].filter(n => !have.has(n) && REG.byN[n]);
    if (sug.length) h += '<p class="ra-hint">Suggested by the triggers: ' + sug.map(n => `<button class="btn small" data-act="addrisk" data-n="${n}" type="button">${n}. ${esc(REG.byN[n].name)}</button>`).join(' ') + '</p>';
    h += `<div class="ra-add"><input type="text" id="raRiskQ" list="raRisks" placeholder="Add a risk: number or name"><button class="btn small" data-act="addrisk" type="button">Add</button>
      <datalist id="raRisks">${REG.risks.map(r => `<option value="${r.n}. ${esc(r.name)}">`).join('')}</datalist></div>`;
    return h;
  }
  function hazardsHTML(a) {
    const rows = live(a.hazards);
    return rows.map(([k, x]) => {
      const r = rate(x.c, x.l);
      return `<div class="ra-risk"><div class="rc-grid"><label>Hazard ${inp(a, 'hazards.' + k + '.what', 'What')}</label><label>Where and when ${inp(a, 'hazards.' + k + '.where', 'e.g. km 79 to 100, overnight')}</label><label>Owner ${inp(a, 'hazards.' + k + '.owner', 'Role')}</label></div>
        <div class="rc-grid"><label>Consequence<select data-f="hazards.${k}.c"><option value="">Pick</option>${[1, 2, 3, 4, 5].map(c => `<option value="${c}"${+x.c === c ? ' selected' : ''}>${c} ${esc(CNAME[c])}</option>`).join('')}</select></label>
        <label>Likelihood<select data-f="hazards.${k}.l"><option value="">Pick</option>${LIK.map(l => `<option value="${l}"${x.l === l ? ' selected' : ''}>${l} ${esc(LNAME[l])}</option>`).join('')}</select></label><div class="ra-today">Today ${chip(r)}</div></div>
        ${r ? `<p class="ra-hint b-${r.band}-t">${esc(BAND[r.band][0])}: ${esc(BAND[r.band][1])}</p>` : ''}
        ${txt(a, 'hazards.' + k + '.controls', 'Controls')}<button class="btn small ra-rm" data-act="unhaz" data-k="${k}" type="button">Remove</button></div>`;
    }).join('') + `<button class="btn small" data-act="addhaz" type="button">Add a hazard</button>`;
  }
  function actionRow(a, k, x, withFrom) {
    return `<div class="ra-act${x.done ? ' done' : ''}"><label class="ra-done"><input type="checkbox" data-act="done" data-id="${esc(a.id)}" data-k="${k}"${x.done ? ' checked' : ''}></label>
      <div><b>${esc(x.what || 'Action')}</b><span class="muted">${x.who ? ' · ' + esc(x.who) : ''}${x.by ? ' · by ' + esc(x.by) : ''}${x.how ? ' · ' + esc(x.how) : ''}</span>
      ${x.done ? `<span class="ra-signed">Done ${esc(hm(x.doneAt))}${x.doneBy ? ' by ' + esc(x.doneBy) : ''}</span>` : ''}${withFrom ? `<br><small class="muted">From the ${esc(dhm(a.created))} assessment</small>` : ''}</div></div>`;
  }
  function actionsHTML(a) {
    const rows = live(a.actions);
    return rows.map(([k, x]) => signed(a) || x.done ? actionRow(a, k, x) :
      `<div class="ra-risk"><div class="rc-grid"><label>Action ${inp(a, 'actions.' + k + '.what', 'What')}</label><label>Who ${inp(a, 'actions.' + k + '.who', 'Name or role')}</label><label>By when ${inp(a, 'actions.' + k + '.by', 'e.g. 7:30am')}</label><label>How ${inp(a, 'actions.' + k + '.how', 'Mechanism: phone, WhatsApp, in person')}</label></div>
       <label class="ra-inline"><input type="checkbox" data-act="done" data-id="${esc(a.id)}" data-k="${k}"> Done</label> <button class="btn small ra-rm" data-act="unact" data-k="${k}" type="button">Remove</button></div>`).join('') +
      (rows.length ? '' : '<p class="rc-empty">No actions yet.</p>') + '<button class="btn small" data-act="addact" type="button">Add an action</button>';
  }
  function signHTML(a) {
    if (signed(a)) return `<p><b>Signed off ${esc(dhm(a.signed.at))}</b> by ${esc(a.signed.by || '')}${a.signed.names ? '. Present and agreed: ' + esc(a.signed.names) : ''}.</p>` +
      live(a.reviews).map(([, r]) => `<p class="muted">Reviewed ${esc(dhm(r.at))}${r.who ? ' by ' + esc(r.who) : ''}: ${esc(r.text || 'no change')}</p>`).join('');
    const miss = [];
    if (!(a.by && a.by.em)) miss.push('the Event Manager or Deputy (section 2)');
    if (!(a.decision && a.decision.d)) miss.push('a decision (section 14)');
    if (a.decision && a.decision.d && a.decision.d !== 'proceed' && !a.decision.detail) miss.push('the decision\'s detail');
    if (![1, 2, 3].some(i => a.top && a.top[i])) miss.push('the top hazards (section 13)');
    return (miss.length ? `<p class="ra-hint">Before signing off, add ${esc(miss.join(', '))}.</p>` : '<p class="ra-hint">Signing off records the time and the weather as it stands, and locks the assessment. Actions can still be ticked off.</p>') +
      `<button class="btn primary" data-act="sign" type="button"${miss.length ? ' disabled' : ''}>Sign off</button>`;
  }

  // ---------- the outputs ----------
  function briefing(a) {
    const S = a.snap || {}, d = a.decision || {}, out = [`*GPT100 Today's Safety Briefing*`, `${dhm(signed(a) ? a.signed.at : a.created)} · ${KINDS[a.kind] || ''}${a.forWhat ? ': ' + a.forWhat : ''}`, ''];
    out.push(`*Decision: ${d.d ? DECISIONS[d.d] : 'not made yet'}*` + (d.detail ? '\n' + d.detail : ''));
    const top = [1, 2, 3].map(i => a.top && a.top[i]).filter(Boolean);
    if (top.length) out.push('', '*Top hazards today*', ...top.map((t, i) => `${i + 1}. ${t}`));
    const R = reachedList(a, S);
    out.push('', '*Triggers*', R.length ? R.map(r => `${r.label} ${r.status === 'met' ? 'MET' : 'getting close'}${r.text ? ': ' + r.text : ''}${a.resp && a.resp[r.key] ? '\nResponse: ' + a.resp[r.key] : ''}`).join('\n') : 'No trigger reached or getting close in the next 48 hours.');
    if (a.n && a.n.course) out.push('', '*Course*', a.n.course);
    const acts = live(a.actions).map(([, x]) => x).filter(x => x.what);
    if (acts.length) out.push('', '*Actions*', ...acts.map(x => `- ${x.what}${x.who ? ' (' + x.who + (x.by ? ', by ' + x.by : '') + ')' : x.by ? ' (by ' + x.by + ')' : ''}${x.done ? ' DONE' : ''}`));
    if (a.commsTeams) out.push('', a.commsTeams);
    if (signed(a)) out.push('', `Signed off ${hm(a.signed.at)} by ${a.signed.by}.` + (now() < evEnd ? ` Next review by ${dhm(a.signed.at + REVIEW_H * 3600e3)} or at any significant change.` : ''));
    return out.join('\n');
  }
  function record(a) {
    const S = a.snap || {}, line = (k, v) => v ? `${k}: ${v}` : null, P = a.pos || {}, CM = a.comms || {};
    const sc = Object.values(S.scopes || {});
    const out = ['GPT100 race-morning dynamic risk assessment (Risk Management Plan, Appendix A)',
      line('Review', KINDS[a.kind]), line('For', a.forWhat), line('Started', dhm(a.created)), line('Weather data as at', S.wxAt ? dhm(S.wxAt) : ''),
      '', 'COMPLETED BY', line('Event Manager or Deputy', a.by && a.by.em), line('Medical Director', a.by && a.by.md), line('Course Manager', a.by && a.by.cm), line('Others present', a.by && a.by.others),
      '', 'CURRENT WEATHER OBSERVATIONS', S.obs, a.n && a.n.obs,
      '', 'TRIGGERS', ...sc.map(s => s.label + ': ' + WX.ORDER.map(k => WX.LABELS[k] + ' ' + WORD[(s.t[k] || {}).status || 'nodata']).join(', ')), a.n && a.n.forecast,
      '', 'FIRE DANGER AND AIR QUALITY', S.fire, a.n && a.n.fire,
      '', 'COURSE CONDITION CHANGES', (a.n && a.n.course) || 'None recorded',
      '', 'POSITIONS IN PLACE', ...POSITIONS.map(([k, l]) => `${l}: ${STATE[P[k]] || 'not checked'}`), a.n && a.n.pos,
      '', 'STAFFING', `Load-bearing position unfilled: ${(a.staff || {}).unfilled || 'not checked'}. Deputy Event Manager on duty and briefed: ${(a.staff || {}).deputy || 'not checked'}.`, a.n && a.n.staffing,
      '', 'COMMS CHECK', ...COMMS.map(([k, l]) => `${l}: ${STATE[CM[k]] || 'not checked'}`), line('Next Event HQ move', a.hqMove),
      '', 'NEW HAZARDS', ...(live(a.hazards).length ? live(a.hazards).map(([, x]) => { const r = rate(x.c, x.l); return `${x.what || 'Hazard'}${x.where ? ', ' + x.where : ''}: ${r ? r.band + '(' + r.score + ') C' + r.c + ' ' + r.l : 'not scored'}${x.controls ? '. Controls: ' + x.controls : ''}${x.owner ? '. Owner: ' + x.owner : ''}`; }) : ['None']),
      '', 'TRIGGERS REACHED', ...(reachedList(a, S).length ? reachedList(a, S).map(r => `${r.label} ${r.status === 'met' ? 'MET' : 'getting close'}${r.text ? ': ' + r.text : ''}${a.resp && a.resp[r.key] ? '. Response: ' + a.resp[r.key] : ''}`) : ['None']),
      '', 'REGISTER RISKS REVIEWED', ...(REG ? live(a.risks).map(([n, x]) => { const r = REG.byN[n], t = rate(x.c, x.l); return r ? `${n}. ${r.name}: today ${t ? t.band + '(' + t.score + ') C' + t.c + ' ' + t.l : 'not scored'} (existing ${r.existing.band}(${r.existing.score}), target ${r.target.band}(${r.target.score}))${x.note ? '. ' + x.note : ''}` : null; }) : []),
      '', 'TOP 3 HAZARDS', ...[1, 2, 3].map(i => a.top && a.top[i] ? i + '. ' + a.top[i] : null),
      '', 'DECISION', (a.decision && a.decision.d ? DECISIONS[a.decision.d] : 'Not made') + (a.decision && a.decision.detail ? ': ' + a.decision.detail : ''),
      '', 'ACTIONS', ...(live(a.actions).length ? live(a.actions).map(([, x]) => `${x.what || ''} | ${x.who || ''} | ${x.by || ''} | ${x.how || ''}${x.done ? ' | done ' + hm(x.doneAt) + (x.doneBy ? ' by ' + x.doneBy : '') : ''}`) : ['None']),
      '', 'COMMS', line('To teams', a.commsTeams), line('To runners, public and partners', a.commsPublic), line('Minutes taken by', a.minutes),
      '', 'SIGN OFF', signed(a) ? `Signed off ${dhm(a.signed.at)} by ${a.signed.by}${a.signed.names ? '. Present and agreed: ' + a.signed.names : ''}` : 'Not signed off',
      ...live(a.reviews).map(([, r]) => `Reviewed ${dhm(r.at)}${r.who ? ' by ' + r.who : ''}: ${r.text || 'no change'}`)];
    return out.filter(x => x != null).join('\n').replace(/\n{3,}/g, '\n\n');
  }
  function exportCSV() {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['Assessment', 'Review', 'For', 'Signed off', 'Signed by', 'Decision', 'Detail', 'Item', 'Name', 'Score', 'Who', 'By when', 'How', 'Done', 'Notes']];
    for (const a of byTime().reverse()) {
      const head = [dhm(a.created), KINDS[a.kind], a.forWhat, signed(a) ? dhm(a.signed.at) : '', signed(a) ? a.signed.by : '', a.decision && a.decision.d ? DECISIONS[a.decision.d] : '', a.decision && a.decision.detail];
      rows.push(head.concat(['Assessment', '', '', '', '', '', '', [1, 2, 3].map(i => a.top && a.top[i]).filter(Boolean).join('; ')]));
      reachedList(a, a.snap || {}).forEach(r => rows.push(head.concat(['Trigger', r.label, r.status === 'met' ? 'Met' : 'Getting close', '', '', '', '', (a.resp && a.resp[r.key]) || r.text])));
      live(a.risks).forEach(([n, x]) => { const r = REG && REG.byN[n], t = rate(x.c, x.l); rows.push(head.concat(['Register risk', n + '. ' + (r ? r.name : ''), t ? t.band + '(' + t.score + ')' : '', r ? r.owner : '', '', '', '', x.note])); });
      live(a.hazards).forEach(([, x]) => { const t = rate(x.c, x.l); rows.push(head.concat(['New hazard', x.what, t ? t.band + '(' + t.score + ')' : '', x.owner, '', '', '', [x.where, x.controls].filter(Boolean).join('. ')])); });
      live(a.actions).forEach(([, x]) => rows.push(head.concat(['Action', x.what, '', x.who, x.by, x.how, x.done ? dhm(x.doneAt) + (x.doneBy ? ' ' + x.doneBy : '') : '', ''])));
    }
    const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' });
    const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'GPT100-risk-assessments.csv'; document.body.appendChild(l); l.click(); setTimeout(() => { URL.revokeObjectURL(l.href); l.remove(); }, 1000);
  }

  // ---------- events ----------
  function pathPatch(path, v) { const ks = path.split('.'), o = {}; let c = o; ks.forEach((k, i) => { if (i === ks.length - 1) c[k] = v; else c = c[k] = {}; }); return o; }
  function bind(a) {
    const B = $('riskBody');
    B.querySelectorAll('[data-f]').forEach(el => {
      const save = () => { let v = el.value; if (/\.c$/.test(el.dataset.f) && v) v = +v; patch(a.id, pathPatch(el.dataset.f, v)); refreshOut(a.id); };
      if (el.tagName === 'SELECT' || el.type === 'radio') el.addEventListener('change', () => { save(); render(); });
      else el.addEventListener('input', () => { clearTimeout(pending.get(el.dataset.f)); pending.set(el.dataset.f, setTimeout(save, 700)); });
      if (el.tagName !== 'SELECT' && el.type !== 'radio') el.addEventListener('blur', () => { if (pending.has(el.dataset.f)) { clearTimeout(pending.get(el.dataset.f)); pending.delete(el.dataset.f); save(); } });
    });
    B.addEventListener('focusout', () => setTimeout(() => { if (held && !B.contains(document.activeElement)) render(); }, 50), { once: true });
    B.querySelectorAll('[data-act]').forEach(el => el.addEventListener(el.type === 'checkbox' ? 'change' : 'click', () => act(el, a)));
  }
  // The briefing follows the form as it's typed.
  function refreshOut(id) { const a = all.get(id), el = $('raBrief'); if (a && el) el.textContent = briefing(a); }
  async function act(el, a) {
    const k = el.dataset.act;
    if (k === 'new') return create(el.dataset.kind);
    if (k === 'open') return open(el.dataset.id);
    if (k === 'close') return open(null);
    if (k === 'export') return exportCSV();
    if (k === 'done') {
      const x = all.get(el.dataset.id), on = el.checked;
      patch(el.dataset.id, { actions: { [el.dataset.k]: on ? { done: true, doneAt: now(), doneBy: who() } : { done: false, doneAt: null, doneBy: null } } }, on ? 'Risk action done: ' + ((x.actions[el.dataset.k] || {}).what || '') : null);
      return render();
    }
    if (k === 'reviewed') {
      const L = await weather(), text = prompt('Reviewed with no change to the decision. Anything to note?', 'No change') ;
      if (text == null) return;
      patch(el.dataset.id, { reviews: { [newId('v')]: { at: now(), who: who(), text, snap: snapshot(L) } } }, 'Risk assessment reviewed, no change: ' + text);
      return render();
    }
    if (!a) return;
    if (k === 'refresh') { const L = await weather(); patch(a.id, { snap: snapshot(L) }); return render(); }
    if (k === 'addrisk') {
      let n = el.dataset.n;
      if (!n) { const q = ($('raRiskQ').value || '').trim().toLowerCase(), m = q.match(/^(\d+)/); const r = m ? REG.byN[+m[1]] : REG.risks.find(r => r.name.toLowerCase().includes(q)); if (!q || !r) return; n = r.n; }
      const r = REG.byN[n]; patch(a.id, { risks: { [n]: { c: r.existing.c, l: r.existing.l } } }); return render();
    }
    if (k === 'unrisk') { patch(a.id, { risks: { [el.dataset.n]: null } }); return render(); }
    if (k === 'addhaz') { patch(a.id, { hazards: { [newId('h')]: { what: '' } } }); return render(); }
    if (k === 'unhaz') { patch(a.id, { hazards: { [el.dataset.k]: null } }); return render(); }
    if (k === 'addact') { patch(a.id, { actions: { [newId('a')]: { what: '', who: '', by: '', how: '' } } }); return render(); }
    if (k === 'unact') { patch(a.id, { actions: { [el.dataset.k]: null } }); return render(); }
    if (k === 'suggest') {
      const items = [];
      reachedList(a, a.snap || {}).forEach(r => items.push({ s: r.status === 'met' ? 30 : 26, t: r.label + (r.status === 'met' ? ' (trigger met)' : ' (getting close)') + (a.resp && a.resp[r.key] ? ': ' + a.resp[r.key] : '') }));
      live(a.risks).forEach(([n, x]) => { const r = REG && REG.byN[n], t = rate(x.c, x.l); if (r && t) items.push({ s: t.score, t: r.name + (x.note ? ': ' + x.note : '') }); });
      live(a.hazards).forEach(([, x]) => { const t = rate(x.c, x.l); if (x.what) items.push({ s: t ? t.score : 0, t: x.what + (x.where ? ', ' + x.where : '') }); });
      const top = items.sort((p, q) => q.s - p.s).slice(0, 3);
      if (!top.length) return alert('Nothing scored yet. Score the register risks or add a hazard first.');
      patch(a.id, { top: { 1: (top[0] || {}).t || '', 2: (top[1] || {}).t || '', 3: (top[2] || {}).t || '' } }); return render();
    }
    if (k === 'sign') {
      const names = [a.by.em, a.by.md, a.by.cm].filter(Boolean).join(', ');
      if (!confirm(`Sign off this assessment as ${a.by.em}?\n\nDecision: ${DECISIONS[a.decision.d]}\n\nIt will be locked. Actions can still be ticked off.`)) return;
      const L = await weather();
      patch(a.id, { snap: snapshot(L), signed: { at: now(), by: a.by.em, names } }, `Risk assessment signed off (${KINDS[a.kind]}${a.forWhat ? ', ' + a.forWhat : ''}): ${DECISIONS[a.decision.d]}${a.decision.detail ? ', ' + a.decision.detail : ''}`);
      return render();
    }
    if (k === 'wa') return window.open('https://wa.me/?text=' + encodeURIComponent(briefing(a)), '_blank', 'noopener');
    if (k === 'copy') {
      const t = el.dataset.what === 'record' ? record(a) : briefing(a);
      try { await navigator.clipboard.writeText(t); el.textContent = 'Copied'; } catch (e) { prompt('Copy this:', t); }
      return;
    }
    if (k === 'print') {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(`<!doctype html><meta charset="utf-8"><title>GPT100 risk assessment ${esc(dhm(a.created))}</title><style>body{font:13px/1.5 Montserrat,Arial,sans-serif;margin:24px;color:#111;background:#fff}pre{white-space:pre-wrap;font:inherit}</style><pre>${esc(record(a))}</pre>`);
      w.document.close(); w.focus(); w.print();
      return;
    }
    if (k === 'delete') {
      if (!confirm('Delete this draft assessment?')) return;
      patch(a.id, { deleted: now() }, 'Risk assessment draft deleted');
      all.delete(a.id); saveCache(); return open(null);
    }
  }

  // ---------- showing the tab ----------
  async function onShow() {
    shown = true;
    if (!unlocked()) return render();
    render();
    await Promise.all([loadRegister(), weather()]);
    render();
    sync();
    clearInterval(timer); timer = setInterval(sync, 15000);
  }
  function onHide() { shown = false; clearInterval(timer); timer = null; }
  [...all.values()].forEach(a => { if (a.deleted) all.delete(a.id); });
  // Check for "needs review" in the background, so the tab shows a dot even when it isn't open.
  const watch = async () => { if (!unlocked()) return badge(); if (!shown) { await weather(); if (ready()) await sync(); } badge(); };
  if (window.MedPlan && window.MedPlan.ready) window.MedPlan.ready.then(() => setTimeout(watch, 4000));
  setInterval(watch, 5 * 60e3);
  addEventListener('online', () => { flush(); });

  // The Medical tab unlocked or locked: forget the register on lock, and redraw if the tab is open.
  function onAuth() { if (!unlocked()) REG = null; if (shown) onShow(); else badge(); }
  window.RiskTab = { onShow, onHide, onAuth, start: async kind => { if (!unlocked()) return; await Promise.all([loadRegister(), weather()]); create(kind); }, briefing: id => all.get(id) && briefing(all.get(id)) };
})();
