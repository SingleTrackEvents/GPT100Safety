// Elevation profile, shared by the field app and the Find tab.
// The whole course, or the section between the aid stations either side of a point (you, or the casualty),
// coloured by steepness, with the aid stations, the point, and the distance and climb to the next aid station.
// Drag along it, or call showLL() from a map tap, to see any point; a dot follows on the map.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const one = x => (Math.round(x * 10) / 10).toFixed(1);
  const short = n => n.replace(/\s*\((start|finish|aid station|water point|checkpoint|emergency aid)\)/ig, '').replace(/ (Carpark|Trailhead|Camp|Rd|Fireline|Track)$/, '');
  // Steepness bands, as on Strava: under 5%, 5 to 10%, 10 to 15%, 15% and over.
  const GRADES = [[5, '#e7e3da', 'Under 5%'], [10, '#f6d77a', '5 to 10%'], [15, '#f0a04b', '10 to 15%'], [Infinity, '#d9473b', '15%+']];
  const gradeCol = g => GRADES.find(b => Math.abs(g) < b[0])[1];
  // Gradient (%) around a km, over a window either side so GPS height wobble doesn't show as cliffs.
  function gradeAt(E, km, h) {
    const a = E.route[E.idxAtKm(Math.max(0, km - h))], b = E.route[E.idxAtKm(km + h)];
    return b[2] - a[2] > 0.01 ? (b[3] - a[3]) / ((b[2] - a[2]) * 10) : 0;
  }

  // o: { el, course, map() → Leaflet map or null, who ('you' or 'the casualty'), colour, empty (text before a point is set) }
  window.GPTProfile = function (o) {
    const root = o.el, who = o.who || 'you', colour = o.colour || '#1666c9';
    root.classList.add('prof');
    root.innerHTML = `<div class="prof-head"><span class="prof-title"></span>
        <span class="prof-seg" role="group" aria-label="Profile"><button type="button" data-p="section" disabled>This section</button><button type="button" data-p="course" class="on">Whole course</button></span></div>
      <div class="prof-svg" aria-label="Elevation profile"></div>
      <p class="prof-legend" aria-label="Steepness">${GRADES.map(g => `<span><i style="background:${g[1]}"></i>${g[2]}</span>`).join('')}</p>
      <p class="prof-info"></p>`;
    const q = s => root.querySelector(s), box = q('.prof-svg'), info = q('.prof-info');
    let base = o.course, viewE = null, here = null, mode = 'course', picked = false, prof = null, hideT = null, mk = null;
    const map = () => (o.map && o.map()) || null;

    function setMode(m) {
      mode = m;
      if (m === 'section') viewE = null;
      root.querySelectorAll('.prof-seg button').forEach(b => { b.classList.toggle('on', b.dataset.p === m); if (b.dataset.p === 'section') b.disabled = !here; });
      draw();
    }
    root.querySelectorAll('.prof-seg button').forEach(b => b.addEventListener('click', () => { picked = true; setMode(b.dataset.p); }));

    function range() {
      const E = viewE || (here ? here.E : base), route = E.route, last = route[route.length - 1][2];
      if (mode !== 'section' || !here || E !== here.E) return { E, k0: 0, k1: last };
      const km = here.km, A = E.AID;
      let a = A[0], b = A[A.length - 1];
      for (let i = 1; i < A.length; i++) if (A[i].trail_km >= km) { a = A[i - 1]; b = A[i]; break; }
      // A short section still gets a useful width.
      let k0 = a.trail_km, k1 = b.trail_km;
      if (k1 - k0 < 3) { const m = (k0 + k1) / 2; k0 = Math.max(0, m - 1.5); k1 = Math.min(last, m + 1.5); }
      return { E, k0, k1, a, b };
    }

    function draw() {
      const R = range(), E = R.E, route = E.route;
      const Wd = Math.max(280, box.clientWidth || 340), Ht = 164, L0 = 34, R0 = 8, T0 = 32, B0 = 18;
      const i0 = E.idxAtKm(R.k0), i1 = E.idxAtKm(R.k1);
      const step = Math.max(1, Math.floor((i1 - i0) / 500));
      const pts = []; for (let i = i0; i <= i1; i += step) pts.push(route[i]); if (pts[pts.length - 1] !== route[i1]) pts.push(route[i1]);
      let lo = Math.min(...pts.map(p => p[3])), hi = Math.max(...pts.map(p => p[3]));
      const pad = Math.max(20, (hi - lo) * 0.12); lo = Math.max(0, lo - pad); hi += pad;
      const X = km => L0 + (Wd - L0 - R0) * (km - R.k0) / (R.k1 - R.k0 || 1), Y = e => T0 + (Ht - T0 - B0) * (1 - (e - lo) / (hi - lo || 1));
      const P = p => X(p[2]).toFixed(1) + ',' + Y(p[3]).toFixed(1), bot = (Ht - B0).toFixed(1);
      // The fill, coloured by steepness over about 120 steps across the width; runs of the same band become one shape.
      const binW = Math.max(0.15, (R.k1 - R.k0) / 120), bins = {};
      const colAt = k => { const b = Math.floor((k - R.k0) / binW); return bins[b] || (bins[b] = gradeCol(gradeAt(E, R.k0 + (b + 0.5) * binW, binW / 2))); };
      let svg = '';
      for (let k = 0; k < pts.length - 1;) {
        const c0 = colAt(pts[k][2]); let j = k + 1;
        while (j < pts.length - 1 && colAt(pts[j][2]) === c0) j++;
        const run = pts.slice(k, j + 1);
        svg += `<path d="M${X(run[0][2]).toFixed(1)},${bot}L${run.map(P).join('L')}L${X(run[run.length - 1][2]).toFixed(1)},${bot}Z" fill="${c0}"/>`;
        k = j;
      }
      svg += `<path d="${pts.map((p, k) => (k ? 'L' : 'M') + P(p)).join('')}" fill="none" stroke="#111" stroke-width="2"/>`;
      // Ahead to the next aid station: the line in blue.
      if (here && here.E === E) {
        const nx = E.AID.find(a => a.trail_km > here.km + 0.05);
        if (nx) {
          const seg = pts.filter(p => p[2] >= here.km && p[2] <= nx.trail_km);
          if (seg.length > 1) svg += `<path d="${seg.map((p, k) => (k ? 'L' : 'M') + P(p)).join('')}" fill="none" stroke="#1666c9" stroke-width="4" stroke-linejoin="round"/>`;
        }
      }
      // Height and km axes.
      [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15].forEach(e => { svg += `<text x="${L0 - 4}" y="${Y(e) + 3}" text-anchor="end">${Math.round(e / 10) * 10}</text><line x1="${L0}" x2="${Wd - R0}" y1="${Y(e)}" y2="${Y(e)}" stroke="#111" stroke-opacity=".12"/>`; });
      const span = R.k1 - R.k0, tick = span > 80 ? 20 : span > 30 ? 10 : span > 12 ? 5 : span > 5 ? 2 : 1;
      for (let k = Math.ceil(R.k0 / tick) * tick; k <= R.k1; k += tick) svg += `<text x="${X(k)}" y="${Ht - 4}" text-anchor="middle">${k}</text>`;
      // Two rows of names; a name that won't fit in either is left off (the line and dot stay).
      const ends = [-1e9, -1e9];
      E.AID.filter(a => a.trail_km >= R.k0 - 0.01 && a.trail_km <= R.k1 + 0.01).forEach(a => {
        const x = X(a.trail_km), name = short(a.name), w = name.length * 6 + 4;
        svg += `<line x1="${x}" x2="${x}" y1="${T0 - 2}" y2="${Ht - B0}" stroke="#111" stroke-width="1" stroke-dasharray="2 3" opacity=".55"/><circle cx="${x}" cy="${Y(route[E.idxAtKm(a.trail_km)][3])}" r="3.5" fill="#111"/>`;
        const anchor = x + w / 2 > Wd - R0 ? 'end' : x - w / 2 < L0 ? 'start' : 'middle';
        const left = anchor === 'end' ? x - w : anchor === 'start' ? x : x - w / 2;
        const row = ends.findIndex(e => left > e);
        if (row < 0) return;
        ends[row] = left + w;
        svg += `<text class="prof-aid" x="${x}" y="${row ? T0 - 6 : T0 - 19}" text-anchor="${anchor}">${esc(name)}</text>`;
      });
      // The point (you, or the casualty).
      if (here && here.E === E && here.km >= R.k0 && here.km <= R.k1) {
        const x = X(here.km), y = Y(here.ele);
        svg += `<line x1="${x}" x2="${x}" y1="${T0}" y2="${Ht - B0}" stroke="${colour}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="6" fill="${colour}" stroke="${colour === '#ffd21f' ? '#111' : '#fff'}" stroke-width="2"/>`;
      }
      svg += `<g class="prof-hover" visibility="hidden"><line x1="0" x2="0" y1="${T0}" y2="${Ht - B0}" stroke="#111" stroke-width="1.5"/><circle r="5" fill="#fff" stroke="#111" stroke-width="2"/></g>`;
      box.innerHTML = `<svg viewBox="0 0 ${Wd} ${Ht}" width="${Wd}" height="${Ht}">${svg}</svg>`;
      q('.prof-title').textContent = mode === 'section' && R.a ? `${short(R.a.name)} to ${short(R.b.name)}` : `${E.name} course, ${Math.round(route[route.length - 1][2])} km`;
      const el = box.querySelector('svg');
      prof = { R, X, Y, hov: el.querySelector('.prof-hover') };
      if (mk) mk.remove();
      summary();
      // Drag along the profile.
      const move = ev => {
        const r = el.getBoundingClientRect(), x = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * Wd / r.width;
        show(Math.max(R.k0, Math.min(R.k1, R.k0 + (x - L0) / (Wd - L0 - R0) * (R.k1 - R.k0))));
      };
      el.addEventListener('pointerdown', move); el.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) move(e); });
      el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); }); el.addEventListener('pointerup', () => { clearTimeout(hideT); hideT = setTimeout(hide, 4000); });
      el.addEventListener('touchmove', move, { passive: true });
    }

    // One point on the profile and the map: km, height, steepness, and how far and how much climb from the point.
    function show(km) {
      if (!prof) return;
      clearTimeout(hideT);
      const { R, X, Y, hov } = prof, E = R.E, j = E.idxAtKm(km), p = E.route[j], g = gradeAt(E, p[2], 0.1);
      hov.setAttribute('visibility', 'visible');
      hov.querySelector('line').setAttribute('x1', X(p[2])); hov.querySelector('line').setAttribute('x2', X(p[2]));
      hov.querySelector('circle').setAttribute('cx', X(p[2])); hov.querySelector('circle').setAttribute('cy', Y(p[3]));
      let h = `<b>km ${one(p[2])}</b> · ${Math.round(p[3])} m · <span class="prof-grade" style="background:${gradeCol(g)}">${g >= 0 ? '+' : '−'}${Math.abs(Math.round(g))}%</span>`;
      if (here && here.E === E) {
        const ic = E.idxAtKm(here.km), d = p[2] - here.km;
        if (Math.abs(d) >= 0.05) h += `<br>From ${who}: ${one(Math.abs(d))} km ${d > 0 ? 'ahead' : 'back'}, +${Math.round(E.climb(ic, j))} m / −${Math.round(E.climb(j, ic))} m`;
      }
      info.innerHTML = h;
      const m = map();
      if (m && window.L) { if (!mk) mk = L.circleMarker([p[0], p[1]], { radius: 7, color: '#111', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }); mk.setLatLng([p[0], p[1]]).addTo(m); }
    }
    function hide() {
      if (!prof) return;
      prof.hov.setAttribute('visibility', 'hidden'); summary(); if (mk) mk.remove();
    }
    // Under the profile: the distance, climb and descent to the next aid station and back to the last.
    function summary() {
      const R = prof.R;
      if (here && here.E !== R.E) { info.textContent = `Showing the ${R.E.name} course. Tap This section to go back.`; return; }
      if (!here) { info.textContent = o.empty || 'Drag along the profile to see any point.'; return; }
      const E = here.E, ic = E.idxAtKm(here.km);
      const nx = E.AID.find(a => a.trail_km > here.km + 0.05), pv = [...E.AID].reverse().find(a => a.trail_km <= here.km + 0.05);
      const part = (a, dir) => {
        if (!a) return '';
        const j = E.idxAtKm(a.trail_km);
        return `<b>${dir} ${esc(short(a.name))}</b> ${one(Math.abs(a.trail_km - here.km))} km, +${Math.round(E.climb(ic, j))} m / −${Math.round(E.climb(j, ic))} m`;
      };
      info.innerHTML = [part(nx, 'To'), part(pv, 'Back to')].filter(Boolean).join('<br>');
    }

    let rz = null; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (box.clientWidth) draw(); }, 200); });
    draw();
    return {
      // The course shown when no point is set (the Find tab's course picker).
      setCourse(E) { base = E; viewE = null; draw(); },
      // The point: { E, km, ele }, or null. The first point shows its section, unless a view was picked.
      setHere(h) { here = h; viewE = null; setMode(h && !picked ? 'section' : mode); },
      // A tap on a map: the nearest course within reach, shown on the profile (switching course or view if needed).
      showLL(lat, lng, zoom) {
        let best = null;
        (base.courses || [base]).forEach(E => { const s = E.snap(lat, lng); if (!best || s.offM < best.s.offM) best = { E, s }; });
        if (!best || best.s.offM > Math.max(150, 40 * Math.pow(2, 16 - (zoom || 14)))) return false;
        const E = best.E, km = E.route[best.s.ic][2];
        if (prof.R.E !== E) { viewE = here && here.E === E ? null : E; setMode('course'); }
        else if (km < prof.R.k0 || km > prof.R.k1) setMode('course');
        show(km);
        hideT = setTimeout(hide, 8000);
        return true;
      },
      redraw: draw
    };
  };
})();
