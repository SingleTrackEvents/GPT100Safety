// GPT100 Safety staff app: the Find tab (incident finder), tabs and start-up.
(function () {
  // G is the engine for the course being viewed (GPT100 by default); the picker switches it.
  let G = window.GPT, route = G.route;
  const C = G.config;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const one = n => (Math.round(n * 10) / 10).toFixed(1);
  const kmTxt = km => 'km ' + one(km);
  // what3words: a tappable ///address that opens the what3words app or website.
  const w3wLink = w => w ? `<a class="w3w" href="https://w3w.co/${esc(w)}" target="_blank" rel="noopener">///${esc(w)}</a>` : '';

  $('assumptions').textContent =
    `Estimates assume responders walk ${C.walkPace} min/km, stretcher carry ${C.evacPace} min/km` +
    (C.carryFactor && C.carryFactor.hard ? ` (x${C.carryFactor.hard} on Hard track${C.carryFactor.unassessed ? `, x${C.carryFactor.unassessed} where not yet assessed` : ''})` : '') +
    `, ${C.climbPenalty} min per metre of climb. Drive times are the race team's times or checked routes ` +
    `(older automatic times x ${C.driveFactor}).`;

  // ---------- Tabs ----------
  function showTab(name) {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
      const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
    });
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + name));
    document.body.classList.toggle('on-find', name === 'find');
    document.body.classList.toggle('on-med', name === 'med');
    document.body.classList.toggle('on-wx', name === 'wx');
    document.body.classList.toggle('on-rc', name === 'rc');
    if (window.RaceControl) { if (name === 'rc') window.RaceControl.onShow(); else window.RaceControl.onHide(); }
    if (window.WeatherTab) { if (name === 'wx') window.WeatherTab.onShow(); else window.WeatherTab.onHide(); }
    if (name === 'med' && window.MedPlan) window.MedPlan.onShow();
    if (name === 'find' && map) setTimeout(() => map.invalidateSize(), 0);
    if (name === 'find' && profile) setTimeout(profile.redraw, 0);
  }
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.addEventListener('click', () => {
    history.replaceState(null, '', b.dataset.tab === 'med' ? '#medical' : b.dataset.tab === 'wx' ? '#weather' : b.dataset.tab === 'rc' ? '#control' : location.pathname + location.search);
    showTab(b.dataset.tab);
  }));

  // The map page keeps this page's query (a demo or a rehearsal feed carries over).
  if ($('mapLink')) $('mapLink').href = 'map.html' + location.search;

  // ---------- Online status ----------
  function netStatus() { $('net').hidden = navigator.onLine; }
  addEventListener('online', netStatus); addEventListener('offline', netStatus); netStatus();

  // ---------- Map ----------
  // The map is optional: if Leaflet can't load (no signal on first open), answers still work.
  let courseLL = route.map(p => [p[0], p[1]]);
  let map = null, resultLayer = null, courseLayer = null, runnerLayer = null, pin = null;
  // The elevation profile under the map: the course, then the casualty's section.
  const profile = window.GPTProfile ? GPTProfile({ el: $('findProf'), course: G, map: () => map, who: 'the casualty', colour: '#ffd21f',
    empty: 'Find a casualty to see their section: the climb and distance to the aid stations either side. Drag along the profile to see any point.' }) : null;
  if (window.L) initMap();
  else {
    $('map').innerHTML = '<p class="map-off">Map unavailable without signal. Answers still work.</p>';
    $('btnPick').disabled = true;
  }

  function initMap() {
  map = L.map('map', { preferCanvas: true, zoomControl: true });
  GPTBaseMap(map);
  if (window.GPTFullscreen) GPTFullscreen(map, $('map').parentNode);
  pin = (color, size) => L.divIcon({ className: '', html: `<div class="pin" style="background:${color};width:${size}px;height:${size}px"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  courseLayer = L.layerGroup().addTo(map);
  drawCourse(true);
  // Layers from the layers button: helicopter landing sites on by default, the Parks Victoria markers off until wanted.
  if (window.GPTHelipads) GPTHelipads.overlay(map, true);
  if (window.GPTTrack) { GPTBaseMap.overlay(map, 'Emergency markers', GPTTrack.overlay(['emergency']), false); GPTBaseMap.overlay(map, 'Camps and assembly areas', GPTTrack.overlay(['camp', 'assembly']), false); }
  G.BASES.forEach(b => L.marker([b.lat, b.lon], { icon: pin(b.color, 22), zIndexOffset: 500, title: b.name + ' base' }).bindPopup(`<b>${esc(b.name)} base</b><br>${w3wLink(G.data.bases_w3w && G.data.bases_w3w[b.key])}`).addTo(map));

  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const d = L.DomUtil.create('div', 'map-legend');
    d.innerHTML = G.BASES.map(b => `<i style="background:${b.color}"></i>${esc(b.name)}`).join('<br>') +
      '<br><i style="background:#111"></i>Aid station or water point<br><i style="background:#888"></i>Access point<br><i style="background:#6d3b8e"></i>Gated access' +
      `<br><i class="ln" style="background:#e00000;opacity:.5"></i>Over ${G.fmt(C.redMin)} to reach` +
      (window.GPTHelipads ? '<br><span class="legend-head">Helicopter landing sites</span><br>' + GPTHelipads.legendHTML() : '') +
      (window.GPTTrack ? '<br><span class="legend-head">Track grade after a find</span><br>' + GPTTrack.legendHTML() : '') +
      (window.GPTTracking ? '<br><span class="trk-mk" style="display:inline-block;vertical-align:middle">1047</span> Tracked runner (grey: quiet, red: not moving)' + (GPTTracking.chip() ? '<br><span class="trk-mk est" style="display:inline-block;vertical-align:middle">1047</span> Estimated from the timing chips (amber: late at the next checkpoint)' : '') : '');
    return d;
  };
  legend.addTo(map);
  resultLayer = L.layerGroup().addTo(map);
  if (window.GPTTracking) {
    runnerLayer = L.layerGroup().addTo(map);
    GPTTracking.onUpdate(() => {
      runnerLayer.clearLayers(); GPTTracking.draw(runnerLayer, G, null, null, { find: true });
      if (last && $('trkNear')) { $('trkNear').innerHTML = GPTTracking.nearHTML(G, last.km, last.lat, last.lon); refreshMessage(last); }
    });
  }
  map.on('click', e => {
    setPicking(false);
    $('q').value = e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5);
    setMsg('');
    findLL(e.latlng.lat, e.latlng.lng, 'map');
  });
  }

  // Everything on the map that depends on the course being viewed.
  function drawCourse(fit) {
    if (!map) return;
    courseLayer.clearLayers();
    G.courses.filter(c => c !== G).forEach(c => L.polyline(c.route.map(p => [p[0], p[1]]), { color: '#8a8a8a', weight: 2, opacity: .6, dashArray: '4,6', interactive: false }).addTo(courseLayer));
    // Red wash where the fastest team takes longer than the red threshold.
    const all = G.bestAtAll(); let seg = null;
    const wash = s => { if (s.length > 1) L.polyline(s, { color: '#e00000', weight: 12, opacity: .35, interactive: false }).addTo(courseLayer); };
    for (let i = 0; i < route.length; i++) {
      if (all[i] && all[i].total > C.redMin) { if (!seg) seg = []; seg.push(courseLL[i]); }
      else if (seg) { wash(seg); seg = null; }
    }
    if (seg) wash(seg);
    const line = L.polyline(courseLL, { color: '#d9531e', weight: 4, opacity: .95 }).addTo(courseLayer);
    G.ACCESS.forEach(a => {
      if (G.main && a.aid) return;
      L.marker([a.lat, a.lon], { icon: pin(G.isGated(a) ? '#6d3b8e' : '#888', 10), title: G.cleanName(a) + (G.isGated(a) ? ' (gated)' : '') })
        .bindPopup(`<b>${esc(G.cleanName(a))}</b><br>${kmTxt(a.trail_km)}${G.isGated(a) ? ' &middot; gated' : ''}${a.conn_m > 50 ? ' &middot; ' + a.conn_m + ' m walk to course' : ''}${a.note ? '<br>' + esc(a.note) : ''}<br>${w3wLink(a.w3w)}`)
        .addTo(courseLayer);
    });
    G.AID.forEach(a => L.marker([a.lat, a.lon], { icon: pin('#111', 14), title: a.name }).bindPopup(`<b>${esc(a.name)}</b><br>${stopKind(a)}, ${kmTxt(a.trail_km)}<br>${w3wLink(a.w3w)}`).addTo(courseLayer));
    if (fit) map.fitBounds(line.getBounds().pad(0.05));
  }
  function stopKind(a) {
    if (a.kind) return { start: 'Start', finish: 'Finish', aid: 'Aid station', water: 'Water point', checkpoint: 'Checkpoint' }[a.kind] || 'Checkpoint';
    return /water point/i.test(a.name) ? 'Staffed water point' : 'Aid station';
  }

  // ---------- Course picker ----------
  const EMPTY = $('result').innerHTML;
  function setCourse(id) {
    const next = window.GPT.course(id);
    if (next === G) return;
    G = next; route = G.route; courseLL = route.map(p => [p[0], p[1]]);
    document.querySelectorAll('.course-pick button').forEach(b => b.classList.toggle('on', b.dataset.c === G.id));
    document.querySelectorAll('.course-note').forEach(n => n.textContent = G.note);
    last = null; $('result').innerHTML = EMPTY; setMsg('');
    if (map) { resultLayer.clearLayers(); drawCourse(true); if (runnerLayer) { runnerLayer.clearLayers(); GPTTracking.draw(runnerLayer, G, null, null, { find: true }); } }
    if (profile) { profile.setHere(null); profile.setCourse(G); }
    if ($('racePick')) $('racePick').hidden = !G.main;
  }
  if (G.courses.length > 1) {
    const html = `<div class="course-pick" role="group" aria-label="Course">${G.courses.map(c => `<button type="button" data-c="${c.id}"${c === G ? ' class="on"' : ''}>${esc(c.label)}</button>`).join('')}</div><p class="course-note"></p>`;
    $('findForm').insertAdjacentHTML('afterbegin', html);
    document.querySelectorAll('.course-pick button').forEach(b => b.addEventListener('click', () => setCourse(b.dataset.c)));
  }

  // ---------- Runner's race (on the GPT100 course) ----------
  // Stage and shorter races run on part of the GPT100 course; a runner gives their own race km,
  // which is converted to GPT100 km using the race's start and finish aid stations.
  const RACES = (C.races || []).map(r => {
    const a = window.GPT.AID.find(x => x.name === r.from), b = window.GPT.AID.find(x => x.name === r.to);
    return a && b ? Object.assign({}, r, { start: a.trail_km, end: b.trail_km }) : null;
  }).filter(Boolean);
  let race = RACES[0] || null;
  const isSub = (r = race) => G.main && r && r.start + (window.GPT.totalKm - r.end) > 0.05; // not the whole course
  // The official race distances run up to 0.5 km past the course line's finish (Miler 163 against 162.6), so allow that much.
  const TOL = 0.5;
  if (RACES.length > 1) {
    const box = `<label class="race-pick" id="racePick">Runner's race <select id="race">${RACES.map(r => `<option value="${r.id}">${esc(r.label)}</option>`).join('')}</select></label>`;
    const note = $('findForm').querySelector('.course-note');
    if (note) note.insertAdjacentHTML('afterend', box); else $('findForm').insertAdjacentHTML('afterbegin', box);
    $('race').addEventListener('change', () => setRace($('race').value, true));
  }
  function setRace(id, rerun) {
    race = RACES.find(r => r.id === id) || RACES[0];
    if ($('race')) $('race').value = race.id;
    $('q').placeholder = (isSub() ? `${race.label} km, coordinates or what3words` : 'Km, coordinates or what3words') + (window.GPTTracking ? ' or #bib' : '');
    if (!rerun) return;
    // A typed km is re-read as the new race's km; any other search just updates the race km shown.
    const q = parseQuery($('q').value);
    if (q && q.type === 'km' && (!q.race || q.race === race.id)) { setMsg(''); findKm(q.km); }
    else if (q && q.type === 'error' && /^\s*\d/.test($('q').value)) fail(q.msg);
    else if (last) show(last.ic, last.q);
  }
  // Where a GPT100 km falls in the runner's race, or null if it's outside that race.
  function raceKmOf(km) {
    if (!isSub() || km < race.start - 0.05 || km > race.end + 0.05) return null;
    return Math.max(0, km - race.start);
  }

  // ---------- Find ----------
  // lookSeq is bumped by every search, so a slow what3words lookup can't land on top of a newer answer.
  let picking = false, last = null, casMarker = null, lookSeq = 0;

  function setMsg(t, ok) { const m = $('qMsg'); m.textContent = t || ''; m.classList.toggle('ok', !!ok); }

  // Clear the answer, so a stale casualty can't be read out or sent after a failed search.
  function clearResult() {
    if (!last) return;
    last = null; casMarker = null; $('result').innerHTML = EMPTY;
    if (map) resultLayer.clearLayers();
    if (profile) profile.setHere(null);
    history.replaceState(null, '', location.pathname + location.search);
  }
  function fail(t) { setMsg(t); clearResult(); }

  // Coordinates as decimal degrees, degrees and minutes, or degrees, minutes and seconds, with or without
  // N/S/E/W ("-37.294, 142.601", "-37° 17.640', 142° 36.060'", "37 17 38.4 S 142 36 3.6 E"). Null if it isn't that shape.
  function parseLL(v) {
    // A trailing altitude from a GPS app ("-37.294, 142.601, 820") is dropped.
    const t = v.toUpperCase().replace(/[°º'′"″]/g, ' ').trim().replace(/^([+-]?\d+\.\d+\s*,\s*[+-]?\d+\.\d+)\s*,\s*[+-]?\d+(?:\.\d+)?\s*M?$/, '$1');
    if (!/^[\d\s.,;+\-NSEW]+$/.test(t)) return null;
    const toks = t.match(/[NSEW]|[+-]?\d+(?:\.\d+)?|[,;]|\s+|./g);
    if (toks.some(x => x === '.' || /^[+-]$/.test(x))) return null;
    const ks = toks.filter(x => !/^\s+$/.test(x));
    let groups = [];
    if (ks.some(x => /^[NSEW]$/.test(x))) {
      // Letters before the numbers (S37.294 E142.601) or after them (37 17 38 S 142 36 4 E).
      const pre = /^[NSEW]$/.test(ks[0]), cur = [];
      let h = null;
      for (const x of ks.filter(y => !/^[,;]$/.test(y)).concat(pre ? ['|'] : [])) {
        if (/^[NSEW|]$/.test(x)) {
          if (pre) { if (h) groups.push({ h, n: cur.splice(0) }); h = x; }
          else groups.push({ h: x, n: cur.splice(0) });
        } else cur.push(+x);
      }
      if (cur.length) return null;
    } else {
      // One comma in the middle: split there. Otherwise split the numbers in half.
      const n = ks.filter(x => !/^[,;]$/.test(x)).map(Number), si = ks.findIndex(x => /^[,;]$/.test(x));
      const at = si > 0 && si < ks.length - 1 && ks.filter(x => /^[,;]$/.test(x)).length === 1 ? si : n.length % 2 ? -1 : n.length / 2;
      if (at < 0) return null;
      groups = [{ n: n.slice(0, at) }, { n: n.slice(at) }];
    }
    if (groups.length !== 2) return null;
    const deg = g => {
      const [d, m = 0, s = 0] = g.n;
      if (!g.n.length || g.n.length > 3 || m < 0 || m >= 60 || s < 0 || s >= 60) return null;
      if ((g.n.length > 1 && !Number.isInteger(d)) || (g.n.length > 2 && !Number.isInteger(m))) return null;
      const x = Math.abs(d) + m / 60 + s / 3600;
      return (d < 0 || Object.is(d, -0) || g.h === 'S' || g.h === 'W') ? -x : x;
    };
    let a = deg(groups[0]), b = deg(groups[1]);
    if (a == null || b == null) return null;
    const h0 = groups[0].h, h1 = groups[1].h;
    if (h0 || h1) {
      if (!h0 || !h1 || /[NS]/.test(h0) === /[NS]/.test(h1)) return null;
      if (/[EW]/.test(h0)) { const x = a; a = b; b = x; }
      return { lat: a, lon: b, lettered: true };
    }
    return { lat: a, lon: b };
  }

  function parseQuery(raw) {
    // Paste junk: Unicode minus, zero-width and non-breaking spaces.
    const v = raw.normalize('NFKC').replace(/[\u2212\u2010\u2011\uFE63\uFF0D]/g, '-').replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '').replace(/[\u00A0\u2007\u202F]/g, ' ').trim();
    if (!v) return null;
    const w = v.replace(/^what3words:\/\//i, '').replace(/^\/+/, '');
    if (/^[\p{L}]+\.[\p{L}]+\.[\p{L}]+$/u.test(w)) return { type: 'w3w', words: w.toLowerCase() };
    // A runner's bib, from the live tracking feed: "#1047", "bib 1047", or a bare number past the end of the course.
    const bm = v.match(/^(?:#|bib\s*|runner\s*)?(\d{1,5})$/i);
    if (bm && window.GPTTracking) {
      const r = GPTTracking.byBib(bm[1]), tagged = /^(#|bib|runner)/i.test(v);
      if (r && (tagged || +bm[1] > G.totalKm + TOL)) return r.pos ? { type: 'bib', r } : { type: 'error', msg: `Bib ${bm[1]} (${r.name}) has no position yet from the tracker or the timing chips` };
      if (tagged) return { type: 'error', msg: GPTTracking.ready() ? `No bib ${bm[1]} in the tracking feed` : 'Tracking is still loading, try again in a moment' };
    }
    if (bm && /^(#|bib|runner)/i.test(v) && !window.GPTTracking) return { type: 'error', msg: 'Live tracking isn\'t available here, so bibs can\'t be looked up. Ask for the km or coordinates.' };
    // Coordinates count only when they land within 20 km of the course; anything further is a misread.
    let far = null;
    const ll = parseLL(v);
    if (ll) {
      let { lat, lon } = ll;
      if (!ll.lettered) {
        if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) { const t = lat; lat = lon; lon = t; }
        if (lat > 0 && lon > 100) lat = -lat; // southern hemisphere minus sign often dropped over the radio
      }
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        const off = G.snap(lat, lon).offM, other = G.courses.find(c => c !== G && c.snap(lat, lon).offM <= 20000);
        if (off <= 20000) return { type: 'll', lat, lon };
        if (other) return { type: 'error', msg: `That spot is ${Math.round(off / 1000)} km from the ${G.name} course. Pick ${other.label} above.` };
        far = off;
      } else far = Infinity;
    }
    // A km: "87.3", "km 87.3", "87.3km", ".5", "87." or a decimal comma with no space and 1 or 2 digits ("87,3").
    // Anything else with a comma ("37, 142") went through the coordinates above.
    const m = v.match(/^(?:km\s*)?(-?(?:\d+(?:\.\d*|,\d{1,2})?|\.\d+))\s*(?:km)?$/i);
    if (m) return kmQuery(+m[1].replace(',', '.'), race);
    if (/^(?:km\s*)?\d+(?:[.,]\d+)?\s*(?:-|\u2013|to)\s*\d+(?:[.,]\d+)?\s*(?:km)?$/i.test(v)) return { type: 'error', msg: 'Give one km, not a range' };
    if (far != null) return { type: 'error', msg: isFinite(far) ? `That reads as coordinates ${Math.round(far / 1000).toLocaleString()} km from the course. Check them with the caller, or type one km (e.g. 87.3).` : 'Those coordinates don\'t look right' };
    // Free text: a stage ("stage 2 km 10") picks that race, and a km is taken only when exactly one number is marked as km.
    let r = race, txt = v;
    const st = v.match(/\bstage\s*([1-4])\b/i);
    if (st) {
      if (!G.main) return { type: 'error', msg: `Pick ${window.GPT.label} above, then the runner's race` };
      r = RACES.find(x => new RegExp('stage ' + st[1] + '\\b', 'i').test(x.label));
      if (!r) return { type: 'error', msg: 'Pick the runner\'s race above, then type their km' };
      txt = v.replace(st[0], ' ');
    }
    // More than one number anywhere ("runner 3 km 20", "km 1e2") is refused, not guessed.
    // "km 20" counts; "20 km" only at the end or before punctuation, since "2 km past Halls Gap" is a distance from a place.
    const nums = txt.match(/\d+(?:\.\d+|,\d{1,2}(?!\d))?|\.\d+/g) || [];
    if (nums.length > 1) return { type: 'error', msg: 'That has more than one number in it. Type just the one km (e.g. 87.3).' };
    const n1 = nums[0], km = n1 && (txt.match(/\bkm\s*(\d+(?:\.\d+|,\d{1,2})?|\.\d+)/i) || txt.match(/(\d+(?:\.\d+|,\d{1,2})?|\.\d+)\s*km\s*(?:$|[,.;:!?)])/i));
    if (km) {
      const q = kmQuery(+km[1].replace(',', '.'), r);
      if (q.type === 'km') { q.note = `Read as ${isSub(r) ? r.label + ' ' : ''}km ${km[1]}`; if (r !== race) { q.race = r.id; q.note += `, for this search only. The race picker stays on ${race.label}.`; } }
      return q;
    }
    if (n1 && /km/i.test(txt)) return { type: 'error', msg: `That reads as a distance from somewhere, not a course km. Ask for the course km, coordinates or what3words.` };
    if (st) return { type: 'error', msg: 'Pick the runner\'s race above, then type their km' };
    return { type: 'error', msg: ENTER() };
  }
  const ENTER = () => 'Enter a km, coordinates (lat, lon) or ///word.word.word' + (window.GPTTracking ? ', or a bib (#1047)' : '');
  // A km in race r (or on the course being viewed), as GPT100 km, clamped to the course.
  function kmQuery(km, r) {
    if (!isFinite(km)) return { type: 'error', msg: ENTER() };
    if (isSub(r)) {
      const len = r.end - r.start;
      if (km < 0 || km > len + TOL) return { type: 'error', msg: `${r.label} km must be between 0 and ${len.toFixed(1)} (the finish)` };
      return { type: 'km', km: Math.min(r.start + km, r.end) };
    }
    if (km < 0 || km > G.totalKm + TOL) return { type: 'error', msg: `Km must be between 0 and ${G.totalKm}` };
    return { type: 'km', km: Math.min(km, G.totalKm) };
  }

  function findKm(km, source) { show(G.idxAtKm(km), { source: source || 'km' }); }
  function findLL(lat, lon, source, words) {
    const s = G.snap(lat, lon);
    show(s.ic, { source, lat, lon, offM: s.offM, words });
  }

  $('findForm').addEventListener('submit', e => {
    e.preventDefault(); $('q').blur();
    lookSeq++;
    const q = parseQuery($('q').value);
    if (!q) { fail('Type a km, coordinates or what3words first'); return; }
    if (q.type === 'error') { fail(q.msg); return; }
    setMsg(q.note || '', !!q.note);
    // A typed stage applies to this search only: the picker keeps the runner's race.
    if (q.race) { const keep = race; race = RACES.find(x => x.id === q.race); try { findKm(q.km); } finally { race = keep; } }
    else if (q.type === 'km') findKm(q.km);
    else if (q.type === 'll') findLL(q.lat, q.lon, 'coordinates');
    else if (q.type === 'bib') findBib(q.r);
    else lookupW3W(q.words);
  });
  // A runner from the live feeds: where they most likely are now (their last GPS fix or chip read, carried forward at
  // their pace when it's a few minutes old), on their own course. The message says how that was worked out.
  function findBib(r) {
    if (r.pos.course !== G) setCourse(r.pos.course.id);
    $('q').value = '#' + r.bib;
    const p = r.pos, at = p.est || p, how = p.est ? `bib ${r.bib}, estimated from ${p.est.from === 'GPS' ? 'the last GPS fix' : 'the ' + p.est.from + ' chip read'} ${GPTTracking.ago(p.ageMs)}` : `bib ${r.bib}, ${p.src === 'chip' ? 'chip read at ' + p.chipAt.name : 'GPS fix'} ${GPTTracking.ago(p.ageMs)}`;
    findLL(at.lat, at.lon, p.done ? `bib ${r.bib}, last known place` : how);
    const text = GPTTracking.where(r).replace(/<[^>]+>/g, '');
    setMsg(`Bib ${r.bib} ${r.name}: ${text}${p.est ? '. The marker is the estimate; the last hard fix was km ' + p.km.toFixed(1) : ''}.`, !(p.stale || p.done || (p.next && p.next.late)));
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('.trk-go'); if (!b || !window.GPTTracking) return;
    const r = GPTTracking.byBib(b.dataset.bib); if (r && r.pos) { showTab('find'); findBib(r); }
  });

  $('btnGps').addEventListener('click', () => {
    if (!navigator.geolocation) { setMsg('This device can\'t share its location'); return; }
    setMsg('Getting your location...', true);
    navigator.geolocation.getCurrentPosition(
      p => { setMsg(`Your location, accurate to about ${Math.round(p.coords.accuracy)} m`, true); $('q').value = p.coords.latitude.toFixed(5) + ', ' + p.coords.longitude.toFixed(5); findLL(p.coords.latitude, p.coords.longitude, 'GPS'); },
      err => fail(err.code === 1 ? 'Location permission was blocked. Allow it in your browser settings.' : 'Couldn\'t get a GPS fix. Try again in the open.'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
  });

  let hint = null;
  function setPicking(on) {
    picking = on; $('btnPick').classList.toggle('picking', on); $('btnPick').textContent = on ? 'Cancel' : 'Pick on map';
    if (on && !hint) { hint = document.createElement('div'); hint.className = 'map-hint'; hint.textContent = 'Tap where the casualty is'; $('map').parentNode.appendChild(hint); }
    if (!on && hint) { hint.remove(); hint = null; }
    if (on) $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('btnPick').addEventListener('click', () => setPicking(!picking));

  // what3words needs a connection and an API key.
  // A key the API rejected isn't used again this session. Only a typed lookup (ask) prompts for a new one.
  const W3W_LS = 'gpt100_w3w_key';
  let w3wBad = null;
  function w3wKey(ask) {
    let k = C.what3wordsKey || '';
    try { k = localStorage.getItem(W3W_LS) || k; } catch (e) { }
    if (k === w3wBad) k = '';
    if (!k && ask) {
      const n = prompt('Enter the what3words API key (ask the Race Director). It\'s saved on this device.', k);
      if (n != null) { k = n.trim(); try { localStorage.setItem(W3W_LS, k); } catch (e) { } }
    }
    return k;
  }
  // Course area for what3words suggestions, so misheard words resolve to somewhere near the race.
  const BOX = (() => {
    let s = 90, n = -90, w = 180, e = -180;
    route.forEach(p => { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); });
    return [s - 0.1, w - 0.1, n + 0.1, e + 0.1].map(x => x.toFixed(4)).join(',');
  })();
  const MID = route[Math.floor(route.length / 2)];

  async function w3wApi(path, params) {
    const key = w3wKey(false);
    if (!key) throw new Error('nokey');
    const qs = new URLSearchParams(Object.assign({ key }, params)).toString();
    const j = await (await fetch(`https://api.what3words.com/v3/${path}?${qs}`)).json();
    if (j && j.error && /key|referrer/i.test(j.error.code + j.error.message)) {
      w3wBad = key; try { localStorage.removeItem(W3W_LS); } catch (e) { }
      throw new Error('badkey');
    }
    return j;
  }

  // The what3words address of a spot (needs signal). Cached so repeat searches don't use up the quota.
  const w3wCache = {};
  async function w3wAt(lat, lon) {
    const id = lat.toFixed(5) + ',' + lon.toFixed(5);
    if (id in w3wCache) return w3wCache[id];
    if (!navigator.onLine) return null;
    try { const j = await w3wApi('convert-to-3wa', { coordinates: id }); return (w3wCache[id] = j.words || null); }
    catch (e) { return null; }
  }

  async function suggest(input) {
    const j = await w3wApi('autosuggest', { input, 'clip-to-bounding-box': BOX, focus: MID[0] + ',' + MID[1], 'n-results': 3 });
    return (j && j.suggestions) || [];
  }

  // Suggestions list under the search box (also used for "did you mean").
  function showSuggestions(list, heading) {
    const box = $('w3wSug');
    if (!list || !list.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = (heading ? `<p class="sug-head">${esc(heading)}</p>` : '') + list.map(x =>
      `<button type="button" class="sug" data-w="${esc(x.words)}"><b>///${esc(x.words)}</b><span>near ${esc(x.nearestPlace || '')}</span></button>`).join('');
    box.hidden = false;
    box.querySelectorAll('.sug').forEach(btn => btn.addEventListener('click', () => {
      $('q').value = '///' + btn.dataset.w; showSuggestions(null); lookupW3W(btn.dataset.w);
    }));
  }

  let sugTimer = null, sugSeq = 0;
  $('q').addEventListener('input', () => {
    clearTimeout(sugTimer);
    const w = $('q').value.trim().replace(/^what3words:\/\//i, '').replace(/^\/+/, '');
    if (!navigator.onLine || !/^[\p{L}]+\.[\p{L}]+\.[\p{L}]+$/u.test(w)) { showSuggestions(null); return; }
    const seq = ++sugSeq;
    sugTimer = setTimeout(async () => {
      try { const list = await suggest(w.toLowerCase()); if (seq === sugSeq) showSuggestions(list, 'Near the course'); }
      catch (e) { }
    }, 350);
  });

  async function lookupW3W(words) {
    clearTimeout(sugTimer); sugSeq++; // drop any typing suggestions still on their way
    showSuggestions(null); clearResult();
    const n = ++lookSeq;
    if (!navigator.onLine) { setMsg('what3words needs mobile signal. Ask for the km or GPS coordinates instead.'); return; }
    if (!w3wKey(true)) { setMsg('A what3words API key is needed for this lookup. Ask the Race Director.'); return; }
    setMsg('Looking up ///' + words + '...', true);
    try {
      const j = await w3wApi('convert-to-coordinates', { words });
      if (n !== lookSeq) return;
      if (j && j.coordinates) {
        const lat = j.coordinates.lat, lon = j.coordinates.lng, off = G.snap(lat, lon).offM;
        setMsg('///' + words + (j.nearestPlace ? ', near ' + j.nearestPlace : ''), true);
        findLL(lat, lon, '///' + words, words);
        // A long way from the course usually means a misheard word. Offer nearby alternatives.
        if (off > 5000) {
          const alts = (await suggest(words)).filter(x => x.words !== words);
          if (alts.length && n === lookSeq) showSuggestions(alts, `That address is ${Math.round(off / 1000)} km from the course. Did you mean:`);
        }
        return;
      }
      const alts = await suggest(words);
      if (n !== lookSeq) return;
      if (alts.length) { setMsg('That what3words address doesn\'t exist. Check the words with the caller.'); showSuggestions(alts, 'Did you mean:'); }
      else setMsg((j && j.error && j.error.message) || 'what3words address not found');
    } catch (e) {
      if (n !== lookSeq) return;
      setMsg(e.message === 'badkey' ? 'what3words key was rejected. Tap Find to enter a new one.' : 'what3words lookup failed. Check signal, or ask for km or coordinates.');
    }
  }

  function radioScript(r) {
    const b = r.best, a = b.a, where = r.aid.prev && r.aid.next
      ? `between ${r.aid.prev.a.name} and ${r.aid.next.a.name}` : '';
    const pos = r.q.lat != null ? `${r.q.lat.toFixed(5)}, ${r.q.lon.toFixed(5)}` : `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`;
    const also = r.alsoKm.length ? ` (course passes here again at ${r.alsoKm.map(kmTxt).join(', ')})` : '';
    const at = r.raceKm != null ? `${r.race} km ${one(r.raceKm)} (${G.name} ${kmTxt(r.km)})` : kmTxt(r.km);
    let s = `${G.name} medical. Casualty at ${at}${also}${where ? ', ' + where : ''}.\n` +
      (r.casW3w ? `Casualty what3words ///${r.casW3w}.\n` : '') +
      `Send ${b.base.name} team. Drive to ${G.cleanName(a)}${a.w3w ? ' ///' + a.w3w : ''}${G.isGated(a) ? ' (gated, take keys)' : ''}, about ${G.fmt(b.drive)}. ` +
      (b.walkKm < 0.05 ? 'The casualty is right by the parking spot.\n' : `Walk in ${one(b.walkKm)} km, about ${G.fmt(b.walk)}.\n`) +
      `ETA to casualty ${G.fmt(b.total)}.`;
    if (r.exAlt) s += ` Fastest carry-out to ${G.cleanName(r.exAlt.a)}${G.isGated(r.exAlt.a) ? ' (gated)' : ''}, ${kmTxt(r.exAlt.joinKm)}, about ${G.fmt(r.exAlt.carry)}.`;
    if (r.remote) s += ` Remote: over ${G.fmt(C.redMin)} to reach, tell the Race Director now and think about a helicopter.`;
    if (r.longJob) s += ` Long job: about ${G.fmt(r.longJob)} with the carry-out, think about a helicopter.`;
    if (r.backup) s += ` Backup ${r.backup.base.name} team, ${G.fmt(r.backup.total)}.`;
    const so = window.MedPlan && window.MedPlan.soLine ? window.MedPlan.soLine(r) : '';
    if (so) s += '\n' + so;
    const tg = window.GPTTrack ? GPTTrack.line(r, G) : '';
    if (tg) s += '\n' + tg;
    const rn = window.GPTTracking ? GPTTracking.nearLine(G, r.km) : '';
    if (rn) s += '\n' + rn;
    s += `\nPosition ${pos}.`;
    return s.replace(/([^.])\.\.(?=\s|$)/g, '$1.'); // a line that already ends in a full stop
  }

  // WhatsApp version: the same message plus map links for the casualty and the parking spot.
  function whatsappText(r) {
    const a = r.best.a, cas = r.q.lat != null ? [r.q.lat, r.q.lon] : [r.lat, r.lon];
    let s = '*' + radioScript(r).replace('\n', '*\n') +
      `\n\nCasualty: https://maps.google.com/?q=${cas[0].toFixed(5)},${cas[1].toFixed(5)}` +
      (r.casW3w ? `\nCasualty what3words: https://w3w.co/${r.casW3w}` : '') +
      `\nPark at ${G.cleanName(a)}: https://maps.google.com/?q=${a.lat},${a.lon}` +
      (a.w3w ? `\nParking what3words: https://w3w.co/${a.w3w}` : '');
    if (location.protocol.startsWith('http')) s += `\nFull details: ${location.href}`;
    return s;
  }

  // Reach plus carry-out over this (minutes) gets the long job warning, even when reach alone is under the red time.
  const LONG_MIN = 240;
  // Why a carry-out is slowed: the grades it crosses that config.carryFactor slows down.
  function slowBy(k0, k1) {
    if (!window.GPTTrack || !G.main) return '';
    const F = C.carryFactor || {}, g = GPTTrack.between(k0, k1).parts.map(p => p.g).filter(x => (F[x] || 1) > 1);
    if (!g.length) return '';
    return ', slowed for ' + (g.includes('hard') ? (g.includes('unassessed') ? 'hard and not yet assessed track' : 'hard track') : 'track not yet assessed');
  }

  function show(ic, q) {
    const r = G.assess(ic); r.q = q; last = r;
    if (profile) profile.setHere({ E: G, km: r.km, ele: r.ele });
    r.casW3w = q.words || null;
    r.raceKm = raceKmOf(r.km);
    if (r.raceKm != null) r.race = race.label;
    const b = r.best, a = b.a, base = b.base;
    // The fastest carry-out, to another exit when that's at least 5 min quicker than back to the team's vehicle.
    const ex = r.exit && r.exit.a !== a && r.exit.carry < b.carry - 5 ? r.exit : null, carry = ex ? ex.carry : b.carry;
    r.exAlt = ex; r.remote = b.total > C.redMin; r.longJob = !r.remote && b.total + carry > LONG_MIN ? b.total + carry : 0;
    let h = '';
    if (isSub()) {
      h += r.raceKm != null
        ? `<p class="race-km"><b>${esc(race.label)} km ${one(r.raceKm)}</b> is ${G.name} km ${one(r.km)}</p>`
        : `<div class="notice warn">This spot isn't on the ${esc(race.label)} course. It's ${G.name} km ${one(r.km)}.</div>`;
    }
    const prev = r.aid.prev, next = r.aid.next;
    h += `<div class="loc"><div class="loc-km"><small>KM</small>${one(r.km)}</div><div class="loc-between">`;
    if (prev) h += `<b>${esc(prev.a.name)}</b> ${one(prev.distKm)} km back`;
    if (prev && next) h += '<br>';
    if (next) h += `<b>${esc(next.a.name)}</b> ${one(next.distKm)} km ahead`;
    h += '</div></div>';
    h += `<p class="cas-w3w" id="casW3w">${r.casW3w ? 'Casualty ' + w3wLink(r.casW3w) : ''}</p>`;
    if (r.alsoKm.length) {
      h += `<div class="notice warn">The course passes this spot more than once: ${[r.km].concat(r.alsoKm).sort((x, y) => x - y).map(kmTxt).join(' and ')}. It's the same place on the ground, so the response is the same.</div>`;
    }
    if (q.offM > 150) {
      h += `<div class="notice warn">This point is ${q.offM >= 1000 ? one(q.offM / 1000) + ' km' : q.offM + ' m'} from the course. Times are to the nearest point on course, ${kmTxt(r.km)}.${q.offM > 3000 ? ' Double check the location.' : ''}</div>`;
    }
    if (b.total > C.redMin) {
      h += `<div class="notice danger">Remote section. It will take over ${G.fmt(C.redMin)} to reach this casualty. Tell the Race Director now and escalate early.</div>`;
    } else if (b.total + carry > LONG_MIN) {
      h += `<div class="notice danger">Long job. Reaching this casualty and carrying them out will take about ${G.fmt(b.total + carry)}. Tell the Race Director now and think about a helicopter.</div>`;
    }
    const gated = G.isGated(a);
    h += `<div class="hero" style="--base:${base.color}">
      <div class="hero-top"><div><span class="eyebrow">Send</span><h2>${esc(base.name)} team</h2></div>
      <div class="eta"><span class="eyebrow">ETA</span><b>${G.fmt(b.total)}</b></div></div>
      <ol class="steps">
        <li><span><b>Drive</b> to ${esc(G.cleanName(a))}${gated ? '<span class="tag gated">Gated</span>' : ''}${a.aid ? `<span class="tag aid">${/water point/i.test(a.name) ? 'Water pt' : 'Aid stn'}</span>` : ''}
          <span class="sub">${kmTxt(b.joinKm)}${b.connM > 50 ? ', ' + b.connM + ' m walk to the course' : ''}${a.w3w ? ' &middot; ' + w3wLink(a.w3w) : ''}${a.note ? '<br>' + esc(a.note) : ''}</span></span><span class="t">${G.fmt(b.drive)}</span></li>
        <li><span><b>Walk in</b> ${b.walkKm < 0.05 ? 'under 50 m' : one(b.walkKm) + ' km'}${b.climb >= 5 ? ', ' + Math.round(b.climb) + ' m climb' : ''}
          <span class="sub">${b.walkKm < 0.05 ? 'Right by the parking spot' : Math.abs(b.joinKm - r.km) < 0.05 ? 'Straight to the course' : b.joinKm > r.km ? 'Along the course, against race direction' : 'Along the course, in race direction'}</span></span><span class="t">${G.fmt(b.walk)}</span></li>
      </ol>
      <div class="carry">${ex ? `Fastest carry-out is to ${esc(G.cleanName(ex.a))}${G.isGated(ex.a) ? ' (gated)' : ''}, ${kmTxt(ex.joinKm)}: about <b>${G.fmt(ex.carry)}</b> at stretcher pace${slowBy(r.km, ex.joinKm)}. Back to the team's vehicle: about ${G.fmt(b.carry)}${slowBy(r.km, b.joinKm)}.`
        : `Carry-out back to the vehicle: about <b>${G.fmt(b.carry)}</b> at stretcher pace${slowBy(r.km, b.joinKm)}.`}</div>
    </div>`;
    h += `<div id="soNear">${window.MedPlan && window.MedPlan.soNearHTML ? window.MedPlan.soNearHTML(r) : ''}</div>`;
    // Track grade, carry-out grades, emergency markers and helipads (Parks Victoria access maps).
    if (window.GPTTrack) h += GPTTrack.card(r, G);
    // Tracked runners near the casualty (live GPS feed), when there is one.
    if (window.GPTTracking) h += `<div id="trkNear">${GPTTracking.nearHTML(G, r.km, r.lat, r.lon)}</div>`;
    const dir = `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lon}`;
    h += `<div class="actions">
      <a class="btn" id="btnWa" href="#" target="_blank" rel="noopener">WhatsApp</a>
      <button class="btn" id="btnShare" type="button">Share</button>
      <a class="btn" href="${dir}" target="_blank" rel="noopener">Directions</a>
      ${window.RaceControl && window.RaceControl.available() ? '<button class="btn" id="btnRc" type="button">Log incident</button>' : ''}</div>`;
    h += `<div class="card"><h3>Message</h3><p class="script" id="script">${esc(radioScript(r))}</p></div>`;
    h += '<div id="wxNear"></div>';
    if (r.results.length > 1) {
      h += '<div class="card"><h3>Other teams</h3>';
      r.results.slice(1).forEach(o => {
        h += `<div class="row"><span><span class="dot" style="background:${o.base.color}"></span><b>${esc(o.base.name)}</b>
          <span class="sub">via ${esc(G.cleanName(o.a))}${G.isGated(o.a) ? ' (gated)' : ''}, walk ${one(o.walkKm)} km</span></span><span class="v">${G.fmt(o.total)}</span></div>`;
      });
      h += '</div>';
    }
    h += `<div id="medNear">${window.MedPlan ? window.MedPlan.nearbyHTML(r) : ''}</div>`;
    h += '<div class="card"><h3>Nearest aid and water points</h3>';
    [['Back', prev], ['Ahead', next]].forEach(([label, x]) => {
      if (!x) return;
      h += `<div class="row"><span><b>${label}: ${esc(x.a.name)}</b><span class="sub">${kmTxt(x.a.trail_km)}, ${one(x.distKm)} km away. Walk ${G.fmt(x.walk)}, carry ${G.fmt(x.carry)}${x.a.w3w ? '<br>' + w3wLink(x.a.w3w) : ''}</span></span></div>`;
    });
    h += '</div>';
    h += `<p class="details">Course point ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)} at ${Math.round(r.ele)} m. ${Math.round(r.climbSoFar).toLocaleString()} m climbed from the start. ` +
      `${q.source && q.source !== 'km' ? 'Found from ' + esc(q.source) + '.' : ''}</p>`;
    $('result').innerHTML = h;

    if ($('btnRc')) $('btnRc').addEventListener('click', () => {
      window.RaceControl.newFromFind(r); history.replaceState(null, '', '#control'); showTab('rc');
      // Carry the runner's race to the form when it doesn't pick it up itself.
      const sel = document.querySelector('#rcForm select[name=race]');
      if (sel && !sel.value && r.race) sel.value = r.race;
    });
    const sh = $('btnShare');
    if (navigator.share) sh.addEventListener('click', () => navigator.share({ title: `${G.name} casualty ${kmTxt(r.km)}`, text: radioScript(r) }).catch(() => { }));
    else sh.addEventListener('click', () => copy(location.href, sh, 'Link copied'));

    drawResult(r);
    if (window.WeatherTab) window.WeatherTab.nearHTML(r.lat, r.lon, r.ele).then(x => { if (last === r && $('wxNear')) $('wxNear').innerHTML = x; });
    const hash = (q.lat != null ? `#ll=${q.lat.toFixed(5)},${q.lon.toFixed(5)}` : `#km=${one(r.km)}`) + (G.main ? '' : '&c=' + G.id) + (isSub() ? '&r=' + race.id : '');
    history.replaceState(null, '', hash);
    refreshMessage(r);
    // Look up the casualty's what3words when there's signal (the spot they were found at, else the course point).
    // Without signal, the stored words of the course point (exact for a km, within 30 m for a spot) stand in.
    if (!r.casW3w) {
      const at = q.lat != null ? [q.lat, q.lon] : [r.lat, r.lon];
      w3wAt(at[0], at[1]).then(w => {
        if (last !== r) return;
        let saved = '';
        if (!w) {
          const n = q.lat != null ? G.nearW3w(q.lat, q.lon) : { words: G.storedW3w(r.ic), m: 0 };
          if (!n || !n.words) return;
          w = n.words; saved = ` <small>(saved words${n.m ? `, course ${n.m} m away` : ''})</small>`;
        }
        r.casW3w = w;
        $('casW3w').innerHTML = (q.lat != null ? 'Casualty ' : 'Course point ') + w3wLink(w) + saved;
        refreshMessage(r);
        if (casMarker) casMarker.setPopupContent(`<b>Casualty</b><br>${kmTxt(r.km)}<br>${w3wLink(w)}`);
      });
    }
    if (innerWidth < 900) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function refreshMessage(r) {
    $('script').textContent = radioScript(r);
    $('btnWa').href = 'https://wa.me/?text=' + encodeURIComponent(whatsappText(r));
  }

  function copy(text, btn, done) {
    const ok = () => { const t = btn.textContent; btn.textContent = done || 'Copied'; setTimeout(() => btn.textContent = t, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, () => fallbackCopy(text, ok));
    else fallbackCopy(text, ok);
  }
  function fallbackCopy(text, ok) {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); ok(); } catch (e) { } t.remove();
  }

  function drawResult(r) {
    if (!map) return;
    resultLayer.clearLayers();
    const b = r.best, a = b.a;
    const ll = [r.lat, r.lon];
    const accLL = [a.lat, a.lon];
    const drive = G.driveLine(a, b.key);
    // Only draw a drive route we actually have. No straight-line guesses across the map.
    if (drive) L.polyline(drive, { color: b.base.color, weight: 5, opacity: .9 }).addTo(resultLayer);
    // The course coloured by track grade from the aid station before to the one after, with the emergency markers and helipads near the casualty.
    if (window.GPTTrack) GPTTrack.draw(resultLayer, r, G, r.aid.prev ? r.aid.prev.a.trail_km : r.km, r.aid.next ? r.aid.next.a.trail_km : r.km);
    // Walk: access point, its track to the course, then along the course from where it joins to the casualty.
    const lo = Math.min(b.idx, r.ic), hi = Math.max(b.idx, r.ic);
    const along = courseLL.slice(lo, hi + 1);
    if (b.idx > r.ic) along.reverse();
    // The walk to the course: this course's mapped walking route, else the access point's own track.
    const walk = (b.connGeom || (a.conn_geom && a.conn_geom.length > 1 ? a.conn_geom : [accLL])).concat(along);
    L.polyline(walk, { color: '#1666c9', weight: 6, opacity: .95, dashArray: '1,8', lineCap: 'round' }).addTo(resultLayer);
    L.marker(accLL, { icon: pin(b.base.color, 16), zIndexOffset: 800, title: 'Park here: ' + G.cleanName(a) }).bindPopup(`<b>Park here</b><br>${esc(G.cleanName(a))}<br>${w3wLink(a.w3w)}`).addTo(resultLayer);
    if (r.q.lat != null && r.q.offM > 60) L.polyline([[r.q.lat, r.q.lon], ll], { color: '#111', weight: 1.5, dashArray: '3,4' }).addTo(resultLayer);
    casMarker = L.circleMarker(ll, { radius: 10, color: '#111', weight: 3, fillColor: '#ffd21f', fillOpacity: 1 })
      .bindPopup(`<b>Casualty</b><br>${kmTxt(r.km)}${r.casW3w ? '<br>' + w3wLink(r.casW3w) : ''}`).addTo(resultLayer);
    const bounds = L.latLngBounds([ll, accLL].concat(walk));
    if (r.q.lat != null) bounds.extend([r.q.lat, r.q.lon]);
    map.fitBounds(bounds.pad(0.35), { maxZoom: 15 });
  }

  function openInFinder(km) { showTab('find'); $('q').value = one(km); setMsg(''); findKm(km); }
  // Used by the Medical tab: open a km in Find, and refresh the "Medical on duty" card when the plan time changes.
  window.GPT_UI = {
    openKm: km => { setCourse(window.GPT.id); openInFinder(km); },
    map: () => map,
    refresh: () => {
      if (!last || !window.MedPlan) return;
      if ($('medNear')) $('medNear').innerHTML = window.MedPlan.nearbyHTML(last);
      if ($('soNear')) $('soNear').innerHTML = window.MedPlan.soNearHTML(last);
    }
  };

  // ---------- Start-up: restore from link ----------
  function fromHash() {
    let h = '';
    try { h = decodeURIComponent(location.hash.slice(1)); } catch (e) { }
    if (h === 'medical') { showTab('med'); return; }
    if (h === 'weather') { showTab('wx'); return; }
    if (h === 'control') { showTab('rc'); return; }
    showTab('find');
    const cm = /[&?]c=([\w-]+)/.exec(h), rm = /[&?]r=([\w-]+)/.exec(h);
    setCourse(cm ? cm[1] : window.GPT.id);
    if (RACES.length) setRace(rm ? rm[1] : RACES[0].id, false);
    let m;
    if (/^km=/.test(h)) {
      m = h.match(/^km=(\d+(?:\.\d+)?)(?=&|$)/); $('q').value = m ? m[1] : '';
      if (m && +m[1] <= G.totalKm + TOL) findKm(+m[1]); else fail(`That link's km isn't valid. Km must be between 0 and ${G.totalKm}.`);
    }
    else if (/^ll=/.test(h)) {
      // A shared spot gets the same 20 km rule as a typed one.
      m = h.match(/^ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?=&|$)/);
      const off = m && Math.abs(m[1]) <= 90 && Math.abs(m[2]) <= 180 ? G.snap(+m[1], +m[2]).offM : Infinity;
      if (m) $('q').value = m[1] + ', ' + m[2];
      if (off <= 20000) findLL(+m[1], +m[2], 'shared link');
      else fail(isFinite(off) ? `That link's spot is ${Math.round(off / 1000).toLocaleString()} km from the ${G.name} course. Check it with whoever sent it.` : 'That link\'s coordinates don\'t look right');
    }
    // A runner's bib, from the map page or a shared link: opens once the tracking feed has their position.
    else if ((m = h.match(/^bib=(\d+)/)) && window.GPTTracking) {
      $('q').value = '#' + m[1];
      let done = false;
      GPTTracking.onUpdate(() => {
        if (done || !GPTTracking.ready()) return;
        done = true;
        const r = GPTTracking.byBib(m[1]);
        if (r && r.pos) findBib(r); else fail(r ? `Bib ${m[1]} (${r.name}) has no position yet from the tracker or the timing chips` : `No bib ${m[1]} in the tracking feed`);
      });
    }
  }
  fromHash();
  addEventListener('hashchange', fromHash);
  // Find pressed before the scripts had loaded (index.html sets the flag): run it now.
  if (window.findEarly) { window.findEarly = 0; if ($('q').value.trim()) $('findForm').requestSubmit(); else setMsg(''); }

  // ---------- First-time intro and how-to (js/intro.js; the ? button reopens it) ----------
  if (window.GPTIntro) GPTIntro({
    key: 'gptIntroSafety',
    steps: [
      () => ({ title: 'GPT100 Safety', html: `<p>The staff app for race control, the medical team and Safety Officers.</p>
        <p>Find the fastest team for any casualty on the course, keep an eye on the weather triggers, see the medical plan, and run the Race Control board.</p>` }),
      GPTIntro.installStep('GPT100 Safety'),
      () => ({ title: '2. Find a casualty', html: `<ol class="rn-steps">
        <li>Type what you've been told: a <b>km</b> (pick the runner's race first if it's a stage or shorter race), <b>coordinates</b> or a <b>what3words</b> address. Or use <b>My location</b>, or <b>Pick on map</b>.</li>
        <li>You get one answer: <b>which team to send</b>, where to park (gated roads flagged), the walk in and the <b>ETA</b>, with the backup team and the stretcher carry-out time.</li>
        <li>It also shows the <b>nearest Safety Officers on foot</b>, the weather there, and the climb either side on the profile.</li>
        <li><b>WhatsApp</b> sends the job to the group, <b>Directions</b> opens Google Maps to the parking spot, and <b>Log incident</b> puts it on the Race Control board.</li>
      </ol><p class="fd-hint">More than 2 hours to reach, or 4 hours with the carry-out? A red warning says to escalate early.</p>` }),
      () => ({ title: '3. The other tabs', html: `<ul class="rn-tablist">
        <li><b>Weather</b> The race triggers (heat, wind, rain, storms, cloud), BOM warnings, fires nearby, radar and the models. <b>Refresh now</b> gets the latest; <b>Share update</b> writes the daily update.</li>
        <li><b>Medical</b> Needs the medical password. Who's on duty where and when, the vehicles, and the plan for any time.</li>
        <li><b>Control</b> Needs the medical password. The Race Control board: incidents, teams, the radio log and live tracking.</li>
      </ul><p class="fd-hint">Tap <b>?</b> at the top any time to see this again. Planning guide only: in an emergency call 000.${C.tracking && C.tracking.credit && C.tracking.credit.name ? ` Timing and tracking by ${C.tracking.credit.url ? `<a href="${esc(C.tracking.credit.url)}" target="_blank" rel="noopener">${esc(C.tracking.credit.name)}</a>` : esc(C.tracking.credit.name)}.` : ''}</p>` })
    ]
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }
})();
