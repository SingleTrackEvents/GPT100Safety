// GPT100 Field: for Safety Officers, sweeps and aid station crews on the course.
// Where am I (GPS or km), the nearest way out, local weather, and send my location by WhatsApp.
// Works offline once opened with signal; what3words and weather need signal (weather uses the last copy).
(function () {
  const C = window.GPT100_CONFIG, MAIN = window.GPT;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const one = x => (Math.round(x * 10) / 10).toFixed(1);
  const tf = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let here = null, watchId = null, map = null, layer = null;

  // ---------- where am I ----------
  // Snap to whichever course is nearest (the GPT100, or the 14k when it's clearly closer).
  function place(lat, lon, gps) {
    let best = null;
    MAIN.courses.forEach(E => {
      const s = E.snap(lat, lon);
      if (!best || s.offM < best.s.offM - (E.main ? 0 : 50)) best = { E, s };
    });
    const E = best.E, r = E.assess(best.s.ic);
    here = { lat, lon, E, r, offM: best.s.offM, gps, t: Date.now(), w3w: null };
    render();
    lookupW3w(lat, lon);
  }
  function fromKm(km) {
    const E = MAIN, ic = E.idxAtKm(km), p = E.route[ic];
    here = { lat: p[0], lon: p[1], E, r: E.assess(ic), offM: 0, gps: null, t: Date.now(), w3w: null, manual: true };
    render();
    lookupW3w(p[0], p[1]);
  }
  function locate() {
    if (!navigator.geolocation) { msg('This phone can\'t share its location with the app. Enter the km instead.', true); return; }
    msg('Finding you… (stand in the open for the best fix)');
    navigator.geolocation.getCurrentPosition(gotFix, gpsError, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
  }
  function gotFix(p) {
    const c = p.coords;
    msg(`GPS fix ${tf.format(new Date(p.timestamp))}, accurate to about ${Math.round(c.accuracy)} m.`);
    place(c.latitude, c.longitude, { acc: c.accuracy, alt: c.altitude, t: p.timestamp });
  }
  function gpsError(e) {
    msg(e.code === 1 ? 'Location is blocked for this site. Allow location in the phone settings, or enter the km.'
      : 'No GPS fix yet. Try again in the open, or enter the km.', true);
  }
  function follow(on) {
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (on && navigator.geolocation) watchId = navigator.geolocation.watchPosition(gotFix, gpsError, { enableHighAccuracy: true, maximumAge: 15000 });
  }
  function msg(t, bad) { const m = $('fdGpsMsg'); m.textContent = t; m.classList.toggle('bad', !!bad); }

  // ---------- what3words (needs signal; the key only works on the live site) ----------
  async function lookupW3w(lat, lon) {
    if (!navigator.onLine || !C.what3wordsKey) return;
    try {
      const qs = new URLSearchParams({ key: C.what3wordsKey, coordinates: lat.toFixed(5) + ',' + lon.toFixed(5) });
      const j = await (await fetch('https://api.what3words.com/v3/convert-to-3wa?' + qs)).json();
      if (j.words && here && here.lat === lat) { here.w3w = j.words; render(); }
    } catch (e) { /* no signal or no key: leave it out */ }
  }

  // ---------- show it ----------
  function between(r) {
    const p = r.aid.prev, n = r.aid.next;
    if (p && p.distKm < 0.3) return 'at ' + p.a.name;
    if (n && n.distKm < 0.3) return 'at ' + n.a.name;
    return p && n ? `between ${p.a.name} and ${n.a.name}` : '';
  }
  function render() {
    if (!here) return;
    $('fdOut').hidden = false;
    const { E, r } = here, g = here.gps;
    const off = here.offM < 40 ? 'On the course' : here.offM < 1000 ? `${here.offM} m from the course` : `${one(here.offM / 1000)} km from the course`;
    $('fdWhere').innerHTML = `
      <div class="fd-kmrow"><span class="fd-kmbig">KM ${one(r.km)}</span>${E.main ? '' : `<span class="fd-course">${esc(E.name)}</span>`}</div>
      <p class="fd-between">${esc(between(r))}</p>
      <p class="fd-facts"><b>${off}</b> · ${Math.round(r.ele)} m high${g ? ` · GPS ±${Math.round(g.acc)} m` : ' · from the km you entered'}</p>
      <p class="fd-facts">${here.lat.toFixed(5)}, ${here.lon.toFixed(5)}${here.w3w ? ` · <a href="https://w3w.co/${esc(here.w3w)}" target="_blank" rel="noopener">///${esc(here.w3w)}</a>` : ''}</p>
      ${here.offM > 1500 ? '<p class="notice warn">You are a long way from the course. Check the location before sending.</p>' : ''}`;
    // Nearest way out: the closest vehicle access (by walking time), and the aid stations either side.
    const opts = r.results.slice().sort((a, b) => a.walk - b.walk);
    const w = opts[0], seen = new Set();
    let h = '';
    if (w) {
      h += `<div class="fd-way"><b>Walk out to ${esc(E.cleanName(w.a))}${E.isGated(w.a) ? ' <span class="tag gated">Gated</span>' : ''}</b>
        <span>${one(w.walkKm)} km, about ${E.fmt(w.walk)} on foot${w.a.w3w ? ` · <a href="https://w3w.co/${esc(w.a.w3w)}" target="_blank" rel="noopener">///${esc(w.a.w3w)}</a>` : ''}</span>
        <span>Drive from there: ${r.results.filter(x => x.a === w.a).map(x => `${esc(x.base.name)} ${E.fmt(x.drive)}`).join(' · ')}</span></div>`;
      seen.add(w.a);
    }
    [['Back', r.aid.prev], ['Ahead', r.aid.next]].forEach(([l, x]) => {
      if (!x) return;
      h += `<div class="fd-way"><b>${l}: ${esc(x.a.name)}</b><span>${one(x.distKm)} km, about ${E.fmt(x.walk)} on foot${x.a.w3w ? ` · <a href="https://w3w.co/${esc(x.a.w3w)}" target="_blank" rel="noopener">///${esc(x.a.w3w)}</a>` : ''}</span></div>`;
    });
    h += `<p class="fd-hint">The team that would come to you: <b>${esc(r.best.base.name)}</b>, about ${E.fmt(r.best.total)}.</p>`;
    $('fdOutWay').innerHTML = h;
    sendLinks();
    weather();
    drawMap(w);
    // The first fix shows this section, unless a view was already picked.
    setProfMode(profPicked ? profMode : 'section');
  }

  // ---------- elevation profile ----------
  // The whole course, or the section between the aid stations either side of you, with the aid stations,
  // where you are, and the distance and climb to the next one. Drag along it to see any point on the map.
  let profMode = 'course', profPicked = false, hoverMk = null;
  const short = n => n.replace(/\s*\((start|finish|aid station|water point|checkpoint|emergency aid)\)/ig, '').replace(/ (Carpark|Trailhead|Camp|Rd|Fireline|Track)$/, '');
  function setProfMode(m) {
    profMode = m;
    document.querySelectorAll('.fd-seg button').forEach(b => { b.classList.toggle('on', b.dataset.p === m); if (b.dataset.p === 'section') b.disabled = !here; });
    drawProfile();
  }
  function profRange() {
    const E = here ? here.E : MAIN, route = E.route, last = route[route.length - 1][2];
    if (profMode !== 'section' || !here) return { E, k0: 0, k1: last };
    const km = here.r.km, A = E.AID;
    let a = A[0], b = A[A.length - 1];
    for (let i = 1; i < A.length; i++) if (A[i].trail_km >= km) { a = A[i - 1]; b = A[i]; break; }
    // A short section still gets a useful width.
    let k0 = a.trail_km, k1 = b.trail_km;
    if (k1 - k0 < 3) { const m = (k0 + k1) / 2; k0 = Math.max(0, m - 1.5); k1 = Math.min(last, m + 1.5); }
    return { E, k0, k1, a, b };
  }
  function drawProfile() {
    const box = $('fdProfile'); if (!box) return;
    const R = profRange(), E = R.E, route = E.route;
    const Wd = Math.max(280, box.clientWidth || 340), Ht = 164, L0 = 34, R0 = 8, T0 = 32, B0 = 18;
    const i0 = E.idxAtKm(R.k0), i1 = E.idxAtKm(R.k1);
    const step = Math.max(1, Math.floor((i1 - i0) / 500));
    const pts = []; for (let i = i0; i <= i1; i += step) pts.push(route[i]); if (pts[pts.length - 1] !== route[i1]) pts.push(route[i1]);
    let lo = Math.min(...pts.map(p => p[3])), hi = Math.max(...pts.map(p => p[3]));
    const pad = Math.max(20, (hi - lo) * 0.12); lo = Math.max(0, lo - pad); hi += pad;
    const X = km => L0 + (Wd - L0 - R0) * (km - R.k0) / (R.k1 - R.k0 || 1), Y = e => T0 + (Ht - T0 - B0) * (1 - (e - lo) / (hi - lo || 1));
    const line = pts.map((p, k) => (k ? 'L' : 'M') + X(p[2]).toFixed(1) + ',' + Y(p[3]).toFixed(1)).join('');
    let svg = `<path d="${line}L${X(pts[pts.length - 1][2]).toFixed(1)},${Ht - B0}L${X(pts[0][2]).toFixed(1)},${Ht - B0}Z" fill="#e7e3da"/>`;
    // Ahead of you to the next aid station, shaded.
    if (here && here.E === E) {
      const nx = E.AID.find(a => a.trail_km > here.r.km + 0.05);
      if (nx) {
        const seg = pts.filter(p => p[2] >= here.r.km && p[2] <= nx.trail_km);
        if (seg.length > 1) svg += `<path d="${seg.map((p, k) => (k ? 'L' : 'M') + X(p[2]).toFixed(1) + ',' + Y(p[3]).toFixed(1)).join('')}L${X(seg[seg.length - 1][2]).toFixed(1)},${Ht - B0}L${X(seg[0][2]).toFixed(1)},${Ht - B0}Z" fill="rgba(217,83,30,.22)"/>`;
      }
    }
    svg += `<path d="${line}" fill="none" stroke="#111" stroke-width="2"/>`;
    // Height and km axes.
    [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15].forEach(e => { svg += `<text x="${L0 - 4}" y="${Y(e) + 3}" text-anchor="end">${Math.round(e / 10) * 10}</text><line x1="${L0}" x2="${Wd - R0}" y1="${Y(e)}" y2="${Y(e)}" stroke="#ddd"/>`; });
    const span = R.k1 - R.k0, tick = span > 80 ? 20 : span > 30 ? 10 : span > 12 ? 5 : span > 5 ? 2 : 1;
    for (let k = Math.ceil(R.k0 / tick) * tick; k <= R.k1; k += tick) svg += `<text x="${X(k)}" y="${Ht - 4}" text-anchor="middle">${k}</text>`;
    // Aid stations: a line and a short name where there's room.
    // Two rows of names; a name that won't fit in either is left off (the line and dot stay).
    const ends = [-1e9, -1e9];
    E.AID.filter(a => a.trail_km >= R.k0 - 0.01 && a.trail_km <= R.k1 + 0.01).forEach(a => {
      const x = X(a.trail_km), name = short(a.name), w = name.length * 6 + 4;
      svg += `<line x1="${x}" x2="${x}" y1="${T0 - 2}" y2="${Ht - B0}" stroke="#111" stroke-width="1" stroke-dasharray="2 3" opacity=".55"/><circle cx="${x}" cy="${Y(route[E.idxAtKm(a.trail_km)][3])}" r="3.5" fill="#111"/>`;
      const anchor = x + w / 2 > Wd - R0 ? 'end' : x - w / 2 < L0 ? 'start' : 'middle';
      const left = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
      const row = ends.findIndex(e => left > e);
      if (row < 0) return;
      ends[row] = left + w;
      svg += `<text class="fd-aid" x="${x}" y="${row ? T0 - 6 : T0 - 19}" text-anchor="${anchor}">${esc(name)}</text>`;
    });
    // You.
    if (here && here.E === E && here.r.km >= R.k0 && here.r.km <= R.k1) {
      const x = X(here.r.km), y = Y(here.r.ele);
      svg += `<line x1="${x}" x2="${x}" y1="${T0}" y2="${Ht - B0}" stroke="#1666c9" stroke-width="2"/><circle cx="${x}" cy="${y}" r="6" fill="#1666c9" stroke="#fff" stroke-width="2"/>`;
    }
    svg += `<g id="fdHover" visibility="hidden"><line x1="0" x2="0" y1="${T0}" y2="${Ht - B0}" stroke="#d9531e" stroke-width="1.5"/><circle r="4" fill="#d9531e"/></g>`;
    box.innerHTML = `<svg viewBox="0 0 ${Wd} ${Ht}" width="${Wd}" height="${Ht}">${svg}</svg>`;
    $('fdProfTitle').textContent = profMode === 'section' && R.a ? `${short(R.a.name)} to ${short(R.b.name)}` : `${E.name} course, ${Math.round(route[route.length - 1][2])} km`;
    profInfo(R);
    // Drag along the profile: km and height, and a dot on the map.
    const el = box.querySelector('svg'), hov = el.querySelector('#fdHover');
    const move = ev => {
      const r = el.getBoundingClientRect(), x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const km = Math.max(R.k0, Math.min(R.k1, R.k0 + (x - L0) / (Wd - L0 - R0) * (R.k1 - R.k0)));
      const p = route[E.idxAtKm(km)];
      hov.setAttribute('visibility', 'visible');
      hov.querySelector('line').setAttribute('x1', X(p[2])); hov.querySelector('line').setAttribute('x2', X(p[2]));
      hov.querySelector('circle').setAttribute('cx', X(p[2])); hov.querySelector('circle').setAttribute('cy', Y(p[3]));
      $('fdProfInfo').innerHTML = `<b>km ${one(p[2])}</b> · ${Math.round(p[3])} m${here && here.E === E ? ` · ${one(Math.abs(p[2] - here.r.km))} km ${p[2] >= here.r.km ? 'ahead' : 'back'}` : ''}`;
      if (map) { if (!hoverMk) hoverMk = L.circleMarker([p[0], p[1]], { radius: 7, color: '#fff', weight: 2, fillColor: '#d9531e', fillOpacity: 1 }).addTo(map); else hoverMk.setLatLng([p[0], p[1]]).addTo(map); }
    };
    const end = () => { hov.setAttribute('visibility', 'hidden'); profInfo(profRange()); if (hoverMk) hoverMk.remove(); };
    el.addEventListener('pointerdown', move); el.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) move(e); });
    el.addEventListener('pointerleave', end); el.addEventListener('pointerup', () => setTimeout(end, 2500));
    el.addEventListener('touchmove', move, { passive: true });
  }
  // Under the profile: the distance, climb and descent to the next aid station.
  function profInfo(R) {
    const info = $('fdProfInfo');
    if (!here || here.E !== R.E) { info.textContent = 'Tap Where am I? to see where you are. Drag along the profile to see any point.'; return; }
    const E = here.E, ic = E.idxAtKm(here.r.km);
    const nx = E.AID.find(a => a.trail_km > here.r.km + 0.05), pv = [...E.AID].reverse().find(a => a.trail_km <= here.r.km + 0.05);
    const part = (a, dir) => {
      if (!a) return '';
      const j = E.idxAtKm(a.trail_km), up = E.climb(ic, j), down = E.climb(j, ic);
      return `<b>${dir} ${esc(short(a.name))}</b> ${one(Math.abs(a.trail_km - here.r.km))} km, +${Math.round(up)} m / −${Math.round(down)} m`;
    };
    info.innerHTML = [part(nx, 'To'), part(pv, 'Back to')].filter(Boolean).join('<br>');
  }

  // ---------- send my location (WhatsApp) ----------
  function message(urgent) {
    const r = here.r, E = here.E, note = $('fdNote').value.trim();
    const w = r.results.slice().sort((a, b) => a.walk - b.walk)[0];
    const lines = [
      urgent ? `URGENT: casualty at ${E.name} km ${one(r.km)}${between(r) ? ', ' + between(r) : ''}.` : `My location: ${E.name} km ${one(r.km)}${between(r) ? ', ' + between(r) : ''}.`,
      note ? 'Note: ' + note : '',
      `Position ${here.lat.toFixed(5)}, ${here.lon.toFixed(5)}${here.gps ? ` (GPS ±${Math.round(here.gps.acc)} m)` : ' (from the km)'}${here.offM >= 40 ? `, ${here.offM} m off the course` : ''}.`,
      here.w3w ? `what3words ///${here.w3w}` : '',
      `Map: https://maps.google.com/?q=${here.lat.toFixed(5)},${here.lon.toFixed(5)}`,
      w ? `Nearest vehicle access: ${E.cleanName(w.a)}${E.isGated(w.a) ? ' (gated)' : ''}, ${one(w.walkKm)} km walk.` : '',
      urgent ? `Fastest team: ${r.best.base.name}, about ${E.fmt(r.best.total)}.` : '',
      `Sent ${tf.format(new Date())} from GPT100 Field.`
    ];
    return lines.filter(Boolean).join('\n');
  }
  function sendLinks() {
    if (!here) return;
    $('fdSend').href = 'https://wa.me/?text=' + encodeURIComponent(message(false));
    $('fdUrgent').href = 'https://wa.me/?text=' + encodeURIComponent(message(true));
  }

  // ---------- weather and map ----------
  let wxFor = null;
  async function weather() {
    const key = here.lat.toFixed(3) + ',' + here.lon.toFixed(3);
    if (key === wxFor) return;
    wxFor = key;
    if (!window.WeatherTab) { $('fdWx').innerHTML = '<p class="muted">Weather isn\'t available.</p>'; return; }
    const html = await window.WeatherTab.nearHTML(here.lat, here.lon, here.r.ele).catch(() => '');
    $('fdWx').innerHTML = html || '<p class="muted">No weather data on this phone yet. Open the app once with signal.</p>';
  }
  // The map is up from the start: both courses, aid stations and water points.
  function initMap() {
    if (!window.L) { $('fdMap').innerHTML = '<p class="map-off">Map unavailable without signal.</p>'; return; }
    map = L.map('fdMap', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenStreetMap' }).addTo(map);
    MAIN.courses.forEach(E => {
      L.polyline(E.route.map(p => [p[0], p[1]]), { color: E.main ? '#d9531e' : '#1666c9', weight: 4, opacity: .8 }).addTo(map);
      E.AID.forEach(a => { const p = E.route[E.idxAtKm(a.trail_km)]; L.circleMarker([p[0], p[1]], { radius: 5, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1 }).bindTooltip(`${esc(a.name)}<br>km ${one(a.trail_km)}${E.main ? '' : ' (' + esc(E.name) + ')'}`).addTo(map); });
    });
    layer = L.layerGroup().addTo(map);
    map.fitBounds(L.latLngBounds(MAIN.route.map(p => [p[0], p[1]])).pad(0.03));
  }
  function drawMap(w) {
    if (!map) return;
    layer.clearLayers();
    const me = [here.lat, here.lon], pts = [me];
    if (here.gps) L.circle(me, { radius: here.gps.acc, color: '#1666c9', weight: 1, fillOpacity: .12 }).addTo(layer);
    L.circleMarker(me, { radius: 9, color: '#fff', weight: 3, fillColor: '#1666c9', fillOpacity: 1 }).bindTooltip('You').addTo(layer);
    if (w) {
      pts.push([w.a.lat, w.a.lon]);
      L.circleMarker([w.a.lat, w.a.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1 }).bindTooltip(here.E.cleanName(w.a)).addTo(layer);
      const line = w.connGeom && w.connGeom.length > 1 ? w.connGeom : null;
      if (line) L.polyline(line, { color: '#1666c9', weight: 4, dashArray: '2 8', lineCap: 'round' }).addTo(layer);
    }
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(pts).pad(0.5), { maxZoom: 15 });
  }

  // ---------- start ----------
  initMap();
  drawProfile();
  document.querySelectorAll('.fd-seg button').forEach(b => b.addEventListener('click', () => { profPicked = true; setProfMode(b.dataset.p); }));
  let rz = null; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { drawProfile(); if (map) map.invalidateSize(); }, 200); });
  $('fdLocate').addEventListener('click', locate);
  $('fdFollow').addEventListener('change', e => follow(e.target.checked));
  $('fdKmForm').addEventListener('submit', e => {
    e.preventDefault();
    const km = parseFloat($('fdKm').value);
    if (isNaN(km) || km < 0 || km > MAIN.totalKm + 0.5) { $('fdKm').classList.add('rc-flash'); setTimeout(() => $('fdKm').classList.remove('rc-flash'), 2600); return; }
    msg(''); fromKm(km);
  });
  $('fdNote').addEventListener('input', sendLinks);
  // Refresh the message time and links when the app is reopened.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sendLinks(); });
  if (C.tracking && C.tracking.url) { const t = $('fdTrack'); t.hidden = false; t.innerHTML = `<a class="btn" href="${esc(C.tracking.url)}" target="_blank" rel="noopener">${esc(C.tracking.label || 'Live tracking')}</a>`; }
  function netStatus() { $('net').hidden = navigator.onLine; }
  addEventListener('online', netStatus); addEventListener('offline', netStatus); netStatus();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
})();
