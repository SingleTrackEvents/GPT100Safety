// GPT100 Runner: the Track tab, for crews, family and friends. Follow runners live, from the GPS trackers and the
// timing chips (js/tracking.js and js/timing.js, the same feeds the staff apps use): where each one is now, their
// time at every checkpoint so far, when they're expected at the ones to come, and the live order of each race,
// with a link to the timing team's official results (config.tracking.results).
// Followed runners are kept on the phone, shown on the Map tab, and can be shared as a link (runner.html#bib=1047).
// The Map tab also shows everyone racing, as dots coloured by race, with Follow in each one's popup.
// The last cards are saved, so with no signal the tab still shows where they were and when.
(function () {
  const $ = id => document.getElementById(id);
  if (!$('tkCards')) return;
  const C = window.GPT100_CONFIG || {}, T = C.tracking || {}, RS = window.GPTRaces, R = RS.R;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const one = x => (Math.round(x * 10) / 10).toFixed(1);
  const store = { get(k, d) { try { const v = localStorage.getItem('rn.' + k), p = v == null ? null : JSON.parse(v); return p == null || (d && typeof d === 'object' && typeof p !== 'object') ? d : p; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('rn.' + k, JSON.stringify(v)); } catch (e) { } } };
  const TR = () => window.GPTTracking || null;
  const live = () => !!(TR() && TR().ready());
  // Every runner once (by bib: a runner the chips knew before the trackers loaded can have an older entry too).
  const everyone = () => TR() ? [...TR().state.byBib.values()] : [];
  const { when, hm, toRace, prepare, timeAt, livePace } = RS;
  const at = t => when(new Date(t));
  const clock = t => hm.format(new Date(t));
  // Elapsed race time as h:mm.
  const hmm = ms => { const m = Math.max(0, Math.round(ms / 60000)); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
  const ago = ms => ms < 90e3 ? 'just now' : ms < 3600e3 ? Math.round(ms / 60e3) + ' min ago' : ms < 48 * 3600e3 ? (ms / 3600e3).toFixed(1) + ' h ago' : Math.round(ms / 864e5) + ' days ago';

  // The timing feed's race (js/timing.js keyOf) to the stage in data/races.js with its points, km and cut-offs.
  const STAGE_OF = { miler: 'miler', '50k': 's1', s1: 's1', s2: 's2', s3: 's3', s4: 's4', '33k': 's4', '14k': '14k', '6k': '6k' };
  const ORDER = ['miler', '50k', 's1', 's2', 's3', 's4', '33k', '14k', '6k'];
  const LABEL = { miler: 'GPT100 Miler', '50k': 'GPT50k', s1: 'Stage race, Stage 1', s2: 'Stage race, Stage 2', s3: 'Stage race, Stage 3', s4: 'Stage race, Stage 4', '33k': 'GPT33k', '14k': 'GPT14k', '6k': 'GPT6k' };
  function stageFor(key) {
    const id = STAGE_OF[key], race = id && R.races.find(r => r.stages.includes(id));
    return race ? prepare(R.stages[id], race.course) : null;
  }
  // The runner app's race picked at the top, as a timing feed race (for the Results list to open on).
  const myKey = () => { const r = window.GPTRunner && GPTRunner.race(), s = window.GPTRunner && GPTRunner.stage(); return !r ? 'miler' : r.id === 'stage' ? (s ? s.id : 's1') : r.id; };

  // ---------- one runner, from both feeds ----------
  const info = bib => { const tr = TR(); return infoOf(tr && tr.byBib(bib)); };
  function infoOf(r) {
    if (!r) return null;
    // A tracker the chips don't know: its GPS event's race, when the event carries just one (config tracking.gpsRaces).
    const F = !r.chip && r.feed && T.gpsRaces && T.gpsRaces[r.feed], only = Array.isArray(F) && F.length === 1 && STAGE_OF[F[0]] ? F[0] : '';
    const c = r.chip || null, key = c ? c.raceKey : only, S = key ? stageFor(key) : null;
    const name = c ? (c.person || c.name.replace(/\s*\([^)]*\)$/, '')) : r.name || '';
    return { r, c, key, S, bib: r.bib, name, gender: c ? c.gender : '', label: key ? LABEL[key] || (c ? c.raceLabel : '') : '' };
  }
  const raceKm = (o, km) => o.S ? Math.max(0, toRace(o.S, km)) : km;
  const lenOf = o => o.S ? o.S.points[o.S.points.length - 1].km : o.c ? o.c.finishKm - o.c.startKm : null;
  // When the runner started: their Start read, else the gun.
  function startT(o) {
    const st = o.c && o.c.reads.find(x => /^start/i.test(x.name));
    return st ? st.t : o.S ? o.S.points[0].ft.getTime() : null;
  }
  const finishRead = o => o.c && o.c.status === 'finished' ? o.c.reads[o.c.reads.length - 1] : null;
  const DONE = { finished: 'Finished', dnf: 'Withdrew', dns: 'Did not start', dsq: 'Disqualified', 'cut off': 'Missed a cut-off' };
  function state(o) {
    const p = o.r.pos, now = Date.now(), st = o.c && o.c.status;
    if (st) return { k: st === 'finished' ? 'fin' : 'out', text: DONE[st] || st };
    if (!p) return { k: 'pre', text: o.S && now < o.S.points[0].ft.getTime() ? 'Not started yet' : 'No position yet' };
    return { k: 'on', text: 'On course' };
  }
  // How the position was worked out, in plain words.
  function source(p) {
    let s = p.src === 'chip' ? `Timing chip at ${esc(p.chipAt.name)}, ${clock(p.chipAt.t)} (${ago(p.ageMs)})` : `GPS tracker, ${ago(p.ageMs)}`;
    if (p.src === 'gps' && p.offM > 150) s += `, ${p.offM >= 950 ? one(p.offM / 1000) + ' km' : Math.round(p.offM / 10) * 10 + ' m'} off the course`;
    return s;
  }
  // Expected times at the points to come, at the pace they've run so far (js/races.js, as on the Aid tab).
  function etas(o) {
    const p = o.r.pos, S = o.S;
    if (!p || !S || o.c && o.c.status) return null;
    const rk = raceKm(o, p.km), L = livePace(S, rk, p.t);
    if (L && !L.early && !L.behind) return { p: L.p, at: k => timeAt(S, k.km, L.p) };
    // Too early to tell their pace: only the next timing point, from the tracking's own estimate.
    if (p.next) return { p: null, at: k => Math.abs(k.gk - p.next.km) < 0.3 ? p.next.due : null };
    return null;
  }
  // The reads at a race point: arrival, and leaving where the aid station has an Out mat.
  function readsAt(o, k) {
    if (!o.c) return {};
    const rs = o.c.reads.filter(x => Math.abs(x.km - k.gk) < 0.4);
    return { in: rs.find(x => !/\(out\)$/.test(x.name)) || null, out: rs.find(x => /\(out\)$/.test(x.name)) || null };
  }

  // ---------- following ----------
  let follow = store.get('follow', []).map(String);
  const isOn = bib => follow.includes(String(bib));
  function toggle(bib) {
    bib = String(bib);
    follow = isOn(bib) ? follow.filter(b => b !== bib) : follow.concat(bib);
    store.set('follow', follow);
    draw();
  }
  let open = store.get('trackOpen', {});

  // ---------- the cards ----------
  function card(o) {
    const p = o.r.pos, s = state(o), S = o.S, now = Date.now(), len = lenOf(o), t0 = startT(o), E = etas(o), fr = finishRead(o);
    let h = `<div class="tk-head"><div><p class="tk-name">${esc(o.name || 'Bib ' + o.bib)}</p><p class="tk-sub">Bib ${esc(o.bib)}${o.label ? ' · ' + esc(o.label) : ''}</p></div><span class="tk-pill ${s.k}">${esc(s.text)}</span></div>`;
    if (fr && t0) h += `<p class="tk-big">${hmm(fr.t - t0)}</p><p class="tk-line">Crossed the finish ${at(fr.t)}.</p>`;
    else if (s.k === 'out') h += `<p class="tk-line">${p && p.chipAt ? `Last read at ${esc(p.chipAt.name)}, ${at(p.chipAt.t)}.` : ''}</p>`;
    else if (p) {
      const km = TR().cur(o.r), rk = raceKm(o, km);
      h += `<p class="tk-big">km ${one(rk)}${len ? `<small> of ${one(len)}</small>` : ''}</p>`;
      if (p.est) h += `<p class="tk-line">${p.est.capped ? `Somewhere between km ${one(raceKm(o, p.est.fromKm))} and ${esc(p.est.to)}, at their pace` : 'Likely about here now, at their pace'}.</p>`;
      h += `<p class="tk-src">Last fix: ${source(p)}</p>`;
      if (t0 && now > t0) h += `<p class="tk-line">Running for ${hmm(now - t0)}.</p>`;
      // Next point and the finish.
      if (S && E) {
        const P = S.points, nx = P.find(k => k.gk > km + 0.1), fin = P[P.length - 1];
        const tn = nx && E.at(nx), tf = E.p != null ? E.at(fin) : null;
        if (nx && tn) h += `<p class="tk-line">Next: <b>${esc(nx.name)}</b> (km ${one(nx.km)}), expected about <b>${at(tn)}</b>.</p>`;
        if (tf && nx !== fin) h += `<p class="tk-line">Finish about <b>${at(tf)}</b>, a time of about ${hmm(tf - t0)}.</p>`;
      }
    } else if (S) h += `<p class="tk-line">Starts ${at(S.points[0].ft)} at ${esc(S.points[0].name)}.</p>`;
    // Splits: every aid station and timing point, with the time they reached it, or when they're expected.
    if (S) {
      const op = !!open[o.bib], P = S.points;
      h += `<button type="button" class="fd-linkbtn tk-more" data-open="${esc(o.bib)}" aria-expanded="${op}">${op ? 'Hide splits' : 'Splits and cut-offs'}</button>`;
      if (op) {
        let last = t0, rows = '';
        P.forEach((k, i) => {
          const rd = i === 0 ? { in: t0 ? { t: t0 } : null } : readsAt(o, k), a = rd.in || rd.out;
          let time = '', sub = '';
          if (a) {
            time = `<b>${clock(a.t)}</b>`;
            sub = i && t0 ? `${hmm(a.t - t0)}${last && i > 1 ? ` · leg ${hmm(a.t - last)}` : ''}` : '';
            if (rd.out && rd.in) sub += `${sub ? ' · ' : ''}left ${clock(rd.out.t)}`;
            last = (rd.out || a).t;
          } else if (E && !(o.c && o.c.status)) {
            const t = E.at(k);
            if (t && t > now - 30 * 60e3) time = `<span class="tk-exp">about ${clock(t)}</span>`;
          }
          const cut = k.ct && i && !k.noCut ? clock(k.ct) : '';
          rows += `<tr class="${a ? 'done' : ''}"><td>${esc(k.name)}<small>km ${one(k.km)}</small></td><td>${time || '<span class="muted">–</span>'}${sub ? `<small>${sub}</small>` : ''}</td><td>${cut}</td></tr>`;
        });
        h += `<table class="tk-splits"><thead><tr><th>Checkpoint</th><th>Time</th><th>Cut-off</th></tr></thead><tbody>${rows}</tbody></table>
          <p class="fd-hint">Times are from the timing chips, as they come in. Points without a timing mat show their expected time only. Expected times are a guide, from the pace they've run so far.</p>`;
      }
    }
    h += `<div class="tk-btns">${p && !(o.c && o.c.status === 'dns') ? `<button type="button" class="btn small" data-map="${esc(o.bib)}">Show on map</button>` : ''}<button type="button" class="btn small" data-share="${esc(o.bib)}">Share</button><button type="button" class="btn small tk-off" data-follow="${esc(o.bib)}">Unfollow</button></div>`;
    return `<section class="fd-card tk-card" data-bib="${esc(o.bib)}">${h}</section>`;
  }

  // ---------- search ----------
  function hits(q) {
    q = q.trim().toLowerCase().replace(/^#|^bib\s*/, '');
    if (!q || !TR()) return [];
    const all = everyone().filter(r => r.bib);
    const num = /^\d+$/.test(q);
    return all.filter(r => num ? r.bib.startsWith(q) : (r.name || '').toLowerCase().includes(q))
      .sort((a, b) => num ? (a.bib === q ? -1 : b.bib === q ? 1 : a.bib.length - b.bib.length || +a.bib - +b.bib) : (a.name || '').localeCompare(b.name || ''))
      .slice(0, 8).map(r => info(r.bib)).filter(Boolean);
  }
  function drawHits() {
    const q = $('tkFind').value, hs = hits(q);
    $('tkHits').innerHTML = !q.trim() ? '' : hs.length ? hs.map(o => `<div class="tk-hit"><span><b>${esc(o.bib)}</b> ${esc(o.name)}<small>${esc(o.label || '')}${o.label ? ' · ' : ''}${esc(state(o).text)}</small></span>${star(o.bib)}</div>`).join('')
      : `<p class="muted">${live() ? 'No runner with that bib or name.' : 'The runner list loads once live tracking is on.'}</p>`;
  }
  const star = bib => `<button type="button" class="btn small${isOn(bib) ? ' tk-off' : ''}" data-follow="${esc(bib)}">${isOn(bib) ? 'Following' : 'Follow'}</button>`;
  $('tkFind').addEventListener('input', drawHits);

  // ---------- results: the live order of a race ----------
  let gFilter = '', raceSel = null, showAll = false;
  const TOP = 25;
  function order(key) {
    const tr = TR(); if (!tr) return [];
    const rs = everyone().filter(r => r.chip && r.chip.raceKey === key).map(r => info(r.bib)).filter(o => o && (!gFilter || o.gender === gFilter));
    const rank = o => { const st = o.c.status; return st === 'finished' ? 0 : !st && o.r.pos ? 1 : !st ? 2 : st === 'dns' ? 4 : 3; };
    return rs.sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 0) return (finishRead(a).t - startT(a)) - (finishRead(b).t - startT(b));
      if (ra === 1) { const ka = tr.cur(a.r), kb = tr.cur(b.r); return Math.abs(kb - ka) > 0.05 ? kb - ka : (a.c.last ? a.c.last.t : 9e15) - (b.c.last ? b.c.last.t : 9e15); }
      return +a.bib - +b.bib;
    });
  }
  function drawOrder() {
    const tr = TR(), keys = tr ? ORDER.filter(k => everyone().some(r => r.chip && r.chip.raceKey === k)) : [];
    const sel = $('tkRace');
    if (!keys.length) { sel.hidden = true; document.querySelector('.tk-filter').hidden = true; $('tkOrder').innerHTML = `<p class="muted">${live() ? 'No timing results yet.' : 'The live order shows here once the timing chips are on, on race day.'}</p>`; return; }
    sel.hidden = false;
    const want = raceSel && keys.includes(raceSel) ? raceSel : keys.includes(myKey()) ? myKey() : keys[0];
    if (sel.dataset.keys !== keys.join()) { sel.innerHTML = keys.map(k => `<option value="${k}">${esc(LABEL[k] || k)}</option>`).join(''); sel.dataset.keys = keys.join(); }
    sel.value = want;
    const all = order(want), gend = everyone().some(r => r.chip && r.chip.gender);
    document.querySelector('.tk-filter').hidden = !gend;
    let n = 0;
    const rows = all.map(o => {
      const st = o.c.status, fr = finishRead(o), t0 = startT(o), p = o.r.pos;
      let place = '', right = '', mid = '';
      if (st === 'finished') { place = ++n; right = `<b>${t0 ? hmm(fr.t - t0) : clock(fr.t)}</b>`; mid = 'Finished'; }
      else if (!st && p) { place = ++n; const rk = raceKm(o, tr.cur(o.r)); right = `km ${one(rk)}`; mid = o.c.last ? `${esc(o.c.last.name)} ${clock(o.c.last.t)}` : p.src === 'gps' ? 'GPS' : ''; }
      else { right = `<span class="muted">${esc(st ? DONE[st] || st : 'Not started')}</span>`; mid = st && o.c.last ? `Last read ${esc(o.c.last.name)}` : ''; }
      return `<div class="tk-row${isOn(o.bib) ? ' on' : ''}"><span class="tk-pl">${place}</span><button type="button" class="tk-who" data-pick="${esc(o.bib)}"><b>${esc(o.name)}</b><small>Bib ${esc(o.bib)}${mid ? ' · ' + mid : ''}</small></button><span class="tk-r">${right}</span></div>`;
    });
    // The top of the field, plus anyone followed further down; Show all for the rest.
    const shown = showAll ? rows : rows.filter((x, i) => i < TOP || isOn(all[i].bib));
    const by = T.credit && T.credit.name ? ` Timing by ${T.credit.url ? `<a href="${esc(T.credit.url)}" target="_blank" rel="noopener">${esc(T.credit.name)}</a>` : esc(T.credit.name)}.` : '';
    $('tkOrder').innerHTML = `<p class="fd-hint">Live order from the timing chips: finishers by time, then runners on course by how far along they are. Tap a name to follow them.${by}</p>` + shown.join('') +
      (rows.length > shown.length ? `<button type="button" class="btn small tk-all" data-all="1">Show all ${rows.length}</button>` : showAll && rows.length > TOP ? `<button type="button" class="btn small tk-all" data-all="0">Show the top ${TOP}</button>` : '');
  }
  $('tkRace').addEventListener('change', () => { raceSel = $('tkRace').value; showAll = false; drawOrder(); });
  document.querySelectorAll('.tk-filter button').forEach(b => b.addEventListener('click', () => {
    gFilter = b.dataset.g; document.querySelectorAll('.tk-filter button').forEach(x => x.classList.toggle('on', x === b)); drawOrder();
  }));

  // ---------- the whole tab ----------
  function drawStatus() {
    const tr = TR(), credit = T.credit && T.credit.name ? ` Timing and tracking by ${T.credit.url ? `<a href="${esc(T.credit.url)}" target="_blank" rel="noopener">${esc(T.credit.name)}</a>` : esc(T.credit.name)}.` : '';
    let s;
    if (!tr) s = 'Live tracking starts on race day. Search for a runner by bib or name here once it\'s on.';
    else if (!tr.ready()) s = navigator.onLine ? 'Loading live tracking…' : 'No signal: showing what was saved last.';
    else { const S = tr.state; s = `Live from the GPS trackers and timing chips${S.updated ? `, updated ${ago(Date.now() - S.updated)}` : ''}.${navigator.onLine ? '' : ' No signal right now.'}`; }
    $('tkStatus').innerHTML = s + credit;
    $('tkOfficial').innerHTML = (T.results ? `<a class="btn" href="${esc(T.results)}" target="_blank" rel="noopener">Official results</a> ` : '') +
      (T.url ? `<a class="btn" href="${esc(T.url)}" target="_blank" rel="noopener">${esc(T.label || 'Live tracking')}</a>` : '') +
      (T.results ? '<span class="fd-hint tk-offnote">The official results are the timing team\'s. The order below is live and may change.</span>' : '');
    $('tkOfficial').hidden = !T.results && !T.url;
  }
  function drawCards() {
    const saved = store.get('trackSaved', {});
    if (!follow.length) { $('tkCards').innerHTML = '<section class="fd-card"><p class="muted">Follow runners to see where they are, their time at each checkpoint and when they\'re expected next. Search above, or tap a name in the results.</p></section>'; return; }
    const out = [];
    let changed = false;
    follow.forEach(bib => {
      const o = live() ? info(bib) : null;
      if (o) { const html = card(o); out.push(html); saved[bib] = { t: Date.now(), html }; changed = true; }
      else if (saved[bib]) out.push(saved[bib].html.replace('<div class="tk-head">', `<p class="tk-saved">Saved ${at(saved[bib].t)}: no live update since.</p><div class="tk-head">`));
      else out.push(`<section class="fd-card tk-card"><div class="tk-head"><div><p class="tk-name">Bib ${esc(bib)}</p><p class="tk-sub">${live() ? 'Not in the tracking or timing lists.' : 'Waiting for live tracking.'}</p></div></div><div class="tk-btns"><button type="button" class="btn small tk-off" data-follow="${esc(bib)}">Unfollow</button></div></section>`);
    });
    Object.keys(saved).forEach(b => { if (!isOn(b)) { delete saved[b]; changed = true; } });
    if (changed) store.set('trackSaved', saved);
    $('tkCards').innerHTML = out.join('');
  }
  function draw() {
    drawStatus(); drawCards(); drawHits(); drawOrder(); drawMap();
  }
  const onTab = () => window.GPTRunner && GPTRunner.tab() === 'track' && !document.hidden;

  // One click handler for the whole tab.
  $('tkCards').parentElement.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.follow) toggle(b.dataset.follow);
    else if (b.dataset.pick) { if (!isOn(b.dataset.pick)) toggle(b.dataset.pick); scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (b.dataset.open) { open[b.dataset.open] = !open[b.dataset.open]; store.set('trackOpen', open); drawCards(); }
    else if (b.dataset.map) showOnMap(b.dataset.map);
    else if (b.dataset.all) { showAll = b.dataset.all === '1'; drawOrder(); }
    else if (b.dataset.share) share(b.dataset.share, b);
  });
  function share(bib, b) {
    const o = live() ? info(bib) : null, url = location.origin + location.pathname + '#bib=' + encodeURIComponent(bib);
    const text = `Follow ${o && o.name ? o.name : 'bib ' + bib}${o && o.label ? ' in the ' + o.label : ''} live`;
    if (navigator.share) navigator.share({ title: 'GPT100 live tracking', text, url }).catch(() => { });
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => { b.textContent = 'Link copied'; setTimeout(() => { b.textContent = 'Share'; }, 2500); }, () => prompt('Copy this link', url));
    else prompt('Copy this link', url);
  }

  // ---------- everyone racing on the Map tab ----------
  // Every runner on course, coloured by race, under the followed runners' bib markers: their bib number once zoomed
  // in, a small dot on the whole course. Tap one for their name, race and km, and to follow them. The Everyone button
  // turns them off, the Races button opens the key, and the key hides or shows a race; all remembered on the phone.
  // Only where runners are: the staff apps' flags (not moving, late) aren't shown here.
  const GROUPS = [
    { id: 'miler', label: 'Miler', color: '#1666c9', keys: ['miler'] },
    { id: '50k', label: '50k', color: '#7b3fb0', keys: ['50k'] },
    { id: 'stage', label: 'Stage race', color: '#128c4a', keys: ['s1', 's2', 's3', 's4'] },
    { id: '33k', label: '33k', color: '#c2185b', keys: ['33k'] },
    { id: 'short', label: '14k and 6k', color: '#b87700', keys: ['14k', '6k'] },
    { id: 'other', label: 'Other', color: '#6b6b6b', keys: [] }
  ];
  const groupOf = o => GROUPS.find(g => g.keys.includes(o.key)) || GROUPS[GROUPS.length - 1];
  let everyOn = store.get('everyone', true) !== false, hidden = store.get('everyHide', []);
  let keyOpen = store.get('everyKey', false) === true;  // the race key folds behind its Races button, to keep the map clear
  let everyLayer = null, everyCtl = null, everyZoom = false;
  const BIB_ZOOM = 12;  // from this zoom in, bib numbers instead of dots
  function everyControl(m) {
    everyCtl = L.control({ position: 'bottomleft' });  // the empty corner: zoom and layers are at the top
    everyCtl.onAdd = () => {
      const d = L.DomUtil.create('div', 'tk-every');
      L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
      d.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.every) { everyOn = !everyOn; store.set('everyone', everyOn); }
        else if (b.dataset.keyopen) { keyOpen = !keyOpen; store.set('everyKey', keyOpen); }
        else if (b.dataset.g) { const g = b.dataset.g; hidden = hidden.includes(g) ? hidden.filter(x => x !== g) : hidden.concat(g); store.set('everyHide', hidden); }
        drawMap();
      });
      return d;
    };
    everyCtl.addTo(m);
  }
  // Markers are kept between refreshes and moved in place. Clearing and redrawing them all every few seconds made the
  // map flicker, could break a pinch or drag under way, and reopened any popup, which panned the map back to it.
  // An open popup only pans the map when it opens; after that it follows its runner without moving the map.
  // items: { id, ll, kind (a new marker when it changes), look (restyle(mk) when it changes), make(), restyle, html }.
  function sync(marks, lg, items) {
    const seen = new Set();
    for (const it of items) {
      seen.add(it.id);
      let e = marks.get(it.id);
      if (e && e.kind !== it.kind) { lg.removeLayer(e.mk); marks.delete(it.id); e = null; }
      if (!e) {
        const mk = it.make().bindPopup(it.html, { autoPan: true });
        mk.on('popupopen', ev => { ev.popup.options.autoPan = false; }).on('popupclose', ev => { ev.popup.options.autoPan = true; });
        marks.set(it.id, { mk: mk.addTo(lg), kind: it.kind, look: it.look, html: it.html, ll: it.ll });
        continue;
      }
      if (e.ll[0] !== it.ll[0] || e.ll[1] !== it.ll[1]) { e.mk.setLatLng(it.ll); e.ll = it.ll; }
      if (e.look !== it.look) { it.restyle(e.mk); e.look = it.look; }
      if (e.html !== it.html) { e.mk.setPopupContent(it.html); e.html = it.html; }
    }
    for (const [id, e] of marks) if (!seen.has(id)) { lg.removeLayer(e.mk); marks.delete(id); }
  }
  const everyMarks = new Map(), folMarks = new Map();
  const bibIcon = (bib, c, faint) => L.divIcon({ className: '', html: `<div class="trk-mk tk-ev${faint ? ' est' : ''}" style="--c:${c}">${esc(bib)}</div>`, iconSize: [30, 18], iconAnchor: [15, 9] });
  function drawEveryone(m) {
    if (!everyLayer) {
      // Their own pane: above the course and its aid stations, under the followed runners' bib markers.
      if (!m.getPane('tkEvery')) m.createPane('tkEvery').style.zIndex = 450;
      everyLayer = L.layerGroup().addTo(m);
      everyControl(m);
      m.on('popupclose', () => everyCtl.getContainer().classList.remove('tk-pop'));
      // A popup sits under the map's buttons: the key steps aside while one is open, so its Follow button can be tapped.
      m.on('popupopen', () => everyCtl.getContainer().classList.add('tk-pop'));
      // Swap dots and bib numbers as the map zooms past BIB_ZOOM.
      m.on('zoomend', () => { if ((m.getZoom() >= BIB_ZOOM) !== everyZoom) drawEveryone(m); });
      m.getContainer().addEventListener('click', e => { const b = e.target.closest('button[data-every-follow]'); if (b) { toggle(b.dataset.everyFollow); m.closePopup(); } });
    }
    const box = everyCtl.getContainer();
    if (!live()) { box.hidden = true; sync(everyMarks, everyLayer, []); return; }
    const all = TR().list().map(infoOf).filter(o => o && o.r.pos && !(o.c && o.c.status));
    const n = {}; all.forEach(o => { const g = groupOf(o).id; n[g] = (n[g] || 0) + 1; });
    box.hidden = !all.length;
    // In the bottom corner, so the key opens upwards, above the buttons.
    const key = everyOn && keyOpen ? `<div class="tk-every-key">${GROUPS.filter(g => n[g.id]).map(g => `<button type="button" data-g="${g.id}" class="${hidden.includes(g.id) ? 'off' : ''}" aria-pressed="${!hidden.includes(g.id)}"><i style="background:${g.color}"></i>${esc(g.label)} <small>${n[g.id]}</small></button>`).join('')}</div>` : '';
    const ctl = key + `<div class="tk-every-row"><button type="button" class="tk-every-btn${everyOn ? ' on' : ''}" data-every="1" aria-pressed="${everyOn}">Everyone <small>${all.length}</small></button>` +
      (everyOn ? `<button type="button" class="tk-every-races" data-keyopen="1" aria-expanded="${keyOpen}">${GROUPS.filter(g => n[g.id]).map(g => `<i style="background:${g.color}"></i>`).join('')}Races</button>` : '') + '</div>';
    if (box.dataset.html !== ctl) { box.innerHTML = ctl; box.dataset.html = ctl; }  // only when it changed: a tap mid-redraw is kept
    // Zoomed in, each runner is their bib number in their race's colour; on the whole course, a small dot.
    const bibs = (everyZoom = m.getZoom() >= BIB_ZOOM);
    const shown = everyOn ? all.filter(o => !hidden.includes(groupOf(o).id)) : [];
    const spot = o => o.r.pos.est ? [o.r.pos.est.lat, o.r.pos.est.lon] : [o.r.pos.lat, o.r.pos.lon];
    sync(everyMarks, everyLayer, shown.map(o => {
      const g = groupOf(o), p = o.r.pos, ll = spot(o), km = TR().cur(o.r), faint = !!(p.est || p.stale);
      // Others on the same spot (an aid station, a bunch on the climb), named in the popup as their bibs overlap.
      const near = bibs ? shown.filter(x => x !== o && window.GPT.metres(spot(x), ll) < 40).map(x => x.bib).sort((a, b) => a - b) : [];
      return {
        id: o.r.id, ll, kind: bibs ? 'bib' : 'dot', look: g.color + faint,
        make: () => bibs ? L.marker(ll, { pane: 'tkEvery', icon: bibIcon(o.bib, g.color, faint) })
          : L.circleMarker(ll, { pane: 'tkEvery', radius: 6, weight: 2, color: '#fff', fillColor: g.color, fillOpacity: faint ? 0.45 : 1, bubblingMouseEvents: false }),
        restyle: mk => bibs ? mk.setIcon(bibIcon(o.bib, g.color, faint)) : mk.setStyle({ fillColor: g.color, fillOpacity: faint ? 0.45 : 1 }),
        html: `<b>${esc(o.name || 'Bib ' + o.bib)}</b><br>Bib ${esc(o.bib)}${o.label ? ' · ' + esc(o.label) : ''}<br>km ${one(raceKm(o, km))}${p.est ? ' (likely, at their pace)' : ''}<br><span class="muted">${source(p)}</span>` +
          (near.length ? `<br><span class="muted">Also here: ${near.slice(0, 15).map(b => 'bib ' + esc(b)).join(', ')}${near.length > 15 ? ` and ${near.length - 15} more` : ''}</span>` : '') +
          `<br><button type="button" class="btn small tk-pop-follow" data-every-follow="${esc(o.bib)}">${isOn(o.bib) ? 'Unfollow' : 'Follow'}</button>`
      };
    }));
  }

  // ---------- followed runners on the Map tab ----------
  let layer = null;
  function drawMap() {
    const m = window.GPTRunner && GPTRunner.map();
    if (!m || !window.L) return;
    drawEveryone(m);
    if (!layer) layer = L.layerGroup().addTo(m);
    const items = [];
    if (live()) follow.forEach((bib, k) => {
      const o = info(bib), p = o && o.r.pos;
      if (!p || (o.c && o.c.status && o.c.status !== 'finished')) return;
      const ll = p.est ? [p.est.lat, p.est.lon] : [p.lat, p.lon], km = TR().cur(o.r), cls = `trk-mk tk-mk${p.est ? ' est' : ''}${p.stale ? ' stale' : ''}`;
      const icon = () => L.divIcon({ className: '', html: `<div class="${cls}">${esc(bib)}</div>`, iconSize: [30, 18], iconAnchor: [15, 9 - 20 * (k % 3)] });
      items.push({ id: bib, ll, kind: 'fol', look: cls + (k % 3), make: () => L.marker(ll, { icon: icon(), zIndexOffset: 800 }), restyle: mk => mk.setIcon(icon()),
        html: `<b>${esc(o.name || 'Bib ' + bib)}</b><br>Bib ${esc(bib)}${o.label ? ' · ' + esc(o.label) : ''}<br>${o.c && o.c.status === 'finished' ? 'Finished' : `km ${one(raceKm(o, km))}${p.est ? ' (likely, at their pace)' : ''}`}<br><span class="muted">${source(p)}</span>` });
    });
    sync(folMarks, layer, items);
  }
  function showOnMap(bib) {
    const o = info(bib), p = o && o.r.pos; if (!p) return;
    GPTRunner.setTab('map');
    setTimeout(() => { const m = GPTRunner.map(); if (!m) return; drawMap(); m.setView(p.est ? [p.est.lat, p.est.lon] : [p.lat, p.lon], 14); }, 80);
  }

  // ---------- start ----------
  // runner.html#bib=1047 (a shared link): follow that runner and open on the Track tab.
  function fromHash() {
    const m = /bib=(\d+)/.exec(location.hash);
    if (!m) return false;
    if (!isOn(m[1])) { follow = follow.concat(m[1]); store.set('follow', follow); }
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { }
    if (window.GPTRunner) GPTRunner.setTab('track');
    return true;
  }
  addEventListener('hashchange', () => { if (fromHash()) draw(); });
  fromHash();
  draw();
  const tr = TR();
  if (tr) tr.onUpdate(() => { drawMap(); if (onTab()) { drawStatus(); drawCards(); drawOrder(); if ($('tkFind').value) drawHits(); } });
  document.querySelector('.rn-nav button[data-tab="track"]').addEventListener('click', draw);
  setInterval(() => { if (onTab()) drawStatus(); }, 30e3);
  addEventListener('online', drawStatus); addEventListener('offline', drawStatus);
})();
