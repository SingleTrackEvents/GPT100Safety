// GPT100 Safety staff app: Find (incident finder) and Run sheet tabs.
(function () {
  const G = window.GPT, C = G.config, route = G.route;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const baseOf = k => G.BASES.find(b => b.key === k);
  const one = n => (Math.round(n * 10) / 10).toFixed(1);
  const kmTxt = km => 'km ' + one(km);

  $('assumptions').textContent =
    `Estimates assume responders walk ${C.walkPace} min/km, stretcher carry ${C.evacPace} min/km, ` +
    `${C.climbPenalty} min per metre of climb, and measured drive times x ${C.driveFactor} for access roads.`;

  // ---------- Tabs ----------
  let sheetBuilt = false;
  function showTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => {
      const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
    });
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + name));
    document.body.classList.toggle('on-find', name === 'find');
    if (name === 'sheet' && !sheetBuilt) buildSheet();
    if (name === 'find' && map) setTimeout(() => map.invalidateSize(), 0);
  }
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => {
    history.replaceState(null, '', b.dataset.tab === 'sheet' ? '#sheet' : location.pathname + location.search);
    showTab(b.dataset.tab);
  }));

  // ---------- Online status ----------
  function netStatus() { $('net').hidden = navigator.onLine; }
  addEventListener('online', netStatus); addEventListener('offline', netStatus); netStatus();

  // ---------- Map ----------
  // The map is optional: if Leaflet can't load (no signal on first open), answers and the run sheet still work.
  const courseLL = route.map(p => [p[0], p[1]]);
  let map = null, resultLayer = null, pin = null;
  if (window.L) initMap();
  else {
    $('map').innerHTML = '<p class="map-off">Map unavailable without signal. Answers and the run sheet still work.</p>';
    $('btnPick').disabled = true;
  }

  function initMap() {
  map = L.map('map', { preferCanvas: true, zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenStreetMap' }).addTo(map);
  const dangerLayer = L.layerGroup().addTo(map);
  const courseLine = L.polyline(courseLL, { color: '#d9531e', weight: 4, opacity: .95 }).addTo(map);
  map.fitBounds(courseLine.getBounds().pad(0.05));

  // Red wash where the fastest team takes longer than the red threshold.
  (function drawDanger() {
    const all = G.bestAtAll(); let seg = null;
    for (let i = 0; i < route.length; i++) {
      if (all[i] && all[i].total > C.redMin) { if (!seg) seg = []; seg.push(courseLL[i]); }
      else if (seg) { if (seg.length > 1) L.polyline(seg, { color: '#e00000', weight: 12, opacity: .35, interactive: false }).addTo(dangerLayer); seg = null; }
    }
    if (seg && seg.length > 1) L.polyline(seg, { color: '#e00000', weight: 12, opacity: .35, interactive: false }).addTo(dangerLayer);
  })();

  pin = (color, size) => L.divIcon({ className: '', html: `<div class="pin" style="background:${color};width:${size}px;height:${size}px"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  G.ACCESS.forEach(a => {
    if (a.aid) return;
    L.marker([a.lat, a.lon], { icon: pin(G.isGated(a) ? '#6d3b8e' : '#888', 10) })
      .bindPopup(`<b>${esc(G.cleanName(a))}</b><br>${kmTxt(a.trail_km)}${G.isGated(a) ? ' &middot; gated' : ''}${a.conn_m > 50 ? ' &middot; ' + a.conn_m + ' m to course' : ''}`)
      .addTo(map);
  });
  G.AID.forEach(a => L.marker([a.lat, a.lon], { icon: pin('#111', 14) }).bindPopup(`<b>${esc(a.name)}</b><br>${/water point/i.test(a.name) ? 'Staffed water point' : 'Aid station'}, ${kmTxt(a.trail_km)}`).addTo(map));
  G.BASES.forEach(b => L.marker([b.lat, b.lon], { icon: pin(b.color, 22), zIndexOffset: 500 }).bindPopup(`<b>${esc(b.name)} base</b>`).addTo(map));

  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const d = L.DomUtil.create('div', 'map-legend');
    d.innerHTML = G.BASES.map(b => `<i style="background:${b.color}"></i>${esc(b.name)}`).join('<br>') +
      '<br><i style="background:#111"></i>Aid station or water point<br><i style="background:#888"></i>Access point<br><i style="background:#6d3b8e"></i>Gated access' +
      `<br><i class="ln" style="background:#e00000;opacity:.5"></i>Over ${G.fmt(C.redMin)} to reach`;
    return d;
  };
  legend.addTo(map);
  resultLayer = L.layerGroup().addTo(map);
  map.on('click', e => {
    setPicking(false);
    $('q').value = e.latlng.lat.toFixed(5) + ', ' + e.latlng.lng.toFixed(5);
    setMsg('');
    findLL(e.latlng.lat, e.latlng.lng, 'map');
  });
  }

  // ---------- Find ----------
  let picking = false;

  function setMsg(t, ok) { const m = $('qMsg'); m.textContent = t || ''; m.classList.toggle('ok', !!ok); }

  function parseQuery(raw) {
    const v = raw.trim();
    if (!v) return null;
    const w = v.replace(/^what3words:\/\//i, '').replace(/^\/+/, '');
    if (/^[\p{L}]+\.[\p{L}]+\.[\p{L}]+$/u.test(w)) return { type: 'w3w', words: w.toLowerCase() };
    const nums = v.match(/-?\d+(?:\.\d+)?/g);
    if (!nums) return { type: 'error', msg: 'Enter a km, coordinates (lat, lon) or ///word.word.word' };
    if (nums.length === 1) {
      const km = +nums[0];
      if (km < 0 || km > G.totalKm) return { type: 'error', msg: `Km must be between 0 and ${G.totalKm}` };
      return { type: 'km', km };
    }
    let lat = +nums[0], lon = +nums[1];
    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) { const t = lat; lat = lon; lon = t; }
    if (lat > 0 && lon > 100) lat = -lat; // southern hemisphere minus sign often dropped over the radio
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { type: 'error', msg: 'Those coordinates don\'t look right' };
    return { type: 'll', lat, lon };
  }

  function findKm(km, source) { show(G.idxAtKm(km), { source: source || 'km' }); }
  function findLL(lat, lon, source) {
    const s = G.snap(lat, lon);
    show(s.ic, { source, lat, lon, offM: s.offM });
  }

  $('findForm').addEventListener('submit', e => {
    e.preventDefault(); $('q').blur();
    const q = parseQuery($('q').value);
    if (!q) { setMsg('Type a km, coordinates or what3words first'); return; }
    if (q.type === 'error') { setMsg(q.msg); return; }
    setMsg('');
    if (q.type === 'km') findKm(q.km);
    else if (q.type === 'll') findLL(q.lat, q.lon, 'coordinates');
    else lookupW3W(q.words);
  });

  $('btnGps').addEventListener('click', () => {
    if (!navigator.geolocation) { setMsg('This device can\'t share its location'); return; }
    setMsg('Getting your location...', true);
    navigator.geolocation.getCurrentPosition(
      p => { setMsg(`Your location, accurate to about ${Math.round(p.coords.accuracy)} m`, true); $('q').value = p.coords.latitude.toFixed(5) + ', ' + p.coords.longitude.toFixed(5); findLL(p.coords.latitude, p.coords.longitude, 'GPS'); },
      err => setMsg(err.code === 1 ? 'Location permission was blocked. Allow it in your browser settings.' : 'Couldn\'t get a GPS fix. Try again in the open.'),
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
  const W3W_LS = 'gpt100_w3w_key';
  function w3wKey(forcePrompt) {
    let k = C.what3wordsKey || '';
    try { k = localStorage.getItem(W3W_LS) || k; } catch (e) { }
    if (!k || forcePrompt) {
      const n = prompt('Enter the what3words API key (ask the Race Director). It\'s saved on this device.', k);
      if (n != null) { k = n.trim(); try { localStorage.setItem(W3W_LS, k); } catch (e) { } }
    }
    return k;
  }
  async function lookupW3W(words) {
    if (!navigator.onLine) { setMsg('what3words needs mobile signal. Ask for the km or GPS coordinates instead.'); return; }
    const key = w3wKey(false);
    if (!key) { setMsg('A what3words API key is needed for this lookup'); return; }
    setMsg('Looking up ///' + words + '...', true);
    try {
      const r = await fetch('https://api.what3words.com/v3/convert-to-coordinates?words=' + encodeURIComponent(words) + '&key=' + encodeURIComponent(key));
      const j = await r.json();
      if (j && j.coordinates) { setMsg('///' + words, true); findLL(j.coordinates.lat, j.coordinates.lng, '///' + words); }
      else if (j && j.error && /key/i.test(j.error.code + j.error.message)) { setMsg('what3words key was rejected. Tap Find to enter a new one.'); try { localStorage.removeItem(W3W_LS); } catch (e) { } }
      else setMsg((j && j.error && j.error.message) || 'what3words address not found');
    } catch (e) { setMsg('what3words lookup failed. Check signal, or ask for km or coordinates.'); }
  }

  function radioScript(r) {
    const b = r.best, a = b.a, where = r.aid.prev && r.aid.next
      ? `between ${r.aid.prev.a.name} and ${r.aid.next.a.name}` : '';
    const pos = r.q.lat != null ? `${r.q.lat.toFixed(5)}, ${r.q.lon.toFixed(5)}` : `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`;
    const also = r.alsoKm.length ? ` (course passes here again at ${r.alsoKm.map(kmTxt).join(', ')})` : '';
    let s = `${C.event} medical. Casualty at ${kmTxt(r.km)}${also}${where ? ', ' + where : ''}.\n` +
      `Send ${b.base.name} team. Drive to ${G.cleanName(a)}${G.isGated(a) ? ' (gated, take keys)' : ''}, about ${G.fmt(b.drive)}. ` +
      `Walk in ${one(b.walkKm)} km, about ${G.fmt(b.walk)}.\n` +
      `ETA to casualty ${G.fmt(b.total)}.`;
    if (r.backup) s += ` Backup ${r.backup.base.name} team, ${G.fmt(r.backup.total)}.`;
    s += `\nPosition ${pos}.`;
    return s;
  }

  // WhatsApp version: the same message plus map links for the casualty and the parking spot.
  function whatsappText(r) {
    const a = r.best.a, cas = r.q.lat != null ? [r.q.lat, r.q.lon] : [r.lat, r.lon];
    let s = '*' + radioScript(r).replace('\n', '*\n') +
      `\n\nCasualty: https://maps.google.com/?q=${cas[0].toFixed(5)},${cas[1].toFixed(5)}` +
      `\nPark at ${G.cleanName(a)}: https://maps.google.com/?q=${a.lat},${a.lon}`;
    if (location.protocol.startsWith('http')) s += `\nFull details: ${location.href}`;
    return s;
  }

  function show(ic, q) {
    const r = G.assess(ic); r.q = q;
    const b = r.best, a = b.a, base = b.base;
    let h = '';
    const prev = r.aid.prev, next = r.aid.next;
    h += `<div class="loc"><div class="loc-km"><small>KM</small>${one(r.km)}</div><div class="loc-between">`;
    if (prev) h += `<b>${esc(prev.a.name)}</b> ${one(prev.distKm)} km back`;
    if (prev && next) h += '<br>';
    if (next) h += `<b>${esc(next.a.name)}</b> ${one(next.distKm)} km ahead`;
    h += '</div></div>';
    if (r.alsoKm.length) {
      h += `<div class="notice warn">The course passes this spot more than once: ${[r.km].concat(r.alsoKm).sort((x, y) => x - y).map(kmTxt).join(' and ')}. It's the same place on the ground, so the response is the same.</div>`;
    }
    if (q.offM > 150) {
      h += `<div class="notice warn">This point is ${q.offM >= 1000 ? one(q.offM / 1000) + ' km' : q.offM + ' m'} from the course. Times are to the nearest point on course, ${kmTxt(r.km)}.${q.offM > 3000 ? ' Double check the location.' : ''}</div>`;
    }
    if (b.total > C.redMin) {
      h += `<div class="notice danger">Remote section. It will take over ${G.fmt(C.redMin)} to reach this casualty. Tell the Race Director now and escalate early.</div>`;
    }
    const gated = G.isGated(a);
    h += `<div class="hero" style="--base:${base.color}">
      <div class="hero-top"><div><span class="eyebrow">Send</span><h2>${esc(base.name)} team</h2></div>
      <div class="eta"><span class="eyebrow">ETA</span><b>${G.fmt(b.total)}</b></div></div>
      <ol class="steps">
        <li><span><b>Drive</b> to ${esc(G.cleanName(a))}${gated ? '<span class="tag gated">Gated</span>' : ''}${a.aid ? `<span class="tag aid">${/water point/i.test(a.name) ? 'Water pt' : 'Aid stn'}</span>` : ''}
          <span class="sub">${kmTxt(b.joinKm)}${a.conn_m > 50 ? ', ' + a.conn_m + ' m track to the course' : ''}</span></span><span class="t">${G.fmt(b.drive)}</span></li>
        <li><span><b>Walk in</b> ${one(b.walkKm)} km${b.climb >= 5 ? ', ' + Math.round(b.climb) + ' m climb' : ''}
          <span class="sub">${b.joinKm > r.km ? 'Along the course, against race direction' : (b.joinKm < r.km ? 'Along the course, in race direction' : 'Straight to the course')}</span></span><span class="t">${G.fmt(b.walk)}</span></li>
      </ol>
      <div class="carry">Carry-out back to the vehicle: about <b>${G.fmt(b.carry)}</b> at stretcher pace.</div>
    </div>`;
    const dir = `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lon}`;
    h += `<div class="actions">
      <a class="btn" id="btnWa" href="#" target="_blank" rel="noopener">WhatsApp</a>
      <button class="btn" id="btnShare" type="button">Share</button>
      <a class="btn" href="${dir}" target="_blank" rel="noopener">Directions</a></div>`;
    h += `<div class="card"><h3>Message</h3><p class="script" id="script">${esc(radioScript(r))}</p></div>`;
    if (r.results.length > 1) {
      h += '<div class="card"><h3>Other teams</h3>';
      r.results.slice(1).forEach(o => {
        h += `<div class="row"><span><span class="dot" style="background:${o.base.color}"></span><b>${esc(o.base.name)}</b>
          <span class="sub">via ${esc(G.cleanName(o.a))}${G.isGated(o.a) ? ' (gated)' : ''}, walk ${one(o.walkKm)} km</span></span><span class="v">${G.fmt(o.total)}</span></div>`;
      });
      h += '</div>';
    }
    h += '<div class="card"><h3>Nearest aid and water points</h3>';
    [['Back', prev], ['Ahead', next]].forEach(([label, x]) => {
      if (!x) return;
      h += `<div class="row"><span><b>${label}: ${esc(x.a.name)}</b><span class="sub">${kmTxt(x.a.trail_km)}, ${one(x.distKm)} km away. Walk ${G.fmt(x.walk)}, carry ${G.fmt(x.carry)}</span></span></div>`;
    });
    h += '</div>';
    h += `<p class="details">Course point ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)} at ${Math.round(r.ele)} m. ${Math.round(r.climbSoFar).toLocaleString()} m climbed from the start. ` +
      `${q.source && q.source !== 'km' ? 'Found from ' + esc(q.source) + '.' : ''}</p>`;
    $('result').innerHTML = h;

    const sh = $('btnShare');
    if (navigator.share) sh.addEventListener('click', () => navigator.share({ title: `${C.event} casualty ${kmTxt(r.km)}`, text: radioScript(r) }).catch(() => { }));
    else sh.addEventListener('click', () => copy(location.href, sh, 'Link copied'));

    drawResult(r);
    const hash = q.lat != null ? `#ll=${q.lat.toFixed(5)},${q.lon.toFixed(5)}` : `#km=${one(r.km)}`;
    history.replaceState(null, '', hash);
    $('btnWa').href = 'https://wa.me/?text=' + encodeURIComponent(whatsappText(r));
    if (innerWidth < 900) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const lo = Math.min(b.idx, r.ic), hi = Math.max(b.idx, r.ic);
    const walk = (a.conn_geom && a.conn_geom.length > 1 ? a.conn_geom : [accLL]).concat(courseLL.slice(lo, hi + 1));
    L.polyline(walk, { color: '#1666c9', weight: 6, opacity: .95, dashArray: '1,8', lineCap: 'round' }).addTo(resultLayer);
    L.marker(accLL, { icon: pin(b.base.color, 16), zIndexOffset: 800 }).bindPopup(`<b>Park here</b><br>${esc(G.cleanName(a))}`).addTo(resultLayer);
    if (r.q.lat != null && r.q.offM > 60) L.polyline([[r.q.lat, r.q.lon], ll], { color: '#111', weight: 1.5, dashArray: '3,4' }).addTo(resultLayer);
    L.circleMarker(ll, { radius: 10, color: '#111', weight: 3, fillColor: '#ffd21f', fillOpacity: 1 }).bindPopup(`<b>Casualty</b><br>${kmTxt(r.km)}`).addTo(resultLayer);
    const bounds = L.latLngBounds([ll, accLL].concat(walk));
    if (r.q.lat != null) bounds.extend([r.q.lat, r.q.lon]);
    map.fitBounds(bounds.pad(0.35), { maxZoom: 15 });
  }

  // ---------- Run sheet ----------
  let secs = null;
  function buildSheet() {
    sheetBuilt = true;
    secs = G.sections();
    const all = G.bestAtAll();
    let redKm = 0, amberKm = 0, worst = null;
    for (let i = 1; i < route.length; i++) {
      const d = route[i][2] - route[i - 1][2], t = all[i] && all[i].total;
      if (t > C.redMin) redKm += d; else if (t > C.amberMin) amberKm += d;
      if (all[i] && (!worst || t > worst.t)) worst = { t, km: route[i][2] };
    }
    $('sheetSummary').innerHTML = `
      <div class="stat green"><b>${one(G.totalKm - redKm - amberKm)} km</b><span>reachable within ${G.fmt(C.amberMin)}</span></div>
      <div class="stat amber"><b>${one(amberKm)} km</b><span>${G.fmt(C.amberMin)} to ${G.fmt(C.redMin)} to reach</span></div>
      <div class="stat red"><b>${one(redKm)} km</b><span>over ${G.fmt(C.redMin)} to reach</span></div>
      <div class="stat"><b>${G.fmt(worst.t)}</b><span>slowest point, ${kmTxt(worst.km)}</span></div>`;
    $('sections').innerHTML = secs.map(sectionHTML).join('');
    document.querySelectorAll('.sec-head').forEach(h => h.addEventListener('click', () => {
      const s = h.parentNode, on = !s.classList.contains('open');
      s.classList.toggle('open', on); h.setAttribute('aria-expanded', on);
    }));
    document.querySelectorAll('tr.go').forEach(tr => tr.addEventListener('click', () => openInFinder(+tr.dataset.km)));
    document.querySelectorAll('[data-map]').forEach(btn => btn.addEventListener('click', () => {
      const s = secs[+btn.dataset.map]; showTab('find');
      if (!map) return;
      map.fitBounds(L.latLngBounds(courseLL.slice(s.from.idx, s.to.idx + 1)).pad(0.15));
      $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }

  function sectionHTML(s, n) {
    const w = s.worst;
    const label = { green: 'Good access', amber: 'Slow access', red: 'Remote' }[s.rating];
    let h = `<article class="sec ${s.rating}" id="sec-${n}">
      <button class="sec-head" type="button" aria-expanded="false">
        <span class="sec-km">KM ${one(s.startKm)} to ${one(s.endKm)}</span>
        <span class="sec-name">${esc(s.from.name)} to ${esc(s.to.name)}</span>
        <span class="sec-meta">${one(s.lengthKm)} km, ${Math.round(s.climb)} m climb &middot; <span class="pill ${s.rating}">${label}</span></span>
        <span class="badge"><span>Up to</span><b>${G.fmt(w.r.total)}</b></span>
      </button><div class="sec-body">`;
    h += `<p><b>Hardest point to reach:</b> ${kmTxt(w.km)}. Send ${esc(w.r.base ? w.r.base.name : baseOf(w.r.key).name)} team via ${esc(G.cleanName(w.r.a))}${G.isGated(w.r.a) ? ' (gated)' : ''}, ${G.fmt(w.r.total)}.</p>`;
    h += '<h4>Access points in this section</h4>';
    if (s.access.length) {
      h += '<ul class="acc-list">' + s.access.map(a => `<li><span class="km">${kmTxt(a.trail_km)}</span>${esc(G.cleanName(a))}${G.isGated(a) ? '<span class="tag gated">Gated</span>' : ''}${a.conn_m > 50 ? `<span class="tag track">${a.conn_m} m walk to course</span>` : ''}</li>`).join('') + '</ul>';
    } else h += '<p class="muted">None between these aid stations. Access is from the aid stations at each end.</p>';
    h += `<h4>Km by km</h4><table class="kmtable"><thead><tr><th>Km</th><th>Send</th><th>Via</th><th style="text-align:right">ETA</th></tr></thead><tbody>`;
    s.rows.forEach(row => {
      const r = row.r, b = baseOf(r.key);
      h += `<tr class="go${row.worst ? ' worst' : ''}" data-km="${row.km}" title="Open in Find">
        <td class="km-c">${one(row.km)}</td><td class="send-c"><span class="dot" style="background:${b.color}"></span>${esc(b.name)}</td>
        <td>${esc(G.cleanName(r.a))}${G.isGated(r.a) ? ' (gated)' : ''}</td><td class="eta-c">${G.fmt(r.total)}</td></tr>`;
    });
    h += `</tbody></table><div class="sec-actions"><button class="btn small" type="button" data-map="${n}">Show on map</button></div></div></article>`;
    return h;
  }

  function openInFinder(km) { showTab('find'); $('q').value = one(km); setMsg(''); findKm(km); }

  $('jumpForm').addEventListener('submit', e => {
    e.preventDefault();
    const km = parseFloat($('jump').value);
    if (isNaN(km) || !secs) return;
    const n = secs.findIndex(s => km >= s.startKm && km <= s.endKm);
    const el = $('sec-' + (n < 0 ? (km < secs[0].startKm ? 0 : secs.length - 1) : n));
    el.classList.add('open', 'flash'); el.querySelector('.sec-head').setAttribute('aria-expanded', true);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => el.classList.remove('flash'), 1800);
  });
  let expanded = false;
  $('btnExpand').addEventListener('click', () => {
    expanded = !expanded;
    document.querySelectorAll('.sec').forEach(s => { s.classList.toggle('open', expanded); s.querySelector('.sec-head').setAttribute('aria-expanded', expanded); });
    $('btnExpand').textContent = expanded ? 'Close all' : 'Open all';
  });
  $('btnPrint').addEventListener('click', () => window.print());
  addEventListener('beforeprint', () => { if (!sheetBuilt) buildSheet(); });

  // ---------- Start-up: restore from link ----------
  function fromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h === 'sheet') { showTab('sheet'); return; }
    showTab('find');
    let m;
    if ((m = h.match(/^km=([\d.]+)/))) { $('q').value = m[1]; findKm(+m[1]); }
    else if ((m = h.match(/^ll=(-?[\d.]+),(-?[\d.]+)/))) { $('q').value = m[1] + ', ' + m[2]; findLL(+m[1], +m[2], 'shared link'); }
  }
  fromHash();
  addEventListener('hashchange', fromHash);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }
})();
