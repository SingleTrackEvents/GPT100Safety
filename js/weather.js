// Weather tab: risk triggers, the course timeline, the race simulator and the model comparison.
// Reads the files published by the hourly weather watch (tools/weather_watch.mjs) from the weather-data branch.
(function () {
  const G = window.GPT, C = window.GPT100_CONFIG, W = C.weather, WX = window.GPT_WX;
  const PACE = window.GPT100_PACING && window.GPT100_PACING.miler;
  if (!W || !WX || !$('wxBody')) return;
  function $(id) { return document.getElementById(id); }
  const HOUR = 3600, T = W.triggers, TOTAL = G.route[G.route.length - 1][2];
  const DATA = new URLSearchParams(location.search).get('wxdata') || W.dataUrl;
  W.refreshUrl = new URLSearchParams(location.search).get('wxrefresh') || W.refreshUrl; // testing override
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nowS = () => Math.floor(Date.now() / 1000);

  // ---------- colour scales ----------
  function ramp(stops) {
    const rgb = stops.map(s => [s[0], parseInt(s[1].slice(1, 3), 16), parseInt(s[1].slice(3, 5), 16), parseInt(s[1].slice(5, 7), 16)]);
    return v => {
      if (v == null || isNaN(v)) return '#ececec';
      if (v <= rgb[0][0]) return stops[0][1];
      for (let i = 1; i < rgb.length; i++) if (v <= rgb[i][0]) {
        const a = rgb[i - 1], b = rgb[i], f = (v - a[0]) / (b[0] - a[0]);
        return `rgb(${Math.round(a[1] + f * (b[1] - a[1]))},${Math.round(a[2] + f * (b[2] - a[2]))},${Math.round(a[3] + f * (b[3] - a[3]))})`;
      }
      return stops[stops.length - 1][1];
    };
  }
  const STATUS_COL = { ok: '#dce8de', close: '#f0b429', met: '#d64545', nodata: '#ececec' };
  const VARS = {
    status: { label: 'Trigger status', col: v => STATUS_COL[v] || STATUS_COL.nodata, key: [['Clear', STATUS_COL.ok], ['Getting close', STATUS_COL.close], ['Met', STATUS_COL.met]] },
    at: { label: 'Feels like', unit: '°C', dp: 1, col: ramp([[-5, '#3b4cc0'], [0, '#5a7fd0'], [5, '#8fb8de'], [12, '#bfe0cf'], [20, '#ece5a3'], [28, '#f4a259'], [32, '#e4572e'], [36, '#a4161a']]), key: [['0°C', '#5a7fd0'], ['12°C', '#bfe0cf'], ['20°C', '#ece5a3'], ['32°C', '#e4572e'], ['36°C', '#a4161a']] },
    t: { label: 'Temperature', unit: '°C', dp: 1 },
    g: { label: 'Wind gusts', unit: 'km/h', dp: 0, col: ramp([[0, '#eef3ee'], [30, '#bfe3c0'], [50, '#f6d365'], [60, '#e4572e'], [90, '#7b1fa2']]), key: [['30', '#bfe3c0'], ['50', '#f6d365'], ['60', '#e4572e'], ['90 km/h', '#7b1fa2']] },
    p: { label: 'Rain', unit: 'mm/h', dp: 1, col: ramp([[0, '#f5f5f0'], [0.19, '#f5f5f0'], [0.2, '#d6e8f5'], [1, '#8cc1e6'], [4, '#2f7fc1'], [10, '#173f8a']]), key: [['0.2', '#d6e8f5'], ['1', '#8cc1e6'], ['4', '#2f7fc1'], ['10 mm/h', '#173f8a']] },
    pp: { label: 'Chance of rain', unit: '%', dp: 0, col: ramp([[0, '#f5f5f0'], [50, '#8cc1e6'], [100, '#173f8a']]), key: [['0%', '#f5f5f0'], ['50%', '#8cc1e6'], ['100% of models', '#173f8a']] },
    wbgt: { label: 'WBGT (heat stress)', unit: '', dp: 1, col: ramp([[10, '#eef3ee'], [20, '#ece5a3'], [25, '#f4a259'], [28, '#e4572e'], [30, '#a4161a']]), key: [['20', '#ece5a3'], ['28', '#e4572e'], ['30', '#a4161a']] },
    storm: { label: 'Thunderstorm', unit: 'models', dp: 0, col: v => v == null ? '#ececec' : v >= 2 ? STATUS_COL.met : v === 1 ? STATUS_COL.close : '#f5f5f0', key: [['1 model', STATUS_COL.close], ['2 or more', STATUS_COL.met]] },
    cc: { label: 'Cloud', unit: '%', dp: 0, col: ramp([[0, '#fdf6d8'], [100, '#8a8a8a']]), key: [['Clear', '#fdf6d8'], ['Overcast', '#8a8a8a']] },
    cloud: { label: 'In cloud (high ground)', unit: '%', dp: 0, col: v => v == null ? '#f5f5f0' : ramp([[0, '#f5f5f0'], [49, '#dfe3e8'], [50, '#9aa5b1'], [100, '#4a5560']])(v), key: [['Some models', '#dfe3e8'], ['Half the models', '#9aa5b1'], ['All models', '#4a5560']] },
    uv: { label: 'UV index', unit: '', dp: 1, col: ramp([[0, '#eef3ee'], [3, '#ece5a3'], [6, '#f4a259'], [8, '#e4572e'], [11, '#7b1fa2']]), key: [['3 moderate', '#ece5a3'], ['6 high', '#f4a259'], ['8 very high', '#e4572e'], ['11 extreme', '#7b1fa2']] }
  };
  VARS.t.col = VARS.at.col; VARS.t.key = VARS.at.key;
  function fmtV(k, v) { const d = VARS[k]; return v == null ? 'n/a' : (d.dp ? v.toFixed(d.dp) : Math.round(v)) + (d.unit && d.unit !== 'models' ? (d.unit === '°C' ? '°C' : ' ' + d.unit) : ''); }

  // ---------- state ----------
  let obs = null, ens = null;           // live BOM observations; ensemble ranges (loaded for the Models view)
  let latest = null, history = [], grid = null, replayYears = [], loadErr = null, built = false, view = 'triggers';
  const replays = {}, modelFiles = {};
  let dsKey = null, ds = null;          // dataset for the timeline and simulator: { grid, shift, label, forecast }
  let movedDate = null;                 // "as if the race started on" date for the forecast
  let sel = null;                       // selected { km, t }
  let tlVar = 'status', tlRange = 'race', mapVar = 'status', trigScope = 'next48';
  let simT = null, playTimer = null, simSpeed = 3600, trip = null;
  let mdVar = 't', mdRange = 'week', mdPoint = null, mdHidden = {}, mdT = null;
  let map = null, segs = [], runMarks = {}, trigLayer = null, selMark = null, fitted = false;

  async function getJSON(name) {
    // A changing ?t= gets past GitHub's 5 minute cache, so new data shows as soon as it's published.
    const r = await fetch(DATA + name + (DATA.startsWith('http') ? '?t=' + Math.floor(Date.now() / 30000) : ''), { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  async function load() {
    try {
      latest = await getJSON('latest.json');
      loadErr = null;
      getJSON('history.json').then(h => { history = h; if (view === 'triggers') renderView(); }).catch(() => { });
      getJSON('obs.json').then(o => { obs = o; drawLive(); if (view === 'triggers') renderView(); }).catch(() => { });
      drawLive();
      getJSON('replay/index.json').then(y => { replayYears = y; }).catch(() => { });
    } catch (e) { loadErr = e.message; }
  }
  async function loadGrid() {
    if (grid && grid.modelsRun === (latest && latest.modelsRun)) return grid;
    grid = await getJSON('grid.json');
    return grid;
  }

  // ---------- values anywhere, any time ----------
  function eleAt(km) { return G.route[G.idxAtKm(km)][3]; }
  function hourIdx(g, t) { return Math.round((t - g.t0) / HOUR); }
  // Consensus value of var k at course km and epoch t: between the two nearest forecast points, with
  // temperatures adjusted for the height difference (6.5°C per km).
  function valueAt(g, k, km, t) {
    const h = hourIdx(g, t);
    if (h < 0 || h >= g.n || !g.cons[k]) return null;
    const P = g.points;
    let j = P.findIndex(p => p.km >= km);
    if (j < 0) j = P.length - 1;
    const i = Math.max(0, j - 1);
    const a = g.cons[k][h][i], b = g.cons[k][h][j];
    if (a == null || b == null) return a == null ? b : a;
    const f = P[j].km === P[i].km ? 0 : Math.min(1, Math.max(0, (km - P[i].km) / (P[j].km - P[i].km)));
    let v = a + f * (b - a);
    if (k === 't' || k === 'at' || k === 'tmax' || k === 'atmin' || k === 'wbgt') {
      const refEle = P[i].ele + f * (P[j].ele - P[i].ele);
      v += -0.0065 * (eleAt(km) - refEle) * (k === 'wbgt' ? 0.6 : 1);
    }
    return v;
  }
  function nearestPoint(g, km) { let bi = 0; g.points.forEach((p, i) => { if (Math.abs(p.km - km) < Math.abs(g.points[bi].km - km)) bi = i; }); return bi; }
  function statusAt(g, km, t) {
    const h = hourIdx(g, t);
    if (h < 0 || h >= g.n) return { status: 'nodata', hits: [] };
    return WX.cellStatus(g, h, nearestPoint(g, km), T);
  }
  function placeAt(km) {
    const A = G.AID; let a = A[0], b = A[A.length - 1];
    for (let i = 1; i < A.length; i++) if (A[i].trail_km >= km) { a = A[i - 1]; b = A[i]; break; }
    if (Math.abs(a.trail_km - km) < 0.3) return 'at ' + a.name;
    if (Math.abs(b.trail_km - km) < 0.3) return 'at ' + b.name;
    return 'between ' + a.name + ' and ' + b.name;
  }

  // ---------- datasets ----------
  function paceStart() { return WX.parseLocal(PACE.points[0].fast); }
  function paceEnd() { return WX.parseLocal(PACE.points[PACE.points.length - 1].slow); }
  function forecastCoversRace(g) { return g && g.t0 + (g.n - 1) * HOUR >= paceEnd(); }
  function defaultMovedDate(g) {
    const start = PACE.points[0].fast.slice(11), dur = paceEnd() - paceStart();
    let d = WX.localDate(nowS() + 24 * HOUR);
    // Keep the whole race inside the forecast where possible.
    const last = g.t0 + (g.n - 1) * HOUR;
    if (WX.parseLocal(d + 'T' + start) + dur > last) d = WX.localDate(Math.max(nowS(), last - dur - 24 * HOUR));
    return d;
  }
  async function setDataset(key) {
    const g = await loadGrid();
    if (key == null) key = forecastCoversRace(g) ? 'fc' : 'mv';
    dsKey = key;
    if (key === 'fc') ds = { grid: g, shift: 0, forecast: true, label: 'Latest forecast' };
    else if (key === 'mv') {
      movedDate = movedDate || defaultMovedDate(g);
      ds = { grid: g, shift: WX.parseLocal(movedDate + PACE.points[0].fast.slice(10)) - paceStart(), forecast: true, label: 'Latest forecast, race moved to ' + WX.fmtDay(WX.parseLocal(movedDate)) };
    } else {
      const y = +key.slice(1);
      if (!replays[y]) replays[y] = await getJSON('replay/' + y + '.json');
      ds = { grid: replays[y], shift: WX.parseLocal(y + PACE.points[0].fast.slice(4)) - paceStart(), forecast: false, label: 'Race dates in ' + y + ' (past weather)' };
    }
    trip = null;
    simT = null;
  }
  function dsPicker() {
    const covers = grid && forecastCoversRace(grid);
    const opts = [['fc', 'Latest forecast, race dates' + (covers ? '' : ' (not reached yet)')], ['mv', 'Latest forecast, move the race']]
      .concat(replayYears.slice().reverse().map(y => ['y' + y, 'Race dates in ' + y + ' (past weather)']));
    return `<div class="wx-ds"><label>Weather <select id="wxDs">${opts.map(o => `<option value="${o[0]}"${o[0] === dsKey ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>
      ${dsKey === 'mv' ? `<label>Race starts <input id="wxMoved" type="date" value="${movedDate}"></label>` : ''}</div>
      ${dsKey === 'fc' && !covers ? '<p class="notice warn">The forecast doesn\'t reach race weekend yet (it reaches about 16 days ahead). Choose "move the race" to see the race in the current forecast, or a past year.</p>' : ''}
      ${dsKey && dsKey[0] === 'y' ? '<p class="wx-note">Past weather is the ERA5 reanalysis for the race dates that year: what actually happened, in a coarse 25 km grid.</p>' : ''}`;
  }
  function bindDs() {
    const s = $('wxDs');
    if (s) s.addEventListener('change', async () => { await setDataset(s.value); renderView(); });
    const m = $('wxMoved');
    if (m) m.addEventListener('change', async () => { if (m.value) { movedDate = m.value; await setDataset('mv'); renderView(); } });
  }

  // ---------- layout ----------
  function build() {
    $('wxBody').innerHTML = `<div class="wx-layout">
      <div class="wx-panel">
        <div class="wx-head"><h1>Weather</h1><p id="wxUpd" class="wx-upd"></p>${W.refreshUrl ? '<div class="wx-refresh"><button id="wxRefresh" class="btn small" type="button">Refresh now</button><span id="wxRefreshMsg" class="wx-upd" role="status"></span></div>' : ''}</div>
        <div id="wxWarn"></div>
        <div class="seg wx-views" role="tablist">
          <button data-v="triggers">Triggers</button><button data-v="timeline">Timeline</button><button data-v="sim">Simulator</button><button data-v="models">Models</button>
        </div>
        <div id="wxView"></div>
      </div>
      <div class="wx-map"><div id="wxMap" aria-label="Weather map"></div></div>
    </div>`;
    $('wxBody').querySelectorAll('.wx-views button').forEach(b => b.addEventListener('click', () => setView(b.dataset.v)));
    if ($('wxRefresh')) $('wxRefresh').addEventListener('click', refreshMenu);
    buildMap();
    built = true;
  }
  function setView(v) {
    if (v !== 'sim') stopPlay();
    view = v;
    $('wxBody').querySelectorAll('.wx-views button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    renderView();
  }
  function header() {
    if (!latest) {
      $('wxUpd').textContent = loadErr ? '' : 'Loading…';
      $('wxWarn').innerHTML = loadErr ? `<p class="notice danger">Weather data isn't available (${esc(loadErr)}). ${navigator.onLine ? 'The hourly weather watch may not have run yet.' : 'You\'re offline.'}</p>` : '';
      return;
    }
    const age = (nowS() - latest.updated) / HOUR;
    $('wxUpd').innerHTML = `Updated ${WX.fmtTime(latest.updated)} (${age < 1 ? Math.round(age * 60) + ' min' : age.toFixed(1) + ' h'} ago). ` +
      (latest.modelsRun ? `Models fetched ${WX.fmtTime(latest.modelsRun, false)}: ${latest.models.length} models.` : '');
    const warn = [];
    if (age > W.staleHours) warn.push(`<p class="notice danger">This weather is ${age.toFixed(1)} hours old. The hourly watch may have stopped: check the Weather watch in GitHub Actions. ${navigator.onLine ? '' : 'You\'re offline.'}</p>`);
    const bad = Object.entries(latest.sources || {}).filter(([k, s]) => !s.ok && k !== 'bom_access_global');
    if (bad.length) warn.push(`<p class="notice warn">Not updating: ${bad.map(([k]) => esc(srcName(k).replace(/ \(.*\)$/, ''))).join(', ')}. See Sources below.</p>`);
    $('wxWarn').innerHTML = warn.join('');
  }
  function renderView() {
    if (!built) return;
    header();
    $('wxBody').querySelectorAll('.wx-views button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
    const V = $('wxView');
    if (!latest) { V.innerHTML = ''; return; }
    if (view === 'triggers') {
      // Keep a half-written weather update when the page refreshes its data.
      const draft = $('wxShareText') ? $('wxShareText').value : null;
      V.innerHTML = triggersHTML(); bindTriggers(); drawMapTriggers();
      if (draft != null) openShare().then(() => { $('wxShareText').value = draft; $('wxShareText').dispatchEvent(new Event('input')); });
      return;
    }
    V.innerHTML = '<p class="muted">Loading the forecast…</p>';
    (ds ? Promise.resolve() : setDataset(null)).then(() => {
      if (view === 'timeline') renderTimeline();
      else if (view === 'sim') renderSim();
      else if (view === 'models') renderModels();
    }).catch(e => { V.innerHTML = `<p class="notice danger">Couldn't load the forecast (${esc(e.message)}).</p>`; });
  }

  const SRC = { warnings: 'BOM warnings (anonymous FTP)', fire: 'CFA fire ratings', air: 'Air quality forecast (CAMS via Open-Meteo)', ensembles: 'Ensembles: ECMWF and GFS (Open-Meteo)',
    obs: 'BOM observations (anonymous FTP)', precis: 'BOM town forecasts (anonymous FTP)', incidents: 'VicEmergency', epa: 'EPA AirWatch' };
  const srcName = k => SRC[k] || WX.modelName(k) + ' (Open-Meteo)';

  // ---------- Triggers ----------
  const WORD = { met: 'Met', close: 'Getting close', ok: 'Clear', nodata: 'No data' };
  function pill(st, advisory) { return `<span class="wx-pill st-${st}">${advisory && st === 'close' ? 'Advisory' : WORD[st]}</span>`; }
  function triggersHTML() {
    const L = latest, tr = L.triggers;
    let h = '<button class="btn primary wx-share-btn" id="wxShare" type="button">Share weather update</button><div id="wxSharePanel"></div>';
    h += '<div class="wx-overall">' + Object.entries(tr).map(([k, s]) =>
      `<button class="wx-scope st-${s.status}${trigScope === k ? ' on' : ''}" data-scope="${k}"><span>${esc(s.label)}</span><b>${WORD[s.status]}</b></button>`).join('') + '</div>';

    // Official sources first.
    h += '<h2 class="wx-h">Official warnings</h2>';
    if (L.warnings && L.warnings.items) {
      const rel = L.warnings.items.filter(w => w.relevant), other = L.warnings.items.length - rel.length;
      h += rel.length ? rel.map(w => `<a class="wx-bom" href="${esc(w.link || 'https://www.bom.gov.au/vic/warnings/')}" target="_blank" rel="noopener"><b>${esc(w.title)}</b><span>${esc(w.date)}</span></a>`).join('')
        : '<p class="wx-ok">No BOM warnings near the course.</p>';
      if (other) h += `<p class="wx-note">${other} other BOM warning${other > 1 ? 's' : ''} in Victoria. <a href="https://www.bom.gov.au/vic/warnings/" target="_blank" rel="noopener">All Victorian warnings</a></p>`;
    } else h += '<p class="notice warn">BOM warnings aren\'t coming through. Check <a href="https://www.bom.gov.au/vic/warnings/" target="_blank" rel="noopener">bom.gov.au/vic/warnings</a>.</p>';
    if (L.fire && L.fire.days && L.fire.days.length) {
      h += `<table class="wx-fire"><thead><tr><th>CFA</th>${W.districts.map(d => `<th>${esc(d)}</th>`).join('')}</tr></thead><tbody>` +
        L.fire.days.map(d => `<tr><td>${WX.fmtDay(WX.parseLocal(d.date))}</td>${W.districts.map(k => { const r = d.districts[k] || {}; return `<td><span class="fdr fdr-${(r.rating || '').replace(/\s/g, '').toLowerCase()}">${esc(WX.titleCase(r.rating || 'n/a'))}</span>${r.tfb ? ' <b class="tfb">Total Fire Ban</b>' : ''}</td>`; }).join('')}</tr>`).join('') +
        '</tbody></table><p class="wx-note"><a href="https://www.cfa.vic.gov.au/warnings-restrictions/total-fire-bans-and-ratings" target="_blank" rel="noopener">CFA fire ratings</a> · <a href="https://www.epa.vic.gov.au/for-community/airwatch" target="_blank" rel="noopener">EPA AirWatch</a> · <a href="https://www.bom.gov.au/products/IDR023.loop.shtml" target="_blank" rel="noopener">Radar</a></p>';
    }
    h += incidentsHTML() + obsHTML() + precisHTML();

    for (const [sk, s] of Object.entries(tr)) {
      h += `<h2 class="wx-h" id="wxs-${sk}">${esc(s.label)} <span class="wx-when">${WX.fmtTime(s.from)} to ${WX.fmtTime(s.to)}</span></h2>`;
      if (s.note) h += `<p class="wx-note">${esc(s.note)}</p>`;
      h += '<div class="wx-cards">' + WX.ORDER.map(k => {
        const r = s.triggers[k], w = r.worst;
        const where = w && w.at ? (w.km != null ? `km ${w.km}${w.place ? ' ' + esc(w.place) : ''}, ` : '') + (k === 'fire' ? '' : WX.fmtTime(w.at)) : '';
        return `<button class="wx-card st-${r.status}" data-key="${k}" ${w && w.km != null ? `data-km="${w.km}" data-t="${w.at}"` : ''}>
          <div class="wx-card-top"><b>${esc(r.label)}</b>${pill(r.status, r.advisory)}</div>
          ${r.text ? `<p>${esc(r.text)}</p>` : ''}
          ${where && r.status !== 'nodata' ? `<p class="wx-where">${where}${w.runners ? ' <span class="chip">Runners on course</span>' : ''}</p>` : ''}
          ${r.status === 'nodata' && r.note ? `<p class="wx-where">${esc(r.note)}</p>` : ''}
          ${r.chance && r.status !== 'nodata' ? `<p class="wx-where">Ensembles: ${r.chance.p ? 'up to ' + r.chance.p + '% chance' + (r.chance.p ? ` (km ${r.chance.km}, ${WX.fmtTime(r.chance.at)})` : '') : 'none of 82 forecasts reach it'}</p>` : ''}
          ${k === 'cloud' ? liveCloudHTML() : ''}
          <p class="wx-rule">${esc(r.rule)}${r.proposed ? ' <em>(proposed trigger)</em>' : ''}</p>
        </button>`;
      }).join('') + '</div>';
    }
    h += trendHTML();
    h += `<details class="wx-src"><summary>Sources</summary><ul>${Object.entries(L.sources || {}).map(([k, s]) =>
      `<li><b>${esc(srcName(k))}</b>: ${s.ok ? (s.hours ? s.hours + ' hours' : s.stations != null ? s.stations + ' stations' : 'OK') : 'not working: ' + esc(s.error)}</li>`).join('')}</ul>
      <p class="wx-note">Consensus = the middle value of all models (median). "Getting close" also flags when any single model reaches a trigger. Temperatures are adjusted to the height of each point. Phone alerts go to the ntfy app when a trigger gets closer, plus a 6 am summary from ${WX.fmtDay(WX.parseLocal(W.alertsFrom))}.</p></details>`;
    return h;
  }

  // Fires, planned burns, incidents and warnings near the course (VicEmergency).
  const INC_COL = { fire: '#c62828', burn: '#e8710a', warning: '#b87700', incident: '#666' };
  function incidentsHTML() {
    const I = latest.incidents;
    let h = '<h2 class="wx-h">Fires, burns and incidents</h2>';
    if (!I || !I.items) return h + '<p class="notice warn">VicEmergency isn\'t coming through. Check <a href="https://emergency.vic.gov.au/respond/" target="_blank" rel="noopener">emergency.vic.gov.au</a>.</p>';
    if (!I.items.length) return h + `<p class="wx-ok">Nothing on VicEmergency within ${W.incidentKm} km of the course.</p>`;
    return h + I.items.map(it => `<a class="wx-inc" style="border-color:${INC_COL[it.kind]}" href="https://emergency.vic.gov.au/respond/" target="_blank" rel="noopener">
      <b>${esc(it.title || it.name)}</b>${it.status ? ` <span class="wx-pill">${esc(it.status)}</span>` : ''}
      <span>${esc(it.location || it.name)} · ${it.dist} km from the course (near km ${it.km})${it.size ? ' · ' + esc(it.size) : ''}</span></a>`).join('') +
      '<p class="wx-note">From VicEmergency. Bushfires within ' + W.fireNearKm + ' km meet the fire trigger; planned burns that close make smoke getting close.</p>';
  }
  // Live BOM observations from weather stations near the course.
  function obsHTML() {
    const st = obs && obs.stations ? Object.values(obs.stations).sort((a, b) => a.fromCourseKm - b.fromCourseKm) : [];
    let h = '<h2 class="wx-h">Live observations</h2>';
    if (!st.length) return h + '<p class="wx-note">' + (latest.sources && latest.sources.obs && !latest.sources.obs.ok ? 'BOM observations aren\'t coming through.' : 'Loading…') + ' <a href="https://www.bom.gov.au/vic/observations/vicall.shtml" target="_blank" rel="noopener">BOM observations</a></p>';
    const now = nowS();
    h += '<div class="wx-scroll"><table class="wx-fire wx-obs"><thead><tr><th>Station</th><th>Time</th><th>Temp</th><th>Feels</th><th>Wind, gust</th><th>Rain</th></tr></thead><tbody>' + st.map(s => {
      const r = s.series[s.series.length - 1], old = now - r.t > 2 * HOUR;
      const prev = s.series.find(x => x.t >= r.t - 3 * HOUR && x.temp != null);
      const trend = prev && r.temp != null && prev !== r ? r.temp - prev.temp : null;
      return `<tr class="${old ? 'muted' : ''}"><td><b>${esc(s.name)}</b><br><span class="wx-where">${s.height != null ? Math.round(s.height) + ' m, ' : ''}${s.fromCourseKm} km from course</span></td>
        <td>${WX.fmtTime(r.t, false)}${old ? '<br><span class="wx-where">old</span>' : ''}</td>
        <td>${r.temp != null ? r.temp.toFixed(1) + '°' : 'n/a'}${trend != null && Math.abs(trend) >= 1 ? `<br><span class="wx-where">${trend > 0 ? '+' : ''}${trend.toFixed(1)} in 3 h</span>` : ''}</td>
        <td>${r.at != null ? r.at.toFixed(1) + '°' : 'n/a'}</td><td>${r.wind != null ? Math.round(r.wind) : '-'}, ${r.gust != null ? Math.round(r.gust) : '-'} km/h ${esc(r.dir || '')}</td>
        <td>${r.rain != null ? r.rain + ' mm' : '-'}</td></tr>`;
    }).join('') + '</tbody></table></div><p class="wx-note">BOM weather stations within ' + W.obsRadiusKm + ' km. Rain is since 9 am. Also on the map.</p>';
    const E = latest.epa;
    if (E && E.sites && E.sites.length) h += '<p class="wx-note"><b>EPA air monitors:</b> ' + E.sites.map(x => `${esc(x.name)} PM2.5 ${x.pm25 != null ? Math.round(x.pm25) + ' ' + esc(x.unit) : 'n/a'}${x.advice ? ' (' + esc(x.advice) + ')' : ''}, ${x.dist} km from course`).join('; ') + '.</p>';
    return h;
  }
  // The Bureau's own forecasts for towns near the course.
  function precisHTML() {
    const P = latest.precis;
    if (!P || !P.places || !P.places.length) return '';
    const days = [...new Set(P.places.flatMap(p => p.days.map(d => d.date)))].filter(Boolean).slice(0, 5);
    return '<h2 class="wx-h">BOM forecast</h2><div class="wx-scroll"><table class="wx-fire wx-precis"><thead><tr><th></th>' + days.map(d => `<th>${WX.fmtDay(WX.parseLocal(d))}</th>`).join('') + '</tr></thead><tbody>' +
      P.places.map(p => `<tr><td><b>${esc(p.name)}</b></td>` + days.map(d => {
        const x = p.days.find(y => y.date === d);
        if (!x) return '<td></td>';
        return `<td>${x.max != null ? '<b>' + x.max + '°</b>' : ''}${x.min != null ? ' / ' + x.min + '°' : ''}<br>${esc(x.precis || '')}${x.rain ? '<br><span class="wx-where">Rain ' + esc(x.rain) + (x.range ? ', ' + esc(x.range) : '') + '</span>' : ''}</td>`;
      }).join('') + '</tr>').join('') + '</tbody></table></div><p class="wx-note">The Bureau of Meteorology\'s official forecasts. <a href="https://www.bom.gov.au/vic/forecasts/wimmera.shtml" target="_blank" rel="noopener">Wimmera</a> · <a href="https://www.bom.gov.au/vic/forecasts/southwest.shtml" target="_blank" rel="noopener">South West</a></p>';
  }
  // Live check: the BOM Mount William station (1,150 m, beside the course). Near 100% humidity means it's in cloud.
  function liveCloudHTML() {
    const st = obs && obs.stations ? Object.values(obs.stations).find(x => /william/i.test(x.name)) : null;
    const r = st && st.series[st.series.length - 1];
    if (!r || r.rh == null || nowS() - r.t > 2 * HOUR) return '';
    return `<p class="wx-where">Live, ${esc(st.name)} station ${WX.fmtTime(r.t, false)}: humidity ${Math.round(r.rh)}%${r.rh >= 97 ? ', <b>likely in cloud now</b>' : ''}.</p>`;
  }
  function trendHTML() {
    const pts = history.filter(x => x.race && x.race.heat != null);
    if (pts.length < 2) return '';
    const series = [['heat', 'Hottest °C', '#c62828'], ['wind', 'Gust on ridges km/h', '#7b1fa2'], ['rain', 'Rain 24 h mm', '#1666c9'], ['cold', 'Coldest feels like °C', '#2a4d9b']];
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    return '<h2 class="wx-h">How the race forecast has moved</h2><div class="wx-trend">' + series.map(([k, lab, col]) => {
      const v = pts.filter(p => p.race[k] != null);
      if (v.length < 2) return '';
      const lo = Math.min(...v.map(p => p.race[k])), hi = Math.max(...v.map(p => p.race[k])), span = hi - lo || 1;
      const d = v.map((p, i) => `${i ? 'L' : 'M'}${(4 + 192 * (p.t - t0) / (t1 - t0 || 1)).toFixed(1)},${(36 - 30 * (p.race[k] - lo) / span).toFixed(1)}`).join('');
      return `<div><span>${lab}: <b>${v[v.length - 1].race[k].toFixed(k === 'wind' ? 0 : 1)}</b></span><svg viewBox="0 0 200 40" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg></div>`;
    }).join('') + `</div><p class="wx-note">Race weekend peaks from each run since ${WX.fmtDay(t0)}.</p>`;
  }
  // Daily weather update: written from the latest data, editable, then sent by WhatsApp or copied.
  async function openShare() {
    const P = $('wxSharePanel');
    P.innerHTML = '<p class="muted">Writing the update…</p>';
    let g = null;
    try { g = await loadGrid(); } catch (e) { }
    const text = WX.updateText({ grid: g, triggers: latest.triggers, fire: latest.fire, warnings: latest.warnings, incidents: latest.incidents, config: C, now: nowS(),
      url: location.origin + location.pathname + '#weather' });
    P.innerHTML = `<div class="wx-share"><p class="wx-note">Check it and add your own call at the top before sending. WhatsApp shows *words* in bold.</p>
      <textarea id="wxShareText" rows="16">${esc(text)}</textarea>
      <div class="wx-btns"><a class="btn primary small" id="wxShareWa" href="#" target="_blank" rel="noopener">WhatsApp</a>
        <button class="btn small" id="wxShareCopy" type="button">Copy</button>${navigator.share ? '<button class="btn small" id="wxShareSys" type="button">Share</button>' : ''}
        <button class="btn small" id="wxShareClose" type="button">Close</button></div></div>`;
    const ta = $('wxShareText'), wa = $('wxShareWa');
    const sync = () => { wa.href = 'https://wa.me/?text=' + encodeURIComponent(ta.value); };
    ta.addEventListener('input', sync); sync();
    $('wxShareCopy').addEventListener('click', async e => {
      try { await navigator.clipboard.writeText(ta.value); } catch (err) { ta.select(); document.execCommand('copy'); }
      e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1500);
    });
    if ($('wxShareSys')) $('wxShareSys').addEventListener('click', () => navigator.share({ title: 'GPT100 weather update', text: ta.value }).catch(() => { }));
    $('wxShareClose').addEventListener('click', () => { P.innerHTML = ''; });
    ta.focus(); ta.setSelectionRange(0, 0);
  }
  function bindTriggers() {
    $('wxShare').addEventListener('click', openShare);
    $('wxView').querySelectorAll('.wx-scope').forEach(b => b.addEventListener('click', () => {
      trigScope = b.dataset.scope; renderView();
      const el = $('wxs-' + trigScope); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    $('wxView').querySelectorAll('.wx-card[data-km]').forEach(b => b.addEventListener('click', () => {
      sel = { km: +b.dataset.km, t: +b.dataset.t };
      dsKey = null; ds = null;
      tlVar = 'status'; tlRange = 'all';
      setView('timeline');
    }));
  }

  // ---------- Timeline ----------
  function rangeHours(g) {
    const last = g.n - 1, clamp = x => Math.max(0, Math.min(last, x));
    if (tlRange === 'race' || !ds.forecast) {
      return [clamp(hourIdx(g, paceStart() + ds.shift) - 3), clamp(hourIdx(g, paceEnd() + ds.shift) + 3)];
    }
    if (tlRange === 'next') return [clamp(hourIdx(g, nowS()) - 2), clamp(hourIdx(g, nowS()) + 72)];
    return [0, last];
  }
  function renderTimeline() {
    const g = ds.grid;
    if (!sel || hourIdx(g, sel.t) < 0 || hourIdx(g, sel.t) >= g.n) {
      // Start at the race start (or now, for the next few days).
      const t = tlRange === 'race' || !ds.forecast ? paceStart() + ds.shift : nowS();
      sel = { km: sel ? sel.km : 86.4, t: g.t0 + Math.max(0, Math.min(g.n - 1, hourIdx(g, t))) * HOUR };
    }
    $('wxView').innerHTML = dsPicker() + `
      <div class="wx-ctl">
        <label>Show <select id="wxVar">${Object.entries(VARS).map(([k, v]) => `<option value="${k}"${k === tlVar ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>
        ${ds.forecast ? `<div class="seg small">${[['race', 'Race'], ['next', 'Next 3 days'], ['all', 'All']].map(([k, l]) => `<button data-r="${k}"${tlRange === k ? ' class="on"' : ''}>${l}</button>`).join('')}</div>` : ''}
      </div>
      <div class="wx-tl"><canvas id="wxTl"></canvas></div>
      <div class="wx-key">${keyHTML(tlVar)} <span><i class="ln fast"></i>Fastest</span> <span><i class="ln slow"></i>Slowest (cut-offs)</span></div>
      <form id="wxAny" class="wx-any"><label>Km <input id="wxKm" type="number" step="0.1" min="0" max="${TOTAL}" inputmode="decimal" value="${sel ? sel.km : ''}"></label>
        <label>When <input id="wxWhen" type="datetime-local" value="${sel ? localInput(sel.t) : ''}"></label><button class="btn small" type="submit">Show</button></form>
      <div id="wxRead"></div>`;
    $('wxVar').addEventListener('change', e => { tlVar = e.target.value; mapVar = tlVar; renderTimeline(); });
    $('wxView').querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { tlRange = b.dataset.r; renderTimeline(); }));
    $('wxAny').addEventListener('submit', e => {
      e.preventDefault();
      const km = parseFloat($('wxKm').value), t = WX.parseLocal($('wxWhen').value);
      if (isNaN(km) || isNaN(t)) return;
      select(Math.max(0, Math.min(TOTAL, km)), t);
    });
    bindDs();
    const cv = $('wxTl');
    cv.addEventListener('click', e => {
      const r = cv.getBoundingClientRect(), L = cv._L;
      if (!L) return;
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < L.left || y < L.top || y > L.top + L.h) return;
      const h = L.h0 + Math.floor((x - L.left) / L.cw), km = (y - L.top) / L.h * TOTAL;
      select(Math.round(km * 10) / 10, g.t0 + Math.min(L.h1, h) * HOUR);
    });
    drawTimeline();
    readout();
    colourMap(sel.t);
  }
  function localInput(t) { const p = WX.parts(t), d = WX.localDate(t); return d + 'T' + p.hour + ':' + p.minute; }
  function select(km, t) {
    sel = { km, t };
    if ($('wxKm')) { $('wxKm').value = km; $('wxWhen').value = localInput(t); }
    drawTimeline(); readout(); colourMap(t);
  }
  function drawTimeline() {
    const cv = $('wxTl'); if (!cv) return;
    const g = ds.grid, [h0, h1] = rangeHours(g), nh = h1 - h0 + 1;
    const Wd = cv.parentElement.clientWidth || 600, Ht = Math.round(Math.max(300, Math.min(480, Wd * 0.72)));
    const dpr = window.devicePixelRatio || 1;
    cv.width = Wd * dpr; cv.height = Ht * dpr; cv.style.width = Wd + 'px'; cv.style.height = Ht + 'px';
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = { left: 40, top: 20, w: Wd - 48, h: Ht - 44, h0, h1 }; L.cw = L.w / nh; cv._L = L;
    const yk = km => L.top + km / TOTAL * L.h, xh = h => L.left + (h - h0) * L.cw;
    x.clearRect(0, 0, Wd, Ht);
    const P = g.points, col = VARS[tlVar].col;
    for (let p = 0; p < P.length; p++) {
      const a = p ? (P[p - 1].km + P[p].km) / 2 : 0, b = p < P.length - 1 ? (P[p].km + P[p + 1].km) / 2 : TOTAL;
      const y0 = yk(a), y1 = yk(b);
      for (let h = h0; h <= h1; h++) {
        const v = tlVar === 'status' ? WX.cellStatus(g, h, p, T).status : g.cons[tlVar] ? g.cons[tlVar][h][p] : null;
        x.fillStyle = col(v);
        x.fillRect(xh(h), y0, L.cw + 0.6, y1 - y0 + 0.6);
      }
    }
    // Night shading and day labels.
    x.font = '600 11px Montserrat, sans-serif'; x.textBaseline = 'middle';
    const night = h => g.lh[h] >= 20 || g.lh[h] < 6;
    x.fillStyle = 'rgba(20,30,60,.10)';
    for (let h = h0; h <= h1; h++) if (night(h) && (h === h0 || !night(h - 1))) {
      let e = h; while (e < h1 && night(e + 1)) e++;
      x.fillRect(xh(h), L.top, (e - h + 1) * L.cw, L.h);
    }
    for (let h = h0; h <= h1; h++) {
      const lh = g.lh[h];
      if (lh === 0) {
        x.fillStyle = '#111'; x.fillRect(xh(h), L.top - 4, 1, L.h + 4);
        // Day labels: full where there's room, shorter on long ranges.
        const lab = L.cw * 24 > 70 ? WX.fmtDay(g.t0 + h * HOUR) : WX.fmtDay(g.t0 + h * HOUR).split(' ').slice(0, 2).join(' ');
        if (L.cw * 24 > 34 || g.lh[h] === 0 && Math.round((h - h0) / 24) % 2 === 0) x.fillText(lab, xh(h) + 3, 9);
      } else if (lh === 12 && nh < 100) { x.fillStyle = '#625c53'; x.fillText('12:00', xh(h) + 2, L.top + L.h + 12); }
    }
    if (nh <= 100 && g.lh[h0] !== 0) { x.fillStyle = '#111'; x.fillText(WX.fmtDay(g.t0 + h0 * HOUR), L.left + 2, 9); }
    // Km axis with aid stations.
    x.fillStyle = '#625c53'; x.textAlign = 'right';
    for (let k = 0; k <= TOTAL; k += 20) x.fillText(k, L.left - 5, yk(k));
    x.textAlign = 'left';
    x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1;
    G.AID.forEach(a => { x.beginPath(); x.moveTo(L.left, yk(a.trail_km)); x.lineTo(L.left + L.w, yk(a.trail_km)); x.stroke(); });
    // Runner lines.
    if (PACE) for (const [kind, colr, dash] of [['fast', '#111', []], ['slow', '#111', [5, 4]]]) {
      x.strokeStyle = colr; x.lineWidth = 2; x.setLineDash(dash); x.beginPath();
      let on = false;
      for (let s = h0 * 4; s <= h1 * 4; s++) {
        const t = g.t0 + s * HOUR / 4, km = WX.kmAt(PACE, kind, t - ds.shift);
        if (km == null) { on = false; continue; }
        const px = L.left + (s / 4 - h0 + 0.5) * L.cw, py = yk(km);
        if (on) x.lineTo(px, py); else x.moveTo(px, py);
        on = true;
      }
      x.stroke(); x.setLineDash([]);
    }
    // Selection.
    if (sel) {
      const h = hourIdx(g, sel.t);
      if (h >= h0 && h <= h1) {
        x.strokeStyle = '#d9531e'; x.lineWidth = 2;
        x.strokeRect(xh(h) - 1, yk(sel.km) - 5, L.cw + 2, 10);
        x.beginPath(); x.moveTo(xh(h) + L.cw / 2, L.top); x.lineTo(xh(h) + L.cw / 2, L.top + L.h); x.globalAlpha = .4; x.stroke(); x.globalAlpha = 1;
      }
    }
    x.fillStyle = '#625c53'; x.fillText('km', 4, L.top + L.h + 12);
  }
  function keyHTML(k) { return (VARS[k].key || []).map(([l, c]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join(' '); }
  function conditions(g, km, t) {
    const v = k => valueAt(g, k, km, t);
    const h = hourIdx(g, t), p = nearestPoint(g, km);
    if (v('t') == null) return null;
    return { t: v('t'), at: v('at'), wbgt: v('wbgt'), g: v('g'), gmax: v('gmax'), w: v('w'), p: v('p'), pp: v('pp'), p24: v('p24'), cc: v('cc'),
      code: g.cons.code[h][p], storm: g.cons.storm[h][p], n: g.cons.n[h][p], cape: v('cape'), uv: v('uv'), status: statusAt(g, km, t),
      cloud: g.cons.cloud ? g.cons.cloud[h][p] : null, cbase: g.cons.cbase ? g.cons.cbase[h][p] : null };
  }
  function condLine(c) {
    return `<b>${c.t.toFixed(1)}°C</b>, feels ${c.at.toFixed(1)}°C · gusts ${Math.round(c.g)} km/h${c.gmax > c.g + 5 ? ' (up to ' + Math.round(c.gmax) + ')' : ''} · ` +
      `rain ${c.p.toFixed(1)} mm/h${c.n > 1 ? ' (' + Math.round(c.pp) + '% of models)' : ''} · ${esc(WX.codeText(c.code))}${c.cloud != null && c.cloud >= T.cloud.agree ? ' · <b>in cloud</b>' : ''}${c.storm ? ` · <b>thunderstorm in ${c.storm} of ${c.n} models</b>` : ''}`;
  }
  function hitsHTML(st) { return st.hits.length ? st.hits.map(x => `<span class="wx-pill st-${x.status}">${WX.LABELS[x.key]}: ${WORD[x.status]}</span>`).join(' ') : '<span class="wx-pill st-ok">No triggers</span>'; }
  function readout() {
    const R = $('wxRead'); if (!R || !sel) return;
    const g = ds.grid, c = conditions(g, sel.km, sel.t);
    const time = sel.t - ds.shift;
    const f = PACE && WX.passTime(PACE, 'fast', sel.km), s = PACE && WX.passTime(PACE, 'slow', sel.km);
    R.innerHTML = `<div class="wx-read">
      <div class="eyebrow">km ${sel.km.toFixed(1)} ${esc(placeAt(sel.km))} · ${Math.round(eleAt(sel.km))} m</div>
      <h3>${WX.fmtTime(sel.t)}</h3>
      ${c ? `<p>${condLine(c)}</p><p>Rain in the last 24 hours: ${c.p24.toFixed(1)} mm · WBGT ${c.wbgt.toFixed(1)} · cloud ${Math.round(c.cc)}%${c.uv != null ? ' · UV ' + c.uv.toFixed(0) : ''}</p>${c.cloud != null ? `<p>In cloud in ${c.cloud}% of models${c.cbase == null || c.cbase >= 3000 ? ', cloud base above 1,500 m' : c.cbase <= 860 ? ', cloud base at or below about 850 m' : `, cloud base about ${Math.round(c.cbase / 50) * 50} m`}.</p>` : ''}<p>${hitsHTML(c.status)}</p>` : '<p class="muted">No forecast for this time.</p>'}
      ${f ? `<p class="wx-note">Runners pass here from ${WX.fmtTime(f + ds.shift)} (fastest) to ${WX.fmtTime(s + ds.shift)} (cut-off).${WX.runnersAt(PACE, sel.km, sel.t, ds.shift) ? ' <b>Runners are likely here at this time.</b>' : ''}</p>` : ''}
      <div class="wx-btns">${ds.forecast ? '<button class="btn small" id="wxCmp">Compare models here</button>' : ''}<button class="btn small" id="wxFind">Open in Find</button></div>
    </div>`;
    if ($('wxCmp')) $('wxCmp').addEventListener('click', () => { mdPoint = nearestPoint(grid, sel.km); mdT = sel.t; setView('models'); });
    $('wxFind').addEventListener('click', () => window.GPT_UI && window.GPT_UI.openKm(sel.km));
    void time;
    markSel(sel.km);
  }

  // ---------- Simulator ----------
  function simBounds() { return [paceStart() + ds.shift - HOUR, paceEnd() + ds.shift + HOUR]; }
  function tripSummary(kind) {
    const g = ds.grid, t0 = WX.parseLocal(PACE.points[0][kind === 'fast' ? 'fast' : 'slow']) + ds.shift;
    const t1 = WX.parseLocal(PACE.points[PACE.points.length - 1][kind]) + ds.shift;
    const S = { kind, t0, t1, samples: [], hot: null, cold: null, gust: null, rain: 0, wetH: 0, stormH: 0, hits: {}, missing: 0 };
    for (let t = t0; t <= t1; t += HOUR / 2) {
      const km = WX.kmAt(PACE, kind, t - ds.shift); if (km == null) continue;
      const c = conditions(g, km, t);
      S.samples.push({ t, km, c });
      if (!c) { S.missing++; continue; }
      if (!S.hot || c.t > S.hot.v) S.hot = { v: c.t, km, t };
      if (!S.cold || c.at < S.cold.v) S.cold = { v: c.at, km, t };
      if (eleAt(km) >= W.ridgeMinEle && (!S.gust || c.g > S.gust.v)) S.gust = { v: c.g, km, t };
      S.rain += c.p / 2; if (c.p >= 0.2) S.wetH += 0.5; if (c.storm) S.stormH += 0.5;
      c.status.hits.forEach(x => { const o = S.hits[x.key]; if (!o || WX.RANK[x.status] > WX.RANK[o.status]) S.hits[x.key] = { status: x.status, km, t }; });
    }
    return S;
  }
  function renderSim() {
    if (!PACE) { $('wxView').innerHTML = '<p>No pacing loaded.</p>'; return; }
    const [a, b] = simBounds();
    if (simT == null || simT < a || simT > b) simT = a + HOUR;
    if (!trip) trip = { fast: tripSummary('fast'), slow: tripSummary('slow') };
    $('wxView').innerHTML = dsPicker() + `
      <div class="wx-sim-ctl">
        <button id="wxPlay" class="btn primary small">${playTimer ? 'Pause' : 'Play'}</button>
        <select id="wxSpeed">${[[900, '15 min a second'], [3600, '1 hour a second'], [10800, '3 hours a second']].map(([v, l]) => `<option value="${v}"${v === simSpeed ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <label>Map <select id="wxMapVar">${Object.entries(VARS).map(([k, v]) => `<option value="${k}"${k === mapVar ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>
      </div>
      <input id="wxSlider" class="wx-slider" type="range" min="${a}" max="${b}" step="900" value="${simT}">
      <h3 id="wxSimT" class="wx-simt"></h3>
      <div class="wx-runners"><div id="wxRunfast" class="wx-runner"></div><div id="wxRunslow" class="wx-runner"></div></div>
      <h2 class="wx-h">The whole race</h2>
      ${['fast', 'slow'].map(k => tripHTML(trip[k])).join('')}
      <p class="wx-note">Fastest = first runner's expected times, slowest = the cut-offs (GPT100 Miler, Course Details sheet). Weather is the model consensus at each runner's position every 30 minutes.</p>`;
    bindDs();
    $('wxPlay').addEventListener('click', () => playTimer ? stopPlay() : startPlay());
    $('wxSpeed').addEventListener('change', e => { simSpeed = +e.target.value; });
    $('wxMapVar').addEventListener('change', e => { mapVar = e.target.value; simUpdate(); });
    $('wxSlider').addEventListener('input', e => { stopPlay(); simT = +e.target.value; simUpdate(); });
    simUpdate();
  }
  function tripHTML(S) {
    const who = S.kind === 'fast' ? 'Fastest runner' : 'Slowest runner (cut-offs)';
    const at = o => o ? ` <span class="wx-where">km ${o.km.toFixed(1)}, ${WX.fmtTime(o.t)}</span>` : '';
    const hits = Object.entries(S.hits);
    return `<div class="wx-trip"><h3>${who}: ${WX.fmtTime(S.t0)} to ${WX.fmtTime(S.t1)}</h3>
      ${S.missing ? `<p class="notice warn">No forecast for ${S.missing / 2} hours of this race.</p>` : ''}
      ${journeySVG(S)}
      <ul class="wx-facts">
        <li>Hottest <b>${S.hot ? S.hot.v.toFixed(1) + '°C' : 'n/a'}</b>${at(S.hot)}</li>
        <li>Coldest feels like <b>${S.cold ? S.cold.v.toFixed(1) + '°C' : 'n/a'}</b>${at(S.cold)}</li>
        <li>Strongest gust on ridges <b>${S.gust ? Math.round(S.gust.v) + ' km/h' : 'n/a'}</b>${at(S.gust)}</li>
        <li>Rain <b>${S.rain.toFixed(1)} mm</b> over ${S.wetH} hours${S.stormH ? `, <b>thunderstorm risk for ${S.stormH} hours</b>` : ''}</li>
      </ul>
      <p>${hits.length ? hits.map(([k, o]) => `<span class="wx-pill st-${o.status}">${WX.LABELS[k]}: ${WORD[o.status]}</span>`).join(' ') : '<span class="wx-pill st-ok">No triggers on this runner\'s race</span>'}</p></div>`;
  }
  function journeySVG(S) {
    const s = S.samples.filter(x => x.c);
    if (s.length < 2) return '';
    const Wd = 420, Ht = 150, t0 = S.t0, t1 = S.t1, X = t => 30 + (Wd - 36) * (t - t0) / (t1 - t0);
    const temps = s.flatMap(x => [x.c.t, x.c.at]), lo = Math.floor(Math.min(...temps) - 2), hi = Math.ceil(Math.max(...temps) + 2);
    const Y = v => 8 + (Ht - 38) * (1 - (v - lo) / (hi - lo));
    const maxE = 1200, E = km => Ht - 22 - (Ht - 40) * eleAt(km) / maxE;
    const rMax = Math.max(2, ...s.map(x => x.c.p));
    let ele = `M${X(s[0].t)},${Ht - 22}` + s.map(x => `L${X(x.t).toFixed(1)},${E(x.km).toFixed(1)}`).join('') + `L${X(s[s.length - 1].t)},${Ht - 22}Z`;
    const line = k => s.map((x, i) => `${i ? 'L' : 'M'}${X(x.t).toFixed(1)},${Y(x.c[k]).toFixed(1)}`).join('');
    const bars = s.filter(x => x.c.p >= 0.1).map(x => `<rect x="${(X(x.t) - 2).toFixed(1)}" y="${(Ht - 22 - 40 * x.c.p / rMax).toFixed(1)}" width="4" height="${(40 * x.c.p / rMax).toFixed(1)}" fill="#2f7fc1"/>`).join('');
    const storms = s.filter(x => x.c.storm).map(x => `<rect x="${(X(x.t) - 3).toFixed(1)}" y="0" width="6" height="${Ht - 22}" fill="${x.c.storm >= 2 ? '#d64545' : '#f0b429'}" opacity=".35"/>`).join('');
    let ticks = '';
    for (let t = Math.ceil(t0 / (6 * HOUR)) * 6 * HOUR; t <= t1; t += 6 * HOUR) {
      const p = WX.parts(t);
      ticks += `<line x1="${X(t)}" x2="${X(t)}" y1="${Ht - 22}" y2="${Ht - 18}" stroke="#625c53"/><text x="${X(t)}" y="${Ht - 6}" text-anchor="middle">${p.hour === '00' ? p.weekday : p.hour + ':00'}</text>`;
    }
    const yt = [lo, Math.round((lo + hi) / 2), hi].map(v => `<text x="26" y="${Y(v) + 4}" text-anchor="end">${v}°</text>`).join('');
    return `<svg class="wx-journey" viewBox="0 0 ${Wd} ${Ht}" data-kind="${S.kind}"><path d="${ele}" fill="#ece9e1"/>${storms}${bars}
      <path d="${line('t')}" fill="none" stroke="#c62828" stroke-width="2"/><path d="${line('at')}" fill="none" stroke="#2a4d9b" stroke-width="2" stroke-dasharray="4 3"/>
      ${ticks}${yt}<line class="now" x1="0" x2="0" y1="0" y2="${Ht - 22}" stroke="#d9531e" stroke-width="2" visibility="hidden"/></svg>
      <p class="wx-key"><span><i class="ln" style="background:#c62828"></i>Temperature</span> <span><i class="ln" style="background:#2a4d9b"></i>Feels like</span> <span><i style="background:#2f7fc1"></i>Rain</span> <span><i style="background:#ece9e1"></i>Height</span></p>`;
  }
  function simUpdate() {
    if (!$('wxSimT')) return;
    const g = ds.grid;
    $('wxSimT').textContent = WX.fmtTime(simT);
    $('wxSlider').value = simT;
    for (const kind of ['fast', 'slow']) {
      const km = WX.kmAt(PACE, kind, simT - ds.shift), el = $('wxRun' + kind);
      const name = kind === 'fast' ? 'Fastest' : 'Slowest (cut-offs)';
      let body;
      if (km == null) {
        const done = simT - ds.shift > WX.parseLocal(PACE.points[PACE.points.length - 1][kind]);
        body = `<p class="muted">${done ? 'Finished' : 'Not started'}</p>`;
      } else {
        const c = conditions(g, km, simT);
        body = `<p class="wx-rk">km ${km.toFixed(1)} <span>${esc(placeAt(km))} · ${Math.round(eleAt(km))} m</span></p>` +
          (c ? `<p>${condLine(c)}</p><p>${hitsHTML(c.status)}</p>` : '<p class="muted">No forecast for this time.</p>');
      }
      el.innerHTML = `<div class="eyebrow">${name}</div>${body}`;
      const svg = $('wxView').querySelector(`.wx-journey[data-kind="${kind}"]`), S = trip[kind];
      if (svg) {
        const ln = svg.querySelector('.now'), x = 30 + 384 * (simT - S.t0) / (S.t1 - S.t0);
        ln.setAttribute('visibility', simT >= S.t0 && simT <= S.t1 ? 'visible' : 'hidden'); ln.setAttribute('x1', x); ln.setAttribute('x2', x);
      }
      if (map) {
        if (km == null) runMarks[kind].remove();
        else { const r = G.route[G.idxAtKm(km)]; runMarks[kind].setLatLng([r[0], r[1]]).addTo(map); }
      }
    }
    colourMap(simT);
  }
  function startPlay() {
    const [, b] = simBounds();
    if (simT >= b) simT = simBounds()[0];
    playTimer = setInterval(() => {
      simT = Math.min(b, simT + simSpeed / 5);
      simUpdate();
      if (simT >= b) stopPlay();
    }, 200);
    if ($('wxPlay')) $('wxPlay').textContent = 'Pause';
  }
  function stopPlay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    if ($('wxPlay')) $('wxPlay').textContent = 'Play';
  }

  // ---------- Models ----------
  const MCOL = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#17becf', '#999999', '#bcbd22'];
  const MVARS = { t: ['Temperature', '°C', 1], at: ['Feels like', '°C', 1], g: ['Wind gusts', 'km/h', 0], w: ['Wind speed', 'km/h', 0], p: ['Rain', 'mm/h', 1], cc: ['Cloud', '%', 0], cape: ['Storm energy (CAPE)', 'J/kg', 0], rh: ['Humidity', '%', 0], uv: ['UV index', '', 1], cbase: ['Cloud base (high ground)', 'm', 0] };
  const LINES = { t: [[T.heat.close, 'close'], [T.heat.met, 'met']], at: [[T.cold.close, 'close'], [T.cold.met, 'met']], g: [[T.wind.close, 'close'], [T.wind.met, 'met']], cape: [[T.storm.capeClose, 'close']] };
  async function renderModels() {
    const g = await loadGrid();
    if (mdPoint == null) mdPoint = nearestPoint(g, sel ? sel.km : 86.4);
    const V = $('wxView');
    V.innerHTML = `<div class="wx-ctl">
      <label>Point <select id="wxPt">${g.points.map((p, i) => `<option value="${i}"${i === mdPoint ? ' selected' : ''}>km ${p.km} ${esc(p.name)} (${p.ele} m${p.ridge ? ', ridge' : ''})</option>`).join('')}</select></label>
      <label>Show <select id="wxMv">${Object.entries(MVARS).map(([k, v]) => `<option value="${k}"${k === mdVar ? ' selected' : ''}>${v[0]}</option>`).join('')}</select></label>
      <div class="seg small">${[['week', 'Next 7 days'], ['race', 'Race weekend'], ['all', 'All']].map(([k, l]) => `<button data-r="${k}"${mdRange === k ? ' class="on"' : ''}>${l}</button>`).join('')}</div>
    </div><div id="wxChart"><p class="muted">Loading the models…</p></div><div id="wxMtab"></div>`;
    $('wxPt').addEventListener('change', e => { mdPoint = +e.target.value; renderModels(); });
    $('wxMv').addEventListener('change', e => { mdVar = e.target.value; renderModels(); });
    V.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { mdRange = b.dataset.r; renderModels(); }));
    markSel(g.points[mdPoint].km);
    colourMap(mdT || nowS());
    if (!ens || ens.run !== latest.ensRun) { try { ens = await getJSON('ens.json'); } catch (e) { ens = null; } }
    let f = modelFiles[g.modelsRun + '/' + mdPoint];
    try { if (!f) f = modelFiles[g.modelsRun + '/' + mdPoint] = await getJSON('models/p' + mdPoint + '.json'); }
    catch (e) { $('wxChart').innerHTML = `<p class="notice danger">Couldn't load the models (${esc(e.message)}).</p>`; return; }
    drawModels(g, f);
  }
  function drawModels(g, f) {
    const ids = Object.keys(f.models), last = g.n - 1;
    let h0 = 0, h1 = last;
    if (mdRange === 'week') { h0 = Math.max(0, hourIdx(g, nowS()) - 3); h1 = Math.min(last, h0 + 7 * 24); }
    if (mdRange === 'race') { h0 = Math.max(0, hourIdx(g, WX.parseLocal(W.event.start))); h1 = Math.min(last, hourIdx(g, WX.parseLocal(W.event.end))); }
    if (h1 <= h0) { $('wxChart').innerHTML = '<p class="notice warn">The forecast doesn\'t reach race weekend yet.</p>'; $('wxMtab').innerHTML = ''; return; }
    const val = (m, h) => { const a = f.models[m][mdVar]; const v = a && h < a.length ? a[h] : null; return mdVar === 'cbase' && v == null && a ? (h < a.length ? 2000 : null) : v; };
    if (mdVar === 'cbase' && !ids.some(m => f.models[m].cbase)) { $('wxChart').innerHTML = '<p class="notice warn">Cloud base is only worked out for the high ground: ' + T.cloud.zones.map(z => z.name + ' (km ' + z.fromKm + ' to ' + z.toKm + ')').join(' and ') + '. Pick a point there.</p>'; $('wxMtab').innerHTML = ''; return; }
    // Ensemble range: 80% of the 82 ensemble forecasts fall inside the band.
    const band = ens && { t: ['t10', 't90'], g: ['g10', 'g90'] }[mdVar];
    let ej = -1;
    if (band) { ej = ens.gi.indexOf(mdPoint); if (ej < 0) { let bd = 1e9; ens.points.forEach((p, j) => { const d = Math.abs(p.km - g.points[mdPoint].km); if (d < bd) { bd = d; ej = j; } }); } }
    const ensAt = (k, h) => { if (ej < 0) return null; const hh = h - (ens.t0 - g.t0) / HOUR; return hh >= 0 && hh < ens.n ? ens.v[k][hh][ej] : null; };
    const med = []; for (let h = h0; h <= h1; h++) med.push(WX.median(ids.filter(m => !mdHidden[m]).map(m => val(m, h))));
    let lo = Infinity, hi = -Infinity;
    for (const m of ids) if (!mdHidden[m]) for (let h = h0; h <= h1; h++) { const v = val(m, h); if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    if (band) for (let h = h0; h <= h1; h++) { const a = ensAt(band[0], h), b = ensAt(band[1], h); if (a != null) lo = Math.min(lo, a); if (b != null) hi = Math.max(hi, b); }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (mdVar === 'p' || mdVar === 'cc' || mdVar === 'cape' || mdVar === 'g' || mdVar === 'w') lo = 0;
    (LINES[mdVar] || []).forEach(([v]) => { if (v <= hi * 1.3 && v >= lo - 5) { hi = Math.max(hi, v); lo = Math.min(lo, v); } });
    if (mdVar === 'cbase') { lo = Math.min(lo, 600); hi = Math.max(hi, g.points[mdPoint].ele + 100); }
    hi += (hi - lo) * 0.06 || 1;
    const Wd = 640, Ht = 260, X = h => 36 + (Wd - 44) * (h - h0) / (h1 - h0), Y = v => 10 + (Ht - 40) * (1 - (v - lo) / (hi - lo));
    let svg = '';
    const night = h => g.lh[h] >= 20 || g.lh[h] < 6;
    for (let h = h0; h <= h1; h++) if (night(h) && (h === h0 || !night(h - 1))) {
      let e = h; while (e < h1 && night(e + 1)) e++;
      svg += `<rect x="${X(h).toFixed(1)}" y="10" width="${(X(e + 1) - X(h)).toFixed(1)}" height="${Ht - 40}" fill="rgba(20,30,60,.07)"/>`;
    }
    for (let h = h0; h <= h1; h++) {
      const lh = g.lh[h];
      if (lh === 0) svg += `<line x1="${X(h)}" x2="${X(h)}" y1="10" y2="${Ht - 30}" stroke="#bbb"/><text x="${X(h) + 3}" y="${Ht - 16}">${WX.fmtDay(g.t0 + h * HOUR)}</text>`;
    }
    for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; svg += `<text x="32" y="${Y(v) + 4}" text-anchor="end">${v.toFixed(MVARS[mdVar][2] && hi - lo < 10 ? 1 : 0)}</text><line x1="36" x2="${Wd - 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="#eee"/>`; }
    if (mdVar === 'cbase') { const e = g.points[mdPoint].ele; svg += `<line x1="36" x2="${Wd - 8}" y1="${Y(e)}" y2="${Y(e)}" stroke="${STATUS_COL.close}" stroke-width="2" stroke-dasharray="6 4"/><text x="${Wd - 10}" y="${Y(e) - 4}" text-anchor="end">This point, ${e} m: cloud base below the line means in cloud</text>`; }
    (LINES[mdVar] || []).forEach(([v, st]) => { if (v >= lo && v <= hi) svg += `<line x1="36" x2="${Wd - 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="${STATUS_COL[st]}" stroke-width="1.5" stroke-dasharray="6 4"/>`; });
    if (band) {
      const top = [], bot = [];
      for (let h = h0; h <= h1; h++) { const a = ensAt(band[0], h), b = ensAt(band[1], h); if (a != null && b != null) { top.push(X(h).toFixed(1) + ',' + Y(b).toFixed(1)); bot.unshift(X(h).toFixed(1) + ',' + Y(a).toFixed(1)); } }
      if (top.length > 1) svg += `<polygon points="${top.concat(bot).join(' ')}" fill="rgba(217,83,30,.16)" stroke="none"/>`;
    }
    ids.forEach((m, i) => {
      if (mdHidden[m]) return;
      let d = '', on = false;
      for (let h = h0; h <= h1; h++) { const v = val(m, h); if (v == null) { on = false; continue; } d += (on ? 'L' : 'M') + X(h).toFixed(1) + ',' + Y(v).toFixed(1); on = true; }
      svg += `<path d="${d}" fill="none" stroke="${MCOL[i % MCOL.length]}" stroke-width="1.4" opacity=".85"/>`;
    });
    let dm = '', on = false;
    med.forEach((v, k) => { if (v == null) { on = false; return; } dm += (on ? 'L' : 'M') + X(h0 + k).toFixed(1) + ',' + Y(v).toFixed(1); on = true; });
    svg += `<path d="${dm}" fill="none" stroke="#111" stroke-width="3"/>`;
    if (mdT == null || hourIdx(g, mdT) < h0 || hourIdx(g, mdT) > h1) mdT = g.t0 + Math.max(h0, Math.min(h1, hourIdx(g, nowS()))) * HOUR;
    const hs = hourIdx(g, mdT);
    svg += `<line x1="${X(hs)}" x2="${X(hs)}" y1="10" y2="${Ht - 30}" stroke="#d9531e" stroke-width="2"/>`;
    $('wxChart').innerHTML = `<svg id="wxMsvg" class="wx-models" viewBox="0 0 ${Wd} ${Ht}">${svg}<rect id="wxMhit" x="36" y="10" width="${Wd - 44}" height="${Ht - 40}" fill="transparent"/></svg>
      <div class="wx-legend">${ids.map((m, i) => `<button data-m="${m}" class="${mdHidden[m] ? 'off' : ''}"><i style="background:${MCOL[i % MCOL.length]}"></i>${esc(WX.modelName(m))}</button>`).join('')}<span><i style="background:#111"></i>Consensus</span>${band && ej >= 0 ? '<span><i style="background:rgba(217,83,30,.35)"></i>Ensemble range (80% of 82 forecasts)</span>' : ''}</div>`;
    $('wxChart').querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { mdHidden[b.dataset.m] = !mdHidden[b.dataset.m]; drawModels(g, f); }));
    $('wxMhit').addEventListener('click', e => {
      const svgEl = $('wxMsvg'), r = svgEl.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * Wd;
      mdT = g.t0 + Math.round(h0 + (x - 36) / (Wd - 44) * (h1 - h0)) * HOUR;
      drawModels(g, f); colourMap(mdT);
    });
    // Table at the chosen hour.
    const unit = MVARS[mdVar][1], dp = MVARS[mdVar][2];
    const rows = ids.map((m, i) => { const v = val(m, hs), c = f.models[m].code && f.models[m].code[hs]; return { m, i, v, c }; });
    const vals = rows.map(r => r.v).filter(v => v != null);
    $('wxMtab').innerHTML = `<h3 class="wx-h3">${WX.fmtTime(mdT)} at km ${g.points[mdPoint].km}${g.points[mdPoint].name ? ' ' + esc(g.points[mdPoint].name) : ''}</h3>
      <table class="wx-mt"><thead><tr><th>Model</th><th>${MVARS[mdVar][0]}</th><th>Sky</th></tr></thead><tbody>${rows.map(r =>
        `<tr><td><i style="background:${MCOL[r.i % MCOL.length]}"></i>${esc(WX.modelName(r.m))}</td><td>${r.v == null ? '<span class="muted">n/a</span>' : r.v.toFixed(dp) + ' ' + unit}</td><td>${esc(WX.codeText(r.c))}</td></tr>`).join('')}
      <tr class="med"><td>Consensus</td><td>${vals.length ? WX.median(vals).toFixed(dp) + ' ' + unit : 'n/a'}</td><td></td></tr></tbody></table>
      <p class="wx-note">${vals.length > 1 ? `The models range from ${Math.min(...vals).toFixed(dp)} to ${Math.max(...vals).toFixed(dp)} ${unit}: ${spreadWord(mdVar, Math.max(...vals) - Math.min(...vals))}.` : ''} Short range models (UK Met Office, Météo-France, ICON) drop out after a few days. Tap the chart to choose a time.${mdVar === 'cbase' ? ' A line along the top means no cloud below about 1,500 m in that model.' : ''}</p>`;
  }
  function spreadWord(k, s) {
    const lim = { t: [2, 5], at: [2, 5], g: [10, 25], w: [8, 20], p: [0.5, 2], cc: [25, 60], cape: [200, 600], rh: [10, 25] }[k] || [1, 2];
    return s <= lim[0] ? 'good agreement' : s <= lim[1] ? 'some disagreement' : 'big disagreement, so low confidence';
  }

  // ---------- map ----------
  function buildMap() {
    if (!window.L) { $('wxMap').innerHTML = '<p class="map-off">Map unavailable without signal.</p>'; return; }
    map = L.map('wxMap', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenStreetMap' }).addTo(map);
    L.polyline(G.route.map(p => [p[0], p[1]]), { color: '#555', weight: 7, opacity: .35 }).addTo(map);
    runMarks.fast = L.marker([0, 0], { zIndexOffset: 1000, icon: L.divIcon({ className: '', html: '<div class="wx-rm">F</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).bindTooltip('Fastest');
    runMarks.slow = L.marker([0, 0], { zIndexOffset: 1000, icon: L.divIcon({ className: '', html: '<div class="wx-rm slow">S</div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).bindTooltip('Slowest');
    trigLayer = L.layerGroup().addTo(map);
    liveLayer = L.layerGroup().addTo(map);
    addRadar();
    drawLive();
    map.on('click', e => {
      const s = G.snap(e.latlng.lat, e.latlng.lng);
      if (s.offM > 2000) return;
      const km = Math.round(G.route[s.ic][2] * 10) / 10;
      if (view === 'models' && grid) { mdPoint = nearestPoint(grid, km); renderModels(); return; }
      if (view !== 'timeline') { sel = { km, t: sel ? sel.t : nowS() }; setView('timeline'); return; }
      select(km, sel ? sel.t : nowS());
    });
    fitMap();
  }

  // Live layer: BOM weather stations and VicEmergency incidents, on every view.
  let liveLayer = null;
  function drawLive() {
    if (!liveLayer) return;
    liveLayer.clearLayers();
    if (latest && latest.incidents && latest.incidents.items) latest.incidents.items.forEach(it => {
      const c = INC_COL[it.kind];
      if (it.poly && it.poly.length > 2) L.polygon(it.poly, { color: c, weight: 2, fillOpacity: .25 }).addTo(liveLayer);
      L.circleMarker([it.lat, it.lon], { radius: 7, color: '#fff', weight: 2, fillColor: c, fillOpacity: 1 })
        .bindTooltip(`<b>${esc(it.title || it.name)}</b><br>${esc(it.location || '')}<br>${it.dist} km from the course${it.status ? '<br>' + esc(it.status) : ''}`).addTo(liveLayer);
    });
    if (obs && obs.stations) Object.values(obs.stations).forEach(s => {
      const r = s.series[s.series.length - 1];
      const label = (r.temp != null ? Math.round(r.temp) + '°' : '') + (r.gust != null ? ' ' + Math.round(r.gust) : '');
      L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: `<div class="wx-obs-mark">${label}</div>`, iconSize: null, iconAnchor: [14, 10] }) })
        .bindTooltip(`<b>${esc(s.name)}</b> (BOM), ${WX.fmtTime(r.t, false)}<br>${r.temp != null ? r.temp + '°C, feels ' + r.at + '°C' : ''}<br>Wind ${r.wind ?? '-'} km/h, gusts ${r.gust ?? '-'} km/h ${esc(r.dir || '')}<br>Rain since 9 am ${r.rain ?? '-'} mm`).addTo(liveLayer);
    });
  }
  // Rain radar (RainViewer): the last hour, looping.
  let radarOn = false, radarLayers = [], radarTimer = null, radarCtl = null;
  function addRadar() {
    const Ctl = L.Control.extend({
      onAdd() {
        const d = L.DomUtil.create('div', 'wx-radar-ctl');
        d.innerHTML = '<button type="button">Radar</button><span></span>';
        L.DomEvent.disableClickPropagation(d);
        d.querySelector('button').addEventListener('click', () => radarOn ? radarStop() : radarStart());
        return d;
      }
    });
    radarCtl = new Ctl({ position: 'topright' }).addTo(map);
  }
  async function radarStart() {
    const ctl = radarCtl.getContainer(), lab = ctl.querySelector('span');
    radarOn = true; ctl.classList.add('on'); lab.textContent = 'Loading…';
    try {
      const j = await (await fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-cache' })).json();
      const frames = j.radar.past.slice(-7);
      radarLayers = frames.map(f => ({ t: f.time, layer: L.tileLayer(j.host + f.path + '/256/{z}/{x}/{y}/2/1_1.png', { opacity: 0, maxNativeZoom: 7, maxZoom: 17, zIndex: 300, attribution: 'Radar <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>' }).addTo(map) }));
      let i = 0;
      const show = () => {
        if (!radarOn) return;
        radarLayers.forEach((r, k) => r.layer.setOpacity(k === i ? 0.65 : 0));
        lab.textContent = WX.fmtTime(radarLayers[i].t, false);
        i = (i + 1) % radarLayers.length;
      };
      show();
      radarTimer = setInterval(show, 700);
    } catch (e) { lab.textContent = 'Radar unavailable'; radarOn = false; ctl.classList.remove('on'); }
  }
  function radarStop() {
    radarOn = false; clearInterval(radarTimer); radarTimer = null;
    radarLayers.forEach(r => r.layer.remove()); radarLayers = [];
    const ctl = radarCtl.getContainer(); ctl.classList.remove('on'); ctl.querySelector('span').textContent = '';
  }
  function fitMap() {
    if (!map || !$('wxMap').offsetWidth) return;
    map.invalidateSize();
    if (!fitted) { map.fitBounds(L.latLngBounds(G.route.map(p => [p[0], p[1]])).pad(0.04)); fitted = true; }
  }
  function ensureSegs(g) {
    if (!map || (segs.length && segs._pts === g.points)) return;
    segs.forEach(s => s.remove());
    segs = g.points.map((p, i) => {
      const a = i ? (g.points[i - 1].km + p.km) / 2 : 0, b = i < g.points.length - 1 ? (p.km + g.points[i + 1].km) / 2 : TOTAL;
      const pts = G.route.filter(r => r[2] >= a - 0.05 && r[2] <= b + 0.05).map(r => [r[0], r[1]]);
      return L.polyline(pts, { weight: 6, opacity: .95, color: '#999' }).addTo(map);
    });
    segs._pts = g.points;
  }
  let mapKey = null;
  function colourMap(t) {
    if (!map || !ds) return;
    const g = view === 'models' ? grid : ds.grid; if (!g) return;
    ensureSegs(g);
    const k = view === 'timeline' ? tlVar : view === 'models' ? 'status' : mapVar, h = hourIdx(g, t);
    segs.forEach((s, p) => {
      const v = h < 0 || h >= g.n ? null : k === 'status' ? WX.cellStatus(g, h, p, T).status : g.cons[k] ? g.cons[k][h][p] : null;
      s.setStyle({ color: k === 'status' && v === 'ok' ? '#3c9a5f' : VARS[k].col(v) });
      const pt = g.points[p], c = h >= 0 && h < g.n && g.cons.t[h][p] != null;
      s.bindTooltip(`<b>km ${pt.km}${pt.name ? ' ' + esc(pt.name) : ''}</b> (${pt.ele} m)<br>` + (c ? `${g.cons.t[h][p]}°C, feels ${g.cons.at[h][p]}°C<br>Gusts ${g.cons.g[h][p]} km/h, rain ${g.cons.p[h][p]} mm/h` : 'No forecast'), { sticky: true });
    });
    if (view !== 'sim') { runMarks.fast.remove(); runMarks.slow.remove(); }
    trigLayer.clearLayers();
    if (mapKey) mapKey.remove();
    mapKey = L.control({ position: 'bottomleft' });
    mapKey.onAdd = () => { const d = L.DomUtil.create('div', 'map-legend'); d.innerHTML = `<b>${VARS[k].label}</b>, ${WX.fmtTime(t)}<br>` + (VARS[k].key || []).map(([l, c]) => c === STATUS_COL.ok ? ['Clear', '#3c9a5f'] : [l, c]).map(([l, c]) => `<i style="background:${c}"></i>${esc(l)}`).join('<br>'); return d; };
    mapKey.addTo(map);
  }
  function drawMapTriggers() {
    if (!map) return;
    segs.forEach(s => s.setStyle({ color: '#999' }));
    runMarks.fast.remove(); runMarks.slow.remove();
    if (selMark) { selMark.remove(); selMark = null; }
    trigLayer.clearLayers();
    if (mapKey) { mapKey.remove(); mapKey = null; }
    const s = latest.triggers[trigScope];
    WX.ORDER.forEach(k => {
      const r = s.triggers[k];
      if (!(r.status === 'met' || r.status === 'close') || !r.worst || r.worst.km == null) return;
      const p = G.route[G.idxAtKm(r.worst.km)];
      L.marker([p[0], p[1]], { icon: L.divIcon({ className: '', html: `<div class="wx-tm st-${r.status}">${esc(r.label)}</div>`, iconSize: null, iconAnchor: [0, 10] }) })
        .bindTooltip(`${esc(r.text || '')}<br>km ${r.worst.km}, ${WX.fmtTime(r.worst.at)}`).addTo(trigLayer);
    });
  }
  function markSel(km) {
    if (!map) return;
    const p = G.route[G.idxAtKm(km)];
    if (!selMark) selMark = L.circleMarker([p[0], p[1]], { radius: 9, color: '#d9531e', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(map);
    else selMark.setLatLng([p[0], p[1]]).addTo(map);
  }

  // ---------- start ----------
  // ---------- Refresh now (through the refresh relay, which holds the GitHub key) ----------
  let refreshing = false;
  async function relay(path, opts) {
    const r = await fetch(W.refreshUrl.replace(/\/$/, '') + path, Object.assign({ cache: 'no-store' }, opts));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  }
  function refreshMenu() {
    const box = $('wxRefreshMsg');
    if (refreshing) return;
    box.innerHTML = '<button class="lnk" data-m="0" type="button">Quick (1 to 2 min)</button> · <button class="lnk" data-m="1" type="button">Full, with new forecast models (2 to 4 min)</button>';
    box.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => doRefresh(b.dataset.m === '1')));
  }
  async function doRefresh(models) {
    const box = $('wxRefreshMsg'), btn = $('wxRefresh');
    const say = t => { if ($('wxRefreshMsg')) $('wxRefreshMsg').textContent = t; };
    refreshing = true; btn.disabled = true;
    const before = latest && latest.updated;
    try {
      say('Asking for fresh weather…');
      const r = await relay('/refresh' + (models ? '?models=1' : ''), { method: 'POST' });
      if (!r.started && r.reason === 'recent') say(`The weather was refreshed ${COOLDOWN_TXT(r)}. Checking for the new data…`);
      else if (!r.started) say('A refresh is already running. Waiting for it…');
      else say(r.full ? 'Fetching fresh weather and forecast models…' : models ? 'Fetching fresh weather (models were updated recently)…' : 'Fetching fresh weather…');
      // Wait for the run to finish, then for the new data to appear (up to about 6 minutes).
      const t0 = Date.now();
      while (Date.now() - t0 < 6 * 60 * 1000) {
        await new Promise(res => setTimeout(res, 15000));
        await load();
        if (latest && latest.updated !== before) break;
        const s = await relay('/status').catch(() => null);
        if (s && s.last && s.last.status === 'completed' && s.last.conclusion !== 'success' && Date.parse(s.last.updated) > t0) throw new Error('the weather watch failed this time');
        say('Still fetching… ' + Math.round((Date.now() - t0) / 60000 * 10) / 10 + ' min');
      }
      if (latest && latest.updated !== before) {
        if (latest.modelsRun !== (grid && grid.modelsRun)) { grid = null; if (ds && ds.forecast) { ds = null; dsKey = null; } }
        renderView();
        say('Updated just now.');
      } else say('No new data yet. It may take a few more minutes; the tab checks again every 10 minutes.');
    } catch (e) {
      say('Couldn\'t refresh (' + e.message + '). The automatic updates carry on.');
    } finally {
      refreshing = false;
      if ($('wxRefresh')) $('wxRefresh').disabled = false;
    }
  }
  const COOLDOWN_TXT = r => r.last ? WX.fmtTime(Math.floor(Date.parse(r.last.created) / 1000), false).replace(/^/, 'at ') : 'a few minutes ago';

  let refresh = null;
  async function onShow() {
    if (!built) build();
    setTimeout(fitMap, 0);
    if (!latest) { renderView(); await load(); }
    setView(view);
    if (!refresh) refresh = setInterval(async () => {
      const before = latest && latest.updated;
      await load();
      if (latest && latest.updated !== before) {
        if (latest.modelsRun !== (grid && grid.modelsRun)) { grid = null; if (ds && ds.forecast) { ds = null; dsKey = null; } }
        if (view !== 'sim' || !playTimer) renderView();
      } else header();
    }, 10 * 60 * 1000);
  }
  function onHide() { stopPlay(); }
  // Small weather line for a Find result: conditions now at the casualty, the next 3 hours and any BOM warning.
  let nearLoad = null;
  async function nearHTML(lat, lon, ele) {
    try {
      if (!nearLoad) nearLoad = (latest ? Promise.resolve() : load()).then(loadGrid);
      await nearLoad;
    } catch (e) { nearLoad = null; return ''; }
    if (!latest || !grid) return '';
    const s = G.snap(lat, lon);
    if (s.offM > 3000) return '';
    const km = G.route[s.ic][2], t = nowS();
    const c = conditions(grid, km, t);
    if (!c) return '';
    // Adjust temperatures to the casualty's height (the 14k and off course spots differ from the GPT100 course).
    const dz = ele != null ? -0.0065 * (ele - eleAt(km)) : 0;
    let gust = c.g, rain = 0, storm = 0;
    for (let k = 1; k <= 3; k++) {
      const n = conditions(grid, km, t + k * HOUR);
      if (n) { gust = Math.max(gust, n.g); rain += n.p; storm = Math.max(storm, n.storm); }
    }
    const age = (t - latest.updated) / HOUR;
    const warn = latest.warnings && latest.warnings.items ? latest.warnings.items.filter(w => w.relevant) : [];
    const hits = c.status.hits.filter(x => x.status !== 'ok');
    const inc = latest.incidents && latest.incidents.items ? latest.incidents.items.filter(x => x.kind !== 'warning' && G.metres([lat, lon], [x.lat, x.lon]) < 15000) : [];
    return `<div class="wx-near"><b>Weather now:</b> ${(c.t + dz).toFixed(0)}°C, feels ${(c.at + dz).toFixed(0)}°C, gusts ${Math.round(c.g)} km/h, ${esc(WX.codeText(c.code).toLowerCase())}.
      Next 3 hours: ${rain >= 0.2 ? rain.toFixed(1) + ' mm rain' : 'dry'}, gusts to ${Math.round(gust)} km/h${storm ? ', <b>thunderstorm possible</b>' : ''}.
      ${hits.map(x => `<span class="wx-pill st-${x.status}">${WX.LABELS[x.key]}: ${WORD[x.status]}</span>`).join(' ')}
      ${warn.map(w => `<br><a class="wx-near-warn" href="${esc(w.link)}" target="_blank" rel="noopener">BOM: ${esc(w.title)}</a>`).join('')}
      ${inc.map(x => `<br><a class="wx-near-warn" href="https://emergency.vic.gov.au/respond/" target="_blank" rel="noopener">${esc(x.title)} ${(G.metres([lat, lon], [x.lat, x.lon]) / 1000).toFixed(0)} km away${x.location ? ': ' + esc(x.location) : ''}</a>`).join('')}
      ${age > W.staleHours ? `<br><span class="muted">Weather data is ${age.toFixed(0)} hours old.</span>` : ''}
      <a class="lnk" href="index.html#weather">Weather tab</a></div>`;
  }
  // For the Race Control board: the latest triggers, loading them if this tab hasn't yet.
  async function peek() { if (!latest || nowS() - latest.updated > 15 * 60) await load(); return latest; }
  window.WeatherTab = { onShow, onHide, nearHTML, peek, valueAt: (km, t) => grid && conditions(grid, km, t || nowS()), loadGrid: () => load().then(loadGrid) };
})();
