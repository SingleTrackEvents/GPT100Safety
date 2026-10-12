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

  // ---------- race and cut-offs (js/races.js, shared with the runner app) ----------
  // Pick a race (and stage): every aid station with its cut-off and expected time. Once you've tapped Where
  // am I? during the race, the times come from your position and the clock (for sweeps); otherwise from a
  // target time. Where am I? also shows your race km and the next cut-off.
  const RX = window.GPTRaces;
  const rstore = { get(k, d) { try { const v = localStorage.getItem('fd.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('fd.' + k, JSON.stringify(v)); } catch (e) { } } };
  let race = null, stage = null;
  if (RX) race = RX.R.races.find(x => x.id === rstore.get('race')) || RX.R.races[0];
  const rkey = () => race.id + '.' + stage.id;
  function setRace(r) {
    race = r; rstore.set('race', r.id);
    const saved = rstore.get('stage.' + r.id), list = RX.stagesOf(r);
    setStage(list.find(x => x.id === saved) || RX.currentStage(r));
  }
  function setStage(S) {
    stage = S; rstore.set('stage.' + race.id, S.id);
    const list = RX.stagesOf(race), P = S.points, fin = P[P.length - 1];
    $('fdStages').hidden = list.length < 2;
    $('fdStages').innerHTML = list.map(x => `<button type="button" data-s="${x.id}"${x === S ? ' class="on"' : ''}>${esc(x.label)}</button>`).join('');
    $('fdStages').querySelectorAll('button').forEach(b => b.onclick = () => setStage(RX.R.stages[b.dataset.s]));
    $('fdRaceStart').textContent = `${one(fin.km)} km, +${fin.up} m. Starts ${RX.when(P[0].ft)} at ${P[0].name}. Final cut-off ${RX.when(fin.ct)}.`;
    $('fdTarget').value = rstore.get('target.' + rkey(), '');
    raceDraw();
    const En = RX.engineFor(S);
    if (profile && En) { profile.setCourse(En); profileHere(); }
    drawRaceMap(true);
  }
  // Where you are on the picked race: race km, how far off its course, or null when not near it.
  function racePos() {
    if (!here || !stage) return null;
    const En = RX.engineFor(stage), P = stage.points;
    if (!En) return null;
    const i0 = En.idxAtKm(P[0].gk), i1 = En.idxAtKm(P[P.length - 1].gk), ds = [];
    for (let i = i0; i <= i1; i++) ds.push(En.metres([here.lat, here.lon], [En.route[i][0], En.route[i][1]]));
    const bd = Math.min(...ds);
    if (bd > 2000) return null;
    // Where the course doubles back, pick the pass that fits the race clock.
    const cands = ds.map((d, k) => d <= bd + 25 ? i0 + k : -1).filter(i => i >= 0), now = Date.now();
    const expect = now > P[0].ft.getTime() ? RX.toCourse(stage, Math.max(0, RX.interpKm(stage, now))) : En.route[cands[0]][2];
    const bi = cands.reduce((a, b) => Math.abs(En.route[b][2] - expect) < Math.abs(En.route[a][2] - expect) ? b : a, cands[0]);
    return { E: En, ic: bi, rk: Math.max(0, RX.toRace(stage, En.route[bi][2])), offM: Math.round(bd) };
  }
  // Pace: 0 = the first runner's time, 1 = the cut-off. From the target time, else from where you are now.
  function racePace() {
    const P = stage.points, fin = P[P.length - 1], v = $('fdTarget').value.trim(), m = /^(\d{1,2})(?:[:.h ](\d{1,2}))?$/.exec(v);
    if (m) return { p: (P[0].ft.getTime() + (+m[1] * 60 + +(m[2] || 0)) * 60000 - fin.ft) / (fin.ct - fin.ft), from: 'target' };
    const rp = racePos(), now = Date.now();
    if (rp && now > P[0].ft.getTime() && now < fin.ct.getTime() + 6 * 3600e3) return { p: RX.paceAt(stage, rp.rk, now), from: 'here', rp };
    return null;
  }
  function raceLine() {
    const rp = racePos(); if (!rp) return '';
    const P = stage.points, nx = P.find(x => x.km > rp.rk + 0.05), fin = P[P.length - 1];
    let h = `<p class="fd-facts fd-raceline"><b>${esc(race.short)}${race.stages.length > 1 ? ' ' + esc(stage.label) : ''} km ${one(rp.rk)}</b> of ${one(fin.km)}`;
    if (nx) {
      const j = rp.E.idxAtKm(nx.gk);
      h += ` · Next: <b>${esc(nx.name)}</b> in ${one(nx.km - rp.rk)} km, +${Math.round(rp.E.climb(rp.ic, j))} m`;
      if (nx.ct && !nx.noCut) h += `, cut-off <b>${RX.when(nx.ct)}</b>`;
      const now = Date.now();
      if (now > P[0].ft.getTime() && now < fin.ct.getTime() + 6 * 3600e3) {
        const eta = RX.timeAt(stage, nx.km, RX.paceAt(stage, rp.rk, now));
        h += nx.noCut || !nx.ct ? `. At your pace about ${RX.hm.format(new Date(eta))}.` : eta <= nx.ct ? `. At your pace about ${RX.hm.format(new Date(eta))}, ${RX.dur(nx.ct - eta)} before the cut-off.` : `. <b class="fd-late">At your pace about ${RX.hm.format(new Date(eta))}, after the cut-off.</b>`;
      }
    }
    return h + '</p>';
  }
  function raceDraw() {
    if (!stage) return;
    const S = stage, P = S.points, pc = racePace();
    const p = pc && pc.p;
    $('fdTargetMsg').textContent = !pc ? 'Add a target time (hours:minutes), or tap Where am I? during the race, to see expected times.'
      : pc.from === 'here' ? `Expected times from where you are (km ${one(pc.rp.rk)}) at ${RX.hm.format(new Date())}.` : p > 1 ? 'Slower than the cut-offs allow.' : '';
    $('fdTargetMsg').classList.toggle('bad', !!pc && p > 1);
    let last = null;
    $('fdPlan').innerHTML = P.map((x, i) => {
      const eta = p != null && i ? RX.timeAt(S, x.km, p) : null, prev = last; last = x;
      const leg = prev ? `${one(x.km - prev.km)} km, +${x.up - prev.up} / −${x.down - prev.down} m` : '';
      const late = eta && x.ct && !x.noCut && eta > x.ct, past = pc && pc.from === 'here' && x.km <= pc.rp.rk;
      const kind = { start: 'Start', finish: 'Finish', turn: 'Turnaround', aid: 'Aid station', water: 'Water point', emergency: 'Emergency aid', checkpoint: 'Checkpoint' }[x.kind] || 'Aid station';
      return `<div class="rn-row${late ? ' late' : ''}${past ? ' fd-past' : ''}"><div class="rn-km">${one(x.km)}<small>km</small></div>
        <div class="rn-main"><b>${esc(x.name)}</b><div class="rn-tags"><span class="rn-tag">${kind}</span>${x.drop ? '<span class="rn-tag">Drop bag</span>' : ''}</div>${leg ? `<div class="rn-leg">${leg}</div>` : ''}</div>
        <div class="rn-times">${eta && !past ? `<div class="rn-eta">${RX.when(new Date(eta))}</div>` : i ? '' : `<div class="rn-eta">${RX.when(x.ft)}</div>`}${i && x.ct && !x.noCut ? `<div class="rn-cut">Cut-off ${RX.when(x.ct)}</div>` : ''}</div></div>`;
    }).join('');
  }

  // ---------- Safety Officer posts (data/safety-officers.js: public, no names) ----------
  // Shift times are hours from t0 (Melbourne; the race is in daylight saving, UTC+11). During the event,
  // posts not staffed right now are faded; before it, every post shows with its shifts.
  const SO = window.GPT100_SO;
  let soLayer = null, soKey = null;
  const soT0 = SO ? new Date(SO.t0 + '+11:00').getTime() : 0;
  const soTime = h => new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(soT0 + h * 3600e3)).replace(',', '');
  function drawSO() {
    if (!SO || !soLayer) return;
    soLayer.clearLayers();
    const h = (Date.now() - soT0) / 3600e3, live = h >= 0 && h <= SO.n;
    if (!soKey) {
      soKey = L.control({ position: 'bottomright' });
      soKey.onAdd = () => { const d = L.DomUtil.create('div', 'map-legend'); d.innerHTML = '<span class="so-mark on fd-so-key">SO</span>Safety Officers' + (live ? '<br><span class="so-mark fd-so-key" style="opacity:.5">SO</span>Not on post now' : ''); return d; };
      soKey.addTo(map);
    }
    SO.stations.forEach(s => {
      const posts = SO.posts.filter(p => p.station === s.name && !/passage/i.test(p.label));
      if (!posts.length) return;
      const now = posts.filter(p => p.a <= h && p.z > h), lit = !live || now.length;
      L.marker([s.lat, s.lon], {
        zIndexOffset: 400, opacity: lit ? 1 : 0.45, title: s.name + ' Safety Officers',
        icon: L.divIcon({ className: '', html: `<div class="so-mark${lit ? ' on' : ''}">SO</div>`, iconSize: [24, 18], iconAnchor: [12, 9] })
      }).bindPopup(`<b>${esc(s.name)}</b> · Safety Officers<br>${live ? (now.length ? '<b>On post now</b><br>' : 'Not on post now<br>') : ''}` +
        posts.map(p => `${esc(p.label)}: ${soTime(p.a)} to ${soTime(p.z)}`).join('<br>')).addTo(soLayer);
    });
  }
  // Keep on post / not on post current during the event.
  setInterval(() => { if (!document.hidden) drawSO(); }, 5 * 60e3);

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
      ${pos}${raceLine()}<button type="button" class="fd-linkbtn fd-seemap" onclick="GPTFieldTab('map')">See it on the map</button>`;
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
    profileHere();
    raceDraw();
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
  // The map, on its own tab: kept to the picked race (its course in orange, its aid stations with cut-offs),
  // with the other courses faint, Safety Officer posts, you and the way out, on a topo map (or the street map).
  let raceLayer = null, pendingFit = null;
  const mapShown = () => !!map && $('fdMap').offsetWidth > 0;
  // A hidden map can't size itself: fit when the Map tab opens.
  function fitMap(bounds, opts) { if (mapShown()) map.fitBounds(bounds, opts); else pendingFit = [bounds, opts]; }
  function initMap() {
    if (!window.L) { $('fdMap').innerHTML = '<p class="map-off">Map unavailable without signal.</p>'; return; }
    map = L.map('fdMap', { zoomControl: true });
    GPTBaseMap(map);
    MAIN.courses.forEach(E => L.polyline(E.route.map(p => [p[0], p[1]]), { color: '#8a8a8a', weight: 2, opacity: .55, interactive: false }).addTo(map));
    raceLayer = L.layerGroup().addTo(map);
    soLayer = L.layerGroup().addTo(map);
    drawSO();
    trailLine = L.polyline([], { color: '#7a3db8', weight: 3, opacity: .9, dashArray: '1 6', lineCap: 'round', interactive: false }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on('click', e => profile.showLL(e.latlng.lat, e.latlng.lng, map.getZoom()));
    window.GPTField = { map };
  }

  function drawRaceMap(fit) {
    if (!map || !stage) return;
    raceLayer.clearLayers();
    const En = RX.engineFor(stage), P = stage.points;
    $('fdMapFor').textContent = `${race.label}${race.stages.length > 1 ? ', ' + stage.label : ''}: ${one(P[P.length - 1].km)} km`;
    if (!En) return;
    const i0 = En.idxAtKm(P[0].gk), i1 = En.idxAtKm(P[P.length - 1].gk);
    if (!En.main && !MAIN.courses.includes(En)) L.polyline(En.route.map(p => [p[0], p[1]]), { color: '#8a8a8a', weight: 2, opacity: .55, interactive: false }).addTo(raceLayer);
    const line = L.polyline(En.route.slice(i0, i1 + 1).map(p => [p[0], p[1]]), { color: '#d9531e', weight: 5, opacity: .95, interactive: false }).addTo(raceLayer);
    P.forEach((x, i) => L.circleMarker([x.lat, x.lon], { radius: i && i < P.length - 1 ? 6 : 7, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1 })
      .bindTooltip(`<b>${esc(x.name)}</b><br>km ${one(x.km)}${x.ct && i && !x.noCut ? '<br>Cut-off ' + RX.when(x.ct) : i ? '' : '<br>Start ' + RX.when(x.ft)}`).addTo(raceLayer));
    if (fit) fitMap(line.getBounds().pad(0.06));
  }
  // The profile follows the picked race; you're on it when Where am I? puts you on that race.
  function profileHere() {
    const rp = racePos();
    if (!rp) { profile.setHere(null); return; }
    const q = rp.E.route[rp.ic];
    profile.setHere({ E: rp.E, km: q[2], ele: q[3] });
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
    // Far away: show you and the course together.
    if (tier === 'far') { fitMap(L.latLngBounds(pts).extend(L.latLngBounds(MAIN.route.map(p => [p[0], p[1]]))).pad(0.1)); return; }
    if (far) { fitMap(L.latLngBounds(pts).pad(0.3), { maxZoom: 14 }); return; }
    fitMap(L.latLngBounds(pts).pad(0.5), { maxZoom: 15 });
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
    // iPhone in Safari: install first, or the map downloads twice (js/intro.js).
    if (window.GPTIntro && GPTIntro.installFirst()) {
      el.innerHTML = `<h2>Install the app first</h2>
        <p>Add GPT100 Field to your home screen, then save the map from there. On iPhone a map saved in Safari isn't shared with the home screen app, so it would download twice (about ${mb} MB).</p>${GPTIntro.iosSteps('GPT100 Field')}
        <button type="button" class="fd-linkbtn" id="fdSaveHere">Save in Safari anyway</button>`;
      $('fdSaveHere').onclick = () => { GPTIntro.allowBrowserSave(); offlineCard(); };
      return;
    }
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
  profile = GPTProfile({
    el: $('fdProf'), course: MAIN, map: () => map, who: 'you', height: 118,
    empty: 'Tap Where am I? to see where you are. Drag along the profile, or tap the course on the map, to see any point.',
    window: En => stage && En === RX.engineFor(stage) ? { k0: stage.points[0].gk, k1: stage.points[stage.points.length - 1].gk } : null,
    km: { toRace: k => stage ? RX.toRace(stage, k) : k, toCourse: k => stage ? RX.toCourse(stage, k) : k },
    title: () => !stage ? '' : `${race.short}${race.stages.length > 1 ? ' ' + stage.label : ''}: ${one(stage.points[stage.points.length - 1].km)} km`
  });
  showTrail();
  offlineCard();
  // Tabs along the bottom: Where, Map and Race. The last one used is remembered.
  let tab = rstore.get('tab', 'where');
  function setTab(t) {
    if (!document.querySelector(`.rn-tab[data-tab="${t}"]`)) t = 'where';
    tab = t; rstore.set('tab', t);
    document.querySelectorAll('.rn-tab').forEach(el => el.hidden = el.dataset.tab !== t);
    document.querySelectorAll('.rn-nav button').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    if (t === 'map') setTimeout(() => { if (map) { map.invalidateSize(); if (pendingFit) { map.fitBounds(...pendingFit); pendingFit = null; } } if (profile) profile.redraw(); }, 0);
    scrollTo(0, 0);
  }
  document.querySelectorAll('.rn-nav button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('fdChangeRace').onclick = () => setTab('race');
  window.GPTFieldTab = setTab;
  if (RX) {
    $('fdRace').innerHTML = RX.R.races.map(x => `<option value="${x.id}">${esc(x.label)}</option>`).join('');
    $('fdRace').value = race.id;
    // A new race: the map shows that race (after Where am I? has redrawn you on it).
    $('fdRace').onchange = () => { setRace(RX.R.races.find(x => x.id === $('fdRace').value)); if (here) { render(); drawRaceMap(true); } };
    $('fdTarget').addEventListener('input', () => { rstore.set('target.' + rkey(), $('fdTarget').value); raceDraw(); });
    setRace(race);
    setInterval(() => { if (!document.hidden) raceDraw(); }, 60e3);
  } else $('fdRaceCard').hidden = true;
  setTab(tab);
  // First-time intro and how-to (and the ? button).
  if (window.GPTIntro) GPTIntro({
    key: 'gptIntroField', done: offlineCard,
    steps: [
      () => ({ title: 'GPT100 Field', html: `<p>For Safety Officers, sweeps, aid station crews and medics out on the course.</p>
        <p>It tells you exactly where you are on the course, the quickest way out, and sends your location to race control in one tap. Once it's set up it works with no signal.</p>` }),
      GPTIntro.installStep('GPT100 Field', 'Do this first, before saving the map. On iPhone, the home screen app keeps its own copy, so a map saved here in the browser would have to download again.'),
      GPTIntro.saveStep(offlineCard),
      () => ({ title: '3. How to use it', html: `<ul class="rn-tablist">
        <li><b>Where</b> Tap <b>Where am I?</b> for your course km, between which aid stations, and how far off the course you are (and which way the course is). No GPS? Type the km.</li>
        <li><b>Send</b> <b>Send my location</b> or <b>Urgent: casualty here</b> opens WhatsApp with the km, position, map link and nearest vehicle access ready. Add a note, pick the group, send.</li>
        <li><b>Way out</b> The nearest vehicle access and how long it takes on foot, and the aid stations either side.</li>
        <li><b>Map</b> A big topo map of your race: its course, aid stations with cut-offs, and Safety Officer posts (SO). The profile shows the climb ahead; drag it or tap the course to see any point.</li>
        <li><b>Race</b> Pick your race (it stays picked): every aid station with its cut-off, and when you'll reach each one at your current pace (or from a target time). Handy for sweeps.</li>
        <li><b>Trail</b> Turn on <b>Keep updating</b> to follow your position and draw the trail you've walked.</li>
      </ul><p class="fd-hint">Tap <b>?</b> at the top any time to see this again. In an emergency call 000.</p>` })
    ]
  });
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
