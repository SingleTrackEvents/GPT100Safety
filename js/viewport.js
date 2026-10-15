// Keeps the tabs along the bottom on the real bottom of the screen (runner and field apps).
// On an iPhone, a home screen app can open the first time with its layout taller or shorter than the
// screen, so position: fixed puts the tabs part way up (or down) until the app is reopened. The visual
// viewport is what's really on screen: when the tabs aren't on its bottom edge, move them there, and
// size the Map tab from it too (--vvh).
(function () {
  const vv = window.visualViewport, nav = document.querySelector('.rn-nav');
  if (!vv || !nav) return;
  let shift = 0, raf = 0;
  const typing = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
  function fix() {
    raf = 0;
    // With the keyboard up the screen is meant to be shorter: leave the tabs where the phone puts them.
    if (typing()) { if (shift) { nav.style.translate = ''; shift = 0; } return; }
    document.documentElement.style.setProperty('--vvh', Math.round(vv.height) + 'px');
    const bottom = nav.getBoundingClientRect().bottom - shift, want = vv.offsetTop + vv.height;
    // (translate, not transform, so the wide-screen centring transform stays)
    const d = Math.round(want - bottom);
    const next = Math.abs(d) > 1 ? d : 0;
    if (next !== shift) { shift = next; nav.style.translate = shift ? `0 ${shift}px` : ''; }
  }
  const soon = () => { if (!raf) raf = requestAnimationFrame(fix); };
  vv.addEventListener('resize', soon);
  vv.addEventListener('scroll', soon);
  addEventListener('scroll', soon, { passive: true });
  addEventListener('resize', soon);
  addEventListener('orientationchange', () => setTimeout(fix, 300));
  addEventListener('pageshow', soon);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(fix, 100); });
  document.addEventListener('focusout', () => setTimeout(fix, 100));
  // The first launch settles late: check again over the first few seconds.
  [0, 250, 1000, 2500].forEach(t => setTimeout(fix, t));
  window.GPTViewportFix = fix;
})();
