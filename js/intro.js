// First-time intro and how-to for the field and safety apps (the runner app has its own, in js/runner.js).
// Shows once on each phone (and again in an installed iPhone app, which has its own storage); the ? button
// in the header opens it any time.
// GPTIntro({ key, steps: [ ({ IOS, STANDALONE }) => ({ title, html, after(body) }) ], done() })
(function () {
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let installPrompt = null, redraw = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (redraw) redraw(); });
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

  const iosSteps = app => `<ol class="rn-steps"><li>Tap <b>Share</b> <span class="rn-ico">⬆︎</span> at the bottom of Safari (or the top on iPad).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>${app}</b> from your home screen.</li></ol>`;

  // On iPhone a home screen app keeps its own storage, apart from Safari: a map saved in Safari
  // isn't in the installed app, so it would download twice. (Android shares it.)
  const installFirst = () => IOS && !STANDALONE && get('gptSaveInBrowser') !== '1';

  // The "install the app" step, for whichever phone this is.
  function installStep(app, whyIOS) {
    return () => {
      let h = '';
      if (STANDALONE) h = `<p class="rn-ok">✓ You're using the installed app.</p><p>It opens straight from your home screen, like any other app.</p>`;
      else if (IOS) h = `<p>${whyIOS || 'Add it to your home screen so it opens like any other app.'}</p>${iosSteps(app)}<p class="fd-hint">Not in Safari? Open this page in Safari to add it.</p>`;
      else if (installPrompt) h = `<p>Install it so it opens from your home screen, like any other app.</p><button type="button" class="rn-intro-next" id="giInstall">Install app</button><p class="fd-hint" id="giInstallMsg"></p>`;
      else h = `<p>Add it to your home screen so it opens like any other app.</p><ol class="rn-steps"><li>Open the browser menu <span class="rn-ico">⋮</span>.</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li></ol><p class="fd-hint">On a computer it works in the browser as it is.</p>`;
      return {
        title: '1. Install the app', html: h,
        after: body => {
          const b = body.querySelector('#giInstall');
          if (b) b.onclick = async () => { installPrompt.prompt(); const c = await installPrompt.userChoice.catch(() => null); installPrompt = null; body.querySelector('#giInstallMsg').textContent = c && c.outcome === 'accepted' ? 'Installed. Open it from your home screen.' : ''; };
        }
      };
    };
  }

  // The "save the map" step (apps with the offline topo map).
  function saveStep(onSaved) {
    return async () => {
      const OM = window.GPTOfflineMap, mb = Math.round(((OM && OM.bytes) || 0) / 1e6);
      let h = `<p>There's little signal on the course. Save the topo map along the course (about ${mb} MB) on wifi, before you go.</p>`;
      const st = OM && OM.available() ? await OM.status() : null;
      if (!st) h += '<p class="muted">This browser can\'t save the map. Try Safari or Chrome.</p>';
      else if (st.saved) h += '<p class="rn-ok">✓ The map is saved on this phone.</p>';
      else if (installFirst()) h += '<p class="notice warn">Install the app first (step 1), then open it from your home screen. You\'ll see this guide again there, with the Save button.</p>';
      else h += '<button type="button" class="rn-intro-next" id="giSave">Save map now</button><div class="fd-bar" hidden><i></i></div><p class="fd-hint" id="giSaveMsg">You can also do this later from the card at the top.</p>';
      return {
        title: '2. Save the map', html: h,
        after: body => {
          const b = body.querySelector('#giSave'); if (!b) return;
          b.onclick = async () => {
            const bar = body.querySelector('.fd-bar'), out = body.querySelector('#giSaveMsg');
            if (!navigator.onLine) { out.textContent = 'No signal. Try again with wifi or good signal.'; return; }
            b.disabled = true; bar.hidden = false; out.textContent = 'Keep the app open until it finishes.';
            const r = await OM.save((d, t) => { bar.firstChild.style.width = (100 * d / t).toFixed(1) + '%'; b.textContent = `Saving ${Math.round(100 * d / t)}%`; });
            if (r.failed) { b.disabled = false; b.textContent = 'Save again'; out.textContent = `${r.failed} map squares didn't save. Tap Save again with better signal.`; }
            else { b.textContent = 'Map saved ✓'; out.textContent = 'Saved. The map now works without signal.'; }
            if (onSaved) onSaved();
          };
        }
      };
    };
  }

  function GPTIntro(o) {
    const wrap = document.createElement('div');
    wrap.className = 'rn-intro'; wrap.hidden = true;
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'giTitle');
    wrap.innerHTML = `<div class="rn-intro-card"><button type="button" class="rn-intro-skip">Skip</button><div class="gi-body"></div>
      <div class="rn-intro-dots" aria-hidden="true"></div>
      <div class="rn-intro-nav"><button type="button" class="btn gi-back">Back</button><button type="button" class="rn-intro-next gi-next">Next</button></div></div>`;
    document.body.appendChild(wrap);
    const body = wrap.querySelector('.gi-body'), n = o.steps.length;
    let i = -1;
    async function draw() {
      if (i < 0) return;
      const s = await o.steps[i]({ IOS, STANDALONE });
      body.innerHTML = `${i === 0 ? '<img class="rn-intro-logo" src="icons/logo.png" alt="GPT100 Miler">' : ''}<h2 id="giTitle">${s.title}</h2>${s.html}`;
      wrap.querySelector('.rn-intro-dots').innerHTML = Array.from({ length: n }, (_, k) => `<i${k === i ? ' class="on"' : ''}></i>`).join('');
      wrap.querySelector('.gi-back').style.visibility = i ? 'visible' : 'hidden';
      wrap.querySelector('.gi-next').textContent = i === n - 1 ? 'Let\'s go' : 'Next';
      if (s.after) s.after(body);
      wrap.querySelector('.rn-intro-card').scrollTop = 0;
    }
    redraw = draw;
    const open = () => { i = 0; wrap.hidden = false; document.body.classList.add('rn-noscroll'); draw(); };
    const close = () => { wrap.hidden = true; i = -1; document.body.classList.remove('rn-noscroll'); set(o.key, '1'); if (o.done) o.done(); };
    wrap.querySelector('.gi-next').onclick = () => { if (i >= n - 1) close(); else { i++; draw(); } };
    wrap.querySelector('.gi-back').onclick = () => { if (i > 0) { i--; draw(); } };
    wrap.querySelector('.rn-intro-skip').onclick = close;
    addEventListener('keydown', e => { if (e.key === 'Escape' && !wrap.hidden) close(); });
    // The ? button in the header.
    const q = document.createElement('button');
    q.type = 'button'; q.className = 'rn-q'; q.textContent = '?'; q.setAttribute('aria-label', 'How the app works');
    q.onclick = open;
    const top = document.querySelector('header.top');
    if (top) top.appendChild(q);
    if (get(o.key) !== '1') open();
    return { open };
  }
  GPTIntro.installStep = installStep;
  GPTIntro.saveStep = saveStep;
  GPTIntro.installFirst = installFirst;
  GPTIntro.iosSteps = iosSteps;
  GPTIntro.allowBrowserSave = () => set('gptSaveInBrowser', '1');
  window.GPTIntro = GPTIntro;
})();
