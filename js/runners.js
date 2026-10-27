// The Runners panel, shared by the map page (js/map.js) and the field app's Map tab (js/field.js) so the two stay the
// same: a bib search, the Runner watch (not moving, off the course, late at the next checkpoint, tracker gone quiet),
// the field by section, and the front and tail of each race. Show centres the map on a runner and opens their popup.
// GPTRunners({ map, layer: () => runner layer, panel, button, key, extra(r), before(), opened(on), none, esc })
// fills the panel and returns { open, render, show, bib }. A bib in the link (#bib=1047) opens on that runner.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const one = n => (Math.round(n * 10) / 10).toFixed(1);
  window.GPTRunners = function (o) {
    const G = window.GPT, courses = G.courses, TR = window.GPTTracking || null, P = o.panel, B = o.button, map = o.map;
    const $ = s => P.querySelector(s), extra = r => o.extra ? o.extra(r) : '';
    P.innerHTML = `<div class="mp-panel-head"><h2>Runners</h2><button id="mpClose" class="mp-x" type="button" aria-label="Close">×</button></div>
    <form id="mpBibForm" class="mp-bib" autocomplete="off">
      <input id="mpBib" type="text" inputmode="numeric" placeholder="Bib, e.g. 1047" aria-label="Bib number">
      <button class="btn small primary" type="submit">Show</button>
    </form>
    <p id="mpBibMsg" class="msg" role="status"></p>
    <div id="mpLive"></div>`;

    // Centre on a runner and say where they are.
    function show(bib) {
      const r = TR && TR.byBib(bib);
      if (!r || !r.pos) { $('#mpBibMsg').textContent = !TR ? 'Live tracking isn\'t set up yet' : TR.ready() ? `No position for bib ${bib} yet` : 'Tracking is still loading'; return false; }
      if (o.before) o.before();
      const p = r.pos, at = p.est ? [p.est.lat, p.est.lon] : [p.lat, p.lon], layer = o.layer && o.layer();
      map.setView(at, Math.max(map.getZoom(), 14));
      // Open the runner's own marker popup (runners on one spot are stacked, each with its own marker).
      let mk = null;
      if (layer) layer.eachLayer(l => { if (l.options && l.options.bib === r.bib) mk = l; });
      if (mk) mk.openPopup();
      else L.popup({ maxWidth: 280 }).setLatLng(at).setContent(`${TR.who(r)}<br>km ${one(TR.cur(r))}${p.est ? ' (estimated)' : ''}${p.offM > 60 ? ', ' + TR.dist(p.offM) + ' off the course' : ''}<br>${TR.where(r)}${extra(r)}`).openOn(map);
      $('#mpBibMsg').textContent = '';
      if (innerWidth < 700) open(false);
      return true;
    }
    $('#mpBibForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#mpBib').value.replace(/^#|^bib\s*/i, '').trim(); if (v) show(v); });
    document.addEventListener('click', e => { const b = e.target.closest('.trk-go'); if (b) show(b.dataset.bib); });

    function open(on) {
      P.hidden = !on; B.setAttribute('aria-expanded', on); B.classList.toggle('on', on);
      if (o.key) try { localStorage.setItem(o.key, on ? '1' : '0'); } catch (e) { }
      if (o.opened) o.opened(on);
      setTimeout(() => map.invalidateSize(), 50);
      if (on) render();
    }
    B.addEventListener('click', () => open(P.hidden));
    $('#mpClose').addEventListener('click', () => open(false));
    if (o.esc) document.addEventListener('keydown', e => { if (e.key === 'Escape' && !P.hidden) open(false); });

    function render() {
      if (P.hidden) return;
      const el = $('#mpLive');
      if (!TR) { el.innerHTML = o.none || `<p class="muted">No live tracking feed is set (<code>tracking.gps</code> and <code>tracking.chip</code> in the config). To see how it looks, <a href="${esc(location.pathname.replace(/.*\//, '') || 'index.html')}?demo=1">run the demo</a>: made-up runners on the course, GPS and chips both.</p>`; return; }
      if (!TR.ready()) { el.innerHTML = `<p class="muted">${esc(TR.status())}</p>`; return; }
      const w = TR.watch();
      const go = r => `<button class="btn small trk-go" type="button" data-bib="${esc(r.bib)}">Show</button>`;
      const row = (r, why) => `<div class="row"><span>${TR.who(r)}<span class="sub">${why}, km ${one(TR.cur(r))}${r.pos.est ? ' (estimated)' : ''}${r.pos.course !== G ? ' (' + esc(r.pos.course.label) + ')' : ''}. ${TR.where(r)}</span></span>${go(r)}</div>`;
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
        const A = E.AID, rows = [];
        for (let i = 1; i < A.length; i++) { const n = TR.between(E, A[i - 1].trail_km, A[i].trail_km).length; if (n) rows.push({ a: A[i - 1], b: A[i], n }); }
        h += rows.map(x => `<div class="row"><span><b>${esc(x.a.name)}</b> to <b>${esc(x.b.name)}</b><span class="sub">km ${one(x.a.trail_km)} to ${one(x.b.trail_km)}</span></span><span class="v">${x.n}</span></div>`).join('');
        const few = (list, label) => list.length ? `<h4>${label}</h4>` + list.map(r => `<div class="row"><span>${TR.who(r)}<span class="sub">km ${one(TR.cur(r))}${r.pos.est ? ' (estimated)' : ''}, ${TR.where(r)}</span></span>${go(r)}</div>`).join('') : '';
        h += few(on.slice(0, 3), 'Front') + few(on.slice(-3).reverse().filter(r => !on.slice(0, 3).includes(r)), 'Tail');
      });
      el.innerHTML = h;
    }

    // A bib in the link opens on that runner: map.html#bib=1047, field.html#bib=1047.
    const m = /bib=(\d+)/.exec(location.hash);
    if (m && TR) { let done = false; TR.onUpdate(() => { if (!done && TR.ready()) { done = true; show(m[1]); } }); }
    return { open, render, show, bib: m ? m[1] : null };
  };
})();
