// GPT100 Safety: Medical tab. The race medical plan is stored encrypted (data/medplan.enc.js) and
// unlocked on each device with the password. Shows who is on duty, runner numbers and vehicles,
// live during the event or at any chosen time, and tells Find which medics are nearest.
(function () {
  const G = window.GPT, ENC = window.GPT100_MEDPLAN_ENC;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = 'gpt100_medplan_key';
  const DAYS = { Thu: 0, Fri: 1, Sat: 2, Sun: 3 };
  const MEDICAL = ['Doctor', 'CCRN', 'Nurse', 'Paramedic', 'FAO'];

  let P = null;          // the decrypted plan
  let T0 = null;         // plan start (Melbourne wall clock)
  let pick = null;       // chosen time in hours from T0, or null to follow the live clock
  let liveTimer = null, map = null, mapLayer = null;

  // ---------- Unlocking ----------
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const b64e = u => btoa(String.fromCharCode(...new Uint8Array(u)));
  async function keyFromPassword(pw) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(ENC.salt), iterations: ENC.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  }
  async function decrypt(key) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(ENC.iv) }, key, b64d(ENC.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function unlock(pw) {
    const key = await keyFromPassword(pw);
    P = await decrypt(key); // throws on a wrong password
    try { localStorage.setItem(LS, b64e(await crypto.subtle.exportKey('raw', key))); } catch (e) { }
    init();
  }
  async function unlockStored() {
    let raw = null;
    try { raw = localStorage.getItem(LS); } catch (e) { }
    if (!raw || !ENC || !window.crypto || !crypto.subtle) return false;
    try {
      const key = await crypto.subtle.importKey('raw', b64d(raw), 'AES-GCM', false, ['decrypt']);
      P = await decrypt(key); init(); return true;
    } catch (e) { try { localStorage.removeItem(LS); } catch (x) { } return false; } // plan re-encrypted: ask again
  }
  function lock() {
    try { localStorage.removeItem(LS); } catch (e) { }
    P = null; stopLive(); if (map) { map.remove(); map = null; }
    render();
  }

  // ---------- Plan helpers ----------
  function init() {
    T0 = new Date(P.t0);
    P.stations.forEach(s => {
      const sn = G.snap(s.lat, s.lon);
      s.ckm = G.route[sn.ic][2]; // km on this app's course
      const a = G.ACCESS.filter(x => x.w3w).map(x => ({ x, d: G.metres([x.lat, x.lon], [s.lat, s.lon]) })).sort((p, q) => p.d - q.d)[0];
      s.w3w = a && a.d < 60 ? a.x.w3w : null; // only when it is the same spot
    });
    P.raceTimes = P.races.map(r => ({ name: r[0], start: parseWhen(r[1]), end: parseWhen(r[2]), where: r[1] }));
  }
  function parseWhen(txt) {
    const m = /(Thu|Fri|Sat|Sun)\s+(\d{1,2}):(\d{2})/.exec(txt || '');
    return m ? DAYS[m[1]] * 24 + (+m[2]) + (+m[3]) / 60 - T0.getHours() - T0.getMinutes() / 60 : null;
  }
  function melbNow() {
    const p = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const g = k => +p.find(x => x.type === k).value;
    return new Date(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
  }
  const endH = () => P.n / 4;
  const liveH = () => (melbNow() - T0) / 3600e3;
  const inEvent = () => { const h = liveH(); return h >= 0 && h <= endH(); };
  const DEFAULT_H = 52; // Sat 09:00, a busy moment, when outside the event window
  function curH() { return pick != null ? pick : (inEvent() ? liveH() : DEFAULT_H); }
  const isLive = () => pick == null && inEvent();
  function fmtH(h) {
    const d = new Date(T0.getTime() + h * 3600e3);
    return d.toLocaleString('en-AU', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  const timeOnly = h => fmtH(h).slice(4);
  const on = (x, h) => x.a <= h && x.z > h;
  const staffAt = (name, h) => P.pos.filter(p => p.station === name && on(p, h));
  const crewAt = (name, h) => P.st.filter(p => p.station === name && on(p, h));
  function runnersAt(name, h) {
    const a = P.arr[name]; if (!a) return [0, 0];
    const i = Math.floor(h * 4); let m = 0, s = 0;
    for (let j = i - 2; j <= i + 1; j++) if (j >= 0 && j < P.n) { m += a.m[j]; s += a.s[j]; }
    return [m, s];
  }
  function vehicle(v, h) {
    let at = 'Halls Gap', moving = null;
    for (const m of P.mv) {
      if (m.veh !== v) continue;
      if (m.arr <= h) at = m.b;
      else if (m.dep <= h && h < m.arr) { moving = m; break; }
    }
    return { at, moving };
  }
  const VEH = () => Object.keys(P.veh).filter(v => v !== 'ST');
  const stationByName = n => P.stations.find(s => s.name === n);
  const col = g => P.grades[g] || '#888';

  // ---------- Medical tab ----------
  function render() {
    const el = $('medBody'); if (!el) return;
    if (!ENC) { el.innerHTML = '<div class="card"><p>No medical plan has been loaded into this version of the app.</p></div>'; return; }
    if (!P) {
      el.innerHTML = `<form class="card med-lock" id="medUnlock" autocomplete="off">
        <h3>Medical plan</h3>
        <p>Who is on duty where, runner numbers and medical vehicles, live during the event. Enter the password from the Race Director. This device remembers it until you lock the tab.</p>
        <div class="search-row"><input id="medPw" type="password" placeholder="Password" autocomplete="current-password"><button class="btn primary" type="submit">Unlock</button></div>
        <p class="msg" id="medMsg" role="status"></p></form>`;
      $('medUnlock').addEventListener('submit', async e => {
        e.preventDefault(); const pw = $('medPw').value; if (!pw) return;
        $('medMsg').textContent = ''; $('medMsg').classList.add('ok'); $('medMsg').textContent = 'Unlocking...';
        try { await unlock(pw); render(); if (window.GPT_UI) window.GPT_UI.refresh(); }
        catch (err) { $('medMsg').classList.remove('ok'); $('medMsg').textContent = window.crypto && crypto.subtle ? 'That password didn\'t work.' : 'This browser can\'t unlock the plan. Open the app over https.'; }
      });
      return;
    }
    const h = curH();
    let html = `<div class="med-head"><div><h1>Medical</h1>
      <p class="med-when">${isLive() ? '<span class="live-dot"></span>Live, ' : ''}<b>${fmtH(h)}</b>${pick == null && !inEvent() ? ` <span class="muted">(the event runs Thu 5 Nov 05:00 to Sun 8 Nov; showing a sample time)</span>` : ''}</p></div>
      <div class="med-tools">${pick != null && inEvent() ? '<button class="btn small" id="medGoLive" type="button">Back to live</button>' : ''}<button class="btn small" id="medLockBtn" type="button">Lock</button></div></div>`;
    // time picker
    const jumps = [['Thu 07:00', 2], ['Thu 14:00', 9], ['Fri 08:00', 27], ['Fri 15:30', 34.5], ['Fri 23:00', 42], ['Sat 03:00', 46], ['Sat 09:00', 52], ['Sat 20:00', 63], ['Sun 03:00', 70], ['Sun 12:00', 79]];
    html += `<details class="card med-time" id="medTime"${pick != null ? ' open' : ''}><summary>View another time</summary>
      <input type="range" id="medSlider" min="0" max="${P.n - 1}" value="${Math.max(0, Math.min(P.n - 1, Math.round(h * 4)))}" aria-label="Plan time">
      <div class="med-jumps">${jumps.map(([l, j]) => `<button type="button" class="btn small" data-h="${j}">${l}</button>`).join('')}</div></details>`;
    // races
    const running = P.raceTimes.filter(r => r.start != null && r.start <= h && (r.end == null || r.end > h));
    const next = P.raceTimes.filter(r => r.start != null && r.start > h).sort((a, b) => a.start - b.start)[0];
    html += `<div class="med-races">${running.length ? running.map(r => `<span class="chip">${esc(r.name)}</span>`).join('') : '<span class="muted">No races on course</span>'}${next ? `<span class="muted">Next: ${esc(next.name)}, ${fmtH(next.start)}</span>` : ''}</div>`;
    // busiest
    const loads = P.stations.map(s => ({ s, n: runnersAt(s.name, h).reduce((a, b) => a + b, 0) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
    if (loads.length) html += `<p class="med-busy"><b>Busiest now:</b> ${loads.slice(0, 3).map(x => `${esc(x.s.name)} (${x.n}/h)`).join(', ')}</p>`;
    // vehicles
    html += '<div class="card"><h3>Medical vehicles</h3>';
    VEH().forEach(v => {
      const s = vehicle(v, h);
      html += `<div class="row"><span><span class="vk">${v}</span> ${esc(P.veh[v])}</span><span class="v">${s.moving ? `${esc(s.moving.a)} to ${esc(s.moving.b)}, arrives ${timeOnly(s.moving.arr)}` : 'at ' + esc(s.at)}</span></div>`;
    });
    const soon = P.mv.filter(m => m.dep >= h - 0.25 && m.dep <= h + 2).sort((a, b) => a.dep - b.dep);
    if (soon.length) {
      html += '<h4>Next 2 hours</h4>' + soon.map(m => `<div class="row"><span>${timeOnly(m.dep)} <b>${esc(m.who)}</b> ${esc(m.a)} to ${esc(m.b)}<span class="sub">${esc(m.vname)}${m.note ? ', ' + esc(m.note) : ''}</span></span><span class="v">${m.min} min</span></div>`).join('');
    }
    html += '</div>';
    // stations
    html += '<h2 class="med-h2">Stations</h2>';
    const shown = P.stations.filter(s => staffAt(s.name, h).length || crewAt(s.name, h).length || runnersAt(s.name, h).some(x => x));
    if (!shown.length) html += '<p class="muted">Nobody is on post at this time.</p>';
    shown.forEach(s => {
      const staff = staffAt(s.name, h), crew = crewAt(s.name, h), [m, st] = runnersAt(s.name, h), tot = m + st;
      const top = staff.find(p => p.status === 'on' && p.grade === 'Doctor') ? 'Doctor' : (staff.find(p => p.status === 'on') || {}).grade;
      html += `<article class="card med-st" style="--g:${top ? col(top) : '#ccc'}">
        <div class="med-st-head"><div><h3>${esc(s.name)}</h3><span class="muted">km ${s.ckm.toFixed(1)}${s.w3w ? ' &middot; <a class="w3w" href="https://w3w.co/' + esc(s.w3w) + '" target="_blank" rel="noopener">///' + esc(s.w3w) + '</a>' : ''}</span></div>
        <button class="btn small" type="button" data-km="${s.ckm}">Find</button></div>
        ${tot ? `<div class="med-bar"><i style="width:${Math.min(100, tot * 2.5)}%"></i></div><p class="med-load">${tot} runners this hour${st ? ` (Miler ${m}, Stage Race ${st})` : ''}</p>` : ''}
        ${staff.map(p => `<div class="med-pos"><i class="sw${p.status === 'call' ? ' call' : ''}" style="--c:${col(p.grade)}"></i><span><b>${esc(p.grade)}</b>${p.status === 'call' ? ' on call' : ''} (${esc(p.person)}) ${timeOnly(p.a)} to ${timeOnly(p.z)}${p.note ? `<span class="sub">${esc(p.note)}</span>` : ''}</span></div>`).join('')}
        ${crew.map(p => `<div class="med-pos"><i class="sw" style="--c:#bdbdbd"></i><span class="muted">SingleTrack: ${esc(p.label)}</span></div>`).join('')}
        ${s.acc ? `<p class="med-acc">${esc(s.acc)}</p>` : ''}</article>`;
    });
    html += `<details class="card" id="medMapWrap"><summary>Map</summary><div id="medMap"></div></details>
      <p class="med-note">Draft plan. Runner numbers are 2025 results on the 2026 clock; person IDs are provisional. Keep this information within the medical and event team.</p>`;
    el.innerHTML = html;

    // wiring
    $('medLockBtn').addEventListener('click', () => { if (confirm('Lock the medical plan on this device? You will need the password again.')) lock(); });
    if ($('medGoLive')) $('medGoLive').addEventListener('click', () => { pick = null; render(); refreshFind(); });
    $('medSlider').addEventListener('input', e => { pick = +e.target.value / 4; render(); $('medTime').open = true; refreshFind(); });
    el.querySelectorAll('.med-jumps [data-h]').forEach(b => b.addEventListener('click', () => { pick = +b.dataset.h; render(); refreshFind(); }));
    el.querySelectorAll('.med-st [data-km]').forEach(b => b.addEventListener('click', () => window.GPT_UI && window.GPT_UI.openKm(+b.dataset.km)));
    $('medMapWrap').addEventListener('toggle', e => { if (e.target.open) drawMap(h); });
    if (isLive()) startLive(); else stopLive();
  }

  function drawMap(h) {
    if (!window.L) { $('medMap').innerHTML = '<p class="map-off">Map unavailable without signal.</p>'; return; }
    if (map) { map.remove(); map = null; }
    map = L.map('medMap', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenStreetMap' }).addTo(map);
    const line = L.polyline(G.route.map(p => [p[0], p[1]]), { color: '#d9531e', weight: 3, opacity: .8 }).addTo(map);
    map.fitBounds(line.getBounds().pad(0.05));
    P.stations.forEach(s => {
      const staff = staffAt(s.name, h), onPost = staff.filter(p => p.status === 'on');
      const g = onPost.find(p => p.grade === 'Doctor') ? 'Doctor' : (onPost[0] || {}).grade;
      const n = runnersAt(s.name, h).reduce((a, b) => a + b, 0);
      L.circleMarker([s.lat, s.lon], { radius: 6 + Math.min(n, 40) * 0.35, color: staff.some(p => p.status === 'call') ? col('Doctor') : '#333', weight: staff.some(p => p.status === 'call') ? 3 : 1, fillColor: g ? col(g) : (crewAt(s.name, h).length ? '#9e9e9e' : '#eee'), fillOpacity: 1 })
        .bindPopup(`<b>${esc(s.name)}</b><br>${staff.map(p => esc(p.grade) + (p.status === 'call' ? ' on call' : '')).join(', ') || 'No medical staff'}<br>${n} runners this hour`).addTo(map);
    });
    VEH().forEach(v => {
      const s = vehicle(v, h); let ll;
      if (s.moving) { const f = (h - s.moving.dep) / (s.moving.arr - s.moving.dep), A = stationByName(s.moving.a), B = stationByName(s.moving.b); ll = [A.lat + (B.lat - A.lat) * f, A.lon + (B.lon - A.lon) * f]; }
      else { const st = stationByName(s.at); ll = [st.lat, st.lon]; }
      L.marker(ll, { icon: L.divIcon({ className: '', html: `<div class="vmark">${v}</div>`, iconSize: [26, 16], iconAnchor: [13, 8] }) }).bindPopup(esc(P.veh[v])).addTo(map);
    });
  }

  function startLive() { if (!liveTimer) liveTimer = setInterval(() => { if (isLive()) { render(); refreshFind(); } }, 60000); }
  function stopLive() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } }
  function refreshFind() { if (window.GPT_UI) window.GPT_UI.refresh(); }

  // ---------- For Find: medics on duty near a casualty ----------
  function nearbyHTML(r) {
    if (!ENC) return '';
    if (!P) return '<p class="details">Unlock the Medical tab to see which medics are on duty nearby.</p>';
    const h = curH(), km = r.km, list = [];
    P.stations.forEach(s => {
      const staff = staffAt(s.name, h).filter(p => MEDICAL.includes(p.grade));
      if (!staff.length) return;
      list.push({ s, staff, d: s.ckm - km });
    });
    list.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
    let html = `<div class="card"><h3>Medical on duty</h3><p class="details">${isLive() ? 'Now' : 'Plan time ' + fmtH(h) + ' (set in the Medical tab)'}</p>`;
    if (!list.length) html += '<p class="muted">No medical staff on duty at this time.</p>';
    list.slice(0, 3).forEach(x => {
      const where = Math.abs(x.d) < 0.3 ? 'at this spot' : `${Math.abs(x.d).toFixed(1)} km ${x.d < 0 ? 'back' : 'ahead'} on course`;
      const until = Math.min(...x.staff.map(p => p.z));
      html += `<div class="row"><span>${x.staff.map(p => `<span class="dot" style="background:${col(p.grade)}"></span><b>${esc(p.grade)}</b>${p.status === 'call' ? ' on call' : ''}`).join(' ')}
        <span class="sub">${esc(x.s.name)}, ${where}. Until ${timeOnly(until)}</span></span></div>`;
    });
    const veh = VEH().map(v => { const s = vehicle(v, h); return `${esc(P.veh[v])} ${s.moving ? `heading to ${esc(s.moving.b)}` : 'at ' + esc(s.at)}`; });
    html += `<p class="details">${veh.join('. ')}.</p></div>`;
    return html;
  }

  window.MedPlan = { render, nearbyHTML, onShow: render, ready: unlockStored().then(ok => { if (ok) { render(); refreshFind(); } }) };
})();
