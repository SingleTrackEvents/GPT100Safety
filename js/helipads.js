// Helicopter landing sites (HLS) from data/helipads.js: a layer on the maps (ticked on or off from the layers button),
// the nearest sites on the Find card and in the message, and the markers near a casualty when the layer is off.
// Loads before js/track.js, which hands its helipad rows over to this when it's present.
(function () {
  const H = window.GPT100_HELIPADS;
  if (!H) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const one = n => (Math.round(n * 10) / 10).toFixed(1);
  const dist = m => m >= 950 ? one(m / 1000) + ' km' : Math.round(m / 10) * 10 + ' m';
  function metres(a, b) {
    const R = 6371000, la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180;
    const dla = (b[0] - a[0]) * Math.PI / 180, dlo = (b[1] - a[1]) * Math.PI / 180;
    const x = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = d => d ? MONTHS[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4) : '';

  // Three kinds of site on the map: used by Parks Victoria this year, current on the DEECA list, or expired on it.
  const STATE = {
    used: { label: 'Used by Parks Victoria, ' + H.used_when, col: '#0b6b3a' },
    current: { label: 'Current on the DEECA list', col: '#333' },
    expired: { label: 'Expired on the DEECA list', col: '#6e6e6e' }
  };
  // A site the DEECA list calls unsuitable (Roses Gap: loose stones) is never shown as in good condition.
  const unfit = s => /not suitable/i.test(s.status_note || '');
  const state = s => s.used && !unfit(s) ? 'used' : s.status === 'current' ? 'current' : 'expired';
  // A site closed today (Melbourne date, on the app's clock: the demo's when one is running) goes after the usable ones.
  const today = () => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date(window.GPT && GPT.now ? GPT.now() : Date.now())); } catch (e) { return ''; } };
  const shut = s => !!(s.closed && s.closed.includes(today()));
  const bad = s => unfit(s) || shut(s);
  const warn = s => [shut(s) ? 'Closed today.' : '', unfit(s) ? 'DEECA list: ' + s.status_note.charAt(0).toLowerCase() + s.status_note.slice(1).replace(/\.$/, '') + '.' : '', s.note || ''].filter(Boolean).join(' ');
  const title = s => s.name + ' HLS';

  // What we know about the site's condition, in one sentence (brief: without the status the popup heads it with).
  function condition(s, brief) {
    const insp = s.inspected ? ', last inspected ' + month(s.inspected) : '';
    if (unfit(s) && brief) return (s.used ? `A Parks Victoria helicopter used it in ${H.used_when}. ` : '') + (s.inspected ? `Last inspected ${month(s.inspected)}. ` : '') + 'Check it before relying on it.';
    if (unfit(s)) return `${s.used ? `A Parks Victoria helicopter used it in ${H.used_when}, but the` : 'The'} DEECA list has it ${s.status === 'current' ? 'current' : 'expired'}${insp}. Check it before relying on it.`;
    if (brief) return (s.inspected ? `Last inspected ${month(s.inspected)}. ` : '') + (s.status === 'current' ? 'Some sites may need vegetation cleared.' : (s.status_note ? s.status_note.replace(/\.$/, '') + '. ' : '') + 'Check it before relying on it.');
    if (s.used) return `A Parks Victoria helicopter used it in ${H.used_when}, so it's in good condition${s.status === 'expired' ? ' (the DEECA list has it expired' + insp + ')' : s.status === 'unlisted' ? ' (not on the DEECA list)' : ''}.`;
    if (s.status === 'current') return `Current on the DEECA list${insp}. Some sites may need vegetation cleared.`;
    return `Expired on the DEECA list${insp}${s.status_note ? '. ' + s.status_note : ''}. Check it before relying on it.`;
  }
  // Pad, surface, vehicle access and hazards.
  function facts(s) {
    const f = [];
    if (s.diam_m || s.surface) f.push(`${s.diam_m ? Math.round(s.diam_m) + ' m ' : ''}${s.surface ? s.surface.toLowerCase() : 'pad'}`);
    if (s.vehicle) f.push(/^no$/i.test(s.vehicle) ? 'no vehicle access' : s.vehicle + ' access');
    if (s.ele_m) f.push(s.ele_m + ' m above sea level');
    let t = f.join(', ');
    if (s.hazards) t += (t ? '. ' : '') + 'Hazards: ' + s.hazards.charAt(0).toLowerCase() + s.hazards.slice(1).replace(/\.$/, '');
    return t;
  }
  function popup(s) {
    const st = state(s);
    let h = `<b>${esc(title(s))}</b><br><span style="color:${STATE[st].col};font-weight:700">${esc(STATE[st].label)}</span>`;
    if (warn(s)) h += `<br><b style="color:#c00">${esc(warn(s))}</b>`;
    const c = condition(s, !s.used || unfit(s)); if (c) h += `<br>${esc(c)}`;
    const f = facts(s); if (f) h += `<br>${esc(f.charAt(0).toUpperCase() + f.slice(1))}.`;
    h += `<br>Course km ${one(s.km)}${s.off_m > 60 ? ', ' + dist(s.off_m) + ' off the course' : ''}`;
    h += `<br><span style="color:#625c53">${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}${s.precise ? '' : ' (DEECA list position, to about 100 m)'}</span>`;
    h += `<br><a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}" target="_blank" rel="noopener">Directions</a>`;
    return h;
  }
  function icon(s) {
    return L.divIcon({ className: '', html: `<div class="hls-mk ${state(s)}">H</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
  }
  function marker(s) {
    return L.marker([s.lat, s.lon], { icon: icon(s), zIndexOffset: 550, title: title(s) }).bindPopup(popup(s));
  }

  // The map layer: every site, once per map.
  const LAYERS = [];
  function layer() { const g = L.layerGroup(H.sites.map(marker)); LAYERS.push(g); return g; }
  const shown = () => LAYERS.some(g => g._map);
  function overlay(map, on) {
    if (!window.L || !window.GPTBaseMap || !GPTBaseMap.overlay) return null;
    return GPTBaseMap.overlay(map, 'Helicopter landing sites', layer(), on !== false);
  }

  // Sites near a point: along the course for those on it, straight line for the rest (as js/track.js does).
  function near(lat, lon, km) {
    return H.sites.map(s => {
      const line = metres([lat, lon], [s.lat, s.lon]);
      const along = km != null && s.off_m <= 150 ? Math.abs(s.km - km) * 1000 : null;
      return Object.assign({ line, along, m: along != null ? along : line, onCourse: along != null }, s);
    }).sort((x, y) => x.m - y.m);
  }
  function where(p, km) {
    if (!p.onCourse || km == null) return `${dist(p.line)} away${p.off_m > 150 ? ', ' + dist(p.off_m) + ' off the course' : ''}`;
    if (p.m < 60) return 'right here';
    return `${dist(p.m)} ${p.km < km ? 'back' : 'ahead'} along the course, km ${one(p.km)}`;
  }
  // The two nearest within 10 km, unsuitable or closed today last; the better kept of the two leads only when it's under 1 km further.
  function pick(lat, lon, km) {
    const rank = p => state(p) === 'used' ? 0 : state(p) === 'current' ? 1 : 2;
    const out = near(lat, lon, km).filter(p => p.m < 10000).sort((x, y) => (bad(x) - bad(y)) || (x.m - y.m)).slice(0, 2);
    if (out.length > 1 && !bad(out[1]) && rank(out[1]) < rank(out[0]) && out[1].m - out[0].m < 1000) out.reverse();
    // A nearer site closed today comes straight after the usable one, with its warning.
    const x = out.length && !shut(out[0]) && near(lat, lon, km).find(p => shut(p) && p.m < out[0].m);
    if (x) out[1] = x;
    return out;
  }
  // What the first of those is: the nearest, the nearest usable (an unsuitable nearer one was passed over),
  // or the best kept nearby (a better kept one under 1 km further leads).
  function lead(lat, lon, km, P) {
    const nearer = near(lat, lon, km).filter(p => p.m < P[0].m && p.name !== P[0].name);
    return !nearer.length ? 'Nearest' : nearer.every(bad) ? 'Nearest usable' : 'Best nearby';
  }

  // Rows for the Track and carry-out card.
  function rows(r, km) {
    const P = pick(r.lat, r.lon, km);
    if (!P.length) return `<div class="row"><span><b>No helicopter landing site within 10 km</b><span class="sub">The nearest are on the map's Helicopter landing sites layer.</span></span></div>`;
    const head = lead(r.lat, r.lon, km, P) + ' helicopter landing site';
    // A site closed today leads with its warning.
    return P.map((p, i) => `<div class="row"><span><b>${i ? 'Also' : head}: ${esc(title(p))}</b><span class="sub">${shut(p) ? `<b style="color:var(--red)">${esc(warn(p))}</b> ` + esc(where(p, km).replace(/^r/, 'R')) : esc(where(p, km))}. ${esc(condition(p))}${facts(p) ? ' ' + esc(facts(p).charAt(0).toUpperCase() + facts(p).slice(1)) + '.' : ''}${warn(p) && !shut(p) ? ` <b style="color:var(--red)">${esc(warn(p))}</b>` : ''}</span></span><span class="tg-glyph" style="background:${STATE[state(p)].col}">H</span></div>`).join('');
  }
  // For the radio script and WhatsApp message: the nearest within 10 km.
  function line(r, km) {
    const P = pick(r.lat, r.lon, km);
    if (!P.length) return '';
    const p = P[0], x = near(r.lat, r.lon, km).find(q => q.m < p.m && shut(q));
    if (shut(p)) return `Closed today: ${p.name} HLS, ${where(p, km)}${p.note ? '. ' + p.note.replace(/\.$/, '') : ''}${P.length > 1 ? '' : '. No other HLS within 10 km'}`;
    return `${lead(r.lat, r.lon, km, P)} HLS ${p.name}, ${where(p, km)}${state(p) === 'used' ? '' : p.status === 'current' ? ' (current, DEECA list)' : ' (expired on the DEECA list)'}${warn(p) ? '. ' + warn(p) : ''}${x ? `. Not ${x.name}, nearer but closed today` : ''}`;
  }
  // The nearest sites on the result map when the layer is turned off.
  function draw(layer, r, km) {
    if (shown()) return;
    pick(r.lat, r.lon, km).forEach(p => marker(p).addTo(layer));
  }
  function legendHTML() {
    return ['used', 'current', 'expired'].map(k => `<span class="hls-mk ${k} hls-key">H</span>${esc(STATE[k].label)}`).join('<br>');
  }

  window.GPTHelipads = { sites: H.sites, source: H.source, near, pick, rows, line, draw, layer, overlay, legendHTML, popup, condition, facts, title };
})();
