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
    addTrail(c.latitude, c.longitude, c.accuracy);
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
  // How far off the course you are decides what the app says:
  //   up to 50 m: on the course · 50 to 300 m: just off (direction back) · 300 m to 2 km: off the course
  //   (named if at an access point or aid station; walk-out times assume you get back onto the course first)
  //   2 to 10 km: a long way off (named if at a base; no walk-out times) · over 10 km: no course answers.
  const ON_M = 50, NEAR_M = 300, OFF_M = 2000, FAR_M = 10000, POOR_GPS_M = 100;
  const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  function compass(from, to) {
    const r = Math.PI / 180, y = Math.sin((to[1] - from[1]) * r) * Math.cos(to[0] * r);
    const x = Math.cos(from[0] * r) * Math.sin(to[0] * r) - Math.sin(from[0] * r) * Math.cos(to[0] * r) * Math.cos((to[1] - from[1]) * r);
    return DIRS[Math.round(((Math.atan2(y, x) / r + 360) % 360) / 45) % 8];
  }
  const dist = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${one(m / 1000)} km`;
  // Where you are relative to the course, for the screen and the message.
  function situation() {
    const { E, r } = here, me = [here.lat, here.lon], cp = [r.lat, r.lon];
    const tier = here.manual || here.offM <= ON_M ? 'on' : here.offM <= NEAR_M ? 'near' : here.offM <= OFF_M ? 'off' : here.offM <= FAR_M ? 'long' : 'far';
    const dir = tier === 'on' ? '' : compass(me, cp);
    let at = null;
    if (tier === 'off') {
      const spots = E.ACCESS.map(a => ({ name: E.cleanName(a), lat: a.lat, lon: a.lon })).concat(E.AID.map(a => ({ name: a.name, lat: a.lat, lon: a.lon })));
      const best = spots.map(x => ({ x, d: E.metres(me, [x.lat, x.lon]) })).sort((a, b) => a.d - b.d)[0];
      if (best && best.d < 300) at = best.x.name;
    } else if (tier === 'long') {
      const best = E.BASES.map(b => ({ b, d: E.metres(me, [b.lat, b.lon]) })).sort((a, b) => a.d - b.d)[0];
      if (best && best.d < 1500) at = best.b.name + ' base';
    }
    return { tier, dir, at };
  }
  function render() {
    if (!here) return;
    $('fdOut').hidden = false;
    const { E, r } = here, g = here.gps, S = situation();
    here.S = S;
    $('fdOut').classList.toggle('far', S.tier === 'far');
    $('fdOut').classList.toggle('long', S.tier === 'long');
    const poor = g && g.acc > POOR_GPS_M ? `<p class="notice warn"><b>GPS isn't accurate enough yet</b> (±${Math.round(g.acc)} m). Stand in the open and tap Where am I? again.</p>` : '';
    const pos = `<p class="fd-facts">${here.lat.toFixed(5)}, ${here.lon.toFixed(5)}${g ? ` · GPS ±${Math.round(g.acc)} m` : ''}${here.w3w ? ` · <a href="https://w3w.co/${esc(here.w3w)}" target="_blank" rel="noopener">///${esc(here.w3w)}</a>` : ''}</p>`;
    const kmTag = E.main ? '' : `<span class="fd-course">${esc(E.name)}</span>`;
    if (S.tier === 'far') {
      $('fdWhere').innerHTML = `${poor}
        <div class="fd-kmrow"><span class="fd-kmbig">${Math.round(here.offM / 1000)} KM</span></div>
        <p class="fd-between">from the course</p>
        <p class="notice warn">You're more than ${FAR_M / 1000} km from the GPT100 courses, so the app won't point you to a course km or a way out from here. Where am I? works within ${FAR_M / 1000} km of the course.</p>
        ${pos}<p class="fd-facts">Need a point on the course? Enter the km above.</p>`;
      $('fdOutWay').innerHTML = '';
      drawMap(null, 'far');
      profile.setHere(null);
      return;
    }
    if (S.tier === 'long') {
      $('fdWhere').innerHTML = `${poor}
        <div class="fd-kmrow"><span class="fd-kmbig">${one(here.offM / 1000)} KM</span>${kmTag}</div>
        <p class="fd-between">${S.at ? `At ${esc(S.at)}, ` : ''}from the course</p>
        <p class="fd-facts">Nearest course point: <b>km ${one(r.km)}</b>, ${S.dir} of you (${esc(between(r))}). Walking times don't apply from here.</p>
        ${pos}`;
      $('fdOutWay').innerHTML = '';
      sendLinks();
      weather();
      drawMap(null, 'long');
      profile.setHere(null);
      return;
    }
    const off = S.tier === 'on' ? (here.manual ? 'From the km you entered' : 'On the course')
      : S.tier === 'near' ? `Just off the course. The course is ${dist(here.offM)} ${S.dir} of you`
      : `${S.at ? `At ${esc(S.at)}, ` : ''}${dist(here.offM)} off the course. The course is ${S.dir} of you (straight line, may not be walkable)`;
    $('fdWhere').innerHTML = `${poor}
      <div class="fd-kmrow"><span class="fd-kmbig">KM ${one(r.km)}</span>${kmTag}</div>
      <p class="fd-between">${esc(between(r))}</p>
      <p class="fd-facts fd-off-${S.tier}"><b>${off}</b> · ${Math.round(r.ele)} m high</p>
      ${pos}`;
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
    if (S.tier === 'off') h = `<p class="notice warn">You're ${dist(here.offM)} off the course. These times assume you get back onto the course at km ${one(r.km)} first.</p>` + h;
    $('fdOutWay').innerHTML = h;
    sendLinks();
    weather();
    drawMap(w, S.tier);
    profile.setHere({ E, km: r.km, ele: r.ele });
  }

  // ---------- elevation profile (js/profile.js) ----------
  let profile = null;

  // ---------- send my location (WhatsApp) ----------
  function message(urgent) {
    const r = here.r, E = here.E, note = $('fdNote').value.trim(), S = here.S || { tier: 'on' };
    const long = S.tier === 'long', w = long ? null : r.results.slice().sort((a, b) => a.walk - b.walk)[0];
    const where = S.tier === 'on' ? `${E.name} km ${one(r.km)}${between(r) ? ', ' + between(r) : ''}`
      : `${S.at ? 'at ' + S.at + ', ' : ''}${dist(here.offM)} ${({ north: 'south', 'north-east': 'south-west', east: 'west', 'south-east': 'north-west', south: 'north', 'south-west': 'north-east', west: 'east', 'north-west': 'south-east' })[S.dir]} of the course at ${E.name} km ${one(r.km)}${between(r) ? ' (' + between(r) + ')' : ''}`;
    const lines = [
      urgent ? `URGENT: casualty ${S.tier === 'on' ? 'at ' : ''}${where}.` : `My location: ${where}.`,
      note ? 'Note: ' + note : '',
      `Position ${here.lat.toFixed(5)}, ${here.lon.toFixed(5)}${here.gps ? ` (GPS ±${Math.round(here.gps.acc)} m)` : ' (from the km)'}.`,
      here.w3w ? `what3words ///${here.w3w}` : '',
      `Map: https://maps.google.com/?q=${here.lat.toFixed(5)},${here.lon.toFixed(5)}`,
      w ? `Nearest vehicle access: ${E.cleanName(w.a)}${E.isGated(w.a) ? ' (gated)' : ''}, ${one(w.walkKm)} km walk.` : '',
      urgent && !long ? `Fastest team: ${r.best.base.name}, about ${E.fmt(r.best.total)}.` : '',
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
  // The map is up from the start: both courses, aid stations and water points, on a topo map (or the street map).
  function initMap() {
    if (!window.L) { $('fdMap').innerHTML = '<p class="map-off">Map unavailable without signal.</p>'; return; }
    map = L.map('fdMap', { zoomControl: true });
    GPTBaseMap(map);
    MAIN.courses.forEach(E => {
      L.polyline(E.route.map(p => [p[0], p[1]]), { color: E.main ? '#d9531e' : '#1666c9', weight: 4, opacity: .8 }).addTo(map);
      E.AID.forEach(a => { const p = E.route[E.idxAtKm(a.trail_km)]; L.circleMarker([p[0], p[1]], { radius: 5, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1 }).bindTooltip(`${esc(a.name)}<br>km ${one(a.trail_km)}${E.main ? '' : ' (' + esc(E.name) + ')'}`).addTo(map); });
    });
    trailLine = L.polyline([], { color: '#7a3db8', weight: 3, opacity: .9, dashArray: '1 6', lineCap: 'round', interactive: false }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.fitBounds(L.latLngBounds(MAIN.route.map(p => [p[0], p[1]])).pad(0.03));
    map.on('click', e => profile.showLL(e.latlng.lat, e.latlng.lng, map.getZoom()));
    window.GPTField = { map };
  }

  // ---------- breadcrumb trail ----------
  // Each GPS fix is kept on this phone (for 24 hours), so a sweep can see where they've been.
  const TRAIL_KEY = 'fdTrail', DAY = 864e5;
  let trail = [], trailLine = null;
  try { trail = (JSON.parse(localStorage.getItem(TRAIL_KEY)) || []).filter(p => Date.now() - p[2] < DAY); } catch (e) { trail = []; }
  const metres = (a, b) => { const R = 6371e3, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r, x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  function addTrail(lat, lon, acc) {
    if (acc > 60) return;
    const p = [+lat.toFixed(6), +lon.toFixed(6), Date.now()], last = trail[trail.length - 1];
    if (last && metres(last, p) < Math.max(10, acc / 2)) return;
    trail.push(p);
    if (trail.length > 3000) trail.splice(0, trail.length - 3000);
    try { localStorage.setItem(TRAIL_KEY, JSON.stringify(trail)); } catch (e) { }
    showTrail();
  }
  function showTrail() {
    if (trailLine) trailLine.setLatLngs(trail.map(p => [p[0], p[1]]));
    const el = $('fdTrail');
    if (trail.length < 2) { el.hidden = true; return; }
    let m = 0; for (let i = 1; i < trail.length; i++) m += metres(trail[i - 1], trail[i]);
    el.hidden = false;
    el.innerHTML = `<span class="fd-trail-key"></span>Your trail: <b>${one(m / 1000)} km</b> since ${tf.format(new Date(trail[0][2]))} <button type="button" class="fd-linkbtn" id="fdTrailClear">Clear</button>`;
    $('fdTrailClear').onclick = () => { if (!confirm('Clear your trail on this phone?')) return; trail = []; try { localStorage.removeItem(TRAIL_KEY); } catch (e) { } showTrail(); };
  }
  function drawMap(w, tier) {
    const far = tier === 'far' || tier === 'long';
    if (!map) return;
    layer.clearLayers();
    const me = [here.lat, here.lon], pts = [me];
    // Off the course: a dashed line to the nearest course point.
    if (tier && tier !== 'on' && tier !== 'far') { const cp = [here.r.lat, here.r.lon]; pts.push(cp); L.polyline([me, cp], { color: '#111', weight: 2, dashArray: '4 6', interactive: false }).addTo(layer); L.circleMarker(cp, { radius: 6, color: '#111', weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip('Course km ' + one(here.r.km)).addTo(layer); }
    if (here.gps) L.circle(me, { radius: here.gps.acc, color: '#1666c9', weight: 1, fillOpacity: .12 }).addTo(layer);
    L.circleMarker(me, { radius: 9, color: '#fff', weight: 3, fillColor: '#1666c9', fillOpacity: 1 }).bindTooltip('You').addTo(layer);
    if (w) {
      pts.push([w.a.lat, w.a.lon]);
      L.circleMarker([w.a.lat, w.a.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1 }).bindTooltip(here.E.cleanName(w.a)).addTo(layer);
      const line = w.connGeom && w.connGeom.length > 1 ? w.connGeom : null;
      if (line) L.polyline(line, { color: '#1666c9', weight: 4, dashArray: '2 8', lineCap: 'round' }).addTo(layer);
    }
    map.invalidateSize();
    // Far away: show you and the course together.
    if (tier === 'far') { map.fitBounds(L.latLngBounds(pts).extend(L.latLngBounds(MAIN.route.map(p => [p[0], p[1]]))).pad(0.1)); return; }
    if (far) { map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 14 }); return; }
    map.fitBounds(L.latLngBounds(pts).pad(0.5), { maxZoom: 15 });
  }

  // ---------- save the map for offline ----------
  // Until the topo map is saved on the phone, a card at the top asks for it; then it shrinks to one line.
  const OM = window.GPTOfflineMap;
  let saving = false;
  async function offlineCard() {
    const el = $('fdOffline');
    if (!OM || !OM.available()) { el.hidden = true; return; }
    const st = await OM.status(), mb = Math.round(OM.bytes / 1e6);
    el.hidden = false;
    if (saving) return;
    if (st.saved) {
      el.className = 'fd-offline ok';
      el.innerHTML = `<span class="fd-tick">✓</span> Map saved for use without signal${st.when ? ', ' + new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short' }).format(new Date(st.when)) : ''}.`;
      return;
    }
    el.className = 'fd-offline fd-card todo';
    el.innerHTML = `<h2>Save the map before you leave signal</h2>
      <p>The topo map 2 km either side of both courses, so it works with no signal. About ${mb} MB: best on wifi.${st.have ? ` ${st.have} of ${st.total} map squares already saved.` : ''}</p>
      <button id="fdSaveMap" class="fd-big" type="button">Save map for offline</button>
      <div class="fd-bar" hidden><i></i></div><p class="fd-hint" id="fdSaveMsg"></p>`;
    $('fdSaveMap').onclick = saveMap;
  }
  async function saveMap() {
    if (!navigator.onLine) { $('fdSaveMsg').textContent = 'No signal. Try again with wifi or good signal.'; return; }
    saving = true;
    const btn = $('fdSaveMap'), bar = document.querySelector('.fd-bar'), m = $('fdSaveMsg');
    btn.disabled = true; btn.textContent = 'Saving…'; bar.hidden = false;
    m.textContent = 'Keep the app open until it finishes.';
    const r = await OM.save((d, t) => { bar.firstChild.style.width = (100 * d / t).toFixed(1) + '%'; btn.textContent = `Saving ${Math.round(100 * d / t)}%`; });
    saving = false;
    if (r.failed) {
      await offlineCard();
      $('fdSaveMsg').textContent = `${r.failed} map squares didn't save. Tap Save again with better signal to finish.`;
      $('fdSaveMsg').classList.add('bad');
    } else offlineCard();
  }

  // ---------- start ----------
  initMap();
  profile = GPTProfile({ el: $('fdProf'), course: MAIN, map: () => map, who: 'you', empty: 'Tap Where am I? to see where you are. Drag along the profile, or tap the course on the map, to see any point.' });
  showTrail();
  offlineCard();
  let rz = null; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (map) map.invalidateSize(); }, 200); });
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
