// Which way you're facing, for the arrow on the blue "You" dot (runner and field apps).
// The phone's compass when it has one (iPhone asks once, from the tap on Where am I?), otherwise the
// GPS direction of travel while you're moving. No reading: just the dot, as before.
(function () {
  let asking = false, compass = null, compassT = 0, gpsDir = null, started = false, frame = 0;
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
  // Best called from a tap (iPhone only lets a page use the compass after one; without one it waits for the next).
  function start() {
    if (started || asking) return;
    const listen = () => {
      started = true;
      window.addEventListener('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation', onTurn);
    };
    const D = window.DeviceOrientationEvent;
    if (!D) return;
    // Android (Chrome): the compass needs no asking, so start now, tap or not. Newer Chrome has the iPhone's
    // requestPermission too, but asking there without a tap can answer "denied" and leave the arrow off.
    if ('ondeviceorientationabsolute' in window) { listen(); return; }
    if (typeof D.requestPermission === 'function') {
      const later = () => { asking = false; document.addEventListener('click', start, { once: true, capture: true }); };
      // Not from a tap (the field app's Follow me turns back on as the page opens): an iPhone may answer
      // "denied" for the whole visit without asking, so wait for the next tap rather than ask now.
      if (navigator.userActivation && !navigator.userActivation.isActive) { later(); return; }
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
      // Every dot on the page each time (a dot drawn again since, as when the map opens, starts from when it was made).
      const h = now();
      document.querySelectorAll('.me-mk .me-dir').forEach(el => {
        el.hidden = h == null;
        if (h != null) el.style.transform = `rotate(${Math.round(h)}deg)`;
      });
    });
  }
  // The blue "You" marker, with the arrow when there's a direction.
  // Drawing the dot starts the compass too: the field app puts your last location back on the map as it
  // opens, with no tap on Where am I? (an iPhone then asks at the next tap anywhere).
  function marker(ll) {
    start();
    return L.marker(ll, { zIndexOffset: 800, keyboard: false, icon: L.divIcon({ className: '', html: html(), iconSize: [44, 44], iconAnchor: [22, 22], tooltipAnchor: [12, 0] }) }).on('add', paint);
  }
  window.GPTHeading = { start, gps, marker };
})();
