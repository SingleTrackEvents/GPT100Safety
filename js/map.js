// GPT100 Safety map page (map.html): the whole course on one screen, for a big screen at race control or a phone in
// the hand. Both courses, aid stations and water points, access points, helicopter landing sites, Safety Officer
// posts, the Parks Victoria markers and track grades from the layers button, and every tracked runner live. Tap the
// course for the km, the team to send and the ETA, with a link into Find for the full answer. The Runners panel has
// a bib search, the Runner watch, the field by section, and the front and tail of each race.
(function () {
  const G = window.GPT, C = G.config, courses = G.courses;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const one = n => (Math.round(n * 10) / 10).toFixed(1);
  const w3wLink = w => w ? `<a class="w3w" href="https://w3w.co/${esc(w)}" target="_blank" rel="noopener">///${esc(w)}</a>` : '';
  const TR = window.GPTTracking || null;
  // Links into the staff app keep the page's own query (so a demo carries over).
  const findHref = hash => 'index.html' + location.search + hash;
  $('mpFind').href = findHref('');

  function netStatus() { $('net').hidden = navigator.onLine; }
  addEventListener('online', netStatus); addEventListener('offline', netStatus); netStatus();

  if (!window.L) { $('map').innerHTML = '<p class="map-off">Map unavailable without signal. Open the app once with signal, then it keeps a copy.</p>'; return; }

  // ---------- the map ----------
  const map = L.map('map', { preferCanvas: true, zoomControl: true });
  GPTBaseMap(map);
  if (window.GPTFullscreen) GPTFullscreen(map, document.querySelector('.mp-mapbox'));
  const pin = (color, size) => L.divIcon({ className: '', html: `<div class="pin" style="background:${color};width:${size}px;height:${size}px"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  const COL = { main: '#d9531e', other: '#2a7fc1' };
  const lineOf = E => E.route.map(p => [p[0], p[1]]);
  const stopKind = a => a.kind ? ({ start: 'Start', finish: 'Finish', aid: 'Aid station', water: 'Water point', checkpoint: 'Checkpoint' }[a.kind] || 'Checkpoint') : (/water point/i.test(a.name) ? 'Staffed water point' : 'Aid station');

  // Red wash on the GPT100 where the fastest team takes longer than the red threshold.
  const all = G.bestAtAll(); let seg = null;
  const wash = s => { if (s.length > 1) L.polyline(s, { color: '#e00000', weight: 12, opacity: .35, interactive: false }).addTo(map); };
  G.route.forEach((p, i) => { if (all[i] && all[i].total > C.redMin) { (seg = seg || []).push([p[0], p[1]]); } else if (seg) { wash(seg); seg = null; } });
  if (seg) wash(seg);
  // The courses.
  const bounds = L.latLngBounds([]);
  courses.forEach(E => {
    const line = L.polyline(lineOf(E), { color: E.main ? COL.main : COL.other, weight: E.main ? 4 : 3, opacity: .95, interactive: false }).addTo(map);
    bounds.extend(line.getBounds());
  });
  // Aid stations and water points, named on the map once zoomed in.
  const stops = L.layerGroup().addTo(map);
  courses.forEach(E => E.AID.forEach(a => {
    L.marker([a.lat, a.lon], { title: a.name, icon: pin('#111', 14), zIndexOffset: 300 })
      .bindTooltip(a.name, { direction: 'right', offset: [8, 0], permanent: true, className: 'mp-tip' })
      .bindPopup(`<b>${esc(a.name)}</b><br>${stopKind(a)}, ${E.label}, km ${one(a.trail_km)}<br>${w3wLink(a.w3w)}`).addTo(stops);
  }));
  const labels = () => map.getContainer().classList.toggle('mp-labels', map.getZoom() >= 12);
  map.on('zoomend', labels);
  // Access points, from the layers button (on to start with).
  const access = L.layerGroup();
  courses.forEach(E => E.ACCESS.forEach(a => {
    if (E.main && a.aid) return;
    if (!E.main && G.ACCESS.includes(a)) return;  // shared with the GPT100: drawn once
    L.marker([a.lat, a.lon], { title: E.cleanName(a), icon: pin(E.isGated(a) ? '#6d3b8e' : '#888', 10) })
      .bindPopup(`<b>${esc(E.cleanName(a))}</b><br>Access point, ${E.label} km ${one(a.trail_km)}${E.isGated(a) ? ' &middot; gated' : ''}${a.conn_m > 50 ? ' &middot; ' + a.conn_m + ' m walk to course' : ''}${a.note ? '<br>' + esc(a.note) : ''}<br>${w3wLink(a.w3w)}`).addTo(access);
  }));
  GPTBaseMap.overlay(map, 'Access points', access, true);
  G.BASES.forEach(b => L.marker([b.lat, b.lon], { title: b.name + ' base', icon: pin(b.color, 22), zIndexOffset: 500 }).bindPopup(`<b>${esc(b.name)} base</b><br>${w3wLink(G.data.bases_w3w && G.data.bases_w3w[b.key])}`).addTo(map));
  if (window.GPTHelipads) GPTHelipads.overlay(map, true);
  if (window.GPTTrack) {
    GPTBaseMap.overlay(map, 'Emergency markers', GPTTrack.overlay(['emergency']), false);
    GPTBaseMap.overlay(map, 'Camps and assembly areas', GPTTrack.overlay(['camp', 'assembly']), false);
    GPTBaseMap.overlay(map, 'Track hazards', GPTTrack.overlay(['hazard', 'hazards', 'warning']), false);
    // The whole GPT100 coloured by Parks Victoria track grade.
    const T = window.GPT100_TRACK, grades = L.layerGroup();
    if (T && T.segments) T.segments.forEach(([a, b, g]) => {
      const info = GPTTrack.GRADES[g]; if (!info) return;
      const i0 = G.idxAtKm(a), i1 = G.idxAtKm(b);
      L.polyline(G.route.slice(i0, i1 + 1).map(p => [p[0], p[1]]), { color: info.col, weight: 7, opacity: .9, interactive: false }).addTo(grades);
    });
    GPTBaseMap.overlay(map, 'Track grades', grades, false);
  }
  // Safety Officer posts (public: posts and shift times only), lit when on post during the event.
  const SO = window.GPT100_SO, soLayer = L.layerGroup();
  // Shift times are hours from t0 (Melbourne; the race is in daylight saving, UTC+11), as in js/field.js.
  const soT0 = SO ? new Date(SO.t0 + '+11:00').getTime() : 0;
  const soTime = h => new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(soT0 + h * 3600e3)).replace(',', '');
  function drawSO() {
    if (!SO) return;
    soLayer.clearLayers();
    const h = (Date.now() - soT0) / 3600e3, live = h >= 0 && h <= SO.n / 4; // n is in quarter hours
    SO.stations.forEach(s => {
      const posts = SO.posts.filter(p => p.station === s.name && !/passage/i.test(p.label));
      if (!posts.length) return;
      const now = posts.filter(p => p.a <= h && p.z > h), lit = !live || now.length;
      L.marker([s.lat, s.lon], { title: s.name + ' Safety Officers', zIndexOffset: 400, opacity: lit ? 1 : 0.45, icon: L.divIcon({ className: '', html: `<div class="so-mark${lit ? ' on' : ''}">SO</div>`, iconSize: [24, 18], iconAnchor: [12, 9] }) })
        .bindPopup(`<b>${esc(s.name)}</b> &middot; Safety Officers<br>${live ? (now.length ? '<b>On post now</b><br>' : 'Not on post now<br>') : ''}` + posts.map(p => `${esc(p.label)}: ${soTime(p.a)} to ${soTime(p.z)}`).join('<br>')).addTo(soLayer);
    });
  }
  if (SO) { drawSO(); GPTBaseMap.overlay(map, 'Safety Officer posts', soLayer, true); setInterval(drawSO, 5 * 60e3); }

  // The key folds away (a button) so it doesn't cover the map on a phone; open to start with on a big screen.
  const KEY = 'gptMapKey';
  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const d = L.DomUtil.create('div', 'map-legend mp-key');
    let open = innerWidth >= 1000;
    try { const v = localStorage.getItem(KEY); if (v != null) open = v === '1'; } catch (e) { }
    d.innerHTML = `<button type="button" class="mp-key-btn" aria-expanded="${open}">Key</button><div class="mp-key-body"${open ? '' : ' hidden'}></div>`;
    L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
    d.firstChild.addEventListener('click', () => { const b = d.lastChild; b.hidden = !b.hidden; d.firstChild.setAttribute('aria-expanded', !b.hidden); try { localStorage.setItem(KEY, b.hidden ? '0' : '1'); } catch (e) { } });
    d.lastChild.innerHTML = G.BASES.map(b => `<i style="background:${b.color}"></i>${esc(b.name)} base`).join('<br>') +
      `<br><i class="ln" style="background:${COL.main}"></i>GPT100${courses.length > 1 ? `<br><i class="ln" style="background:${COL.other}"></i>${esc(courses.filter(c => !c.main).map(c => c.label).join(', '))}` : ''}` +
      '<br><i style="background:#111"></i>Aid station or water point<br><i style="background:#888"></i>Access point<br><i style="background:#6d3b8e"></i>Gated access' +
      `<br><i class="ln" style="background:#e00000;opacity:.5"></i>Over ${G.fmt(C.redMin)} to reach` +
      (SO ? '<br><span class="so-mark on" style="display:inline-block;width:22px;margin-right:5px">SO</span>Safety Officers' : '') +
      (window.GPTHelipads ? '<br><span class="legend-head">Helicopter landing sites</span><br>' + GPTHelipads.legendHTML() : '') +
      (window.GPTTrack ? '<br><span class="legend-head">Track grades (layers button)</span><br>' + GPTTrack.legendHTML() : '') +
      (TR ? '<br><span class="trk-mk" style="display:inline-block;vertical-align:middle">1047</span> Tracked runner (grey: quiet, red: not moving, purple: off the course)' + (TR.chip() ? '<br><span class="trk-mk est" style="display:inline-block;vertical-align:middle">1047</span> Estimated from the timing chips (amber: late at the next checkpoint)' : '') : '');
    return d;
  };
  legend.addTo(map);
  // Whole course button (words, not an icon: a target icon reads as "find me").
  const fitCtrl = L.control({ position: 'topleft' });
  fitCtrl.onAdd = () => { const d = L.DomUtil.create('div', 'leaflet-bar gpt-fs'); d.innerHTML = '<button type="button" class="gpt-fs-btn mp-fit" title="Zoom out to the whole course" style="width:auto;padding:0 8px;font:600 12px var(--body)">Whole course</button>'; L.DomEvent.disableClickPropagation(d); d.firstChild.onclick = () => map.fitBounds(bounds.pad(0.04)); return d; };
  fitCtrl.addTo(map);
  map.fitBounds(bounds.pad(0.04));
  labels();

  // ---------- tap the course: km, team and ETA, and a link into Find ----------
  let tapPop = null;
  map.on('click', e => {
    let best = null;
    for (const E of courses) { const s = E.snap(e.latlng.lat, e.latlng.lng); if (!best || s.offM < best.offM) best = { E, ic: s.ic, offM: s.offM }; }
    if (!best || best.offM > 2000) return;
    const E = best.E, r = E.assess(best.ic), b = r.best, p = E.route[best.ic];
    const between = r.aid.prev && r.aid.next ? `<br>${esc(r.aid.prev.a.name)} ${one(r.aid.prev.distKm)} km back, ${esc(r.aid.next.a.name)} ${one(r.aid.next.distKm)} km ahead` : '';
    const hash = `#ll=${e.latlng.lat.toFixed(5)},${e.latlng.lng.toFixed(5)}` + (E.main ? '' : '&c=' + E.id);
    const near = TR && TR.ready() ? TR.near(E, r.km, 3, 3) : [];
    tapPop = L.popup({ maxWidth: 280 }).setLatLng([p[0], p[1]]).setContent(
      `<b>${esc(E.name)} km ${one(r.km)}</b>${best.offM > 150 ? ` (${best.offM >= 1000 ? one(best.offM / 1000) + ' km' : Math.round(best.offM) + ' m'} from the tap)` : ''}${between}` +
      `<br>Send <b>${esc(b.base.name)} team</b> via ${esc(E.cleanName(b.a))}${E.isGated(b.a) ? ' (gated)' : ''}: drive ${E.fmt(b.drive)}, walk ${one(b.walkKm)} km, <b>ETA ${E.fmt(b.total)}</b>${b.total > C.redMin ? ' <span style="color:#c62828;font-weight:700">(over ' + E.fmt(C.redMin) + ')</span>' : ''}` +
      (near.length ? `<br>Nearby: ${near.map(x => `bib ${esc(x.bib)} (km ${one(TR.cur(x))})`).join(', ')}` : '') +
      `<br><a class="btn small" style="margin-top:6px" href="${esc(findHref(hash))}">Open in Find</a>`).openOn(map);
  });

  // ---------- live runners ----------
  let runnerLayer = null;
  if (TR) {
    runnerLayer = L.layerGroup().addTo(map);
    TR.onUpdate(() => {
      // Redrawn on every update: an open runner popup is opened again on the new marker, without panning.
      let open = null;
      runnerLayer.eachLayer(l => { if (l.isPopupOpen && l.isPopupOpen()) open = l.options.bib; });
      runnerLayer.clearLayers(); courses.forEach(E => TR.draw(runnerLayer, E, null, null, { extra: r => `<br><a class="btn small" style="margin-top:6px" href="${esc(findHref('#bib=' + r.bib))}">Open in Find</a>` }));
      runnerLayer.eachLayer(l => { if (open != null && l.options.bib === open) { const p = l.getPopup(); p.options.autoPan = false; l.openPopup(); p.options.autoPan = true; } });
      renderPanel(); $('mpStatus').textContent = TR.status();
    });
  } else $('mpStatus').textContent = 'No live tracking feed is set.';

  // Centre on a runner and say where they are.
  function show(bib) {
    const r = TR && TR.byBib(bib);
    if (!r || !r.pos) { $('mpBibMsg').textContent = TR && TR.ready() ? `No position for bib ${bib} yet` : 'Tracking is still loading'; return false; }
    const p = r.pos, at = p.est ? [p.est.lat, p.est.lon] : [p.lat, p.lon];
    map.setView(at, Math.max(map.getZoom(), 14));
    // Open the runner's own marker popup (runners on one spot are stacked, each with its own marker).
    let mk = null;
    if (runnerLayer) runnerLayer.eachLayer(l => { if (l.options && l.options.bib === r.bib) mk = l; });
    if (mk) mk.openPopup();
    else L.popup({ maxWidth: 280 }).setLatLng(at).setContent(`${TR.who(r)}<br>km ${one(TR.cur(r))}${p.est ? ' (estimated)' : ''}${p.offM > 60 ? ', ' + TR.dist(p.offM) + ' off the course' : ''}<br>${TR.where(r)}<br><a class="btn small" style="margin-top:6px" href="${esc(findHref('#bib=' + r.bib))}">Open in Find</a>`).openOn(map);
    $('mpBibMsg').textContent = '';
    if (innerWidth < 700) openPanel(false);
    return true;
  }
  $('mpBibForm').addEventListener('submit', e => { e.preventDefault(); const v = $('mpBib').value.replace(/^#|^bib\s*/i, '').trim(); if (v) show(v); });
  document.addEventListener('click', e => { const b = e.target.closest('.trk-go'); if (b) show(b.dataset.bib); });

  // ---------- the Runners panel ----------
  const PANEL = 'gptMapPanel';
  function openPanel(on) {
    $('mpPanel').hidden = !on; $('mpRunners').setAttribute('aria-expanded', on); $('mpRunners').classList.toggle('on', on);
    try { localStorage.setItem(PANEL, on ? '1' : '0'); } catch (e) { }
    setTimeout(() => map.invalidateSize(), 50);
    if (on) renderPanel();
  }
  $('mpRunners').addEventListener('click', () => openPanel($('mpPanel').hidden));
  $('mpClose').addEventListener('click', () => openPanel(false));
  function renderPanel() {
    if ($('mpPanel').hidden) return;
    const el = $('mpLive');
    if (!TR) { el.innerHTML = `<p class="muted">No live tracking feed is set (<code>tracking.gps</code> and <code>tracking.chip</code> in the config). To see how it looks, <a href="map.html?demo=1">run the demo</a>: made-up runners on the course, GPS and chips both.</p>`; return; }
    if (!TR.ready()) { el.innerHTML = `<p class="muted">${esc(TR.status())}</p>`; return; }
    const w = TR.watch();
    const row = (r, why) => `<div class="row"><span>${TR.who(r)}<span class="sub">${why}, km ${one(TR.cur(r))}${r.pos.est ? ' (estimated)' : ''}${r.pos.course !== G ? ' (' + esc(r.pos.course.label) + ')' : ''}. ${TR.where(r)}</span></span><button class="btn small trk-go" type="button" data-bib="${esc(r.bib)}">Show</button></div>`;
    let h = `<p class="trk-status">${esc(TR.status())}</p><h3>Runner watch</h3>`;
    const any = w.stopped.length || (w.off || []).length || w.late.length || w.quiet.length;
    if (w.stopped.length) h += '<h4>Not moving for 20 min</h4>' + w.stopped.slice(0, 12).map(r => row(r, 'Not moving')).join('');
    if ((w.off || []).length) h += '<h4>Off the course</h4>' + w.off.slice(0, 12).map(r => row(r, TR.dist(r.pos.offM) + ' off the course')).join('');
    if (w.late.length) h += '<h4>Late at the next checkpoint</h4>' + w.late.slice(0, 12).map(r => row(r, (r.pos.next.overdue ? 'Overdue' : 'Late') + ' at ' + esc(r.pos.next.name))).join('');
    if (w.quiet.length) h += '<h4>Tracker gone quiet</h4>' + w.quiet.slice(0, 12).map(r => row(r, 'No fix')).join('');
    if (!any) h += '<p class="muted">Everyone on course is moving and accounted for.</p>';
    courses.forEach(E => {
      const on = TR.leaders(E);
      if (!on.length) return;
      h += `<h3>${esc(E.label)}: ${on.length} on course</h3>`;
      const A = E.AID;
      const rows = [];
      for (let i = 1; i < A.length; i++) { const n = TR.between(E, A[i - 1].trail_km, A[i].trail_km).length; if (n) rows.push({ a: A[i - 1], b: A[i], n }); }
      h += rows.map(x => `<div class="row"><span><b>${esc(x.a.name)}</b> to <b>${esc(x.b.name)}</b><span class="sub">km ${one(x.a.trail_km)} to ${one(x.b.trail_km)}</span></span><span class="v">${x.n}</span></div>`).join('');
      const few = (list, label) => list.length ? `<h4>${label}</h4>` + list.map(r => `<div class="row"><span>${TR.who(r)}<span class="sub">km ${one(TR.cur(r))}${r.pos.est ? ' (estimated)' : ''}, ${TR.where(r)}</span></span><button class="btn small trk-go" type="button" data-bib="${esc(r.bib)}">Show</button></div>`).join('') : '';
      h += few(on.slice(0, 3), 'Front') + few(on.slice(-3).reverse().filter(r => !on.slice(0, 3).includes(r)), 'Tail');
    });
    el.innerHTML = h;
  }
  let want = innerWidth >= 1000;
  try { const v = localStorage.getItem(PANEL); if (v != null) want = v === '1'; } catch (e) { }
  if (TR && want && innerWidth >= 700) openPanel(true);

  // A bib in the link opens on that runner: map.html#bib=1047.
  const m = /bib=(\d+)/.exec(location.hash);
  if (m && TR) { let done = false; TR.onUpdate(() => { if (!done && TR.ready()) { done = true; show(m[1]); } }); }

  // The ? help (js/intro.js): once on first open, unless the link opens on a runner.
  if (window.GPTIntro) GPTIntro({
    key: 'gptIntroMap', quiet: !!m,
    steps: [() => ({ title: 'Safety map', html: `<ul class="rn-tablist">
      <li><b>Tap the course</b> The km, the team to send and the ETA, with Open in Find for the full answer.</li>
      <li><b>Runners</b> Find a bib, the Runner watch (not moving, off the course, late, tracker quiet) and the field by section. Show centres the map on a runner.</li>
      <li><b>Layers</b> The button at the top right adds emergency markers, camps, track hazards and track grades. Key, at the bottom left, says what the markers mean.</li>
      <li><b>Whole course</b> Zooms back out. The button under the layers button is full screen.</li>
    </ul><p class="fd-hint">Tap <b>?</b> at the top any time to see this again. Planning guide only: in an emergency call 000.</p>` })]
  });

  window.GPTMapPage = { map, show };
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
})();
