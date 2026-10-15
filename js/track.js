// Track grades and emergency features for the Find tab, from the Parks Victoria access maps (data/track-grades.js).
// Grades run along the GPT100 course by km. The 14k shares some ground with it; there we snap to the GPT100 line.
(function () {
  const T = window.GPT100_TRACK;
  if (!T) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const one = n => (Math.round(n * 10) / 10).toFixed(1);
  const dist = m => m >= 950 ? one(m / 1000) + ' km' : Math.round(m / 10) * 10 + ' m';

  // What each grade means for a carry-out, in Parks Victoria's words, shortened.
  const GRADES = {
    easy: { label: 'Easy', col: '#9ad11a', text: '#1d4d00', note: 'Mostly smooth, little in the way. Mule (wheeled) stretcher recommended.' },
    medium: { label: 'Medium', col: '#ff9a1f', text: '#4a2a00', note: 'Rough with a few obstacles. Paraguard stretcher recommended.' },
    hard: { label: 'Hard', col: '#b31212', text: '#fff', note: 'Rough and may be steep, with many obstacles. Stretcher movement is slow and may need hand to hand carrying.' },
    unassessed: { label: 'Not yet assessed', col: '#9a9a9a', text: '#fff', note: 'Parks Victoria has not graded this track. Expect the harder end.' },
    'road:sealed': { label: 'Sealed road', col: '#c9a6ff', text: '#2d0a5e', note: 'The course is on a sealed road here. A 2WD vehicle can reach it.' },
    'road:unsealed': { label: 'Unsealed road', col: '#5fb52c', text: '#fff', note: 'The course is on an unsealed road here. A 2WD vehicle can usually reach it.' },
    'road:4wd': { label: '4WD track', col: '#2f7bff', text: '#fff', note: 'The course is on a 4WD track here. A 4WD can reach it.' }
  };
  const ROADS = { sealed: 'Sealed road, 2WD', unsealed: 'Unsealed road, 2WD', '4wd': '4WD only' };
  const KINDS = {
    emergency: { label: 'Emergency marker', col: '#0a84ff', glyph: 'EM' },
    helipad: { label: 'Helipad', col: '#333', glyph: 'H' },
    assembly: { label: 'Assembly area', col: '#e3b505', glyph: 'A' },
    camp: { label: 'GPT campsite', col: '#2e8b57', glyph: 'C' },
    hazard: { label: 'Track hazard', col: '#e6c700', glyph: '!' },
    hazards: { label: 'Several track hazards', col: '#2bbf2b', glyph: '!' },
    warning: { label: 'Track warning', col: '#d80000', glyph: '!' }
  };
  const HAZ = ['hazard', 'hazards', 'warning'];
  const SEGS = T.segments;
  const info = g => GRADES[g] || { label: 'Unmapped', col: '#ddd', text: '#333', note: 'Parks Victoria has no graded track mapped here. Expect it to be slow.' };

  function at(km) {
    const s = SEGS.find(s => km >= s[0] && km < s[1]) || (km >= SEGS[SEGS.length - 1][1] ? SEGS[SEGS.length - 1] : null);
    return s ? s[2] : null;
  }
  // How much of each grade lies between two km, worst first.
  // Unmapped stretches are campgrounds and road junctions rather than rough ground, so they rank below medium.
  const RANK = ['hard', 'unassessed', 'medium', null, 'easy', 'road:4wd', 'road:unsealed', 'road:sealed'];
  function between(k0, k1) {
    const lo = Math.min(k0, k1), hi = Math.max(k0, k1), by = new Map();
    for (const [a, b, g] of SEGS) {
      const o = Math.min(b, hi) - Math.max(a, lo);
      if (o > 0) by.set(g, (by.get(g) || 0) + o);
    }
    // Slivers under 150 m (a road crossing, a gap between two maps) don't set the tone of a carry-out.
    let parts = [...by].map(([g, km]) => ({ g, km })).sort((x, y) => RANK.indexOf(x.g) - RANK.indexOf(y.g));
    if (parts.length > 1) parts = parts.filter(p => p.km >= 0.15) ;
    return { parts, worst: parts.length ? parts[0].g : null, total: hi - lo };
  }
  // GPT100 km for a point: the course km on the main course, else the nearest GPT100 point within 40 m.
  function mainKm(G, r) {
    if (G.main) return r.km;
    const M = G.course('100'), s = M.snap(r.lat, r.lon);
    return s && s.offM <= 40 ? M.route[s.ic][2] : null;
  }
  function metres(lat1, lon1, lat2, lon2) { return window.GPT.metres([lat1, lon1], [lat2, lon2]); }

  // Points near a casualty: along the course for markers on it, straight line for the rest.
  function near(r, km) {
    return T.points.map(p => {
      const line = metres(r.lat, r.lon, p.lat, p.lon);
      const along = km != null && p.off_m <= 150 ? Math.abs(p.km - km) * 1000 : null;
      return Object.assign({ line, along, m: along != null ? along : line, onCourse: along != null }, p);
    }).sort((x, y) => x.m - y.m);
  }
  // The emergency marker to name: one with a printed code, unless an uncoded one is much closer.
  function pickEM(N) {
    const emc = N.find(p => p.kind === 'emergency' && p.code && p.m < 5000), emu = N.find(p => p.kind === 'emergency' && !p.code && p.m < 5000);
    return emc && (!emu || emc.m <= emu.m * 3 || emc.m < 1500) ? emc : emu;
  }
  function where(p, km) {
    if (!p.onCourse || km == null) return `${dist(p.line)} away${p.off_m > 150 ? ', ' + dist(p.off_m) + ' off the course' : ''}`;
    if (p.m < 60) return 'right here';
    return `${dist(p.m)} ${p.km < km ? 'back' : 'ahead'} along the course, km ${one(p.km)}`;
  }
  function chip(g) { const i = info(g); return `<span class="tg-chip" style="background:${i.col};color:${i.text}">${esc(i.label)}</span>`; }
  function breakdown(b) {
    if (!b.parts.length) return '';
    return b.parts.map(p => `<span class="tg-bit"><i style="background:${info(p.g).col}"></i>${one(p.km)} km ${esc(info(p.g).label.toLowerCase())}</span>`).join(' ');
  }

  // The Find card. r is the engine's assessment; G the course engine it came from.
  // o.vehicle: the access point to show the carry-out to (defaults to the fastest team's). o.who: 'you' for the field app.
  function card(r, G, o) {
    o = o || {};
    const km = mainKm(G, r);
    if (km == null) return '';
    const g = at(km), i = info(g);
    let h = `<div class="card tg"><h3>Track and carry-out</h3>`;
    h += `<p class="tg-here">${chip(g)} <span class="tg-note">${esc(i.note)}</span></p>`;
    const b = o.vehicle || r.best;
    if (G.main && b) {
      const rows = [[`To the vehicle at ${esc(G.cleanName(b.a))}`, between(km, b.joinKm)]];
      if (r.aid.prev) rows.push([`Back to ${esc(r.aid.prev.a.name)}`, between(km, r.aid.prev.a.trail_km)]);
      if (r.aid.next) rows.push([`Ahead to ${esc(r.aid.next.a.name)}`, between(km, r.aid.next.a.trail_km)]);
      h += '<div class="tg-rows">';
      for (const [label, bd] of rows) {
        const w = info(bd.worst);
        h += `<div class="row"><span><b>${label}</b><span class="sub">${breakdown(bd) || 'Straight to the course'}</span></span><span class="v" style="color:${bd.worst === 'hard' || bd.worst === 'unassessed' || bd.worst == null ? 'var(--red)' : 'inherit'}">${esc(bd.parts.length > 1 ? 'Worst ' + w.label.toLowerCase() : (bd.parts.length ? w.label : ''))}</span></div>`;
      }
      h += '</div>';
      const roadKey = b.a.name + '|' + b.a.trail_km, rg = T.access[roadKey];
      if (rg) h += `<p class="tg-road">Road to ${esc(G.cleanName(b.a))}: <b>${esc(ROADS[rg])}</b>${rg === '4wd' ? '. Send a 4WD.' : '.'}</p>`;
    }
    const N = near(r, km);
    const em = pickEM(N), hp = N.find(p => p.kind === 'helipad' && p.m < 10000), as = N.find(p => p.kind === 'assembly' && p.m < 3000);
    const hz = N.filter(p => HAZ.includes(p.kind) && p.m < 1000);
    h += '<div class="tg-pts">';
    if (em) h += `<div class="row"><span><b>Nearest emergency marker${em.code ? ' ' + esc(em.code) : ' (no code printed)'}</b><span class="sub">${esc(where(em, km))}. Give this code to 000 for a precise location.</span></span><span class="tg-glyph" style="background:${KINDS.emergency.col}">EM</span></div>`;
    if (hp) h += `<div class="row"><span><b>Nearest helipad${hp.name ? ', ' + esc(hp.name) : ''}</b><span class="sub">${esc(where(hp, km))}.</span></span><span class="tg-glyph" style="background:${KINDS.helipad.col}">H</span></div>`;
    if (as) h += `<div class="row"><span><b>Assembly area</b><span class="sub">${esc(where(as, km))}.</span></span><span class="tg-glyph" style="background:${KINDS.assembly.col};color:#111">A</span></div>`;
    if (!em) h += `<div class="row"><span><b>No emergency marker within 5 km</b><span class="sub">Give 000 the coordinates or what3words instead.</span></span></div>`;
    hz.forEach(p => { h += `<div class="row"><span><b>${esc(KINDS[p.kind].label)}</b><span class="sub">${esc(where(p, km))}.${p.kind === 'warning' ? ' Parks Victoria says to seek site specific information.' : ''}</span></span><span class="tg-glyph" style="background:${KINDS[p.kind].col};color:#111">!</span></div>`; });
    h += '</div>';
    const F = (G.config && G.config.carryFactor) || {};
    const slow = Object.keys(F).filter(k => F[k] > 1).map(k => `${info(k).label.toLowerCase()} x${F[k]}`).join(', ');
    h += `<p class="tg-src">${slow ? `Carry-out times allow for the grade (${esc(slow)} on the ${G.config.evacPace} min/km stretcher pace). ` : ''}Grades and markers from the ${esc(T.source)}. Grades are for the walking track, not the race line, so expect some variation.</p></div>`;
    return h;
  }

  // One line for the radio script and WhatsApp message.
  function line(r, G, o) {
    o = o || {};
    const km = mainKm(G, r);
    if (km == null) return '';
    const g = at(km), i = info(g), N = near(r, km), em = pickEM(N), hp = N.find(p => p.kind === 'helipad');
    let s = `Track ${i.label.toLowerCase()}`;
    if (g === 'easy') s += ', mule stretcher'; else if (g === 'medium') s += ', paraguard stretcher'; else if (g === 'hard') s += ', slow carry, may need hand to hand';
    const v = o.vehicle || r.best;
    if (G.main && v) { const b = between(km, v.joinKm); if (b.parts.length > 1 || (b.worst && b.worst !== g)) s += `. Carry-out worst ${info(b.worst).label.toLowerCase()}`; }
    if (em && em.code && em.m < 3000) s += `. Nearest emergency marker ${em.code}, ${where(em, km)}`;
    if (hp && hp.m < 6000) s += `. Nearest helipad ${hp.name ? hp.name + ', ' : ''}${where(hp, km)}`;
    return s + '.';
  }

  // Map: the course coloured by grade around the casualty, and the markers near it.
  function draw(layer, r, G, k0, k1) {
    if (!window.L || !G.main) return;
    const route = G.route, lo = Math.max(0, Math.min(k0, k1) - 1), hi = Math.max(k0, k1) + 1;
    for (const [a, b, g] of SEGS) {
      if (b < lo || a > hi) continue;
      const i0 = G.idxAtKm(Math.max(a, lo)), i1 = G.idxAtKm(Math.min(b, hi));
      if (i1 <= i0) continue;
      const pts = []; for (let i = i0; i <= i1; i++) pts.push([route[i][0], route[i][1]]);
      L.polyline(pts, { color: info(g).col, weight: 7, opacity: .9, interactive: false }).addTo(layer);
    }
    const km = r.km;
    for (const p of T.points) {
      if (Math.abs(p.km - km) > 6 && metres(r.lat, r.lon, p.lat, p.lon) > 5000) continue;
      const k = KINDS[p.kind];
      const icon = L.divIcon({ className: '', html: `<div class="tg-mk" style="background:${k.col};color:${HAZ.includes(p.kind) || p.kind === 'assembly' ? '#111' : '#fff'}">${k.glyph}</div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
      L.marker([p.lat, p.lon], { icon, zIndexOffset: 600 }).bindPopup(`<b>${esc(k.label)}${p.code ? ' ' + esc(p.code) : ''}</b>${p.name ? '<br>' + esc(p.name) : ''}<br>km ${one(p.km)}${p.off_m > 60 ? ', ' + dist(p.off_m) + ' off the course' : ''}`).addTo(layer);
    }
  }

  // Whether the carry-out between two km crosses track that slows it (config.carryFactor).
  function slowed(k0, k1, G) {
    if (!G.main) return false;
    const F = (G.config && G.config.carryFactor) || {};
    return between(k0, k1).parts.some(p => (F[p.g] || 1) > 1);
  }

  function legendHTML() {
    return ['easy', 'medium', 'hard', 'unassessed'].map(g => `<i class="ln" style="background:${GRADES[g].col}"></i>${GRADES[g].label}`).join('<br>');
  }

  window.GPTTrack = { at, between, near, card, line, draw, slowed, legendHTML, GRADES, KINDS };
})();
