// GPT100 Field: for Safety Officers, sweeps and aid station crews on the course.
// Where am I (GPS or km), the nearest way out, local weather, and send my location by WhatsApp.
// Works offline once opened with signal; what3words and weather need signal (weather uses the last copy).
(function () {
  const C = window.GPT100_CONFIG, MAIN = window.GPT;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const one = x => (Math.round(x * 10) / 10).toFixed(1);
  const tf = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let here = null, watchId = null, map = null, layer = null, runnerLayer = null;
  // The race clock: the demo's when it's on (js/demo.js, ?demo=), so cut-offs and expected times can be rehearsed.
  const D0 = window.GPT100_DEMO ? Date.parse(GPT100_DEMO.contests['GPT100 Miler'].start + ':00+11:00') : 0;
  const clock = () => window.GPTDemo && D0 ? D0 + GPTDemo.simNow() : Date.now();
  const ago = ms => ms < 60e3 ? 'just now' : RX.dur(ms) + ' ago';

  // ---------- race and cut-offs (js/races.js, shared with the runner app) ----------
  // Pick a race (and stage): every aid station with its cut-off and expected time. Once you've tapped Where
  // am I? during the race, the times come from your position and the clock (for sweeps); otherwise from a
  // target time. Where am I? also shows your race km and the next cut-off.
  const RX = window.GPTRaces;
  const rstore = { get(k, d) { try { const v = localStorage.getItem('fd.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('fd.' + k, JSON.stringify(v)); } catch (e) { } } };
  let race = null, stage = null;
  if (RX) race = RX.R.races.find(x => x.id === rstore.get('race')) || RX.R.races[0];
  const rkey = () => race.id + '.' + stage.id;
  // The race's own km name: "Miler", "14k", or the stage ("Stage 2").
  const rname = () => race.stages.length > 1 ? stage.label : race.short;
  const dayF = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'short' }), day = t => dayF.format(t == null ? clock() : t);
  function setRace(r) {
    race = r; rstore.set('race', r.id);
    // A stage you tapped stays picked for that day; otherwise today's stage (or the next one).
    const saved = rstore.get('stage.' + r.id), list = RX.stagesOf(r);
    setStage((saved && saved.day === day() && list.find(x => x.id === saved.id)) || RX.currentStage(r, clock()));
  }
  function setStage(S) {
    stage = S;
    const list = RX.stagesOf(race), P = S.points, fin = P[P.length - 1];
    $('fdStages').hidden = list.length < 2;
    $('fdStages').innerHTML = list.map(x => `<button type="button" data-s="${x.id}"${x === S ? ' class="on"' : ''}>${esc(x.label)}</button>`).join('');
    $('fdStages').querySelectorAll('button').forEach(b => b.onclick = () => { rstore.set('stage.' + race.id, { id: b.dataset.s, day: day() }); setStage(RX.R.stages[b.dataset.s]); if (here) render(); });
    $('fdRaceStart').textContent = `${one(fin.km)} km, +${fin.up} m. Starts ${RX.when(P[0].ft)} at ${P[0].name}. Final cut-off ${RX.when(fin.ct)}.`;
    // An older field.html (still in the phone's cache) has no fdKmFor: name the race in its label instead.
    const kf = $('fdKmFor'), kl = document.querySelector('label[for="fdKm"]');
    if (kf) kf.textContent = rname(); else if (kl) kl.textContent = `No GPS? Enter the ${rname()} km`;
    $('fdKm').placeholder = `0 to ${one(fin.km)}`;
    $('fdTarget').value = rstore.get('target.' + rkey(), '');
    raceDraw();
    const En = RX.engineFor(S);
    if (profile && En) { profile.setCourse(En); profileHere(); }
    drawRaceMap(true);
    home();
  }
  // Where you are on the picked race: race km, how far off its course, or null when not near it. A typed km is
  // its own answer (here.mk). Kept on here for each stage.
  let lastFix = null;
  function racePos() {
    if (!here || !stage) return null;
    if (here.rpc && here.rpc.sid === stage.id) return here.rpc.v;
    const En = RX.engineFor(stage);
    here.rpc = { sid: stage.id, v: here.mk && here.mk.sid === stage.id ? { E: En, ic: here.mk.ic, rk: here.mk.rk, offM: 0 } : En ? findPos(En) : null };
    return here.rpc.v;
  }
  function findPos(En) {
    const P = stage.points, i0 = En.idxAtKm(P[0].gk), i1 = En.idxAtKm(P[P.length - 1].gk), ds = [];
    for (let i = i0; i <= i1; i++) ds.push(En.metres([here.lat, here.lon], [En.route[i][0], En.route[i][1]]));
    const bd = Math.min(...ds);
    if (bd > 2000) return null;
    // Where the course doubles back, pick the pass just ahead of your last fix (in the last 2 hours), else the one that fits the race clock.
    const cands = ds.map((d, k) => d <= bd + 25 ? i0 + k : -1).filter(i => i >= 0), t = clock();
    const prev = lastFix && lastFix.sid === stage.id && lastFix.t < here.t && here.t - lastFix.t < 2 * 3600e3 ? lastFix.rk : null;
    const expect = prev != null ? RX.toCourse(stage, prev + 0.3) : t > P[0].ft.getTime() ? RX.toCourse(stage, Math.max(0, RX.interpKm(stage, t))) : En.route[cands[0]][2];
    const bi = cands.reduce((a, b) => Math.abs(En.route[b][2] - expect) < Math.abs(En.route[a][2] - expect) ? b : a, cands[0]);
    const rp = { E: En, ic: bi, rk: Math.max(0, RX.toRace(stage, En.route[bi][2])), offM: Math.round(bd), byFix: prev != null };
    if (!here.manual) lastFix = { sid: stage.id, rk: rp.rk, t: here.t };
    return rp;
  }
  // Pace: 0 = the first runner's time, 1 = the cut-off. From the target time, else from where you are now.
  function racePace() {
    const P = stage.points, fin = P[P.length - 1], v = $('fdTarget').value.trim(), m = /^(\d{1,2})(?:[:.h ](\d{1,2}))?$/.exec(v);
    if (m) return { p: (P[0].ft.getTime() + (+m[1] * 60 + +(m[2] || 0)) * 60000 - fin.ft) / (fin.ct - fin.ft), from: 'target' };
    const rp = racePos(), now = clock(), L = rp && RX.livePace && now < fin.ct.getTime() + 6 * 3600e3 ? RX.livePace(stage, rp.rk, now) : null;
    return L ? Object.assign(L, { from: 'here', rp }) : null;
  }
  // The point you're at (within 0.3 km, as the Where card says) and the next one after it.
  function nextPt(rp) {
    const P = stage.points, at = P.find(x => Math.abs(x.km - rp.rk) < 0.3);
    return { at, nx: P.find(x => x.km > (at ? at.km : rp.rk) + 0.05) };
  }
  // When a runner here now (at the pace that puts them here at this time) would reach the next point. Not before the
  // first runner could be here (a post that early has no runner to go by), nor near the start (too soon to tell),
  // nor when it gives a time already past. Well behind cut-off pace, no time: just that.
  function etaLine(rp, nx) {
    const fin = stage.points[stage.points.length - 1], t = clock();
    if (t >= fin.ct.getTime() + 6 * 3600e3) return null;
    const L = RX.liveEta && RX.liveEta(stage, rp.rk, t, nx); // (an older js/races.js has none)
    if (!L || L.early) return null;
    if (L.behind) return { ok: false, s: 'A runner here now is well behind cut-off pace.' };
    if (L.p < 0 || L.eta <= t) return null;
    // The day too, when it isn't today.
    const m = L.margin, s = `A runner here now gets there about ${day(L.eta) === day(t) ? RX.hm.format(new Date(L.eta)) : RX.when(new Date(L.eta))}`;
    return m == null ? { ok: true, s: s + '.' } : m > -60e3 ? { ok: true, s: s + (m < 60e3 ? ', on the cut-off.' : `, ${RX.dur(m)} before the cut-off.`) } : { ok: false, s: s + ', after the cut-off.' };
  }
  function raceLine() {
    const rp = racePos(); if (!rp) return '';
    const P = stage.points, { at, nx } = nextPt(rp), fin = P[P.length - 1];
    let h = `<p class="fd-facts fd-raceline"><b>${esc(race.short)}${race.stages.length > 1 ? ' ' + esc(stage.label) : ''} km ${one(rp.rk)}</b> of ${one(fin.km)}${at ? ` · At <b>${esc(at.name)}</b>` : ''}`;
    if (nx) {
      const j = rp.E.idxAtKm(nx.gk), e = etaLine(rp, nx);
      h += ` · Next: <b>${esc(nx.name)}</b> in ${one(nx.km - rp.rk)} km, +${Math.round(rp.E.climb(rp.ic, j))} m`;
      if (nx.ct && !nx.noCut) h += `, cut-off <b>${RX.when(nx.ct)}</b>`;
      if (e) h += e.ok ? `. ${e.s}` : `. <b class="fd-late">${e.s}</b>`;
    }
    return h + '</p>';
  }
  function raceDraw() {
    if (!stage) return;
    const S = stage, P = S.points, pc = racePace();
    const p = pc && pc.p;
    const fromHere = pc && pc.from === 'here' ? `where you are (km ${one(pc.rp.rk)}) at ${RX.hm.format(new Date(clock()))}` : '';
    $('fdTargetMsg').textContent = !pc ? 'Add a target time (hours:minutes), or tap Where am I? during the race, to see expected times.'
      : pc.early ? `Too near the start to tell a pace from ${fromHere}: these are the times on cut-off pace.`
      : pc.behind ? `From ${fromHere}, a runner is well behind cut-off pace: they'd get to each point after the time shown.`
      : fromHere ? `Expected times from ${fromHere}.` : p > 1 ? 'Slower than the cut-offs allow.' : '';
    $('fdTargetMsg').classList.toggle('bad', !!pc && (p > 1 || !!pc.behind));
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
    const h = (clock() - soT0) / 3600e3, live = h >= 0 && h <= SO.n / 4; // n is in quarter hours
    if (!soKey) {
      // Bottom left: on a short map the right side is full (layers, full screen, ◎).
      soKey = L.control({ position: 'bottomleft' });
      soKey.onAdd = () => { const d = L.DomUtil.create('div', 'map-legend'); d.innerHTML = '<span class="so-mark on fd-so-key">SO</span>Safety Officers' + (live ? '<br><span class="so-mark fd-so-key">SO</span>Not on post now' : '') + (window.GPTHelipads ? '<br><span class="hls-mk used hls-key">H</span>Helicopter landing site' : ''); return d; };
      soKey.addTo(map);
    }
    SO.stations.forEach(s => {
      const posts = SO.posts.filter(p => p.station === s.name && !/passage/i.test(p.label));
      if (!posts.length) return;
      const now = posts.filter(p => p.a <= h && p.z > h), lit = !live || now.length;
      L.marker([s.lat, s.lon], {
        zIndexOffset: 400, title: s.name + ' Safety Officers',
        icon: L.divIcon({ className: '', html: `<div class="so-mark${lit ? ' on' : ''}">SO</div>`, iconSize: [24, 18], iconAnchor: [12, 9] })
      }).bindPopup(`<b>${esc(s.name)}</b> · Safety Officers<br>${live ? (now.length ? '<b>On post now</b><br>' : 'Not on post now<br>') : ''}` +
        posts.map(p => `${esc(p.label)}: ${soTime(p.a)} to ${soTime(p.z)}`).join('<br>')).addTo(soLayer);
    });
  }
  // Keep on post / not on post current during the event.
  setInterval(() => { if (!document.hidden) drawSO(); }, 5 * 60e3);

  // ---------- where am I ----------
  // Snap to whichever course is nearest (the GPT100, or the 14k when it's clearly closer).
  // near: the stored words of the nearest course point (data/course-w3w.js), for when there's no signal.
  const setHere = (E, ic, lat, lon, o) => { here = Object.assign({ lat, lon, E, r: E.assess(ic, clock()), offM: 0, gps: null, t: Date.now(), w3w: null, near: E.nearW3w(lat, lon), w3wDone: false }, o); };
  function shown() { render(); keep(); lookupW3w(here.lat, here.lon); }
  function place(lat, lon, gps, o) {
    let best = null;
    MAIN.courses.forEach(E => {
      const s = E.snap(lat, lon);
      if (!best || s.offM < best.s.offM - (E.main ? 0 : 50)) best = { E, s };
    });
    const E = best.E;
    setHere(E, best.s.ic, lat, lon, Object.assign({ offM: best.s.offM, gps }, o));
    // Where the course passes the same spot twice (Jimmy Creek), the card takes the race's pass (from your last
    // fix, or the race clock), so the course km and the race km agree.
    const rp = racePos(), q = rp && rp.E === E && rp.ic !== here.r.ic ? E.route[rp.ic] : null;
    if (q && E.metres([lat, lon], [q[0], q[1]]) <= here.offM + 25) here.r = E.assess(rp.ic, clock());
    shown();
  }
  // A typed km is the picked race's km (race km, as on the Race tab), put on that race's course.
  function fromKm(rk) {
    const En = stage && RX.engineFor(stage), gk = En ? RX.toCourse(stage, rk) : rk, F = En || MAIN, ic = F.idxAtKm(gk), p = F.route[ic];
    const o = { manual: true, mk: En ? { sid: stage.id, ic, rk, name: rname() } : null };
    // The 6k, 5k and 2k have no responder data of their own: the nearest point on the GPT100 or 14k stands in.
    if (!F.assess) { place(p[0], p[1], null, o); return; }
    setHere(F, ic, p[0], p[1], o);
    shown();
  }
  function locate() {
    if (!navigator.geolocation) { msg('This phone can\'t share its location with the app. Enter the km instead.', true); return; }
    msg('Finding you… (stand in the open for the best fix)');
    const b = locBtn(); if (b) b.classList.add('busy');
    navigator.geolocation.getCurrentPosition(gotFix, gpsError, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
  }
  function gotFix(p) {
    const c = p.coords, b = locBtn();
    if (b) { b.classList.remove('busy'); b.classList.add('on'); }
    msg(`GPS fix ${tf.format(new Date(p.timestamp))}, accurate to about ${Math.round(c.accuracy)} m.`);
    addTrail(c.latitude, c.longitude, c.accuracy);
    place(c.latitude, c.longitude, { acc: c.accuracy, alt: c.altitude, t: p.timestamp });
  }
  function gpsError(e) {
    const b = locBtn(); if (b) b.classList.remove('busy');
    if (e.code === 1 && watchId != null) { $('fdFollow').checked = false; follow(false); }
    msg(e.code === 1 ? 'Location is blocked for this site. Allow location in the phone settings, or enter the km.'
      : 'No GPS fix yet. Try again in the open, or enter the km.', true);
  }
  function follow(on) {
    rstore.set('follow', !!on);
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (on && navigator.geolocation) watchId = navigator.geolocation.watchPosition(gotFix, gpsError, { enableHighAccuracy: true, maximumAge: 15000 });
  }
  // On the Where tab the message sits under the button; on the map it floats over the map for a few seconds.
  let toastT = null;
  function msg(t, bad) {
    const m = $('fdGpsMsg'); m.textContent = t; m.classList.toggle('bad', !!bad);
    const o = $('fdToast'); if (!o) return;
    clearTimeout(toastT); o.textContent = t; o.hidden = !t; o.classList.toggle('bad', !!bad);
    if (t && !/Finding/.test(t)) toastT = setTimeout(() => { o.hidden = true; }, bad ? 7000 : 3500);
  }
  const locBtn = () => document.querySelector('.rn-locbtn');

  // ---------- what3words ----------
  // The live lookup needs signal (and the key only works on the live site). Without it, the result shows the
  // stored words of the nearest course point (within 30 m), marked as saved.
  async function lookupW3w(lat, lon) {
    const mine = () => here && here.lat === lat && here.lon === lon;
    if (navigator.onLine && C.what3wordsKey) {
      try {
        const qs = new URLSearchParams({ key: C.what3wordsKey, coordinates: lat.toFixed(5) + ',' + lon.toFixed(5) });
        const j = await (await fetch('https://api.what3words.com/v3/convert-to-3wa?' + qs)).json();
        if (j.words && mine()) { here.w3w = j.words; here.w3wDone = true; render(); return; }
      } catch (e) { /* no signal or no key: the stored words will do */ }
    }
    if (mine()) { here.w3wDone = true; render(); }
  }
  // The words to show or send: the live ones, else the stored words of the nearest course point.
  const w3wLink = w => `<a href="https://w3w.co/${esc(w)}" target="_blank" rel="noopener">///${esc(w)}</a>`;
  const savedNote = () => here.near.m ? `saved words, course ${here.near.m} m away` : 'saved words';

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
    const pos = `<p class="fd-facts">${here.lat.toFixed(5)}, ${here.lon.toFixed(5)}${g ? ` · GPS ±${Math.round(g.acc)} m, fix ${tf.format(new Date(here.t))}` : ''}${here.w3w ? ` · ${w3wLink(here.w3w)}` : here.w3wDone && here.near ? ` · ${w3wLink(here.near.words)} (${savedNote()})` : ''}</p>`;
    const kmTag = `<span class="fd-course">${esc(E.name)} course</span>`;
    if (S.tier === 'far') {
      $('fdWhere').innerHTML = `${poor}
        <div class="fd-kmrow"><span class="fd-kmbig">${Math.round(here.offM / 1000)} KM</span></div>
        <p class="fd-between">from the course</p>
        <p class="notice warn">You're more than ${FAR_M / 1000} km from the GPT100 courses, so the app won't point you to a course km or a way out from here. Where am I? works within ${FAR_M / 1000} km of the course.</p>
        ${pos}<p class="fd-facts">Need a point on the course? Enter the km above.</p>`;
      $('fdOutWay').innerHTML = ''; $('fdGrade').innerHTML = '';
      mapNow = `${poorLine()}<span class="rn-warn">You're ${Math.round(here.offM / 1000)} km from the course.</span> Where am I? works within ${FAR_M / 1000} km of it.`;
      drawMap(null, 'far');
      profile.setHere(null);
      home();
      return;
    }
    if (S.tier === 'long') {
      $('fdWhere').innerHTML = `${poor}
        <div class="fd-kmrow"><span class="fd-kmbig">${one(here.offM / 1000)} KM</span></div>
        <p class="fd-between">${S.at ? `At ${esc(S.at)}, ` : ''}from the ${esc(E.name)} course</p>
        <p class="fd-facts">Nearest course point: <b>km ${one(r.km)}</b>, ${S.dir} of you (${esc(between(r))}). Walking times don't apply from here.</p>
        ${pos}`;
      $('fdOutWay').innerHTML = ''; $('fdGrade').innerHTML = '';
      sendLinks();
      weather();
      mapNow = `${poorLine()}<span class="rn-warn">${one(here.offM / 1000)} km from the course${S.at ? ' (at ' + esc(S.at) + ')' : ''}.</span> Nearest course point: km ${one(r.km)}, ${S.dir} of you.`;
      drawMap(null, 'long');
      profile.setHere(null);
      home();
      return;
    }
    const off = S.tier === 'on' ? (here.manual ? `From the ${here.mk ? esc(here.mk.name) + ' ' : ''}km you entered` : 'On the course')
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
        <span>Drive from there: ${r.results.filter(x => x.a === w.a).map(x => `${esc(x.base.name)} ${E.fmt(x.drive)}`).join(' · ')}</span>${w.a.note ? `<span>${esc(w.a.note)}</span>` : ''}</div>`;
      seen.add(w.a);
    }
    [['Back', r.aid.prev], ['Ahead', r.aid.next]].forEach(([l, x]) => {
      if (!x) return;
      h += `<div class="fd-way"><b>${l}: ${esc(x.a.name)}</b><span>${one(x.distKm)} km, about ${E.fmt(x.walk)} on foot${x.a.w3w ? ` · <a href="https://w3w.co/${esc(x.a.w3w)}" target="_blank" rel="noopener">///${esc(x.a.w3w)}</a>` : ''}</span></div>`;
    });
    h += `<p class="fd-hint">The team that would come to you: <b>${esc(r.best.base.name)}</b>, about ${E.fmt(r.best.total)}${r.night ? ' (night times)' : ''}.</p>`;
    if (S.tier === 'off') h = `<p class="notice warn">You're ${dist(here.offM)} off the course. These times assume you get back onto the course at km ${one(r.km)} first.</p>` + h;
    $('fdOutWay').innerHTML = h;
    // Track grade here, what a carry-out crosses, the nearest emergency marker and helipad (Parks Victoria access maps).
    here.w = w;
    $('fdGrade').innerHTML = (window.GPTTrack ? GPTTrack.card(r, E, { vehicle: w }) : '') + runnersHTML(E, r);
    mapNow = summaryLine(w, S);
    sendLinks();
    weather();
    drawMap(w, S.tier);
    profileHere();
    raceDraw();
    home();
  }
  // Live tracking: the runners coming towards you and just past you (for a Safety Officer post or an aid station).
  function runnersHTML(E, r) {
    const TR = window.GPTTracking;
    if (!TR) return '';
    if (!TR.ready()) return `<div class="card trk"><h3>Runners near you</h3><p class="muted">${esc(TR.status())}</p></div>`;
    const back = TR.near(E, r.km, 6, 30).filter(x => TR.cur(x) <= r.km).sort((a, b) => TR.cur(b) - TR.cur(a)).slice(0, 6);
    const ahead = TR.near(E, r.km, 6, 30).filter(x => TR.cur(x) > r.km).sort((a, b) => TR.cur(a) - TR.cur(b)).slice(0, 3);
    const row = (x, dir) => `<div class="row"><span>${TR.who(x)}<span class="sub">km ${one(TR.cur(x))}${x.pos.est ? ' (estimated)' : ''}, ${TR.dist(Math.abs(TR.cur(x) - r.km) * 1000)} ${dir}${x.pos.stopped ? ', <b>not moving</b>' : ''}. ${TR.seen(x)}</span></span></div>`;
    return `<div class="card trk"><h3>Runners near you</h3>` +
      (back.length ? `<p class="fd-hint">Coming towards you (nearest first):</p>` + back.map(x => row(x, 'back')).join('') : '<p class="muted">No tracked runners within 6 km behind you.</p>') +
      (ahead.length ? `<p class="fd-hint">Just past you:</p>` + ahead.map(x => row(x, 'ahead')).join('') : '') +
      `<p class="trk-src">${esc(TR.status())}</p></div>`;
  }
  if (window.GPTTracking) GPTTracking.onUpdate(() => { drawRunners(); if (here && here.S && here.S.tier !== 'far' && here.S.tier !== 'long' && $('fdGrade')) $('fdGrade').innerHTML = (window.GPTTrack ? GPTTrack.card(here.r, here.E, { vehicle: here.w }) : '') + runnersHTML(here.E, here.r); });
  function drawRunners() {
    if (!runnerLayer || !window.GPTTracking) return;
    // Redrawn on every update: an open runner popup is opened again on the new marker, without panning.
    let open = null;
    runnerLayer.eachLayer(l => { if (l.isPopupOpen && l.isPopupOpen()) open = l.options.bib; });
    runnerLayer.clearLayers();
    MAIN.courses.forEach(E => GPTTracking.draw(runnerLayer, E));
    if (open != null) runnerLayer.eachLayer(l => { if (l.options.bib === open && l.getPopup()) { const p = l.getPopup(); p.options.autoPan = false; l.openPopup(); p.options.autoPan = true; } });
  }

  // Under the profile on the map: your race km, the next aid station, its cut-off and your pace, and the way out.
  let mapNow = null;
  const poorLine = () => here.gps && here.gps.acc > POOR_GPS_M ? `<span class="rn-warn">GPS only ±${Math.round(here.gps.acc)} m: stand in the open and tap ◎ again.</span><br>` : '';
  function summaryLine(w, S) {
    const r = here.r, rp = racePos();
    const off = S.tier === 'on' ? '' : ` · <span class="rn-warn">${dist(here.offM)} off the course: it's ${S.dir} of you</span>`;
    let h = poorLine();
    if (rp) {
      const P = stage.points, fin = P[P.length - 1], { at, nx } = nextPt(rp);
      h += `<b class="rn-km-now">${esc(rname())} km ${one(rp.rk)}</b> of ${one(fin.km)}${at ? ` · at ${esc(at.name)}` : ''}${off}`;
      if (nx) {
        const j = rp.E.idxAtKm(nx.gk), e = etaLine(rp, nx);
        h += `<br>Next: <b>${esc(nx.name)}</b> in <b>${one(nx.km - rp.rk)} km</b>, +${Math.round(rp.E.climb(rp.ic, j))} / −${Math.round(rp.E.climb(j, rp.ic))} m${nx.ct && !nx.noCut ? `, cut-off <b>${RX.when(nx.ct)}</b>` : ''}`;
        if (e) h += e.ok ? `<br><span class="rn-good">${e.s}</span>` : `<br><span class="rn-warn"><b>${e.s}</b></span>`;
      }
    } else h += `<b class="rn-km-now">${esc(here.E.name)} km ${one(r.km)}</b>${off}<br><span class="rn-dim">Not on the ${esc(race.short)} course${race.stages.length > 1 ? ' (' + esc(stage.label) + ')' : ''}. Change race to see its cut-offs.</span>`;
    if (w) h += `<br>Way out: <b>${esc(here.E.cleanName(w.a))}</b>${here.E.isGated(w.a) ? ' (gated)' : ''}, ${one(w.walkKm)} km, about ${here.E.fmt(w.walk)} on foot`;
    return h;
  }

  // ---------- home: a summary of the picked race and your day ----------
  const until = ms => { const d = Math.floor(ms / 864e5); return d < 1 ? 'in ' + RX.dur(ms) : `in ${d} day${d > 1 ? 's' : ''}`; };
  function home() {
    if (!stage || !$('fdHero')) return;
    const S = stage, P = S.points, fin = P[P.length - 1], now = clock(), t0 = P[0].ft.getTime(), t1 = fin.ct.getTime();
    let count;
    if (now < t0) { const ms = t0 - now, d = Math.floor(ms / 864e5); count = d >= 1 ? `${d} day${d > 1 ? 's' : ''} to go` : `Starts in ${RX.dur(ms)}`; }
    else if (now < t1) count = `Race on · ${RX.dur(now - t0)} in`;
    else count = 'Finished';
    let extra = '';
    // Safety Officers: how many stations have someone on post right now (during the event), else when shifts start.
    if (SO) {
      const h = (now - soT0) / 3600e3, st = SO.stations.filter(s => SO.posts.some(p => p.station === s.name && !/passage/i.test(p.label)));
      if (h < 0) extra += `<p>Safety Officer shifts start <b>${soTime(Math.min(...SO.posts.map(p => p.a)))}</b>.</p>`;
      else if (h <= SO.n / 4) extra += `<p>Safety Officers on post now at <b>${st.filter(s => SO.posts.some(p => p.station === s.name && p.a <= h && p.z > h)).length} of ${st.length}</b> stations.</p>`;
    }
    if (here && mapNow && Date.now() - here.t < 30 * 60e3) extra += `<p class="rn-hero-now"><span class="rn-dim">Where you were at ${tf.format(new Date(here.t))}:</span><br>${mapNow}</p>`;
    $('fdHero').innerHTML = `<p class="rn-hero-race">${esc(race.label)}${race.stages.length > 1 ? ' · ' + esc(stage.label) : ''}</p>
      <p class="rn-hero-count">${count}</p>
      <div class="rn-hero-facts"><span><b>${one(fin.km)}</b> km</span><span><b>+${fin.up.toLocaleString('en-AU')}</b> m</span><span><b>${P.length - 2}</b> aid points</span></div>
      <p>Start <b>${RX.when(P[0].ft)}</b> at ${esc(P[0].name)}<br>Final cut-off <b>${RX.when(fin.ct)}</b> at ${esc(fin.name)}</p>${extra}`;
    // The next cut-offs on this race (for sweeps), with how long until each.
    const nxt = P.filter((x, i) => i && x.ct && !x.noCut && x.ct.getTime() > now).slice(0, 3);
    $('fdHomeNext').innerHTML = `<h2>Next cut-offs</h2>` + (nxt.length ? nxt.map(x => `<div class="rn-now-i rn-home-i"><b>${RX.when(x.ct)}</b><span>${esc(x.name)} · km ${one(x.km)}</span><em>${until(x.ct.getTime() - now)}</em></div>`).join('') : '<p class="muted">All the cut-offs for this race have passed.</p>') +
      '<button type="button" class="fd-linkbtn" id="fdHomeRace">All aid stations and cut-offs</button>';
    $('fdHomeRace').onclick = () => setTab('race');
  }

  // ---------- elevation profile (js/profile.js) ----------
  let profile = null;

  // ---------- send my location (WhatsApp) ----------
  function message(urgent) {
    const r = here.r, E = here.E, note = $('fdNote').value.trim(), S = here.S || { tier: 'on' };
    const long = S.tier === 'long', w = long ? null : r.results.slice().sort((a, b) => a.walk - b.walk)[0];
    // Both kms when a race is picked: the race km the sweeps and crews use, and the course km the responders use.
    const rp = racePos(), ck = `${E.name} km ${one(r.km)}`, rk = rp ? `${rname()} km ${one(rp.rk)}` : '';
    const km = !rk ? ck : rp.E === E && Math.abs(rp.rk - r.km) < 0.05 ? rk : `${rk} (${ck})`, fixT = here.t;
    const where = S.tier === 'on' ? `${km}${between(r) ? ', ' + between(r) : ''}`
      : `${S.at ? 'at ' + S.at + ', ' : ''}${dist(here.offM)} ${({ north: 'south', 'north-east': 'south-west', east: 'west', 'south-east': 'north-west', south: 'north', 'south-west': 'north-east', west: 'east', 'north-west': 'south-east' })[S.dir]} of the course at ${km}${between(r) ? ', ' + between(r) : ''}`;
    const lines = [
      urgent ? `URGENT: casualty ${S.tier === 'on' ? 'at ' : ''}${where}.` : `My location: ${where}.`,
      note ? 'Note: ' + note : '',
      `Position ${here.lat.toFixed(5)}, ${here.lon.toFixed(5)}${here.gps ? ` (GPS ±${Math.round(here.gps.acc)} m)` : ' (from the km)'}.`,
      `${here.gps ? 'Fix' : 'Km entered'} at ${tf.format(new Date(fixT))}, ${ago(Date.now() - fixT)}.`,
      here.w3w ? `what3words ///${here.w3w}` : here.near ? `what3words ///${here.near.words} (${savedNote()})` : '',
      `Map: https://maps.google.com/?q=${here.lat.toFixed(5)},${here.lon.toFixed(5)}`,
      w ? `Nearest vehicle access: ${E.cleanName(w.a)}${E.isGated(w.a) ? ' (gated)' : ''}, ${one(w.walkKm)} km walk.` : '',
      urgent && !long ? `Fastest team: ${r.best.base.name}, about ${E.fmt(r.best.total)}${r.night ? ', night times' : ''}.` : '',
      !long && window.GPTTrack ? GPTTrack.line(r, E, { vehicle: w }) : '',
      `Sent ${tf.format(new Date())} from GPT100 Field.`
    ];
    return lines.filter(Boolean).join('\n');
  }
  // No location, nothing to send: the buttons go dead rather than send an old one.
  function sendLinks() {
    [['fdSend', false], ['fdUrgent', true]].forEach(([id, u]) => { const a = $(id); a.href = here ? 'https://wa.me/?text=' + encodeURIComponent(message(u)) : '#'; a.setAttribute('aria-disabled', here ? 'false' : 'true'); });
  }
  // The last location (with its time), the note and Keep updating are kept on this phone through a reload.
  function keep() {
    rstore.set('here', here && { lat: here.lat, lon: here.lon, cid: here.E.id, ic: here.r.ic, offM: here.offM, gps: here.gps, t: here.t, manual: here.manual, mk: here.mk });
  }
  function restore() {
    const o = rstore.get('here', null), E = o && MAIN.courses.find(x => x.id === o.cid);
    if (!E || !(Date.now() - o.t < DAY)) return;
    setHere(E, o.ic, o.lat, o.lon, { offM: o.offM, gps: o.gps, t: o.t, manual: o.manual, mk: o.mk });
    msg(`Your last location, from ${tf.format(new Date(o.t))} (${ago(Date.now() - o.t)}). Tap Where am I? for a new one.`);
    render(); lookupW3w(o.lat, o.lon);
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
    if (window.GPTFullscreen) GPTFullscreen(map, $('fdMap'));
    MAIN.courses.forEach(E => L.polyline(E.route.map(p => [p[0], p[1]]), { color: '#8a8a8a', weight: 2, opacity: .55, interactive: false }).addTo(map));
    raceLayer = L.layerGroup().addTo(map);
    soLayer = L.layerGroup().addTo(map);
    drawSO();
    // Layers from the layers button: helicopter landing sites on by default, the Parks Victoria markers off until wanted.
    if (window.GPTHelipads) GPTHelipads.overlay(map, true);
    if (window.GPTTrack) { GPTBaseMap.overlay(map, 'Emergency markers', GPTTrack.overlay(['emergency']), false); GPTBaseMap.overlay(map, 'Camps and assembly areas', GPTTrack.overlay(['camp', 'assembly']), false); }
    trailLine = L.polyline([], { color: '#7a3db8', weight: 3, opacity: .9, dashArray: '1 6', lineCap: 'round', interactive: false }).addTo(map);
    if (window.GPTTracking) { runnerLayer = L.layerGroup().addTo(map); drawRunners(); }
    layer = L.layerGroup().addTo(map);
    map.on('click', e => profile.showLL(e.latlng.lat, e.latlng.lng, map.getZoom()));
    // A small location button on the map, as in Google Maps.
    const loc = L.control({ position: 'bottomright' });
    loc.onAdd = () => {
      const d = L.DomUtil.create('div', 'leaflet-bar rn-locwrap');
      d.innerHTML = '<button type="button" class="rn-locbtn" aria-label="Where am I?" title="Where am I?"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3 M12 20v3 M1 12h3 M20 12h3"/></svg></button>';
      L.DomEvent.disableClickPropagation(d);
      d.firstChild.onclick = () => locate();
      return d;
    };
    loc.addTo(map);
    const t = document.createElement('div'); t.id = 'fdToast'; t.className = 'rn-toast'; t.hidden = true; t.setAttribute('role', 'status');
    $('fdMap').appendChild(t);
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
    // The course coloured by track grade between the aid stations either side, with the emergency markers and helipads nearby.
    if (!far && window.GPTTrack) { const r = here.r; GPTTrack.draw(layer, r, here.E, r.aid.prev ? r.aid.prev.a.trail_km : r.km, r.aid.next ? r.aid.next.a.trail_km : r.km); }
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
    el: $('fdProf'), course: MAIN, map: () => map, who: 'you', height: 118, summary: () => mapNow,
    empty: 'Tap ◎ on the map to see where you are. Drag along the profile, or tap the course on the map, to see any point.',
    window: En => stage && En === RX.engineFor(stage) ? { k0: stage.points[0].gk, k1: stage.points[stage.points.length - 1].gk } : null,
    km: { toRace: k => stage ? RX.toRace(stage, k) : k, toCourse: k => stage ? RX.toCourse(stage, k) : k },
    title: () => !stage ? '' : `${race.short}${race.stages.length > 1 ? ' ' + stage.label : ''}: ${one(stage.points[stage.points.length - 1].km)} km`
  });
  showTrail();
  offlineCard();
  // Tabs along the bottom: Home, Map, Where and Race. The last one used is remembered (Home the first time).
  let tab = rstore.get('tab2', 'home');
  // Each tab change is a history step, so the phone's back button goes back a tab rather than out of the app.
  function setTab(t, pop) {
    if (!document.querySelector(`.rn-tab[data-tab="${t}"]`)) t = 'home';
    try { if (pop !== true) (history.state && history.state.fdTab && t !== tab ? history.pushState : history.replaceState).call(history, { fdTab: t }, ''); } catch (e) { }
    tab = t; rstore.set('tab2', t);
    if (t === 'home') home();
    document.querySelectorAll('.rn-tab').forEach(el => el.hidden = el.dataset.tab !== t);
    document.querySelectorAll('.rn-nav button').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    if (t === 'map') setTimeout(() => { if (map) { map.invalidateSize(); if (pendingFit) { map.fitBounds(...pendingFit); pendingFit = null; } } if (profile) profile.redraw(); }, 0);
    scrollTo(0, 0);
  }
  document.querySelectorAll('.rn-nav button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  // Home's Send my location goes straight to Where and finds you.
  document.querySelectorAll('.rn-quick button').forEach(b => b.addEventListener('click', () => { setTab(b.dataset.go); if (b.dataset.go === 'where') locate(); }));
  $('fdChangeRace').onclick = () => setTab('race');
  addEventListener('popstate', e => { if (e.state && e.state.fdTab) setTab(e.state.fdTab, true); });
  window.GPTFieldTab = t => setTab(t);
  if (RX) {
    $('fdRace').innerHTML = RX.R.races.map(x => `<option value="${x.id}">${esc(x.label)}</option>`).join('');
    $('fdRace').value = race.id;
    // A new race: the map shows that race (after Where am I? has redrawn you on it).
    $('fdRace').onchange = () => { setRace(RX.R.races.find(x => x.id === $('fdRace').value)); if (here) { render(); drawRaceMap(true); } };
    $('fdTarget').addEventListener('input', () => { rstore.set('target.' + rkey(), $('fdTarget').value); raceDraw(); home(); });
    setRace(race);
    setInterval(() => { if (!document.hidden) { raceDraw(); if (tab === 'home') home(); } }, 60e3);
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
        <li><b>Home</b> Your race at a glance: the race clock, the next cut-offs, Safety Officers on post, and big buttons to the map, cut-offs and Send my location.</li>
        <li><b>Map</b> A big topo map of your race: its course, aid stations with cut-offs, and Safety Officer posts (SO). Tap <b>◎</b> to find yourself: under the profile you'll see your race km, the next aid station and cut-off, and the way out. Drag the profile or tap the course to see any point.</li>
        <li><b>Where</b> Tap <b>Where am I?</b> for your course km, between which aid stations, and how far off the course you are (and which way the course is). No GPS? Type the km.</li>
        <li><b>Send</b> <b>Send my location</b> or <b>Urgent: casualty here</b> opens WhatsApp with the km, position, map link and nearest vehicle access ready. Add a note, pick the group, send.</li>
        <li><b>Way out</b> The nearest vehicle access and how long it takes on foot, and the aid stations either side.</li>
        <li><b>Race</b> Pick your race (it stays picked): every aid station with its cut-off, and when you'll reach each one at your current pace (or from a target time). Handy for sweeps.</li>
        <li><b>Trail</b> Turn on <b>Keep updating</b> to follow your position and draw the trail you've walked.</li>
      </ul><p class="fd-hint">Tap <b>?</b> at the top any time to see this again. In an emergency call 000.${C.tracking && C.tracking.credit && C.tracking.credit.name ? ` Timing and tracking by ${C.tracking.credit.url ? `<a href="${esc(C.tracking.credit.url)}" target="_blank" rel="noopener">${esc(C.tracking.credit.name)}</a>` : esc(C.tracking.credit.name)}.` : ''}</p>` })
    ]
  });
  let rz = null; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (map) map.invalidateSize(); }, 200); });
  $('fdLocate').addEventListener('click', locate);
  $('fdFollow').addEventListener('change', e => follow(e.target.checked));
  // The km box: the picked race's km, with a comma or a point for the decimals. A bad km takes the old location
  // away (and with it the Send buttons), so it can't be sent by mistake.
  $('fdKmForm').addEventListener('submit', e => {
    e.preventDefault();
    // Nothing typed (Go pressed by mistake, or with gloves): a hint, and the location you have stays.
    if (!$('fdKm').value.trim()) { msg('Type a km in the box, then Go.'); return; }
    const m = /^(?:km\s*)?(\d+(?:[.,]\d*)?|[.,]\d+)(?:\s*km)?$/i.exec($('fdKm').value.trim()), km = m ? +m[1].replace(',', '.') : NaN;
    const len = stage ? stage.points[stage.points.length - 1].km : MAIN.totalKm, what = !stage ? 'The course' : race.stages.length > 1 ? rname() : 'The ' + rname();
    const bad = isNaN(km) ? 'That isn\'t a km. Type a number, like 12.5.' : km > len ? `${what} is ${one(len)} km. Type a km from 0 to ${one(len)}.` : '';
    if (!bad) { msg(''); fromKm(km); return; }
    $('fdKm').classList.add('rc-flash'); setTimeout(() => $('fdKm').classList.remove('rc-flash'), 2600);
    here = null; mapNow = null; keep(); sendLinks();
    $('fdOut').hidden = true; if (layer) layer.clearLayers(); if (profile) profile.setHere(null); home();
    msg(bad + ' No location to send yet.', true);
  });
  // The Send buttons do nothing without a location, and rebuild the message as they're tapped (for the fix age).
  ['fdSend', 'fdUrgent'].forEach(id => $(id).addEventListener('click', e => { if (!here) e.preventDefault(); else sendLinks(); }));
  $('fdNote').value = rstore.get('note', '');
  $('fdNote').addEventListener('input', () => { rstore.set('note', $('fdNote').value); sendLinks(); });
  sendLinks(); restore();
  if (rstore.get('follow', false) && navigator.geolocation) { $('fdFollow').checked = true; follow(true); }
  // Refresh the message time and links when the app is reopened.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sendLinks(); });
  if (C.tracking && C.tracking.url) { const t = $('fdTrack'); t.hidden = false; t.innerHTML = `<a class="btn" href="${esc(C.tracking.url)}" target="_blank" rel="noopener">${esc(C.tracking.label || 'Live tracking')}</a>${C.tracking.credit && C.tracking.credit.name ? ` <span class="fd-hint">by ${C.tracking.credit.url ? `<a href="${esc(C.tracking.credit.url)}" target="_blank" rel="noopener">${esc(C.tracking.credit.name)}</a>` : esc(C.tracking.credit.name)}</span>` : ''}`; }
  function netStatus() { $('net').hidden = navigator.onLine; }
  addEventListener('online', netStatus); addEventListener('offline', netStatus); netStatus();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
})();
