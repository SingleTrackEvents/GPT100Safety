// GPT100 Safety: Medical tab. The race medical plan is stored encrypted (data/medplan.enc.js) and
// unlocked on each device with the password. Shows who is on duty, runner numbers and vehicles,
// live during the event or at any chosen time, and tells Find which medics are nearest.
(function () {
  const G = window.GPT, ENC = window.GPT100_MEDPLAN_ENC, SO = window.GPT100_SO;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = 'gpt100_medplan_pw';
  try { localStorage.removeItem('gpt100_medplan_key'); } catch (e) { } // older versions saved a key, not the password
  const DAYS = { Thu: 0, Fri: 1, Sat: 2, Sun: 3 };
  const MEDICAL = ['Doctor', 'CCRN', 'Nurse', 'Paramedic', 'FAO'];

  let P = null;          // the decrypted plan
  let T0 = null;         // plan start (Melbourne wall clock)
  let pick = null;       // chosen time in hours from T0, or null to follow the live clock
  let liveTimer = null, lockNote = '';

  // ---------- Unlocking ----------
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function keyFromPassword(pw) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(ENC.salt), iterations: ENC.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  }
  async function decrypt(key) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(ENC.iv) }, key, b64d(ENC.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  // The device remembers the password (not a key), so a plan update with the same password stays unlocked,
  // while a new password asks everyone again.
  async function unlock(pw) {
    P = await decrypt(await keyFromPassword(pw)); // throws on a wrong password
    try { localStorage.setItem(LS, pw); } catch (e) { }
    lockNote = ''; init();
  }
  async function unlockStored() {
    let pw = null;
    try { pw = localStorage.getItem(LS); } catch (e) { }
    if (!pw || !ENC || !window.crypto || !crypto.subtle) return false;
    try { P = await decrypt(await keyFromPassword(pw)); init(); return true; }
    catch (e) { try { localStorage.removeItem(LS); } catch (x) { } return false; } // password changed: ask again
  }

  // Pick up a new version of the plan (or a new password) without waiting for a restart.
  async function checkForNewPlan() {
    if (!ENC || !navigator.onLine || !location.protocol.startsWith('http')) return;
    try {
      const t = await (await fetch('data/medplan.enc.js', { cache: 'no-cache' })).text();
      const m = /window\.GPT100_MEDPLAN_ENC = (\{.*\});/.exec(t);
      if (!m) return;
      const next = JSON.parse(m[1]);
      if (next.salt === ENC.salt && next.ct === ENC.ct) return;
      const wasOpen = !!P;
      Object.assign(ENC, next);
      P = null; stopPlay();
      const ok = await unlockStored();
      if (!ok && wasOpen) lockNote = 'The medical plan password has changed. Enter the new password.';
      render(); refreshFind();
    } catch (e) { }
  }
  setTimeout(checkForNewPlan, 4000);
  setInterval(checkForNewPlan, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForNewPlan(); });
  function lock() {
    try { localStorage.removeItem(LS); } catch (e) { }
    P = null; stopLive(); stopPlay();
    render(); refreshFind();
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
  const endH = () => (P || SO).n / 4;
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
  // The tab is built once (render) and then refreshed in place (update), so Play and Live are smooth.
  let built = false, playTimer = null, map = null, fitted = false, stMarks = {}, vMarks = {};
  const JUMPS = [['Thu 07:00', 2], ['Thu 14:00', 9], ['Fri 08:00', 27], ['Fri 15:30', 34.5], ['Fri 23:00', 42], ['Sat 03:00', 46], ['Sat 09:00', 52], ['Sat 20:00', 63], ['Sun 03:00', 70], ['Sun 12:00', 79]];

  function render() {
    const el = $('medBody'); if (!el) return;
    built = false; stopPlay();
    if (map) { map.remove(); map = null; fitted = false; }
    if (!ENC) { el.innerHTML = '<div class="sheet"><div class="card"><p>No medical plan has been loaded into this version of the app.</p></div></div>'; return; }
    if (!P) {
      el.innerHTML = `<div class="sheet"><form class="card med-lock" id="medUnlock" autocomplete="off">
        <h3>Medical plan</h3>
        <p>Who is on duty where, runner numbers and medical vehicles, live during the event. Enter the password from the Race Director. This device remembers it until you lock the tab.</p>
        <div class="search-row"><input id="medPw" type="password" placeholder="Password" autocomplete="current-password"><button class="btn primary" type="submit">Unlock</button></div>
        <p class="msg" id="medMsg" role="status">${esc(lockNote)}</p></form></div>`;
      $('medUnlock').addEventListener('submit', async e => {
        e.preventDefault(); const pw = $('medPw').value; if (!pw) return;
        $('medMsg').classList.add('ok'); $('medMsg').textContent = 'Unlocking...';
        try { await unlock(pw); render(); refreshFind(); }
        catch (err) { $('medMsg').classList.remove('ok'); $('medMsg').textContent = window.crypto && crypto.subtle ? 'That password didn\'t work.' : 'This browser can\'t unlock the plan. Open the app over https.'; }
      });
      return;
    }
    el.innerHTML = `<div class="med-layout">
      <div class="med-panel">
        <div class="med-top">
          <div class="med-clock"><span class="live-dot" id="medDot" hidden></span><b id="medClock"></b><span class="muted" id="medNote"></span></div>
          <div class="med-tools">
            <button class="btn small" id="medPlay" type="button">&#9654; Play</button>
            <select id="medSpeed" aria-label="Play speed"><option value="250">Fast</option><option value="600" selected>Normal</option><option value="1200">Slow</option></select>
            <button class="btn small" id="medGoLive" type="button">Live</button>
            <button class="btn small" id="medLockBtn" type="button">Lock</button>
          </div>
        </div>
        <input type="range" id="medSlider" min="0" max="${P.n - 1}" aria-label="Plan time">
        <div class="med-jumps">${JUMPS.map(([l, j]) => `<button type="button" data-h="${j}">${l}</button>`).join('')}</div>
        <div class="med-races" id="medRaces"></div>
        <div class="med-veh" id="medVeh"></div>
        <div class="med-grid" id="medStations"></div>
        <p class="med-note">Draft plan. Runner numbers are 2025 results on the 2026 clock; person IDs are provisional. Keep this information within the medical and event team.</p>
      </div>
      <div class="med-mapbox"><div id="medMap"></div></div>
    </div>`;

    $('medLockBtn').addEventListener('click', () => { if (confirm('Lock the medical plan on this device? You will need the password again.')) lock(); });
    $('medGoLive').addEventListener('click', () => { stopPlay(); pick = null; update(); });
    $('medPlay').addEventListener('click', () => playTimer ? stopPlay() : startPlay());
    $('medSpeed').addEventListener('change', () => { if (playTimer) { stopPlay(); startPlay(); } });
    $('medSlider').addEventListener('input', e => { stopPlay(); pick = +e.target.value / 4; update(); });
    el.querySelectorAll('.med-jumps [data-h]').forEach(b => b.addEventListener('click', () => { stopPlay(); pick = +b.dataset.h; update(); }));
    $('medStations').addEventListener('click', e => {
      const f = e.target.closest('[data-km]');
      if (f) { window.GPT_UI && window.GPT_UI.openKm(+f.dataset.km); return; }
      const n = e.target.closest('.med-pos, .med-acc'); if (n) n.classList.toggle('open'); // tap a note to read it in full
    });
    buildMap();
    built = true;
    update();
  }

  function startPlay() {
    if (pick == null) pick = curH();
    if (pick >= endH() - 0.25) pick = 0;
    $('medPlay').innerHTML = '&#10074;&#10074; Pause'; $('medPlay').classList.add('on');
    playTimer = setInterval(() => {
      pick = Math.min(pick + 0.25, endH() - 0.25);
      update();
      if (pick >= endH() - 0.25) stopPlay();
    }, +$('medSpeed').value);
  }
  function stopPlay() {
    if (!playTimer) return;
    clearInterval(playTimer); playTimer = null;
    if ($('medPlay')) { $('medPlay').innerHTML = '&#9654; Play'; $('medPlay').classList.remove('on'); }
  }

  function update() {
    if (!built || !P) return;
    const h = curH();
    $('medClock').textContent = fmtH(h);
    $('medDot').hidden = !isLive();
    $('medNote').textContent = isLive() ? ' live' : (pick == null ? ' sample time; the event runs Thu 5 to Sun 8 Nov' : ' plan time');
    $('medGoLive').disabled = !inEvent() || isLive();
    $('medGoLive').title = inEvent() ? '' : 'Live works during the event';
    $('medSlider').value = Math.max(0, Math.min(P.n - 1, Math.round(h * 4)));

    // races and busiest stations
    const running = P.raceTimes.filter(r => r.start != null && r.start <= h && (r.end == null || r.end > h));
    const next = P.raceTimes.filter(r => r.start != null && r.start > h).sort((a, b) => a.start - b.start)[0];
    const loads = P.stations.map(s => ({ s, n: runnersAt(s.name, h).reduce((a, b) => a + b, 0) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
    $('medRaces').innerHTML = (running.length ? running.map(r => `<span class="chip">${esc(r.name)}</span>`).join('') : '<span class="muted">No races on course.</span>') +
      (next ? ` <span class="muted">Next: ${esc(next.name)}, ${fmtH(next.start)}.</span>` : '') +
      (loads.length ? ` <span><b>Busiest:</b> ${loads.slice(0, 3).map(x => `${esc(x.s.name)} ${x.n}/h`).join(', ')}</span>` : '');

    // vehicles and the next two hours of movements
    let vh = '<div class="med-vlist">' + VEH().map(v => {
      const s = vehicle(v, h);
      return `<div><span class="vk">${v}</span> ${esc(P.veh[v].replace(/^RDM /, ''))}: <b>${s.moving ? `to ${esc(s.moving.b)}, arr ${timeOnly(s.moving.arr)}` : esc(s.at)}</b></div>`;
    }).join('') + '</div>';
    const soon = P.mv.filter(m => m.dep >= h - 0.25 && m.dep <= h + 2).sort((a, b) => a.dep - b.dep);
    if (soon.length) vh += '<div class="med-moves"><b>Next 2 h:</b> ' + soon.map(m => `<span title="${esc(m.vname + (m.note ? ', ' + m.note : ''))}">${timeOnly(m.dep)} ${esc(m.who)} ${esc(m.a)} to ${esc(m.b)} (${m.veh})</span>`).join(' &middot; ') + '</div>';
    $('medVeh').innerHTML = vh;

    // stations with anyone on post or runners coming through
    const shown = P.stations.filter(s => staffAt(s.name, h).length || crewAt(s.name, h).length || runnersAt(s.name, h).some(x => x));
    $('medStations').innerHTML = shown.length ? shown.map(s => {
      const staff = staffAt(s.name, h), crew = crewAt(s.name, h), [m, st] = runnersAt(s.name, h), tot = m + st;
      const top = staff.find(p => p.status === 'on' && p.grade === 'Doctor') ? 'Doctor' : (staff.find(p => p.status === 'on') || {}).grade;
      return `<article class="med-st" style="--g:${top ? col(top) : '#ccc'}">
        <div class="med-st-head"><b>${esc(s.name)}</b><span class="muted">km ${s.ckm.toFixed(1)}</span>${tot ? `<span class="med-n" title="${m} Miler, ${st} Stage Race">${tot}/h</span>` : ''}<button class="lnk" type="button" data-km="${s.ckm}">Find</button></div>
        ${tot ? `<div class="med-bar"><i style="width:${Math.min(100, tot * 2.5)}%"></i></div>` : ''}
        ${staff.map(p => `<div class="med-pos"><i class="sw${p.status === 'call' ? ' call' : ''}" style="--c:${col(p.grade)}"></i><span><b>${esc(p.grade)}</b>${p.status === 'call' ? ' on call' : ''} ${esc(p.person)} ${timeOnly(p.a)}-${timeOnly(p.z)}${p.note ? `<span class="note">${esc(p.note)}</span>` : ''}</span></div>`).join('')}
        ${crew.map(p => `<div class="med-pos crew"><i class="sw" style="--c:#9e9e9e"></i><span>${esc(p.label)}</span></div>`).join('')}
        ${s.acc ? `<div class="med-acc">${esc(s.acc)}</div>` : ''}
        ${s.w3w ? `<a class="w3w" href="https://w3w.co/${esc(s.w3w)}" target="_blank" rel="noopener">///${esc(s.w3w)}</a>` : ''}</article>`;
    }).join('') : '<p class="muted">Nobody is on post at this time.</p>';

    updateMap(h);
    refreshFind();
    if (isLive()) startLive(); else stopLive();
  }

  function buildMap() {
    if (!window.L) { $('medMap').innerHTML = '<p class="map-off">Map unavailable without signal.</p>'; return; }
    map = L.map('medMap', { zoomControl: true });
    GPTBaseMap(map);
    L.polyline(G.route.map(p => [p[0], p[1]]), { color: '#d9531e', weight: 3, opacity: .8 }).addTo(map);
    stMarks = {}; vMarks = {};
    P.stations.forEach(s => {
      stMarks[s.name] = L.circleMarker([s.lat, s.lon], { radius: 6, color: '#333', weight: 1, fillColor: '#eee', fillOpacity: 1 })
        .bindTooltip(s.name, { direction: 'right', offset: [8, 0], className: 'med-tip' }).addTo(map);
    });
    VEH().forEach(v => {
      vMarks[v] = L.marker([P.stations[0].lat, P.stations[0].lon], { zIndexOffset: 900, icon: L.divIcon({ className: '', html: `<div class="vmark">${v}</div>`, iconSize: [26, 16], iconAnchor: [13, 8] }) })
        .bindPopup(esc(P.veh[v])).addTo(map);
    });
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
      const d = L.DomUtil.create('div', 'map-legend');
      d.innerHTML = MEDICAL.map(g => `<i style="background:${col(g)}"></i>${g}`).join('<br>') +
        '<br><i style="background:#9e9e9e"></i>Safety Officers only<br>Size = runners per hour<br>Red ring = on call';
      return d;
    };
    legend.addTo(map);
    fitMap();
  }
  function fitMap() {
    if (!map || !$('medMap').offsetWidth) return; // tab hidden: fit when shown
    map.invalidateSize();
    if (!fitted) { map.fitBounds(L.latLngBounds(P.stations.map(s => [s.lat, s.lon])).pad(0.06)); fitted = true; }
  }
  function updateMap(h) {
    if (!map || !map._loaded) return; // not shown yet: it draws when the Medical tab opens
    P.stations.forEach(s => {
      const staff = staffAt(s.name, h), onPost = staff.filter(p => p.status === 'on'), crew = crewAt(s.name, h);
      const g = onPost.find(p => p.grade === 'Doctor') ? 'Doctor' : (onPost[0] || {}).grade;
      const n = runnersAt(s.name, h).reduce((a, b) => a + b, 0), call = staff.some(p => p.status === 'call');
      stMarks[s.name].setStyle({ radius: 6 + Math.min(n, 40) * 0.35, color: call ? col('Doctor') : '#333', weight: call ? 3 : 1, fillColor: g ? col(g) : (crew.length ? '#9e9e9e' : '#eee') });
      stMarks[s.name].setTooltipContent(`<b>${esc(s.name)}</b>${staff.length ? '<br>' + staff.map(p => esc(p.grade) + (p.status === 'call' ? ' on call' : '')).join(', ') : ''}${crew.length ? '<br>' + crew.map(p => esc(p.label)).join(', ') : ''}${n ? `<br>${n} runners/h` : ''}`);
    });
    VEH().forEach(v => {
      const s = vehicle(v, h); let ll;
      if (s.moving) { const f = (h - s.moving.dep) / (s.moving.arr - s.moving.dep), A = stationByName(s.moving.a), B = stationByName(s.moving.b); ll = [A.lat + (B.lat - A.lat) * f, A.lon + (B.lon - A.lon) * f]; }
      else { const st = stationByName(s.at); ll = [st.lat, st.lon]; }
      vMarks[v].setLatLng(ll);
    });
  }

  function startLive() { if (!liveTimer) liveTimer = setInterval(() => { if (isLive()) update(); refreshFind(); }, 60000); }
  function stopLive() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } }
  function refreshFind() { if (window.GPT_UI) window.GPT_UI.refresh(); drawFindLayer(); if (window.RaceControl) window.RaceControl.onAuth(); }

  // ---------- Safety Officer posts on the Find map ----------
  let findLayer = null, soKey = null;
  function drawFindLayer() {
    const fmap = window.GPT_UI && window.GPT_UI.map && window.GPT_UI.map();
    if (!fmap || !window.L) return;
    if (findLayer) { findLayer.remove(); findLayer = null; }
    // Safety Officer posts are public (data/safety-officers.js); the unlocked plan has the same posts.
    const src = P || SO;
    if (!src) { if (soKey) { soKey.remove(); soKey = null; } return; }
    if (!T0) T0 = new Date(src.t0);
    if (!soKey) {
      soKey = L.control({ position: 'bottomright' });
      soKey.onAdd = () => { const d = L.DomUtil.create('div', 'map-legend'); d.innerHTML = '<span class="so-mark on" style="display:inline-block;width:22px;margin-right:5px">SO</span>Safety Officers on post<br><span class="so-mark" style="display:inline-block;width:22px;margin-right:5px;opacity:.5">SO</span>Not on post at this time'; return d; };
      soKey.addTo(fmap);
    }
    const h = curH();
    findLayer = L.layerGroup().addTo(fmap);
    src.stations.forEach(s => {
      const posts = (src.st || src.posts).filter(p => p.station === s.name && !/passage/i.test(p.label));
      if (!posts.length) return;
      const now = posts.filter(p => on(p, h));
      const shifts = posts.map(p => `${esc(p.label)}<br><span style="color:#625c53">${fmtH(p.a)} to ${fmtH(p.z)}</span>`).join('<br>');
      L.marker([s.lat, s.lon], {
        zIndexOffset: 400, opacity: now.length ? 1 : 0.45,
        icon: L.divIcon({ className: '', html: `<div class="so-mark${now.length ? ' on' : ''}">SO</div>`, iconSize: [24, 18], iconAnchor: [12, 9] })
      }).bindPopup(`<b>${esc(s.name)}</b> &middot; Safety Officers<br>${now.length ? `<b>On post ${isLive() ? 'now' : 'at ' + fmtH(h)}</b><br>` : `Not on post ${isLive() ? 'now' : 'at ' + fmtH(h)}<br>`}${shifts}`).addTo(findLayer);
    });
  }

  // ---------- For Find: medics on duty near a casualty ----------
  // ---------- Nearest Safety Officers on foot (public posts, no password needed) ----------
  // Walking time from each post on duty to the casualty: along the course on the GPT100, at responder pace
  // plus climb; on another course (the 14k) by distance on the ground, allowing 40% for the track.
  const soKm = {};
  function soNear(r) {
    const src = P || SO;
    if (!src) return null;
    if (!T0) T0 = new Date(src.t0);
    const h = curH(), C = window.GPT100_CONFIG, main = !r.course || r.course === G.id;
    const posts = (src.st || src.posts).filter(p => !/passage/i.test(p.label));
    const out = [];
    src.stations.forEach(s => {
      const here = posts.filter(p => p.station === s.name);
      if (!here.length) return;
      if (!soKm[s.name]) { const sn = G.snap(s.lat, s.lon); soKm[s.name] = { ic: sn.ic, km: G.route[sn.ic][2], off: sn.offM }; }
      const k = soKm[s.name];
      let distKm, walk;
      if (main) {
        distKm = Math.abs(k.km - r.km) + k.off / 1000;
        walk = distKm * C.walkPace + G.climb(k.ic, r.ic) * C.climbPenalty;
      } else {
        distKm = G.metres([s.lat, s.lon], [r.lat, r.lon]) / 1000 * 1.4;
        walk = distKm * C.walkPace;
      }
      const now = here.filter(p => on(p, h));
      const next = here.filter(p => p.a > h).sort((a, b) => a.a - b.a)[0];
      out.push({ s, d: main ? k.km - r.km : null, distKm, walk, now, next, ground: !main });
    });
    out.sort((a, b) => a.walk - b.walk);
    return { h, list: out };
  }
  function soNearHTML(r) {
    const x = soNear(r);
    if (!x || !x.list.length) return '';
    const onPost = x.list.filter(o => o.now.length).slice(0, 2);
    const team = r.best ? r.best.total : Infinity;
    const when = isLive() ? 'On post now' : `At ${fmtH(x.h)} ${P ? '(plan time, set in the Medical tab)' : '(an example race time; live during the race)'}`;
    let html = `<div class="card so-near"><h3>Nearest Safety Officers on foot</h3><p class="details">${when}</p>`;
    if (!onPost.length) {
      const n = x.list[0];
      html += `<p class="muted">No Safety Officers on post nearby at this time.${n.next ? ` Nearest post: ${esc(n.s.name)}, from ${fmtH(n.next.a)}.` : ''}</p>`;
    }
    onPost.forEach(o => {
      const where = o.ground ? `about ${o.distKm.toFixed(1)} km away` : Math.abs(o.d) < 0.3 ? 'at this spot' : `${Math.abs(o.d).toFixed(1)} km ${o.d < 0 ? 'back' : 'ahead'} on course`;
      const stays = o.now.every(p => /stays put/i.test(p.label));
      const faster = o.walk < team && !stays;
      html += `<div class="row${faster ? ' so-fast' : ''}"><span><span class="so-mark on" style="display:inline-block;width:22px;margin-right:6px">SO</span><b>${esc(o.s.name)}</b>
        <span class="sub">${esc(o.now.map(p => p.label).join(', '))}. ${where}. On post until ${timeOnly(Math.max(...o.now.map(p => p.z)))}.</span>
        ${faster ? '<span class="so-tag">Faster than the team: send them first</span>' : stays && o.walk < team ? '<span class="so-tag">Stays on post: radio for advice</span>' : ''}</span><span class="v">${G.fmt(o.walk)}</span></div>`;
    });
    html += '<p class="details">Walking at responder pace' + (onPost.some(o => o.ground) ? ', by distance on the ground' : ', along the course') + '. Check they can leave their post.</p></div>';
    return html;
  }
  // One line for the WhatsApp message, when Safety Officers on post can get there first.
  function soLine(r) {
    const x = soNear(r);
    if (!x) return '';
    const o = x.list.find(y => y.now.length && !y.now.every(p => /stays put/i.test(p.label)));
    if (!o || !(o.walk < (r.best ? r.best.total : Infinity))) return '';
    return `Nearest Safety Officers on foot: ${o.s.name}, about ${G.fmt(o.walk)} away.`;
  }

  function nearbyHTML(r) {
    if (!ENC) return '';
    if (!P) return '<p class="details">Unlock the Medical tab to see which medics are on duty nearby.</p>';
    const h = curH(), km = r.km, list = [];
    P.stations.forEach(s => {
      const staff = staffAt(s.name, h).filter(p => MEDICAL.includes(p.grade));
      if (!staff.length) return;
      // On another course (e.g. the 14k) km don't line up with the plan, so use distance on the ground.
      const d = r.course && r.course !== G.id ? G.metres([s.lat, s.lon], [r.lat, r.lon]) / 1000 : s.ckm - km;
      list.push({ s, staff, d, ground: r.course && r.course !== G.id });
    });
    list.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
    let html = `<div class="card"><h3>Medical on duty</h3><p class="details">${isLive() ? 'Now' : 'Plan time ' + fmtH(h) + ' (set in the Medical tab)'}</p>`;
    if (!list.length) html += '<p class="muted">No medical staff on duty at this time.</p>';
    list.slice(0, 3).forEach(x => {
      const where = Math.abs(x.d) < 0.3 ? 'at this spot' : x.ground ? `${x.d.toFixed(1)} km away` : `${Math.abs(x.d).toFixed(1)} km ${x.d < 0 ? 'back' : 'ahead'} on course`;
      const until = Math.min(...x.staff.map(p => p.z));
      html += `<div class="row"><span>${x.staff.map(p => `<span class="dot" style="background:${col(p.grade)}"></span><b>${esc(p.grade)}</b>${p.status === 'call' ? ' on call' : ''}`).join(' ')}
        <span class="sub">${esc(x.s.name)}, ${where}. Until ${timeOnly(until)}</span></span></div>`;
    });
    const veh = VEH().map(v => { const s = vehicle(v, h); return `${esc(P.veh[v])} ${s.moving ? `heading to ${esc(s.moving.b)}` : 'at ' + esc(s.at)}`; });
    html += `<p class="details">${veh.join('. ')}.</p></div>`;
    return html;
  }

  function onShow() { if (built) { fitMap(); update(); } else render(); }
  // For the Race Control board: the same password unlocks it, and it shows where the vehicles are.
  function storedPw() { try { return localStorage.getItem(LS); } catch (e) { return null; } }
  function vehicles() {
    if (!P) return [];
    const h = curH();
    return VEH().map(v => { const s = vehicle(v, h); return { id: v, label: P.veh[v], where: s.moving ? 'to ' + s.moving.b : s.at }; });
  }
  function soOnPost() {
    const src = P || SO;
    if (!src) return [];
    if (!T0) T0 = new Date(src.t0);
    const h = curH();
    return src.stations.map(s => ({ name: s.name, lat: s.lat, lon: s.lon, posts: (src.st || src.posts).filter(p => p.station === s.name && !/passage/i.test(p.label) && on(p, h)) }))
      .filter(x => x.posts.length);
  }
  window.MedPlan = { unlocked: () => !!P, pw: storedPw, vehicles, soOnPost, render, nearbyHTML, soNearHTML, soLine, onShow, ready: unlockStored().then(ok => { if (ok) render(); refreshFind(); }) };
  // Keep the public Safety Officer markers in step with the clock when the plan isn't unlocked.
  setInterval(() => { if (!P) drawFindLayer(); }, 5 * 60e3);
  addEventListener('load', () => { if (!P) drawFindLayer(); });
})();
