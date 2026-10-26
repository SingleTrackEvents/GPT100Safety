// GPT100 Runner: for runners and their crews. Your race on the map, where you are, the next aid station,
// cut-offs and expected times, crew points, the schedule and how to get help.
// Race details come from data/races.js (tools/import_races.mjs, from the course sheet). Works offline once opened.
// Nothing internal is here: no Safety Officer posts, access roads, medical plan or weather triggers.
(function () {
  const C = window.GPT100_CONFIG, MAIN = window.GPT, R = window.GPT_RACES, INFO = window.GPT_RUNNER_INFO || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const one = x => (Math.round(x * 10) / 10).toFixed(1);
  // A stored null, or the wrong type (a corrupt or hand-edited value), gives the default.
  const store = { get(k, d) { try { const v = localStorage.getItem('rn.' + k), p = v == null ? null : JSON.parse(v); return p == null || (d && typeof d === 'object' && typeof p !== 'object') ? d : p; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('rn.' + k, JSON.stringify(v)); } catch (e) { } } };

  // Races, cut-offs and expected times (js/races.js, shared with the field app).
  const { mel, fmt, hm, when, dur, engineFor, prepare, toRace, toCourse, timeAt, interpKm, paceAt, liveEta } = window.GPTRaces;

  // ---------- what's picked ----------
  let mode = store.get('mode', 'runner'), race = R.races.find(r => r.id === store.get('race')) || R.races[0], stage = null;
  const { stagesOf, currentStage } = window.GPTRaces;
  // A stage the runner tapped stays picked for that day (Melbourne time), as in the field app; otherwise today's
  // stage (or the next one). (An older phone stored just the id: that counts as not tapped today.)
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' });
  function pickStage() {
    const list = stagesOf(race), saved = store.get('stage.' + race.id, {}), hit = saved.day === ymd.format(new Date()) && list.find(s => s.id === saved.id);
    return hit || currentStage(race);
  }
  const E = () => engineFor(stage);
  const KEY = () => race.id + '.' + stage.id;

  // ---------- page ----------
  $('rnRace').innerHTML = R.races.map(r => `<option value="${r.id}">${esc(r.label)}</option>`).join('');
  $('rnRace').value = race.id;
  $('rnRace').addEventListener('change', () => { race = R.races.find(r => r.id === $('rnRace').value); store.set('race', race.id); here = null; setStage(pickStage()); });
  document.querySelectorAll('.rn-mode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
  // ---------- tabs (along the bottom, for thumbs) ----------
  let tab = store.get('tab', 'course');
  // Each tab change is a history step, so the phone's back button goes back a tab rather than out of the app.
  function setTab(t, pop) {
    // Older phones remember 'course' or 'where'.
    if (t === 'course' || t === 'where' || !document.querySelector(`.rn-tab[data-tab="${t}"]`)) t = 'home';
    try { if (pop !== true) (history.state && history.state.rnTab && t !== tab ? history.pushState : history.replaceState).call(history, { rnTab: t }, ''); } catch (e) { }
    tab = t; store.set('tab', t);
    document.querySelectorAll('.rn-tab').forEach(el => el.hidden = el.dataset.tab !== t);
    document.querySelectorAll('.rn-nav button').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    document.body.classList.toggle('rn-on-map', t === 'map');
    if (t === 'map') setTimeout(() => { if (map) { map.invalidateSize(); if (needFit) { needFit = false; drawCourse(true); if (here) drawMe(); } } if (profile) profile.redraw(); }, 0);
    if (t === 'help') textLink();
    if (t === 'home') home();
    if (t === 'help') showW3w();
    if (t === 'schedule') drawSchedule();
    scrollTo(0, 0);
  }
  document.querySelectorAll('.rn-nav button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  addEventListener('popstate', e => { if (e.state && e.state.rnTab) setTab(e.state.rnTab, true); });

  function setMode(m) {
    mode = m; store.set('mode', m);
    $('rnAidTab').textContent = m === 'crew' ? 'Crew' : 'Aid';
    document.querySelectorAll('.rn-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    document.querySelectorAll('[data-for]').forEach(el => el.hidden = el.dataset.for !== m);
    $('rnAppName').textContent = m === 'crew' ? 'Crew' : 'Runner';
    $('rnPlanTitle').textContent = m === 'crew' ? 'Crew points' : 'Aid stations and cut-offs';
    $('rnQuickAid').innerHTML = m === 'crew' ? 'Crew points<br>and times' : 'Aid stations<br>and cut-offs';
    if (profOpts) profOpts.empty = m === 'crew' ? 'Tap ◎ on the map to see where you are. Drag along the profile to see any point on your runner\'s course.' : RUN_HINT;
    if (profile) profile.redraw();
    drawCourse(); plan(); schedule(); home();
  }
  function setStage(S) {
    stage = S;
    const list = stagesOf(race);
    $('rnStages').hidden = list.length < 2;
    $('rnStages').innerHTML = list.map(s => `<button type="button" data-s="${s.id}"${s === S ? ' class="on"' : ''}>${esc(s.label)}</button>`).join('');
    $('rnStages').querySelectorAll('button').forEach(b => b.onclick = () => { here = null; store.set('stage.' + race.id, { id: b.dataset.s, day: ymd.format(new Date()) }); setStage(R.stages[b.dataset.s]); });
    const P = S.points, fin = P[P.length - 1];
    $('rnStart').textContent = `${one(fin.km)} km, +${fin.up} m. Starts ${when(P[0].ft)} at ${P[0].name}. Final cut-off ${when(fin.ct)}.`;
    $('rnMapFor').textContent = `${race.label}${race.stages.length > 1 ? ', ' + S.label : ''}: ${one(fin.km)} km`;
    $('rnTarget').value = store.get('target.' + KEY(), '');
    $('rnSeenAt').innerHTML = '<option value="">(not yet)</option>' + P.slice(1).map((p, i) => `<option value="${i + 1}">${esc(p.name)}</option>`).join('');
    const seen = store.get('seen.' + KEY(), null);
    $('rnSeenAt').value = seen ? seen.i : ''; $('rnSeenTime').value = seen ? seen.t : '';
    whereNow = null; if (meLayer) meLayer.clearLayers();
    const hasMap = !!E() && !!map;
    $('rnMapCard').hidden = !E(); $('rnNoMap').hidden = !!E();
    if (E()) { profile.setCourse(E()); profile.setHere(null); }
    if (hasMap) drawCourse(true);
    plan(); gear(); schedule(); home();
  }

  // ---------- map and profile ----------
  let map = null, courseLayer = null, meLayer = null, needFit = false;
  function initMap() {
    if (!window.L) { $('fdMap').innerHTML = '<p class="map-off">Map unavailable without signal.</p>'; return; }
    map = L.map('fdMap', { zoomControl: true });
    GPTBaseMap(map);
    courseLayer = L.layerGroup().addTo(map); meLayer = L.layerGroup().addTo(map);
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
    const t = document.createElement('div'); t.id = 'rnToast'; t.className = 'rn-toast'; t.hidden = true; t.setAttribute('role', 'status');
    $('fdMap').appendChild(t);
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
        .bindTooltip(`<b>${esc(p.name)}</b><br>km ${one(p.km)}${p.ct && p !== P[0] && !p.noCut ? '<br>Cut-off ' + when(p.ct) : ''}`).addTo(courseLayer);
    });
    // A hidden map can't size itself: fit when the Course tab opens.
    if (fit) { if ($('fdMap').offsetWidth) map.fitBounds(line.getBounds().pad(0.08)); else needFit = true; }
  }
  let profile = null, profOpts = null;

  // ---------- where am I ----------
  let here = null;
  // Short messages float over the map (Finding you…, GPS errors). stay: until the next one.
  let toastT = null;
  function msg(t, bad, stay) {
    const m = $('rnToast'); if (!m) return;
    clearTimeout(toastT); m.textContent = t; m.hidden = !t; m.classList.toggle('bad', !!bad);
    if (t && !stay) toastT = setTimeout(() => { m.hidden = true; }, bad ? 7000 : 3500);
  }
  // The safety lines on the map (finding you, GPS errors, off the course) in the runner's Help language.
  const UL = k => { const u = (CARDS.cards[cardLang()] || {}).ui || {}; return u[k] != null ? u[k] : ((CARDS.cards.en || {}).ui || {})[k] || DEF[k] || ''; };
  // English for the newest lines, in case the phone still has an older data/safety-cards.js cached.
  const DEF = { located: 'Found you: accurate to about {acc} m.', poorGps: 'GPS only ±{acc} m: stand in the open and tap ◎ again.', raceStarts: 'Race starts {time}.',
    kmOf: '**Km {km}** of {len}', next: 'Next: **{name}** in **{dist}**', backNext: 'Back on the course, next: **{name}** in **{dist}**', cutoff: 'cut-off **{time}**', atFinish: 'At the finish.',
    etaAt: 'At your pace about **{time}**.', etaOn: 'At your pace about **{time}**, on the cut-off.', etaBefore: 'At your pace about **{time}**, {dur} before the cut-off.',
    etaLate: '**At your pace about {time}, after the cut-off.** Talk to the aid station team.', etaBehind: '**Well behind cut-off pace.** Talk to the aid station team.',
    shareFar: 'Ready: you\'re {dist} from the {race} course (GPS ±{acc} m). Check the race picked at the top, then send.',
    foundFar: 'Found you, {dist} from the {race} course (GPS ±{acc} m). Check the race picked at the top, then tap {send} again to send it.' };
  // A line with **bold** in it, as HTML (cls: the bold's class).
  const bold = (s, cls) => esc(s).replace(/\*\*(.+?)\*\*/g, `<b${cls ? ` class="${cls}"` : ''}>$1</b>`);
  // The race as the off-course lines name it: "33k", "Stage race Stage 2".
  const rlab = () => race.short + (race.stages.length > 1 ? ' ' + stage.label : '');
  const locBtn = () => document.querySelector('.rn-locbtn');
  // GPS fix; then() runs once you're placed (the Help tab's Share uses it too).
  function locate(then) {
    if (!E()) { msg('Where am I? needs this race\'s map, which isn\'t in the app yet.', true); return; }
    if (!navigator.geolocation) { msg('This phone can\'t share its location with the app.', true); return; }
    msg(UL('finding'), false, true);
    const b = locBtn(); if (b) b.classList.add('busy');
    // Some phones never answer at all: give up after 30 s (a late fix still places you).
    const fail = e => { clearTimeout(wait); if (b) b.classList.remove('busy'); msg(UL(e.code === 1 ? 'gpsBlocked' : 'gpsNone'), true); $('rnShareMsg').textContent = T()[e.code === 1 ? 'gpsBlocked' : 'gpsNone']; $('rnW3wMsg').textContent = $('rnShareMsg').textContent; };
    const wait = setTimeout(() => fail({ code: 3 }), 30000);
    navigator.geolocation.getCurrentPosition(p => { clearTimeout(wait); if (b) { b.classList.remove('busy'); b.classList.add('on'); } msg(fill(UL('located'), { acc: Math.round(p.coords.accuracy) })); place(p.coords.latitude, p.coords.longitude, p.coords.accuracy); then && then(); },
      fail, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
  }
  const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  function compass(a, b) {
    const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r), x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
    return DIRS[Math.round(((Math.atan2(y, x) / r + 360) % 360) / 45) % 8];
  }
  const dist = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${one(m / 1000)} km`;
  // Nearest point on this race's part of the course.
  function place(lat, lon, acc) {
    const En = E(), P = stage.points, i0 = En.idxAtKm(P[0].gk), i1 = En.idxAtKm(P[P.length - 1].gk);
    const ds = [];
    for (let i = i0; i <= i1; i++) ds.push(En.metres([lat, lon], [En.route[i][0], En.route[i][1]]));
    const bd = Math.min(...ds);
    // Where the course doubles back (out and back), pick the pass that fits: near your last fix, or the race clock.
    const cands = ds.map((d, k) => d <= bd + 25 ? i0 + k : -1).filter(i => i >= 0);
    const now = Date.now(), prev = here && here.stage === stage && now - here.t < 20 * 60e3 ? here.gk : null;
    const started = now > stage.points[0].ft.getTime();
    const expect = prev != null ? prev + 0.3 : started ? toCourse(stage, Math.max(0, interpKm(stage, now))) : En.route[cands[0]][2];
    const bi = cands.reduce((a, b) => Math.abs(En.route[b][2] - expect) < Math.abs(En.route[a][2] - expect) ? b : a, cands[0]);
    const q = En.route[bi];
    // near: the stored words of the nearest course point (data/course-w3w.js), for when there's no signal.
    here = { stage, t: now, lat, lon, acc, ic: bi, gk: q[2], rk: Math.max(0, toRace(stage, q[2])), ele: q[3], offM: Math.round(bd), cp: [q[0], q[1]], w3w: null, near: En.nearW3w(lat, lon), w3wDone: false };
    render();
    lookupW3w(lat, lon);
  }
  // what3words: three words for your 3 m square, easy to read out to 000 or race medical. The live lookup
  // needs signal (and the key only works on the live site). Without it, the Help tab shows the stored words of
  // the course point nearest you (within 30 m), and always your position as numbers.
  async function lookupW3w(lat, lon) {
    showW3w();
    const mine = () => here && here.lat === lat && here.lon === lon;
    // Why there are no live words: no signal (offline, or the request never got through), or the service said no.
    let why = navigator.onLine ? 'service' : 'signal';
    if (navigator.onLine && C.what3wordsKey) {
      try {
        const qs = new URLSearchParams({ key: C.what3wordsKey, coordinates: lat.toFixed(5) + ',' + lon.toFixed(5) });
        const j = await (await fetch('https://api.what3words.com/v3/convert-to-3wa?' + qs)).json();
        if (j.words && mine()) { here.w3w = j.words; here.w3wDone = true; showW3w(); return; }
      } catch (e) { if (e instanceof TypeError) why = 'signal'; /* the stored words or the numbers will do */ }
    }
    if (mine()) { here.w3wDone = true; here.w3wWhy = why; showW3w(); }
  }
  const w3wLink = w => `<a href="https://w3w.co/${esc(w)}" target="_blank" rel="noopener">///${esc(w)}</a>`;
  function showW3w() {
    const w = $('rnW3wWords'), n = $('rnW3wNums'), m = $('rnW3wMsg'), U = T();
    if (!w) return;
    const ok = here && Date.now() - here.t < 15 * 60e3, nums = ok ? `${here.lat.toFixed(5)}, ${here.lon.toFixed(5)}` : '';
    if (ok && here.w3w) {
      w.innerHTML = w3wLink(here.w3w);
      n.textContent = `${U.nums}: ${nums}`;
      m.textContent = fill(U.w3wReady, { time: hm.format(new Date(here.t)) });
    } else if (ok && here.w3wDone && here.near) {
      // No live words: the stored words of the course point nearest you.
      w.innerHTML = w3wLink(here.near.words);
      n.textContent = `${U.nums}: ${nums}`;
      m.textContent = fill(here.w3wWhy === 'service' ? U.w3wStoredNoLive : U.w3wStored, { m: Math.max(3, here.near.m) });
    } else if (ok) {
      w.textContent = nums; n.textContent = '';
      m.textContent = here.w3wDone ? here.w3wWhy === 'service' ? U.w3wNoLive : U.w3wNoSignal : U.w3wGetting;
    } else {
      w.textContent = ''; n.textContent = '';
      m.textContent = U.w3wIntro;
    }
    $('rnW3wGet').textContent = ok ? U.update3 : U.find3;
  }
  // Where you are, as the line under the profile on the Map tab: race km, the next aid station with its
  // distance, climb, cut-off and when you'd get there, and any off-course or poor GPS warning.
  let whereNow = null;
  function render() {
    if (!here) return;
    const S = stage, P = S.points, En = E(), fin = P[P.length - 1];
    const me = [here.lat, here.lon], dirs = UL('dirs'), k = DIRS.indexOf(compass(me, here.cp)), dir = (Array.isArray(dirs) && dirs[k]) || DIRS[k];
    const poor = here.acc > 100 ? `<span class="rn-warn">${esc(fill(UL('poorGps'), { acc: Math.round(here.acc) }))}</span><br>` : '';
    // Off the course: back the way you came first (as the Help card says); the straight line only as a guide.
    const back = `<b class="rn-warn">${esc(UL('offBack'))}</b>`, line = `<span class="rn-dim">${esc(fill(UL('offLine'), { dist: dist(here.offM), dir }))}</span>`;
    drawMe();
    if (here.offM > 2000) {
      whereNow = `${poor}<b class="rn-warn">${esc(fill(UL('offFar'), { dist: dist(here.offM), race: rlab() }))}</b><br>${back}<br>${line}`;
      profile.setHere(null); textLink(); home(); return;
    }
    const nx = P.find(p => p.km > here.rk + 0.05), isOff = here.offM > 50;
    let h = poor + bold(fill(UL('kmOf'), { km: one(here.rk), len: one(fin.km) }), 'rn-km-now');
    if (isOff) h += ` · <span class="rn-warn">${esc(fill(UL('offBy'), { dist: dist(here.offM) }))}</span><br>${back}<br>${line}`;
    if (nx) {
      // Off the course, the next aid line is for once you're back on it, with no pace or arrival time.
      const j = En.idxAtKm(nx.gk), up = En.climb(here.ic, j), down = En.climb(j, here.ic);
      h += `<br>${bold(fill(UL(isOff ? 'backNext' : 'next'), { name: nx.name, dist: one(nx.km - here.rk) + ' km' }))}, +${Math.round(up)} / −${Math.round(down)} m${nx.ct && !nx.noCut ? ', ' + bold(fill(UL('cutoff'), { time: when(nx.ct) })) : ''}${isOff ? '' : pace(nx)}`;
    } else h += '<br>' + esc(UL('atFinish'));
    whereNow = h;
    profile.setHere({ E: En, km: here.gk, ele: here.ele });
    textLink(); home();
  }
  // At your pace (from where you are now and the time), when you'd reach the next point. Not in the first few
  // minutes or km (too soon to tell), and no time when well behind cut-off pace (js/races.js liveEta).
  function pace(nx) {
    const S = stage, now = Date.now(), start = S.points[0].ft.getTime();
    if (now < start) return `<br><span class="rn-dim">${esc(fill(UL('raceStarts'), { time: when(S.points[0].ft) }))}</span>`;
    if (now > S.points[S.points.length - 1].ct.getTime() + 6 * 3600e3) return '';
    const L = liveEta(S, here.rk, now, nx);
    if (!L || L.early) return '';
    if (L.behind) return `<br><span class="rn-warn">${bold(UL('etaBehind'))}</span>`;
    // The day too, when it isn't today.
    const at = ymd.format(new Date(L.eta)) === ymd.format(new Date(now)) ? hm.format(new Date(L.eta)) : when(new Date(L.eta)), m = L.margin;
    if (m == null) return `<br><span class="rn-good">${bold(fill(UL('etaAt'), { time: at }))}</span>`;
    if (m > -60e3) return `<br><span class="rn-good">${bold(fill(UL(m < 60e3 ? 'etaOn' : 'etaBefore'), { time: at, dur: dur(m) }))}</span>`;  // a minute either way is on it
    return `<br><span class="rn-warn">${bold(fill(UL('etaLate'), { time: at }))}</span>`;
  }
  function tags(p) {
    const t = [{ start: 'Start', finish: 'Finish', turn: 'Turnaround', aid: 'Aid station', water: 'Water point', emergency: 'Emergency aid', checkpoint: 'Checkpoint' }[p.kind] || 'Aid station'];
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
    if ($('fdMap').offsetWidth) map.fitBounds(L.latLngBounds([me, here.cp]).pad(0.6), { maxZoom: 15 }); else needFit = true;
  }
  // Share my location: the race, km and position, by text or WhatsApp (the phone's share sheet).
  function locationText() {
    // Far from the picked course, the race km means little: say so rather than give one.
    const rl = `${race.label}${race.stages.length > 1 ? ' ' + stage.label : ''}`;
    return `GPT100 runner location: ${here.offM > 2000 ? `${dist(here.offM)} from the ${rl} course (check which race)` : `${rl}, km ${one(here.rk)}${here.offM > 50 ? ` (${dist(here.offM)} off the course)` : ''}`}. ${here.lat.toFixed(5)}, ${here.lon.toFixed(5)} (GPS ±${Math.round(here.acc)} m). https://maps.google.com/?q=${here.lat.toFixed(5)},${here.lon.toFixed(5)}${here.w3w ? ` what3words ///${here.w3w}` : here.near ? ` what3words ///${here.near.words} (the course, ${Math.max(3, here.near.m)} m from me)` : ''}`;
  }
  const fresh = () => here && Date.now() - here.t < 5 * 60e3;
  // Far from the picked course the race km means little: say how far, as the shared text does.
  const farFill = () => ({ dist: dist(here.offM), race: rlab(), acc: Math.round(here.acc), send: T().send });
  const TF = k => T()[k] || DEF[k];
  function textLink() { $('rnShareMsg').textContent = !fresh() ? T().shareHint : here.offM > 2000 ? fill(TF('shareFar'), farFill()) : fill(T().shareReady, { km: one(here.rk), acc: Math.round(here.acc) }); }
  $('rnShare').addEventListener('click', async () => {
    // The phone only opens the share sheet straight from a tap, so a new fix needs a second tap.
    if (!fresh()) { $('rnShareMsg').textContent = T().finding; locate(() => { $('rnShareMsg').textContent = here.offM > 2000 ? fill(TF('foundFar'), farFill()) : fill(T().found, { km: one(here.rk), acc: Math.round(here.acc), send: T().send }); $('rnShare').textContent = T().send; }); return; }
    $('rnShare').textContent = T().share;
    const text = locationText();
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    location.href = 'sms:?&body=' + encodeURIComponent(text);
  });

  // ---------- Home: welcome and a summary of the race ----------
  const nf = new Intl.NumberFormat('en-AU');
  function home() {
    if (!stage || !$('rnHero')) return;
    const S = stage, P = S.points, fin = P[P.length - 1], now = Date.now(), t0 = P[0].ft.getTime(), t1 = fin.ct.getTime();
    let count;
    if (now < t0) {
      const ms = t0 - now, d = Math.floor(ms / 864e5);
      count = d >= 1 ? `${d} day${d > 1 ? 's' : ''} to go` : `Starts in ${dur(ms)}`;
    } else if (now < t1) count = `Race on · ${dur(now - t0)} in`;
    else count = 'Finished';
    const tp = targetPace(), tgt = $('rnTarget').value.trim();
    let extra = '';
    if (mode === 'runner' && tp != null && tgt) extra = `<p>Your target <b>${esc(tgt)}</b>: finish about <b>${when(new Date(timeAt(S, fin.km, tp)))}</b>.</p>`;
    else if (mode === 'runner') extra = '<p class="fd-hint">Add a target time on the Aid tab to see your splits.</p>';
    else { const sp = seenPace(); extra = sp ? `<p>Last seen at <b>${esc(P[sp.i].name)}</b> ${when(new Date(sp.at))}. Expected at the finish about <b>${when(new Date(timeAt(S, fin.km, sp.p)))}</b>.</p>${stale(sp) ? `<p class="rn-warn">${stale(sp)}</p>` : ''}` : `<p class="fd-hint">${P.filter(x => x.crew !== 'no').length} crew points. Add where your runner was last seen on the Crew tab.</p>`; }
    if (mode === 'runner' && whereNow && here && Date.now() - here.t < 30 * 60e3) extra += `<p class="rn-hero-now"><span class="rn-dim">Where you were at ${hm.format(new Date(here.t))}:</span><br>${whereNow}</p>`;
    $('rnHero').innerHTML = `<p class="rn-hero-race">${esc(race.label)}${race.stages.length > 1 ? ' · ' + esc(S.label) : ''}</p>
      <p class="rn-hero-count">${count}</p>
      <div class="rn-hero-facts"><span><b>${one(fin.km)}</b> km</span><span><b>+${nf.format(fin.up)}</b> m</span><span><b>${P.length - 2}</b> aid points</span></div>
      <p>Start <b>${when(P[0].ft)}</b> at ${esc(P[0].name)}<br>Final cut-off <b>${when(fin.ct)}</b> at ${esc(fin.name)}</p>${extra}`;
    // Up next on the schedule for this race (and crews).
    const nxt = events().filter(e => wanted(e, race.id) && e.start > now - 20 * 60e3).slice(0, 2);
    $('rnHomeNext').innerHTML = `<h2>Up next</h2>` + (nxt.length ? nxt.map(e => `<div class="rn-now-i rn-home-i"><b>${when(new Date(e.start))}</b><span>${esc(e.what)}</span><em>${e.start <= now ? 'now' : until(e.start - now)}</em></div>`).join('') : '<p class="muted">Nothing more on the schedule.</p>') +
      '<button type="button" class="fd-linkbtn" id="rnHomeSched">Full schedule</button>';
    $('rnHomeSched').onclick = () => setTab('schedule');
  }
  document.querySelectorAll('.rn-quick button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.go)));
  setInterval(() => { if (tab === 'home' && !document.hidden) home(); }, 60e3);

  // ---------- schedule (for this race, or its crews) ----------
  const dayFmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'short' });
  // Each item as times: start, and end when the text says "until …" (otherwise it's a moment: on now for 20 min).
  const untilRe = /until (\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
  function events() {
    const out = [];
    (INFO.schedule || []).forEach(d => d.items.forEach(([t, what, f]) => {
      const start = mel(d.day + 'T' + t).getTime(), u = untilRe.exec(what);
      let end = null;
      if (u) { let h = +u[1] % 12 + (/pm/i.test(u[3]) ? 12 : 0); end = mel(d.day + 'T' + String(h).padStart(2, '0') + ':' + (u[2] || '00')).getTime(); if (end <= start) end += 864e5; }
      out.push({ day: d.day, t, what, tags: f.split(' '), start, end });
    }));
    return out;
  }
  // Which items to show: one race (and its crews), or everything.
  const showFor = () => $('rnSchedFor').value || race.id;
  const wanted = (e, tag) => tag === 'full' || e.tags.includes('all') || e.tags.includes(tag) || (mode === 'crew' && e.tags.includes('crew'));
  const until = ms => { const m = Math.round(ms / 60000); if (m < 1) return 'now'; if (m < 60) return `in ${m} min`; const h = Math.floor(m / 60); return h < 24 ? `in ${h} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `in ${Math.round(h / 24)} day${Math.round(h / 24) > 1 ? 's' : ''}`; };
  const tm = e => e.t.replace(/^0/, '');
  function schedule() {
    const sel = $('rnSchedFor'), keep = store.get('schedFor', 'race');
    sel.innerHTML = `<option value="${race.id}">${esc(race.label)}${mode === 'crew' ? ' (and crews)' : ''}</option><option value="full">Full schedule</option>` +
      R.races.filter(r => r !== race).map(r => `<option value="${r.id}">${esc(r.label)}</option>`).join('');
    sel.value = keep === 'full' ? 'full' : keep !== 'race' && R.races.find(r => r.id === keep) ? keep : race.id;
    drawSchedule();
  }
  function drawSchedule() {
    const tag = showFor(), now = Date.now(), all = events().filter(e => wanted(e, tag));
    $('rnVillage').textContent = INFO.village || '';
    // On now: inside an "until" window, or started in the last 20 minutes. Up next: the next three.
    const on = all.filter(e => e.start <= now && (e.end ? now < e.end : now - e.start < 20 * 60e3));
    const next = all.filter(e => e.start > now).slice(0, 3);
    const line = (e, right) => `<div class="rn-now-i"><b>${when(new Date(e.start))}</b><span>${esc(e.what)}</span><em>${right}</em></div>`;
    $('rnNow').innerHTML = (on.length ? `<h3>On now</h3>` + on.map(e => line(e, e.end ? 'until ' + hm.format(new Date(e.end)) : 'now')).join('') : '') +
      (next.length ? `<h3>Up next</h3>` + next.map(e => line(e, until(e.start - now))).join('') : '') ||
      '<p class="muted">Nothing more on the schedule.</p>';
    let html = '', day = null;
    all.forEach(e => {
      if (e.day !== day) { day = e.day; html += `<h3 class="rn-day">${dayFmt.format(mel(e.day + 'T12:00'))}</h3>`; }
      const past = (e.end || e.start + 20 * 60e3) < now, live = on.includes(e);
      html += `<div class="rn-sch${past ? ' past' : ''}${live ? ' live' : ''}"><b>${tm(e)}</b><span>${esc(e.what)}${tag === 'full' && !e.tags.includes('all') ? `<small>${esc(e.tags.map(x => x === 'crew' ? 'Crews' : (R.races.find(r => r.id === x) || {}).short || x).join(', '))}</small>` : ''}</span></div>`;
    });
    $('rnSched').innerHTML = html || '<p class="muted">Nothing listed for this race.</p>';
  }
  $('rnSchedFor').addEventListener('change', () => { const v = $('rnSchedFor').value; store.set('schedFor', v === race.id ? 'race' : v); drawSchedule(); });
  // Keep On now and Up next current while the tab is open.
  setInterval(() => { if (tab === 'schedule' && !document.hidden) drawSchedule(); }, 60e3);

  // ---------- the plan: aid stations, cut-offs and expected times ----------
  // Pace p from the target time (0 = the first runner's finish, 1 = the final cut-off), or for crews from where
  // the runner was last seen. The time at each point for that p comes from js/races.js (the splits fitted to last
  // year's field where the race has them).
  function targetPace() {
    const S = stage, P = S.points, v = $('rnTarget').value.trim(), m = /^(\d{1,2})(?:[:.h ](\d{1,2}))?$/.exec(v);
    if (!m || +(m[2] || 0) > 59) return null;
    const ms = (+m[1] * 60 + +(m[2] || 0)) * 60000, fin = P[P.length - 1], [lo, hi] = targetRange();
    if (ms < lo || ms > hi) return null;
    return (P[0].ft.getTime() + ms - fin.ft) / (fin.ct - fin.ft);
  }
  // A sensible target: from half the first runner's time to half as long again as the cut-off allows.
  function targetRange() { const P = stage.points, fin = P[P.length - 1], t0 = P[0].ft.getTime(); return [Math.max(60e3, (fin.ft - t0) / 2), (fin.ct - t0) * 1.5]; }
  const hmm = ms => { const m = Math.round(ms / 60000); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
  const targetHint = () => { const [lo, hi] = targetRange(); return `Type a time between ${hmm(Math.ceil(lo / 60000) * 60000)} and ${hmm(Math.floor(hi / 60000) * 60000)} (hours:minutes).`; };
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
    return { p: paceAt(S, p.km, best.at), i, at: best.at };
  }
  // A last seen more than 6 hours ago makes a shaky estimate: say so.
  const stale = sp => { const ago = Date.now() - sp.at; return ago > 6 * 3600e3 && sp.at < stage.points[stage.points.length - 1].ct.getTime() ? `That was ${dur(ago)} ago, so this estimate may be well out. Update where they were last seen.` : ''; };
  function plan() {
    if (!stage) return;
    const S = stage, P = S.points, crew = mode === 'crew';
    const tp = targetPace(), tv = $('rnTarget').value.trim(), seen = crew ? seenPace() : null, p = seen ? seen.p : tp;
    const note = p == null ? '' : p < -0.05 ? 'Faster than our first-runner estimate.' : p > 1 ? 'Slower than the cut-offs allow.' : '';
    // For crews going by where the runner was last seen, the note goes there, not by the target time box.
    $('rnSeenMsg').textContent = seen ? `Expected times below are from ${P[seen.i].name} at ${when(new Date(seen.at))}. ${note} ${stale(seen)}`.trim() : '';
    $('rnSeenMsg').classList.toggle('rn-warn', !!seen && (p > 1 || !!stale(seen)));
    $('rnTargetMsg').textContent = seen ? '' : tv && tp == null ? targetHint() : p == null ? 'Add a time (hours:minutes) to see when you\'d reach each one.' : note;
    $('rnTargetMsg').classList.toggle('bad', !seen && (!!tv && tp == null || p > 1));
    let last = null;
    const rows = P.map((x, i) => {
      if (crew && x.crew === 'no' && i && i < P.length - 1) return '';
      const eta = p != null && i ? timeAt(S, x.km, p) : null, prev = last; last = x;
      const leg = prev ? `${one(x.km - prev.km)} km, +${x.up - prev.up} / −${x.down - prev.down} m` : '';
      const late = eta && x.ct && !x.noCut && eta > x.ct;
      const dirs = crew && x.crew !== 'no' ? `<a class="rn-dir" href="https://www.google.com/maps/dir/?api=1&destination=${x.lat.toFixed(5)},${x.lon.toFixed(5)}" target="_blank" rel="noopener">Directions</a>` : '';
      return `<div class="rn-row${late ? ' late' : ''}${seen && seen.i === i ? ' seen' : ''}">
        <div class="rn-km">${one(x.km)}<small>km</small></div>
        <div class="rn-main"><b>${esc(x.name)}</b><div class="rn-tags">${tags(x)}</div>${leg ? `<div class="rn-leg">${leg}</div>` : ''}
          ${crew && x.crew === 'shuttle' ? `<div class="rn-leg">${esc(INFO.shuttleNote || '')}</div>` : ''}${dirs}</div>
        <div class="rn-times">${eta ? `<div class="rn-eta">${when(new Date(eta))}</div>` : i ? '' : `<div class="rn-eta">${when(x.ft)}</div>`}${i && x.ct && !x.noCut ? `<div class="rn-cut">Cut-off ${when(x.ct)}</div>` : ''}</div></div>`;
    }).join('');
    $('rnPlan').innerHTML = rows;
  }
  $('rnTarget').addEventListener('input', () => { store.set('target.' + KEY(), $('rnTarget').value); plan(); home(); });
  const saveSeen = () => { store.set('seen.' + KEY(), $('rnSeenAt').value ? { i: $('rnSeenAt').value, t: $('rnSeenTime').value } : null); plan(); home(); };
  $('rnSeenAt').addEventListener('change', saveSeen); $('rnSeenTime').addEventListener('input', saveSeen);

  // ---------- mandatory gear ----------
  function gear() {
    const list = (INFO.gear || {})[race.id], ticks = store.get('gear.' + race.id, {});
    const src = INFO.gearSource ? ` <a href="${esc(INFO.gearSource)}" target="_blank" rel="noopener">Full details</a>` : '';
    if (list === 'none') { $('rnGear').innerHTML = `<p>No mandatory gear for this race, but see the other races' lists for what's worth carrying.${src}</p>`; return; }
    if (!list || !list.length) { $('rnGear').innerHTML = '<p class="muted">The gear list for this race will be here before race week.</p>'; return; }
    const need = list.filter(g => !/recommended/i.test(g[0])).length;
    const count = () => list.filter((g, i) => ticks[i] && !/recommended/i.test(g[0])).length;
    $('rnGear').innerHTML = `<p class="fd-hint">${esc(INFO.gearNote || '')}${src}</p><p class="rn-gearcount"></p>` +
      list.map((g, i) => `<label class="rn-gear${/recommended/i.test(g[0]) ? ' rec' : ''}"><input type="checkbox" data-i="${i}"${ticks[i] ? ' checked' : ''}><span>${esc(g[0])}${g[1] ? `<small>${esc(g[1])}</small>` : ''}</span></label>`).join('') +
      '<p class="fd-hint">Ticks are kept on this phone.</p>';
    const show = () => { const n = count(); $('rnGear').querySelector('.rn-gearcount').textContent = n >= need ? `All ${need} mandatory items packed.` : `${n} of ${need} mandatory items packed.`; };
    $('rnGear').querySelectorAll('input').forEach(c => c.onchange = () => { ticks[c.dataset.i] = c.checked; store.set('gear.' + race.id, ticks); show(); });
    show();
  }

  // ---------- Help tab: one safety flow in the runner's language ----------
  // data/safety-cards.js carries the emergency card for international runners, written around the app's own tools,
  // plus the Help tab's labels and status lines, in five languages. The language is remembered; the first time it
  // follows the phone's language. Show in English flips the tab for crew or medics to read, without changing the choice.
  // 000, 112 and the Medical Team number are tap-to-call. The before-you-start ticks are kept on the phone.
  const CARDS = window.GPT_SAFETY_CARDS || { langs: [], cards: {} };
  let flipEn = false;
  function cardLang() {
    const saved = store.get('lang');
    if (saved && CARDS.cards[saved]) return saved;
    const nl = (navigator.language || '').toLowerCase();
    const hit = CARDS.langs.find(l => nl.startsWith(l.code));
    return hit ? hit.code : 'en';
  }
  const viewLang = () => flipEn ? 'en' : cardLang();
  const T = () => (CARDS.cards[viewLang()] || CARDS.cards.en || { ui: {} }).ui;
  const fill = (s, o) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => k in o ? o[k] : m);
  const phoneRe = /\b(000|112|1300 375 352)\b/g;
  const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(phoneRe, m => `<a href="tel:${m.replace(/\s/g, '')}">${m}</a>`);
  function helpTab() {
    const sel = $('rnLang'), tabEl = document.querySelector('.rn-helptab');
    if (!sel || !tabEl || !CARDS.langs.length) return;
    const chosen = cardLang(), c = CARDS.cards[viewLang()], U = c.ui, H = c.help, ticks = store.get('cardTicks', {});
    if (!sel.options.length) sel.innerHTML = CARDS.langs.map(l => `<option value="${l.code}">${esc(l.label)}</option>`).join('');
    sel.value = chosen;
    const flip = $('rnLangFlip');
    flip.hidden = chosen === 'en';
    flip.textContent = flipEn ? CARDS.cards[chosen].ui.backTo : CARDS.cards[chosen].ui.showEnglish;
    tabEl.lang = c.lang;
    // Need help?
    $('rnHelpTitle').textContent = U.needHelp;
    $('rnCall000').textContent = U.call000; $('rnCall000Sub').innerHTML = rich(U.call000Sub);
    if (INFO.medicalPhone) $('rnCallMed').innerHTML = `${esc(U.callMed)}<small>${esc(INFO.medicalPhone)}</small>`;
    $('rnCallMedSub').innerHTML = rich(U.callMedSub);
    $('rnInterp').innerHTML = `<h4>${rich(H.interp.title)}</h4>` + H.interp.text.map(t => `<p>${rich(t)}</p>`).join('');
    // Tell us where you are
    $('rnWhereTitle').textContent = U.whereTitle; $('rnW3wTitle').textContent = U.w3wTitle;
    $('rnShare').textContent = fresh() ? U.send : U.share;
    $('rnWhereSteps').innerHTML = H.where.steps.map(t => `<li>${rich(t)}</li>`).join('');
    $('rnWhereNotes').innerHTML = H.where.notes.map(t => `<p>${rich(t)}</p>`).join('');
    // Lost or stopping
    $('rnLostTitle').textContent = U.lostTitle;
    $('rnLost').innerHTML = H.lost.map(t => `<p>${rich(t)}</p>`).join('');
    $('rnOpenMap').textContent = U.openMap;
    // In an emergency, then the rest of the card to open one at a time
    $('rnSumTitle').textContent = U.summaryTitle;
    $('rnSum').innerHTML = H.summary.map(x => `<div><b>${esc(x[0])}${x[1] ? `<small>${esc(x[1])}</small>` : ''}</b><span>${rich(x[2])}</span></div>`).join('');
    const list = (cls, items, tag) => `<${tag} class="${cls}">${items.map(t => `<li>${rich(t)}</li>`).join('')}</${tag}>`;
    const block = b => {
      if (b.type === 'p') return `<p>${rich(b.text)}</p>`;
      if (b.type === 'steps') return list('rn-card-steps', b.items, 'ol');
      if (b.type === 'bullets') return list('rn-card-bullets', b.items, 'ul');
      if (b.type === 'check') return b.items.map((t, i) => `<label class="rn-gear"><input type="checkbox" data-i="${i}"${ticks[i] ? ' checked' : ''}><span>${rich(t)}</span></label>`).join('');
      if (b.type === 'gear') return `<p class="fd-hint">${esc(U.gearTab)} <button type="button" class="fd-linkbtn" data-go="gear">Gear</button></p>`;
      if (b.type === 'alert') return `<div class="rn-card-alert"><h4>${rich(b.title)}</h4>${(b.text || []).map(t => `<p>${rich(t)}</p>`).join('')}${b.steps ? list('rn-card-steps', b.steps, 'ol') : ''}${(b.after || []).map(t => `<p>${rich(t)}</p>`).join('')}</div>`;
      return '';
    };
    const open = store.get('cardOpen', {});
    $('rnCard').innerHTML = H.sections.map((x, i) => `<details class="rn-card-sec" data-i="${i}"${open[i] ? ' open' : ''}><summary><span class="rn-card-n">${i + 1}</span>${esc(x.title)}</summary><div class="rn-card-body">${x.blocks.map(block).join('')}</div></details>`).join('');
    $('rnCardNote').textContent = U.note;
    $('rnCard').querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => { ticks[cb.dataset.i] = cb.checked; store.set('cardTicks', ticks); });
    $('rnCard').querySelectorAll('details').forEach(d => d.ontoggle = () => { open[d.dataset.i] = d.open; store.set('cardOpen', open); });
    $('rnCard').querySelectorAll('[data-go]').forEach(b => b.onclick = () => setTab(b.dataset.go));
    textLink(); showW3w();
  }
  if ($('rnLang')) {
    $('rnLang').addEventListener('change', () => { store.set('lang', $('rnLang').value); flipEn = false; helpTab(); });
    $('rnLangFlip').addEventListener('click', () => { flipEn = !flipEn; helpTab(); });
    $('rnOpenMap').addEventListener('click', () => setTab('map'));
  }

  // ---------- save the map for offline (as in the field app) ----------
  const OM = window.GPTOfflineMap;
  let saving = false;
  // On iPhone a home screen app keeps its own storage, apart from Safari: a map saved in Safari isn't in the
  // installed app, so it would download twice. There the app asks to be installed first. (Android shares it.)
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const installFirst = () => IOS && !STANDALONE && !store.get('saveInBrowser', false);
  let installPrompt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (introStep === 1) introDraw(); });
  // Save with a progress bar on any button (the Course tab card and the intro use it).
  async function saveMap(btn, bar, out) {
    if (!navigator.onLine) { out.textContent = 'No signal. Try again with wifi or good signal.'; return; }
    saving = true; btn.disabled = true; bar.hidden = false; out.classList.remove('bad'); out.textContent = 'Keep the app open until it finishes.';
    const r = await OM.save((d, t) => { bar.firstChild.style.width = (100 * d / t).toFixed(1) + '%'; btn.textContent = `Saving ${Math.round(100 * d / t)}%`; });
    saving = false; btn.disabled = false;
    if (r.failed) { btn.textContent = 'Save again'; out.textContent = `${r.failed} map squares didn't save. Tap Save again with better signal.`; out.classList.add('bad'); }
    else { btn.textContent = 'Map saved ✓'; btn.disabled = true; out.textContent = 'Saved. The map now works without signal.'; }
    offlineCard();
  }
  const iosSteps = '<ol class="rn-steps"><li>Tap <b>Share</b> <span class="rn-ico">⬆︎</span> at the bottom of Safari (or the top on iPad).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>GPT100</b> from your home screen and save the map there.</li></ol>';
  async function offlineCard() {
    const el = $('fdOffline');
    if (!OM || !OM.available()) { el.hidden = true; return; }
    const st = await OM.status(), mb = Math.round(OM.bytes / 1e6);
    // During the race the race status comes first: the card goes below the quick buttons.
    const on = raceOn(); if (on !== (el.previousElementSibling === document.querySelector('.rn-quick'))) on ? document.querySelector('.rn-quick').after(el) : $('rnHero').before(el);
    el.hidden = false;
    if (saving) return;
    if (st.saved) { el.className = 'fd-offline ok'; el.innerHTML = '<span class="fd-tick">✓</span> Map saved for use without signal.'; return; }
    el.className = 'fd-offline fd-card todo';
    if (installFirst()) {
      el.innerHTML = `<h2>Install the app first</h2>
        <p>Add GPT100 to your home screen, then save the map from there. On iPhone a map saved in Safari isn't shared with the home screen app, so it would download twice (about ${mb} MB).</p>${iosSteps}
        <button type="button" class="fd-linkbtn" id="fdSaveHere">Save in Safari anyway</button>`;
      $('fdSaveHere').onclick = () => { store.set('saveInBrowser', true); offlineCard(); };
      return;
    }
    el.innerHTML = `<h2>Save the map before race day</h2>
      <p>There's little signal on the course. Save the topo map now so it works without signal. About ${mb} MB: best on wifi.</p>
      <button id="fdSaveMap" class="fd-big" type="button">Save map for offline</button><div class="fd-bar" hidden><i></i></div><p class="fd-hint" id="fdSaveMsg"></p>`;
    $('fdSaveMap').onclick = () => saveMap($('fdSaveMap'), el.querySelector('.fd-bar'), $('fdSaveMsg'));
  }

  // Race weekend, from the first start to the last cut-off of any race.
  const raceOn = () => { const now = Date.now(); return R.races.some(r => stagesOf(r).some(S => now > S.points[0].ft.getTime() && now < S.points[S.points.length - 1].ct.getTime())); };

  // ---------- intro (first time, and from the ? button) ----------
  let introStep = -1;
  const STEPS = 4;
  function introOpen() { introStep = 0; $('rnIntro').hidden = false; document.body.classList.add('rn-noscroll'); introDraw(); }
  function introClose() { $('rnIntro').hidden = true; introStep = -1; document.body.classList.remove('rn-noscroll'); store.set('introDone', true); offlineCard(); if (window.GPTViewportFix) setTimeout(GPTViewportFix, 50); }
  async function introDraw() {
    const body = $('rnIntroBody'), i = introStep, mb = Math.round(((OM && OM.bytes) || 0) / 1e6);
    let h = '';
    if (i === 0) h = `<img class="rn-intro-logo" src="icons/logo.png" alt="GPT100 Miler">
      <h2 id="rnIntroTitle">Your race in your pocket</h2>
      <p>The course map, where you are, the next aid station, cut-offs, the schedule and how to get help. Once it's set up it works with no signal.</p>
      <div class="rn-mode rn-intro-mode" role="group"><button type="button" data-m="runner"${mode === 'runner' ? ' class="on"' : ''}>I'm running</button><button type="button" data-m="crew"${mode === 'crew' ? ' class="on"' : ''}>I'm crewing</button></div>
      <label class="rn-intro-l" for="rnIntroRace">Race</label><select id="rnIntroRace" class="rn-schedfor">${R.races.map(r => `<option value="${r.id}"${r === race ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select>
      <p class="fd-hint">You can change these at the top of the app any time.</p>`;
    else if (i === 1) {
      h = `<h2 id="rnIntroTitle">1. Install the app</h2>`;
      if (STANDALONE) h += `<p class="rn-ok">✓ You're using the installed app. Nice.</p><p>It opens straight from your home screen, like any other app.</p>`;
      else if (IOS) h += `<p>Do this first, before saving the map. On iPhone, the home screen app keeps its own copy, so a map saved here in the browser would have to download again.</p>${iosSteps}<p class="fd-hint">Not in Safari? Open this page in Safari to add it.</p>`;
      else if (installPrompt) h += `<p>Install it so it opens from your home screen, like any other app.</p><button type="button" class="fd-big" id="rnInstall">Install app</button><p class="fd-hint" id="rnInstallMsg"></p>`;
      else h += `<p>Add it to your home screen so it opens like any other app.</p><ol class="rn-steps"><li>Open the browser menu <span class="rn-ico">⋮</span>.</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li></ol><p class="fd-hint">On a computer it works in the browser as it is.</p>`;
    } else if (i === 2) {
      h = `<h2 id="rnIntroTitle">2. Save the map</h2><p>There's little signal on the course. Save the topo map along the course (about ${mb} MB) on wifi, a few days before.</p>`;
      const st = OM && OM.available() ? await OM.status() : null;
      if (!st) h += '<p class="muted">This browser can\'t save the map. Try Safari or Chrome.</p>';
      else if (st.saved) h += '<p class="rn-ok">✓ The map is saved on this phone.</p>';
      else if (installFirst()) h += '<p class="notice warn">Install the app first (step 1), then open it from your home screen. You\'ll see this guide again there, with the Save button.</p>';
      else h += '<button type="button" class="fd-big" id="rnIntroSave">Save map now</button><div class="fd-bar" hidden><i></i></div><p class="fd-hint" id="rnIntroSaveMsg">You can also do this later on the Course tab.</p>';
    } else h = `<h2 id="rnIntroTitle">3. How it works</h2>
      <ul class="rn-tablist">
        <li><b>Home</b> Your race at a glance: the countdown, start and cut-off, and what's on next.</li>
        <li><b>Map</b> Your race on a big topo map. Tap <b>◎</b> to see where you are: your race km, the next aid station, the climb to it, its cut-off and when you'll get there show under the profile.</li>
        <li><b>${mode === 'crew' ? 'Crew' : 'Aid'}</b> ${mode === 'crew' ? 'Crew points with directions and your runner’s expected times.' : 'Every aid station with cut-offs. Add a target time to see your splits.'}</li>
        <li><b>Help</b> Your safety tab, in English, Japanese, Chinese, Russian or Polish: call 000 or race medical, find your three words (what3words) and GPS numbers to read out, share your location, and what to do if you're lost, bitten, or helping another runner.</li>
        <li><b>Schedule</b> What's on now, what's next, and the full schedule.</li>
        <li><b>Gear</b> Tick off your mandatory gear.</li>
      </ul><p class="fd-hint">Tap <b>?</b> at the top any time to see this again. A guide only: follow the course markings and the race briefing.${C.tracking && C.tracking.credit && C.tracking.credit.name ? ` Timing and tracking by ${C.tracking.credit.url ? `<a href="${esc(C.tracking.credit.url)}" target="_blank" rel="noopener">${esc(C.tracking.credit.name)}</a>` : esc(C.tracking.credit.name)}.` : ''}</p>`;
    body.innerHTML = h;
    $('rnIntroDots').innerHTML = Array.from({ length: STEPS }, (_, k) => `<i${k === i ? ' class="on"' : ''}></i>`).join('');
    $('rnIntroBack').style.visibility = i ? 'visible' : 'hidden';
    $('rnIntroNext').textContent = i === STEPS - 1 ? 'Let\'s go' : 'Next';
    if (i === 0) {
      body.querySelectorAll('.rn-intro-mode button').forEach(b => b.onclick = () => { setMode(b.dataset.m); introDraw(); });
      $('rnIntroRace').onchange = () => { $('rnRace').value = $('rnIntroRace').value; $('rnRace').dispatchEvent(new Event('change')); };
    }
    if ($('rnInstall')) $('rnInstall').onclick = async () => { installPrompt.prompt(); const c = await installPrompt.userChoice.catch(() => null); installPrompt = null; $('rnInstallMsg') && ($('rnInstallMsg').textContent = c && c.outcome === 'accepted' ? 'Installed. You can open it from your home screen.' : ''); };
    if ($('rnIntroSave')) $('rnIntroSave').onclick = () => saveMap($('rnIntroSave'), body.querySelector('.fd-bar'), $('rnIntroSaveMsg'));
  }
  // A quick double tap shouldn't skip a step.
  let introT = 0; const slow = () => { const n = Date.now(), ok = n - introT > 450; if (ok) introT = n; return ok; };
  $('rnIntroNext').onclick = () => { if (!slow()) return; if (introStep >= STEPS - 1) introClose(); else { introStep++; introDraw(); } };
  $('rnIntroBack').onclick = () => { if (introStep > 0 && slow()) { introStep--; introDraw(); } };
  $('rnIntroSkip').onclick = introClose;
  $('rnHelpIntro').onclick = introOpen;

  // ---------- start ----------
  const RUN_HINT = 'Tap ◎ on the map to see where you are and how far to the next aid station. Drag along the profile to see any point.';
  initMap();
  $('rnChangeRace').onclick = () => { setTab('home'); $('rnRace').focus(); };
  profile = GPTProfile(profOpts = { height: 118, summary: () => whereNow,
    el: $('rnProf'), course: engineFor(R.stages[race.stages[0]]) || MAIN, map: () => map, who: 'you',
    empty: RUN_HINT,
    window: En => stage && En === E() ? { k0: stage.points[0].gk, k1: stage.points[stage.points.length - 1].gk } : null,
    km: { toRace: k => stage ? toRace(stage, k) : k, toCourse: k => stage ? toCourse(stage, k) : k },
    title: () => !stage ? '' : `${race.short}${race.stages.length > 1 ? ' ' + stage.label : ''}: ${one(stage.points[stage.points.length - 1].km)} km`
  });
  if (INFO.medicalPhone) { $('rnCallMed').hidden = false; $('rnCallMed').href = 'tel:' + INFO.medicalPhone.replace(/\s/g, ''); }
  $('rnW3wGet').addEventListener('click', () => { $('rnW3wMsg').textContent = T().finding; locate(); });
  helpTab();
  $('rnNotices').innerHTML = (INFO.notices || []).map(n => `<p class="notice">${esc(n.text)}</p>`).join('');
  if (C.tracking && C.tracking.url) { const t = $('fdTrack'); t.hidden = false; t.innerHTML = `<a class="btn" href="${esc(C.tracking.url)}" target="_blank" rel="noopener">${esc(C.tracking.label || 'Live tracking')}</a>${C.tracking.credit && C.tracking.credit.name ? ` <span class="fd-hint">by ${C.tracking.credit.url ? `<a href="${esc(C.tracking.credit.url)}" target="_blank" rel="noopener">${esc(C.tracking.credit.name)}</a>` : esc(C.tracking.credit.name)}</span>` : ''}`; }
  setStage(pickStage());
  setMode(mode);
  setTab(tab);
  offlineCard();
  // Opened for the first time mid-race (a crew sent the link): straight to the race, the intro is on the ? button.
  if (!store.get('introDone', false) && !raceOn()) introOpen();
  let rz = null; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (map) map.invalidateSize(); }, 200); });
  function netStatus() { $('net').hidden = navigator.onLine; }
  addEventListener('online', netStatus); addEventListener('offline', netStatus); netStatus();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  window.GPTRunner = { map: () => map, stage: () => stage };
})();
