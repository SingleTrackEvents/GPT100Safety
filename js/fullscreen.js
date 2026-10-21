// A full screen button on the maps (Find, Medical, Control, the map page and the field app). It fills the screen with
// the map's box: the browser's own full screen where it has one, or the box pinned over the page where it doesn't
// (iPhone). Esc or the button again brings the page back.
(function () {
  if (!window.L) { window.GPTFullscreen = () => null; return; }
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5"/></svg>';
  const EXIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4 M20 9h-5V4 M15 20v-5h5 M4 15h5v5"/></svg>';
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;

  window.GPTFullscreen = function (map, box) {
    box = box || map.getContainer().parentNode;
    let btn = null;
    const isOn = () => fsEl() === box || box.classList.contains('map-full');
    const paint = () => { if (!btn) return; const on = isOn(); btn.innerHTML = on ? EXIT : ICON; btn.title = btn.ariaLabel = on ? 'Exit full screen' : 'Full screen'; };
    const fit = () => { setTimeout(() => map.invalidateSize(), 50); setTimeout(() => map.invalidateSize(), 400); };
    function cssOn(on) {
      box.classList.toggle('map-full', on);
      document.documentElement.classList.toggle('map-full-on', on);
      paint(); fit();
    }
    function toggle() {
      if (isOn()) {
        if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else cssOn(false);
        return;
      }
      const req = box.requestFullscreen || box.webkitRequestFullscreen;
      if (req) {
        let p; try { p = req.call(box); } catch (e) { p = Promise.reject(e); }
        Promise.resolve(p).catch(() => cssOn(true));
      } else cssOn(true);
    }
    // Top right, under the layers button, clear of the key at the bottom left on a short map.
    const ctrl = L.control({ position: 'topright' });
    ctrl.onAdd = () => {
      const d = L.DomUtil.create('div', 'leaflet-bar gpt-fs');
      btn = L.DomUtil.create('button', 'gpt-fs-btn', d);
      btn.type = 'button';
      L.DomEvent.disableClickPropagation(d);
      btn.addEventListener('click', toggle);
      paint();
      return d;
    };
    ctrl.addTo(map);
    const change = () => { paint(); fit(); };
    document.addEventListener('fullscreenchange', change);
    document.addEventListener('webkitfullscreenchange', change);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && box.classList.contains('map-full')) cssOn(false); });
    return { toggle, on: isOn };
  };
})();
