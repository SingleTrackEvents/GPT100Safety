// Which way you're facing, for the arrow on the blue "You" dot (runner and field apps).
// The phone's compass when it has one (iPhone asks once, from the tap on Where am I?), otherwise the
// GPS direction of travel while you're moving. No reading: just the dot, as before.
(function () {
  let asking = false, compass = null, compassT = 0, gpsDir = null, shown = null, started = false, frame = 0;
  const norm = a => ((a % 360) + 360) % 360;
  // The compass reads from the top of the phone held upright: turned sideways, the screen's top is elsewhere.
  const screenAngle = () => (screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : +window.orientation || 0);
  function onTurn(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) h = e.webkitCompassHeading; // iPhone
    else if ((e.absolute || e.type === 'deviceorientationabsolute') && typeof e.alpha === 'number') h = 360 - e.alpha; // Android
    if (h == null) return;
    h = norm(h + screenAngle());
    // A little smoothing (the shorter way round), so the arrow doesn't shake.
    compass = compass == null ? h : norm(compass + ((h - compass + 540) % 360 - 180) * 0.3);
    compassT = Date.now();
    paint();
  }
  // Call from a tap (iPhone only lets a page use the compass after one).
  function start() {
    if (started || asking) return;
    const listen = () => {
      started = true;
      if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onTurn);
      else window.addEventListener('deviceorientation', onTurn);
    };
    const D = window.DeviceOrientationEvent;
    if (!D) return;
    if (typeof D.requestPermission === 'function') {
      // Asked without a tap (Follow me turned back on as the page opens), it fails: ask again at the next tap.
      const later = () => { asking = false; document.addEventListener('click', start, { once: true, capture: true }); };
      asking = true;
      try { D.requestPermission().then(s => { asking = false; if (s === 'granted') listen(); }).catch(later); } catch (e) { later(); }
    } else listen();
  }
  // From a GPS fix: its direction of travel, only while moving (standing still it means nothing).
  function gps(coords) {
    if (!coords) return;
    gpsDir = typeof coords.heading === 'number' && !isNaN(coords.heading) && coords.speed > 0.5 ? coords.heading : null;
    paint();
  }
  // The compass while it's live, else the GPS direction.
  const now = () => compass != null && Date.now() - compassT < 5000 ? compass : gpsDir;
  const html = () => {
    const h = now();
    return `<div class="me-mk"><div class="me-dir"${h == null ? ' hidden' : ''} style="transform:rotate(${Math.round(h || 0)}deg)"><svg viewBox="0 0 44 44" aria-hidden="true"><path class="me-cone" d="M22 22 L9 1 A24 24 0 0 1 35 1 Z"/><path class="me-arrow" d="M22 2 L29.5 12 L14.5 12 Z"/></svg></div><div class="me-dot"></div></div>`;
  };
  function paint() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const h = now();
      if (h === shown) return;
      shown = h;
      document.querySelectorAll('.me-mk .me-dir').forEach(el => {
        el.hidden = h == null;
        if (h != null) el.style.transform = `rotate(${Math.round(h)}deg)`;
      });
    });
  }
  // The blue "You" marker, with the arrow when there's a direction.
  function marker(ll) {
    return L.marker(ll, { zIndexOffset: 800, keyboard: false, icon: L.divIcon({ className: '', html: html(), iconSize: [44, 44], iconAnchor: [22, 22], tooltipAnchor: [12, 0] }) });
  }
  window.GPTHeading = { start, gps, marker };
})();
