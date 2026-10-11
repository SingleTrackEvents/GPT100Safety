// GPT100 Runner: for runners and their crews. Your race on the map, where you are, the next aid station,
// cut-offs and expected times, crew points, the weather and how to get help.
// Race details come from data/races.js (tools/import_races.mjs, from the course sheet). Works offline once opened.
// Nothing internal is here: no Safety Officer posts, access roads, medical plan or weather triggers.
(function () {
  const C = window.GPT100_CONFIG, MAIN = window.GPT, R = window.GPT_RACES, INFO = window.GPT_RUNNER_INFO || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const one = x => (Math.round(x * 10) / 10).toFixed(1);
  const store = { get(k, d) { try { const v = localStorage.getItem('rn.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('rn.' + k, JSON.stringify(v)); } catch (e) { } } };

  // ---------- times (Melbourne; the race is in November, daylight saving, UTC+11) ----------
  const mel = s => s ? new Date(s + ':00+11:00') : null;
  const fmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const hm = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const when = d => d ? fmt.format(d).replace(',', '') : '';
  const dur = ms => { const m = Math.round(Math.abs(ms) / 60000), h = Math.floor(m / 60); return h ? `${h} h ${m % 60} min` : `${m} min`; };

  // ---------- races and stages, matched onto the course line ----------
  const STOP = new Set(['mt', 'mount', 'car', 'park', 'carpark', 'camp', 'rd', 'road', 'track', 'water', 'point', 'trailhead', 'fireline', 'the', 'aid', 'station', 'start', 'finish', 'gap', 'emergency', 'checkpoint']);
  // Sheet names that look like a course stop but aren't it (placed in proportion instead).
  const NOT_A_STOP = new Set(['wonderland trailhead']);
  const words = s => s.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
  const engineFor = stage => stage.course === '100' ? MAIN : stage.course === '14k' ? MAIN.course('14k') : null;
  // Each race point gets gk: its km on the course line. Aid stations are matched by name (in order);
  // points that don't match (e.g. Stockyard Track) sit between their neighbours in proportion.
  function prepare(stage, course) {
    if (stage.ready) return stage;
    stage.course = course; stage.ready = true;
    const E = engineFor(stage), P = stage.points;
    // Races without a map yet (6k, 5k, 2k): place the start by name for the weather.
    if (!E) { const a = MAIN.AID.find(a => words(P[0].name).some(w => !STOP.has(w) && words(a.name).includes(w))); P.forEach(p => { p.ft = mel(p.first); p.ct = mel(p.cutoff); if (a) { p.lat = a.lat; p.lon = a.lon; } }); return stage; }
    let from = 0;
    P.forEach((p, i) => {
      const w = words(p.name), key = w.filter(x => !STOP.has(x));
      if (NOT_A_STOP.has(w.join(' '))) return;
      let best = null;
      E.AID.forEach(a => {
        if (a.trail_km < from - 0.01) return;
        const aw = words(a.name), compact = aw.join('');
        if (!key.some(k => k.length >= 3 && compact.includes(k))) return;
        const score = w.filter(x => aw.includes(x)).length + (key.every(k => compact.includes(k)) ? 2 : 0);
        if (!best || score > best.score || (score === best.score && a.trail_km < best.a.trail_km)) best = { a, score };
      });
      if (best) { p.gk = best.a.trail_km; p.lat = best.a.lat; p.lon = best.a.lon; from = p.gk; }
    });
    const last = E.route[E.route.length - 1][2];
    if (P[0].gk == null) P[0].gk = 0;
    if (P[P.length - 1].gk == null) P[P.length - 1].gk = last;
    for (let i = 1; i < P.length - 1; i++) if (P[i].gk == null) {
      let a = i - 1, b = i + 1; while (P[b].gk == null) b++;
      P[i].gk = P[a].gk + (P[b].gk - P[a].gk) * (P[i].km - P[a].km) / ((P[b].km - P[a].km) || 1);
    }
    P.forEach(p => { if (p.lat == null) { const q = E.route[E.idxAtKm(p.gk)]; p.lat = q[0]; p.lon = q[1]; } p.ft = mel(p.first); p.ct = mel(p.cutoff); });
    return stage;
  }
  // Course km and race km, through the matched aid stations.
  const interp = (P, x, from, to) => {
    if (x <= P[0][from]) return P[0][to] + (x - P[0][from]);
    for (let i = 1; i < P.length; i++) if (x <= P[i][from]) return P[i - 1][to] + (P[i][to] - P[i - 1][to]) * (x - P[i - 1][from]) / ((P[i][from] - P[i - 1][from]) || 1);
    return P[P.length - 1][to] + (x - P[P.length - 1][from]);
  };
  const toRace = (S, gk) => interp(S.points, gk, 'gk', 'km');
  const toCourse = (S, rk) => interp(S.points, rk, 'km', 'gk');
  // Expected time of day at a race km for a pace p: 0 is the first runner, 1 is the cut-off.
  const timeAt = (S, rk, p) => { const P = S.points; let i = 1; while (i < P.length - 1 && P[i].km < rk) i++; const a = P[i - 1], b = P[i], f = (rk - a.km) / ((b.km - a.km) || 1); const t = k => k.ft.getTime() + p * (k.ct - k.ft); return t(a) + (t(b) - t(a)) * Math.max(0, Math.min(1, f)); };
  const paceAt = (S, rk, t) => { const lo = timeAt(S, rk, 0), hi = timeAt(S, rk, 1); return hi > lo ? (t - lo) / (hi - lo) : 0; };

  // ---------- what's picked ----------
  let mode = store.get('mode', 'runner'), race = R.races.find(r => r.id === store.get('race')) || R.races[0], stage = null;
  const stagesOf = r => r.stages.map(id => prepare(R.stages[id], r.course));
  function pickStage() {
    const list = stagesOf(race), saved = store.get('stage.' + race.id);
    if (saved && list.find(s => s.id === saved)) return list.find(s => s.id === saved);
    // A stage race opens on today's stage (or the next one).
    const now = Date.now();
    return list.find(s => s.points[s.points.length - 1].ct.getTime() > now) || list[0];
  }
  const E = () => engineFor(stage);
  const KEY = () => race.id + '.' + stage.id;

  // ---------- page ----------
  $('rnRace').innerHTML = R.races.map(r => `<option value="${r.id}">${esc(r.label)}</option>`).join('');
  $('rnRace').value = race.id;
  $('rnRace').addEventListener('change', () => { race = R.races.find(r => r.id === $('rnRace').value); store.set('race', race.id); here = null; setStage(pickStage()); });
  document.querySelectorAll('.rn-mode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
  function setMode(m) {
    mode = m; store.set('mode', m);
    document.querySelectorAll('.rn-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    document.querySelectorAll('[data-for]').forEach(el => el.hidden = el.dataset.for !== m);
    $('rnAppName').textContent = m === 'crew' ? 'Crew' : 'Runner';
    $('rnPlanTitle').textContent = m === 'crew' ? 'Crew points' : 'Aid stations and cut-offs';
    drawCourse(); plan(); schedule();
  }
  function setStage(S) {
    stage = S; store.set('stage.' + race.id, S.id);
    const list = stagesOf(race);
    $('rnStages').hidden = list.length < 2;
    $('rnStages').innerHTML = list.map(s => `<button type="button" data-s="${s.id}"${s === S ? ' class="on"' : ''}>${esc(s.label)}</button>`).join('');
    $('rnStages').querySelectorAll('button').forEach(b => b.onclick = () => { here = null; setStage(R.stages[b.dataset.s]); });
    const P = S.points, fin = P[P.length - 1];
    $('rnStart').textContent = `${one(fin.km)} km, +${fin.up} m. Starts ${when(P[0].ft)} at ${P[0].name}. Final cut-off ${when(fin.ct)}.`;
    $('rnTarget').value = store.get('target.' + KEY(), '');
    $('rnSeenAt').innerHTML = '<option value="">(not yet)</option>' + P.slice(1).map((p, i) => `<option value="${i + 1}">${esc(p.name)}</option>`).join('');
    const seen = store.get('seen.' + KEY(), null);
    $('rnSeenAt').value = seen ? seen.i : ''; $('rnSeenTime').value = seen ? seen.t : '';
    $('rnWhere').hidden = true; msg('');
    const hasMap = !!E() && !!map;
    $('rnMapCard').hidden = !E(); $('rnNoMap').hidden = !!E();
    if (E()) { profile.setCourse(E()); profile.setHere(null); }
    if (hasMap) drawCourse(true);
    plan(); gear(); weather(); schedule();
  }

  // ---------- map and profile ----------
  let map = null, courseLayer = null, meLayer = null;
  function initMap() {
    if (!window.L) { $('fdMap').innerHTML = '<p class="map-off">Map unavailable without signal.</p>'; return; }
    map = L.map('fdMap', { zoomControl: true });
    GPTBaseMap(map);
    courseLayer = L.layerGroup().addTo(map); meLayer = L.layerGroup().addTo(map);
    map.on('click', e => profile.showLL(e.latlng.lat, e.latlng.lng, map.getZoom()));
  }
  function drawCourse(fit) {
    if (!map || !E()) return;
    courseLayer.clearLayers();
    const En = E(), P = stage.points, i0 = En.idxAtKm(P[0].gk), i1 = En.idxAtKm(P[P.length - 1].gk);
    L.polyline(En.route.map(p => [p[0], p[1]]), { color: '#8a8a8a', weight: 2, opacity: .5, interactive: false }).addTo(courseLayer);
    const line = L.polyline(En.route.slice(i0, i1 + 1).map(p => [p[0], p[1]]), { color: '#d9531e', weight: 5, opacity: .95, interactive: false }).addTo(courseLayer);
    P.forEach(p => {
      const crewPt = mode === 'crew' && p.crew !== 'no';
      L.circleMarker([p.lat, p.lon], { radius: crewPt ? 8 : 6, color: crewPt ? '#128c4a' : '#fff', weight: crewPt ? 3 : 2, fillColor: '#111', fillOpacity: 1 })
        .bindTooltip(`<b>${esc(p.name)}</b><br>km ${one(p.km)}${p.ct && p !== P[0] ? '<br>Cut-off ' + when(p.ct) : ''}`).addTo(courseLayer);
    });
    if (fit) map.fitBounds(line.getBounds().pad(0.08));
  }
  let profile = null;

  // ---------- where am I ----------
  let here = null;
  function msg(t, bad) { const m = $('fdGpsMsg'); m.textContent = t; m.classList.toggle('bad', !!bad); }
  $('fdLocate').addEventListener('click', () => {
    if (!E()) { msg('Where am I? needs this race\'s map, which isn\'t in the app yet.', true); return; }
    if (!navigator.geolocation) { msg('This phone can\'t share its location with the app.', true); return; }
    msg('Finding you… (stand in the open for the best fix)');
    navigator.geolocation.getCurrentPosition(p => { msg(`GPS fix ${hm.format(new Date(p.timestamp))}, accurate to about ${Math.round(p.coords.accuracy)} m.`); place(p.coords.latitude, p.coords.longitude, p.coords.accuracy); },
      e => msg(e.code === 1 ? 'Location is blocked for this site. Allow location in the phone settings.' : 'No GPS fix yet. Try again in the open.', true),
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
  });
  const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  function compass(a, b) {
    const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r), x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
    return DIRS[Math.round(((Math.atan2(y, x) / r + 360) % 360) / 45) % 8];
  }
  const dist = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${one(m / 1000)} km`;
  // Nearest point on this race's part of the course.
  function place(lat, lon, acc) {
    const En = E(), P = stage.points, i0 = En.idxAtKm(P[0].gk), i1 = En.idxAtKm(P[P.length - 1].gk);
    let bi = i0, bd = Infinity;
    for (let i = i0; i <= i1; i++) { const d = En.metres([lat, lon], [En.route[i][0], En.route[i][1]]); if (d < bd) { bd = d; bi = i; } }
    const q = En.route[bi];
    here = { lat, lon, acc, ic: bi, gk: q[2], rk: Math.max(0, toRace(stage, q[2])), ele: q[3], offM: Math.round(bd), cp: [q[0], q[1]] };
    render();
  }
  function render() {
    if (!here) return;
    const S = stage, P = S.points, En = E(), fin = P[P.length - 1], el = $('rnWhere');
    el.hidden = false;
    const me = [here.lat, here.lon], dir = compass(me, here.cp);
    const poor = here.acc > 100 ? `<p class="notice warn"><b>GPS isn't accurate enough yet</b> (±${Math.round(here.acc)} m). Stand in the open and tap Where am I? again.</p>` : '';
    drawMe();
    if (here.offM > 2000) {
      el.innerHTML = `${poor}<div class="fd-kmrow"><span class="fd-kmbig">${one(here.offM / 1000)} KM</span></div>
        <p class="fd-between">from the ${esc(race.short)}${race.stages.length > 1 ? ' ' + esc(S.label) : ''} course</p>
        <p class="fd-facts">The nearest point is km ${one(here.rk)}, ${dir} of you.</p>`;
      profile.setHere(null); weather(); textLink(); return;
    }
    const nx = P.find(p => p.km > here.rk + 0.05), pv = [...P].reverse().find(p => p.km <= here.rk + 0.05) || P[0];
    const off = here.offM <= 50 ? 'On the course' : here.offM <= 300 ? `Just off the course. The course is ${dist(here.offM)} ${dir} of you`
      : `${dist(here.offM)} off the course. The course is ${dir} of you (straight line, may not be walkable)`;
    let h = `${poor}<div class="fd-kmrow"><span class="fd-kmbig">KM ${one(here.rk)}</span><span class="rn-of">of ${one(fin.km)}</span></div>
      <p class="fd-between">${nx ? `${esc(pv.name)} to ${esc(nx.name)}` : 'At the finish'}</p>
      <p class="fd-facts"><b>${off}</b> · ${Math.round(here.ele)} m high</p>`;
    if (nx) {
      const j = En.idxAtKm(nx.gk), up = En.climb(here.ic, j), down = En.climb(j, here.ic);
      h += `<div class="rn-next"><span class="rn-next-l">Next</span><b>${esc(nx.name)}</b> in <b>${one(nx.km - here.rk)} km</b>, +${Math.round(up)} m / −${Math.round(down)} m
        <div class="rn-tags">${tags(nx)}</div>${nx.ct ? `<div>Cut-off <b>${when(nx.ct)}</b></div>` : ''}${pace(nx)}</div>`;
    }
    el.innerHTML = h;
    profile.setHere({ E: En, km: here.gk, ele: here.ele });
    weather(); textLink();
  }
  // At your pace (from where you are now and the time), when you'd reach the next point.
  function pace(nx) {
    const S = stage, now = Date.now(), start = S.points[0].ft.getTime();
    if (now < start) return `<p class="fd-hint">Race starts ${when(S.points[0].ft)}.</p>`;
    if (now > S.points[S.points.length - 1].ct.getTime() + 6 * 3600e3) return '';
    const p = paceAt(S, here.rk, now), eta = timeAt(S, nx.km, p), margin = nx.ct - eta;
    if (margin >= 0) return `<p class="rn-ok">At your pace you'll get there about <b>${hm.format(new Date(eta))}</b>, ${dur(margin)} before the cut-off.</p>`;
    return `<p class="notice warn">At your pace you'd reach ${esc(nx.name)} about ${hm.format(new Date(eta))}, after the cut-off. Talk to the aid station team.</p>`;
  }
  function tags(p) {
    const t = [{ start: 'Start', finish: 'Finish', aid: 'Aid station', water: 'Water point', emergency: 'Emergency aid', checkpoint: 'Checkpoint' }[p.kind] || 'Aid station'];
    if (p.drop) t.push('Drop bag');
    if (p.crew === 'yes') t.push('Crew'); else if (p.crew === 'shuttle') t.push('Crew by shuttle');
    return t.map(x => `<span class="rn-tag${/Crew/.test(x) ? ' crew' : ''}">${x}</span>`).join('');
  }
  function drawMe() {
    if (!map) return;
    meLayer.clearLayers();
    const me = [here.lat, here.lon];
    if (here.acc) L.circle(me, { radius: here.acc, color: '#1666c9', weight: 1, fillOpacity: .12, interactive: false }).addTo(meLayer);
    if (here.offM > 50) L.polyline([me, here.cp], { color: '#111', weight: 2, dashArray: '4 6', interactive: false }).addTo(meLayer);
    L.circleMarker(me, { radius: 9, color: '#fff', weight: 3, fillColor: '#1666c9', fillOpacity: 1 }).bindTooltip('You').addTo(meLayer);
    map.fitBounds(L.latLngBounds([me, here.cp]).pad(0.6), { maxZoom: 15 });
  }
  // Share my location: the race, km and position, by text or WhatsApp (the phone's share sheet).
  function locationText() {
    return `GPT100 runner location: ${race.label}${race.stages.length > 1 ? ' ' + stage.label : ''}, km ${one(here.rk)}${here.offM > 50 ? ` (${dist(here.offM)} off the course)` : ''}. ${here.lat.toFixed(5)}, ${here.lon.toFixed(5)} (GPS ±${Math.round(here.acc)} m). https://maps.google.com/?q=${here.lat.toFixed(5)},${here.lon.toFixed(5)}`;
  }
  function textLink() { $('rnShareMsg').textContent = here ? 'Sends your race km and position. Pick who to send it to.' : 'Tap Where am I? first, then Share my location to send it by text or WhatsApp.'; }
  $('rnShare').addEventListener('click', async () => {
    if (!here) { $('fdLocate').scrollIntoView({ block: 'center' }); msg('Tap Where am I? first.', true); return; }
    const text = locationText();
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    location.href = 'sms:?&body=' + encodeURIComponent(text);
  });

  // ---------- schedule (for this race, or its crews) ----------
  const dayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'short' });
  function schedule() {
    const tag = race.id, now = Date.now();
    $('rnVillage').textContent = INFO.village || '';
    $('rnSched').innerHTML = (INFO.schedule || []).map(d => {
      const items = d.items.filter(([, , f]) => { const w = f.split(' '); return w.includes('all') || w.includes(tag) || (mode === 'crew' && w.includes('crew')); });
      if (!items.length) return '';
      return `<h3 class="rn-day">${dayFmt.format(mel(d.day + 'T12:00'))}</h3>` + items.map(([t, what]) => {
        const past = mel(d.day + 'T' + t).getTime() < now - 3600e3;
        return `<div class="rn-sch${past ? ' past' : ''}"><b>${t.replace(/^0/, '')}</b><span>${esc(what)}</span></div>`;
      }).join('');
    }).join('') || '<p class="muted">Nothing listed for this race.</p>';
  }

  // ---------- the plan: aid stations, cut-offs and expected times ----------
  // Pace p from the target time (0 = the first runner's time, 1 = the cut-off), or for crews from where
  // the runner was last seen.
  function targetPace() {
    const S = stage, P = S.points, v = $('rnTarget').value.trim(), m = /^(\d{1,2})(?:[:.h ](\d{1,2}))?$/.exec(v);
    if (!m) return null;
    const ms = (+m[1] * 60 + +(m[2] || 0)) * 60000, fin = P[P.length - 1];
    return (P[0].ft.getTime() + ms - fin.ft) / (fin.ct - fin.ft);
  }
  function seenPace() {
    const S = stage, P = S.points, i = +$('rnSeenAt').value, t = $('rnSeenTime').value;
    if (!i || !t) return null;
    const p = P[i], [hh, mm] = t.split(':').map(Number);
    // The day: whichever puts the time closest to that point's first-runner to cut-off window.
    let best = null;
    for (let d = -1; d <= 3; d++) {
      const day = new Date(P[0].ft.getTime() + d * 864e5), ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(day);
      const at = new Date(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+11:00`).getTime();
      const off = at < p.ft ? p.ft - at : at > p.ct ? at - p.ct : 0;
      if (!best || off < best.off) best = { at, off };
    }
    return { p: (best.at - p.ft) / ((p.ct - p.ft) || 1), i, at: best.at };
  }
  function plan() {
    if (!stage) return;
    const S = stage, P = S.points, crew = mode === 'crew';
    let p = targetPace(), note = '';
    const seen = crew ? seenPace() : null;
    if (seen) { p = seen.p; $('rnSeenMsg').textContent = `Expected times below are from ${P[seen.i].name} at ${when(new Date(seen.at))}.`; }
    else $('rnSeenMsg').textContent = '';
    if (p != null) note = p < -0.05 ? 'Faster than our first-runner estimate.' : p > 1 ? 'Slower than the cut-offs allow.' : '';
    $('rnTargetMsg').textContent = p == null ? 'Add a time (hours:minutes) to see when you\'d reach each one.' : note;
    $('rnTargetMsg').classList.toggle('bad', p != null && p > 1);
    let last = null;
    const rows = P.map((x, i) => {
      if (crew && x.crew === 'no' && i && i < P.length - 1) return '';
      const eta = p != null && i ? timeAt(S, x.km, p) : null, prev = last; last = x;
      const leg = prev ? `${one(x.km - prev.km)} km, +${x.up - prev.up} / −${x.down - prev.down} m` : '';
      const late = eta && x.ct && eta > x.ct;
      const dirs = crew && x.crew !== 'no' ? `<a class="rn-dir" href="https://www.google.com/maps/dir/?api=1&destination=${x.lat.toFixed(5)},${x.lon.toFixed(5)}" target="_blank" rel="noopener">Directions</a>` : '';
      return `<div class="rn-row${late ? ' late' : ''}${seen && seen.i === i ? ' seen' : ''}">
        <div class="rn-km">${one(x.km)}<small>km</small></div>
        <div class="rn-main"><b>${esc(x.name)}</b><div class="rn-tags">${tags(x)}</div>${leg ? `<div class="rn-leg">${leg}</div>` : ''}
          ${crew && x.crew === 'shuttle' ? `<div class="rn-leg">${esc(INFO.shuttleNote || '')}</div>` : ''}${dirs}</div>
        <div class="rn-times">${eta ? `<div class="rn-eta">${when(new Date(eta))}</div>` : i ? '' : `<div class="rn-eta">${when(x.ft)}</div>`}${i && x.ct ? `<div class="rn-cut">Cut-off ${when(x.ct)}</div>` : ''}</div></div>`;
    }).join('');
    $('rnPlan').innerHTML = rows;
  }
  $('rnTarget').addEventListener('input', () => { store.set('target.' + KEY(), $('rnTarget').value); plan(); });
  const saveSeen = () => { store.set('seen.' + KEY(), $('rnSeenAt').value ? { i: $('rnSeenAt').value, t: $('rnSeenTime').value } : null); plan(); };
  $('rnSeenAt').addEventListener('change', saveSeen); $('rnSeenTime').addEventListener('input', saveSeen);

  // ---------- weather (no internal triggers) ----------
  let wxFor = null;
  async function weather() {
    const pt = here || (stage.points[0].lat != null ? { lat: stage.points[0].lat, lon: stage.points[0].lon, ele: 500 } : null);
    const box = $('rnWx');
    if (!pt || !window.WeatherTab) { box.innerHTML = '<p class="muted">Weather isn\'t available.</p>'; return; }
    const key = pt.lat.toFixed(3) + ',' + pt.lon.toFixed(3); if (key === wxFor) return; wxFor = key;
    const html = await window.WeatherTab.nearHTML(pt.lat, pt.lon, pt.ele || 500).catch(() => '');
    box.innerHTML = (html ? `<p class="fd-hint">${here ? 'Where you are' : 'At the start'}:</p>` + html : '<p class="muted">No weather on this phone yet. Open the app once with signal.</p>');
  }

  // ---------- mandatory gear ----------
  function gear() {
    const list = (INFO.gear || {})[race.id] || [], ticks = store.get('gear.' + race.id, {});
    $('rnGear').innerHTML = list.length ? list.map((g, i) => `<label class="rn-gear"><input type="checkbox" data-i="${i}"${ticks[i] ? ' checked' : ''}> ${esc(g)}</label>`).join('') + '<p class="fd-hint">Ticks are kept on this phone.</p>'
      : '<p class="muted">The gear list for this race will be here before race week. Check the race information.</p>';
    $('rnGear').querySelectorAll('input').forEach(c => c.onchange = () => { ticks[c.dataset.i] = c.checked; store.set('gear.' + race.id, ticks); });
  }

  // ---------- save the map for offline (as in the field app) ----------
  const OM = window.GPTOfflineMap;
  let saving = false;
  async function offlineCard() {
    const el = $('fdOffline');
    if (!OM || !OM.available()) { el.hidden = true; return; }
    const st = await OM.status(), mb = Math.round(OM.bytes / 1e6);
    el.hidden = false;
    if (saving) return;
    if (st.saved) { el.className = 'fd-offline ok'; el.innerHTML = '<span class="fd-tick">✓</span> Map saved for use without signal.'; return; }
    el.className = 'fd-offline fd-card todo';
    el.innerHTML = `<h2>Save the map before race day</h2>
      <p>There's little signal on the course. Save the topo map now so it works without signal. About ${mb} MB: best on wifi.</p>
      <button id="fdSaveMap" class="fd-big" type="button">Save map for offline</button><div class="fd-bar" hidden><i></i></div><p class="fd-hint" id="fdSaveMsg"></p>`;
    $('fdSaveMap').onclick = async () => {
      if (!navigator.onLine) { $('fdSaveMsg').textContent = 'No signal. Try again with wifi or good signal.'; return; }
      saving = true;
      const btn = $('fdSaveMap'), bar = el.querySelector('.fd-bar'); btn.disabled = true; bar.hidden = false; $('fdSaveMsg').textContent = 'Keep the app open until it finishes.';
      const r = await OM.save((d, t) => { bar.firstChild.style.width = (100 * d / t).toFixed(1) + '%'; btn.textContent = `Saving ${Math.round(100 * d / t)}%`; });
      saving = false; await offlineCard();
      if (r.failed) { $('fdSaveMsg').textContent = `${r.failed} map squares didn't save. Tap Save again with better signal.`; $('fdSaveMsg').classList.add('bad'); }
    };
  }

  // ---------- start ----------
  initMap();
  profile = GPTProfile({
    el: $('rnProf'), course: engineFor(R.stages[race.stages[0]]) || MAIN, map: () => map, who: 'you',
    empty: 'Tap Where am I? to see where you are. Drag along the profile, or tap the course on the map, to see any point.',
    window: En => stage && En === E() ? { k0: stage.points[0].gk, k1: stage.points[stage.points.length - 1].gk } : null,
    km: { toRace: k => stage ? toRace(stage, k) : k, toCourse: k => stage ? toCourse(stage, k) : k },
    title: () => !stage ? '' : `${race.short}${race.stages.length > 1 ? ' ' + stage.label : ''}: ${one(stage.points[stage.points.length - 1].km)} km`
  });
  if (INFO.medicalPhone) { $('rnCallMed').hidden = false; $('rnCallMed').href = 'tel:' + INFO.medicalPhone.replace(/\s/g, ''); $('rnCallMed').textContent = 'Call race medical ' + INFO.medicalPhone; }
  $('rnWithdraw').textContent = INFO.withdraw || '';
  $('rnNotices').innerHTML = (INFO.notices || []).map(n => `<p class="notice">${esc(n.text)}</p>`).join('');
  if (C.tracking && C.tracking.url) { const t = $('fdTrack'); t.hidden = false; t.innerHTML = `<a class="btn" href="${esc(C.tracking.url)}" target="_blank" rel="noopener">${esc(C.tracking.label || 'Live tracking')}</a>`; }
  setStage(pickStage());
  setMode(mode);
  offlineCard();
  let rz = null; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (map) map.invalidateSize(); }, 200); });
  function netStatus() { $('net').hidden = navigator.onLine; }
  addEventListener('online', netStatus); addEventListener('offline', netStatus); netStatus();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  window.GPTRunner = { map: () => map, stage: () => stage };
})();
