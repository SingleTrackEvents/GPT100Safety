// The Miler's contingency course (data/contingency.js) on the safety map and the field app's map. A switch on the map
// shows the GPT100 course, the contingency or both, remembered on this phone for both maps. The contingency is a
// different way between two aid stations; the rest of the Miler is the GPT100 course.
// The engine (js/engine.js) makes it a course of its own ("contingency"), for Find, the map taps and Where am I?.
// Live tracking stays on the GPT100 course.
(function () {
  const C = window.GPT100_CONTINGENCY;
  if (!C || !C.route || !C.route.length) return;
  const KEY = 'gptCourseView', MODES = [['main', 'GPT100'], ['contingency', 'Contingency'], ['both', 'Both']];
  const COL = '#7b2cbf';
  let mode = 'main';
  try { const v = localStorage.getItem(KEY); if (MODES.some(m => m[0] === v)) mode = v; } catch (e) { }
  const subs = [];
  const one = n => (Math.round(n * 10) / 10).toFixed(1);
  const R = 6371e3, rad = Math.PI / 180;
  const metres = (a, b) => { const dl = (b[0] - a[0]) * rad, dn = (b[1] - a[1]) * rad, x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

  const X = window.GPTContingency = {
    data: C, color: COL,
    mode: () => mode,
    // Whether the GPT100 is hidden at this km (the stretch the contingency replaces, when only the contingency shows).
    hides: km => mode === 'contingency' && km > C.leave.km + 0.02 && km < C.rejoin.km - 0.02,
    // Whether the contingency shows, and whether it's the only course (so it takes the course colour).
    shown: () => mode !== 'main',
    only: () => mode === 'contingency',
    set(m) {
      if (m === mode || !MODES.some(x => x[0] === m)) return;
      mode = m;
      try { localStorage.setItem(KEY, m); } catch (e) { }
      subs.forEach(f => f(m));
      document.querySelectorAll('.cg-switch button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m));
    },
    onChange(f) { subs.push(f); },
    line: () => C.route.map(p => [p[0], p[1]]),
    // A GPT100 route (or part of it, from index i0 to i1) as lines, leaving out the replaced stretch when it's hidden.
    mainLines(route, i0 = 0, i1 = route.length - 1) {
      const out = []; let cur = [];
      for (let i = i0; i <= i1; i++) {
        const p = route[i];
        if (X.hides(p[2])) { if (cur.length > 1) out.push(cur); cur = []; } else cur.push([p[0], p[1]]);
      }
      if (cur.length > 1) out.push(cur);
      return out;
    },
    // Whether a stretch of the GPT100 (km a to b) covers the whole replaced stretch, so a race on it takes the contingency.
    covers: (a, b) => a <= C.leave.km + 0.05 && b >= C.rejoin.km - 0.05,
    // The nearest point of the contingency to a spot: { i, offM, km (along the contingency), mk (Miler km) }.
    snap(lat, lon) {
      let bi = 0, bd = Infinity;
      C.route.forEach((p, i) => { const d = metres([lat, lon], p); if (d < bd) { bd = d; bi = i; } });
      const p = C.route[bi];
      return { i: bi, offM: bd, lat: p[0], lon: p[1], ele: p[3], km: p[2], mk: C.leave.km + p[2], toGo: C.section_km - p[2] };
    },
    // Popup words for a spot on the contingency: the km, and the team to send with the ETA (the field app's map).
    popup(s, esc, t) {
      const E = window.GPT && GPT.course('contingency');
      let h = `<b>Contingency course km ${one(s.mk)}</b><br>${esc(C.leave.name)} ${one(s.km)} km back, ${esc(C.rejoin.name)} ${one(s.toGo)} km ahead`;
      if (E && E.alt) {
        const r = E.assess(E.idxAtKm(s.mk), t), b = r.best;
        if (b) h += `<br>Send <b>${esc(b.base.name)} team</b> via ${esc(E.cleanName(b.a))}${E.isGated(b.a) ? ' (gated)' : ''}: drive ${E.fmt(b.drive)}, walk ${one(b.walkKm)} km, <b>ETA ${E.fmt(b.total)}</b>${r.night ? ' (night)' : ''}`;
      }
      return h + `<br>Km after ${esc(C.rejoin.name)} are ${one(C.extra_km)} km more than on the GPT100.`;
    },
    legendHTML: () => `<i class="ln" style="background:${COL}"></i>Contingency (${esc0(C.leave.name)} to ${esc0(C.rejoin.name)})`,
    // The switch, as a map control.
    control(map, position) {
      const ctrl = L.control({ position: position || 'topleft' });
      ctrl.onAdd = () => {
        const d = L.DomUtil.create('div', 'leaflet-bar cg-switch');
        d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Course to show');
        d.innerHTML = MODES.map(([m, label]) => `<button type="button" data-m="${m}" aria-pressed="${m === mode}" title="${m === 'main' ? 'Show the GPT100 course' : m === 'both' ? 'Show the GPT100 course and the contingency' : 'Show the contingency course'}">${label}</button>`).join('');
        L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
        d.querySelectorAll('button').forEach(b => b.onclick = () => X.set(b.dataset.m));
        return d;
      };
      ctrl.addTo(map);
      return ctrl;
    }
  };
  function esc0(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
})();
