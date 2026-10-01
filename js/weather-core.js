// GPT100 weather logic shared by the Weather tab (browser) and the hourly weather watch (node,
// tools/weather_watch.mjs): time helpers, runner pacing, feed parsing and the risk trigger checks.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GPT_WX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TZ = 'Australia/Melbourne';
  const HOUR = 3600;

  // ---------- time (Melbourne local) ----------
  const offFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, timeZoneName: 'shortOffset', hour: 'numeric' });
  function offsetMin(epoch) {
    const s = offFmt.formatToParts(new Date(epoch * 1000)).find(p => p.type === 'timeZoneName').value; // GMT+11
    const m = s.match(/GMT([+-])(\d+)(?::(\d+))?/);
    return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0;
  }
  // '2026-11-06T08:00' Melbourne time to epoch seconds.
  function parseLocal(str) {
    const m = String(str).match(/(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d))?/);
    if (!m) return NaN;
    const utc = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 1000;
    let t = utc - offsetMin(utc) * 60;
    t = utc - offsetMin(t) * 60; // settle across a daylight saving change
    return t;
  }
  const partsFmt = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function parts(epoch) {
    const o = {};
    partsFmt.formatToParts(new Date(epoch * 1000)).forEach(p => { o[p.type] = p.value; });
    return o;
  }
  function localHour(epoch) { return +parts(epoch).hour; }
  function fmtTime(epoch, withDay) {
    const p = parts(epoch);
    return (withDay === false ? '' : p.weekday + ' ' + p.day + ' ' + p.month + ' ') + p.hour + ':' + p.minute;
  }
  function fmtDay(epoch) { const p = parts(epoch); return p.weekday + ' ' + p.day + ' ' + p.month; }
  function localDate(epoch) { // yyyy-mm-dd in Melbourne
    const d = new Date((epoch + offsetMin(epoch) * 60) * 1000);
    return d.toISOString().slice(0, 10);
  }

  // ---------- numbers ----------
  function median(a) {
    const v = a.filter(x => x != null && !isNaN(x)).sort((x, y) => x - y);
    if (!v.length) return null;
    const m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
  function max(a) { let r = null; for (const x of a) if (x != null && !isNaN(x) && (r == null || x > r)) r = x; return r; }
  function min(a) { let r = null; for (const x of a) if (x != null && !isNaN(x) && (r == null || x < r)) r = x; return r; }
  function r1(x) { return x == null ? null : Math.round(x * 10) / 10; }
  function r0(x) { return x == null ? null : Math.round(x); }

  // Wet Bulb Globe Temperature in the shade (the Bureau of Meteorology's approximation).
  function wbgt(t, rh) {
    if (t == null || rh == null) return null;
    const e = rh / 100 * 6.105 * Math.exp(17.27 * t / (237.7 + t));
    return 0.567 * t + 0.393 * e + 3.94;
  }

  const CODES = {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail'
  };
  function codeText(c) { return c == null ? '' : (CODES[c] || 'Code ' + c); }

  const MODEL_NAMES = {
    ecmwf_ifs025: 'ECMWF IFS', ecmwf_aifs025_single: 'ECMWF AI', gfs_seamless: 'NOAA GFS', icon_seamless: 'DWD ICON',
    ukmo_seamless: 'UK Met Office', meteofrance_seamless: 'Météo-France', gem_seamless: 'Canada GEM',
    jma_seamless: 'Japan JMA', bom_access_global: 'BOM ACCESS-G', era5: 'ERA5 (observed)'
  };
  function modelName(id) { return MODEL_NAMES[id] || id; }

  // ---------- runner pacing ----------
  // kind: 'fast' or 'slow'. Returns the epoch when that runner passes km, or null when off the pacing.
  function passTime(pace, kind, km) {
    const P = pace.points;
    if (!P._t) P.forEach(p => { p._tf = parseLocal(p.fast); p._ts = parseLocal(p.slow); });
    P._t = true;
    const key = kind === 'fast' ? '_tf' : '_ts';
    if (km < P[0].km || km > P[P.length - 1].km) return null;
    for (let i = 1; i < P.length; i++) {
      if (km <= P[i].km) {
        const a = P[i - 1], b = P[i], f = (km - a.km) / (b.km - a.km || 1);
        return a[key] + f * (b[key] - a[key]);
      }
    }
    return P[P.length - 1][key];
  }
  // Where that runner is at epoch t: km, or null before the start or after the finish.
  function kmAt(pace, kind, t) {
    const P = pace.points;
    passTime(pace, kind, 0);
    const key = kind === 'fast' ? '_tf' : '_ts';
    if (t < P[0][key] || t > P[P.length - 1][key]) return null;
    for (let i = 1; i < P.length; i++) {
      if (t <= P[i][key]) {
        const a = P[i - 1], b = P[i], f = (t - a[key]) / (b[key] - a[key] || 1);
        return a.km + f * (b.km - a.km);
      }
    }
    return P[P.length - 1].km;
  }
  // Are runners (between the fastest and the cut-off) at km at epoch t?
  function runnersAt(pace, km, t, shift) {
    if (!pace) return false;
    const a = passTime(pace, 'fast', km), b = passTime(pace, 'slow', km);
    if (a == null || b == null) return false;
    return t >= a + (shift || 0) - HOUR && t <= b + (shift || 0) + HOUR;
  }

  // ---------- feeds ----------
  function decode(s) {
    return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function tag(xml, t) { const m = xml.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>')); return m ? decode(m[1]).trim() : ''; }
  function items(xml) { return (String(xml).match(/<item[\s>][\s\S]*?<\/item>/g) || []); }
  const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

  // CFA Total Fire Ban and Fire Danger Rating RSS for one fire district.
  function parseCFA(xml, district) {
    const out = [];
    for (const it of items(xml)) {
      const title = tag(it, 'title'), desc = tag(it, 'description').replace(/<[^>]+>/g, ' ');
      const m = title.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
      if (!m || !MONTHS[m[2].toLowerCase()]) continue;
      const date = m[3] + '-' + String(MONTHS[m[2].toLowerCase()]).padStart(2, '0') + '-' + m[1].padStart(2, '0');
      const tfb = /is\s+(currently\s+)?a\s+day\s+of\s+Total\s+Fire\s+Ban/i.test(desc) && !/not\s+currently\s+a\s+day/i.test(desc);
      const r = desc.match(new RegExp(district.replace(/ /g, '\\s+') + '\\s*:\\s*(NO RATING|MODERATE|HIGH|EXTREME|CATASTROPHIC)', 'i'));
      out.push({ date, district, tfb, rating: r ? r[1].toUpperCase() : 'UNKNOWN' });
    }
    return out;
  }

  // ---------- triggers ----------
  const RANK = { nodata: -1, ok: 0, close: 1, met: 2 };
  const LABELS = {
    fire: 'Fire danger', heat: 'Heat', wind: 'Wind on ridges', storm: 'Thunderstorms',
    rain: 'Heavy rain', cold: 'Cold on ridges', smoke: 'Smoke', cloud: 'Cloud on high ground'
  };
  const RULES = {
    fire: 'Total Fire Ban, or Extreme or Catastrophic rating, in the Wimmera or South West district',
    heat: T => 'Air temperature ' + T.met + '°C or WBGT ' + T.wbgtMet + ' (close from ' + T.close + '°C or WBGT ' + T.wbgtClose + ')',
    wind: T => 'Gusts over ' + T.met + ' km/h on ridges, or a BOM Severe Weather Warning (close from ' + T.close + ' km/h)',
    storm: T => 'Thunderstorm in two or more models, or a BOM Severe Thunderstorm Warning (close: one model, or storm energy (CAPE) ' + T.capeClose + ' J/kg)',
    rain: T => 'More than ' + T.met + ' mm in 24 hours (close from ' + T.close + ' mm)',
    cold: T => 'Feels like ' + T.met + '°C or colder on ridges overnight, or ' + T.hours + ' hours of rain with ' + T.windKmh + ' km/h wind (close from ' + T.close + '°C)',
    cloud: T => T.zones.map(z => z.name + ' (km ' + z.fromKm + ' to ' + z.toKm + ')').join(' or ') + ' in cloud for ' + T.hours + ' hours or more in at least ' + T.agree + '% of models, while runners are there. Advisory, not an RMP trigger',
    smoke: T => 'Air quality index over ' + T.met + ' for PM2.5 (close from ' + T.close + ')'
  };
  function ruleText(key, T) { const r = RULES[key]; return typeof r === 'function' ? r(T) : r; }

  // Keep the worst finding: higher status, then the more extreme value, then the earlier time.
  function better(cur, cand, higherIsWorse) {
    if (!cur) return cand;
    if (RANK[cand.status] !== RANK[cur.status]) return RANK[cand.status] > RANK[cur.status] ? cand : cur;
    if (cand.value != null && cur.value != null && cand.value !== cur.value) return (higherIsWorse ? cand.value > cur.value : cand.value < cur.value) ? cand : cur;
    return cand.at < cur.at ? cand : cur;
  }

  // grid: { t0, n, lh (local hour per step), points: [{km, ele, ridge}], cons: {var: [hour][point]} }
  // ctx: { config, now, pace, fire, warnings, aq }
  function evaluate(grid, ctx) {
    const W = ctx.config.weather, T = W.triggers, now = ctx.now, pace = ctx.pace;
    const scopes = {
      next48: { from: now - HOUR, to: now + 48 * HOUR, label: 'Next 48 hours' },
      race: { from: parseLocal(W.event.start), to: parseLocal(W.event.end), label: 'Race weekend' }
    };
    const out = {};
    for (const [sk, sc] of Object.entries(scopes)) {
      const res = {};
      const h0 = grid ? Math.max(0, Math.ceil((sc.from - grid.t0) / HOUR)) : 0;
      const h1 = grid ? Math.min(grid.n - 1, Math.floor((sc.to - grid.t0) / HOUR)) : -1;
      const covered = h1 >= h0;
      const lastT = grid ? grid.t0 + (grid.n - 1) * HOUR : null;
      const partial = covered && grid.t0 + h1 * HOUR < sc.to - HOUR;
      const note = !grid ? 'No forecast data yet.'
        : !covered ? (sc.from > lastT ? 'The forecast reaches this window from about ' + fmtDay(sc.from - 16 * 24 * HOUR) + '.' : 'No forecast hours in this window.')
          : partial ? 'Forecast covers this window up to ' + fmtTime(lastT) + ' only.' : '';
      const C = grid && grid.cons;
      const cell = (key, h, p, status, value, extra) => {
        const t = grid.t0 + h * HOUR, pt = grid.points[p];
        return Object.assign({ status, value, at: t, km: pt.km, place: pt.name || '', runners: runnersAt(pace, pt.km, t, ctx.shift) }, extra || {});
      };
      const base = key => ({ key, label: LABELS[key], rule: ruleText(key, T[key]), proposed: !!T[key].proposed, advisory: !!T[key].advisory, status: covered ? 'ok' : 'nodata', note });

      // Heat: any course point.
      let f = null;
      if (covered) for (let h = h0; h <= h1; h++) for (let p = 0; p < grid.points.length; p++) {
        const t = C.t[h][p], wb = C.wbgt[h][p], tx = C.tmax[h][p], wx = C.wbgtmax[h][p];
        if (t == null) continue;
        const st = t >= T.heat.met || wb >= T.heat.wbgtMet ? 'met'
          : t >= T.heat.close || wb >= T.heat.wbgtClose || tx >= T.heat.met || wx >= T.heat.wbgtMet ? 'close' : 'ok';
        f = better(f, cell('heat', h, p, st, t, { wbgt: wb, hottest: tx }), true);
      }
      res.heat = Object.assign(base('heat'), f && { worst: f, status: f.status,
        text: f.value == null ? '' : 'Hottest ' + f.value.toFixed(1) + '°C (WBGT ' + (f.wbgt == null ? 'n/a' : f.wbgt.toFixed(1)) + ', hottest model ' + (f.hottest == null ? 'n/a' : f.hottest.toFixed(1) + '°C') + ')' });

      // Wind: ridge points; BOM Severe Weather Warning.
      f = null;
      if (covered) for (let h = h0; h <= h1; h++) for (let p = 0; p < grid.points.length; p++) {
        if (!grid.points[p].ridge) continue;
        const g = C.g[h][p], gx = C.gmax[h][p];
        if (g == null) continue;
        const st = g > T.wind.met ? 'met' : g >= T.wind.close || gx > T.wind.met ? 'close' : 'ok';
        f = better(f, cell('wind', h, p, st, g, { strongest: gx }), true);
      }
      res.wind = Object.assign(base('wind'), f && { worst: f, status: f.status,
        text: 'Strongest gust ' + Math.round(f.value) + ' km/h on ridges (strongest model ' + (f.strongest == null ? 'n/a' : Math.round(f.strongest) + ' km/h') + ')' });

      // Storm: thunderstorm weather codes across models, and storm energy.
      f = null;
      if (covered) for (let h = h0; h <= h1; h++) for (let p = 0; p < grid.points.length; p++) {
        const s = C.storm[h][p] || 0, cape = C.cape[h][p];
        const st = s >= 2 ? 'met' : s === 1 || cape >= T.storm.capeClose ? 'close' : 'ok';
        f = better(f, cell('storm', h, p, st, s * 10000 + (cape || 0), { models: s, cape, n: C.n[h][p] }), true);
      }
      res.storm = Object.assign(base('storm'), f && { worst: f, status: f.status,
        text: f.models ? f.models + ' of ' + f.n + ' models show a thunderstorm' : 'No model shows a thunderstorm. Storm energy up to ' + Math.round(f.cape || 0) + ' J/kg' });

      // Rain: 24 hour totals.
      f = null;
      if (covered) for (let h = h0; h <= h1; h++) for (let p = 0; p < grid.points.length; p++) {
        const r = C.p24[h][p], rx = C.p24max[h][p];
        if (r == null) continue;
        const st = r > T.rain.met ? 'met' : r >= T.rain.close || rx > T.rain.met ? 'close' : 'ok';
        f = better(f, cell('rain', h, p, st, r, { wettest: rx }), true);
      }
      res.rain = Object.assign(base('rain'), f && { worst: f, status: f.status,
        text: 'Up to ' + f.value.toFixed(1) + ' mm in 24 hours (wettest model ' + (f.wettest == null ? 'n/a' : f.wettest.toFixed(1) + ' mm') + ')' });

      // Cold: ridge points overnight (18:00 to 08:00), plus long spells of rain with strong wind.
      f = null;
      if (covered) for (let p = 0; p < grid.points.length; p++) {
        if (!grid.points[p].ridge) continue;
        let run = 0;
        for (let h = Math.max(0, h0 - T.cold.hours); h <= h1; h++) {
          const wet = C.p[h][p] >= T.cold.rainMm && C.w[h][p] >= T.cold.windKmh;
          run = wet ? run + 1 : 0;
          if (h < h0) continue;
          const lh = grid.lh[h], night = lh >= 18 || lh < 8;
          const at = C.at[h][p], an = C.atmin[h][p];
          let st = 'ok';
          if (night && at != null) st = at <= T.cold.met ? 'met' : at <= T.cold.close || an <= T.cold.met ? 'close' : 'ok';
          if (run >= T.cold.hours) st = 'met';
          else if (wet && st === 'ok') st = 'close';
          f = better(f, cell('cold', h, p, st, night || run ? at : 99, { wetRun: run, coldest: an }), false);
        }
      }
      res.cold = Object.assign(base('cold'), f && { worst: f, status: f.status,
        text: f.value === 99 || f.value == null ? 'No cold risk overnight on ridges' : (f.wetRun >= T.cold.hours ? f.wetRun + ' hours of rain with strong wind. ' : '') + 'Feels like ' + f.value.toFixed(1) + '°C on ridges (coldest model ' + (f.coldest == null ? 'n/a' : f.coldest.toFixed(1) + '°C') + ')' });

      // Cloud on the high ground (advisory): the longest spell in cloud at any high point. On race weekend only
      // while runners are there; in the next 48 hours whoever is up there (marking, crews).
      f = null;
      if (T.cloud && covered && C.cloud) for (let p = 0; p < grid.points.length; p++) {
        if (C.cloud[h0] === undefined) break;
        let run = 0, start = null, night = 0, sum = 0;
        const flush = () => {
          if (run) {
            const t = grid.t0 + start * HOUR, pt = grid.points[p], zone = cloudZone(T.cloud, pt.km);
            const st = run >= T.cloud.hours ? 'close' : 'ok';
            f = better(f, { status: st, value: run, at: t, km: pt.km, place: zone ? zone.name : pt.name || '', runners: sk === 'race' || runnersAt(pace, pt.km, t, ctx.shift), night: night * 2 >= run, agree: Math.round(sum / run) }, true);
          }
          run = 0; night = 0; sum = 0;
        };
        for (let h = h0; h <= h1; h++) {
          const v = C.cloud[h] && C.cloud[h][p];
          const t = grid.t0 + h * HOUR;
          const on = v != null && v >= T.cloud.agree && (sk !== 'race' || runnersAt(pace, grid.points[p].km, t, ctx.shift));
          if (on) { if (!run) start = h; run++; sum += v; const lh = grid.lh[h]; if (lh >= 18 || lh < 8) night++; }
          else flush();
        }
        flush();
      }
      res.cloud = Object.assign(base('cloud'), f && { worst: f, status: f.status,
        text: f.value ? `${f.place ? f.place + ' i' : 'I'}n cloud for ${f.value} hour${f.value > 1 ? 's' : ''} from ${fmtTime(f.at)}${f.night ? ', mostly overnight' : ''} (${f.agree}% of models)` : 'No cloud forecast on the high ground' });
      if (!f && covered && T.cloud && C.cloud) res.cloud.text = 'No cloud forecast on the high ground' + (sk === 'race' ? ' while runners are there' : '');

      // Smoke: air quality forecast (about 4 days ahead).
      f = null;
      const A = ctx.aq;
      const aqCovered = A && A.aqi && A.t0 + (A.n - 1) * HOUR >= sc.from && A.t0 <= sc.to;
      if (aqCovered) {
        const a0 = Math.max(0, Math.ceil((sc.from - A.t0) / HOUR)), a1 = Math.min(A.n - 1, Math.floor((sc.to - A.t0) / HOUR));
        for (let h = a0; h <= a1; h++) for (let p = 0; p < A.points.length; p++) {
          const v = A.aqi[h][p];
          if (v == null) continue;
          const st = v > T.smoke.met ? 'met' : v >= T.smoke.close ? 'close' : 'ok';
          const t = A.t0 + h * HOUR;
          f = better(f, { status: st, value: v, at: t, km: A.points[p].km, place: A.points[p].name || '', runners: runnersAt(pace, A.points[p].km, t, ctx.shift) }, true);
        }
      }
      res.smoke = Object.assign(base('smoke'), { status: f ? f.status : 'nodata', note: f ? '' : 'The air quality forecast only reaches about 4 days ahead.' },
        f && { worst: f, text: 'Air quality index up to ' + Math.round(f.value) + ' (PM2.5)' });

      // Fire: CFA ratings and Total Fire Bans for the days in the window.
      const days = [];
      for (let t = sc.from; t <= sc.to + 24 * HOUR; t += 24 * HOUR) { const d = localDate(Math.min(t, sc.to)); if (!days.includes(d)) days.push(d); }
      const fd = (ctx.fire && ctx.fire.days || []).filter(d => days.includes(d.date));
      f = null;
      for (const d of fd) for (const [dist, r] of Object.entries(d.districts)) {
        const st = r.tfb || /EXTREME|CATASTROPHIC/.test(r.rating) ? 'met' : r.rating === 'HIGH' ? 'close' : 'ok';
        const cand = { status: st, value: { 'NO RATING': 0, UNKNOWN: 0, MODERATE: 1, HIGH: 2, EXTREME: 3, CATASTROPHIC: 4 }[r.rating] + (r.tfb ? 10 : 0), at: parseLocal(d.date + 'T00:00'), place: dist, rating: r.rating, tfb: r.tfb, date: d.date };
        f = better(f, cand, true);
      }
      res.fire = Object.assign(base('fire'), { status: fd.length ? 'ok' : 'nodata', note: fd.length ? '' : 'CFA ratings are published about 4 days ahead.' },
        f && { worst: f, status: f.status, text: (f.tfb ? 'Total Fire Ban. ' : '') + f.place + ': ' + titleCase(f.rating) + ' on ' + fmtDay(f.at) });

      // Official BOM warnings in force now count for the next 48 hours.
      if (sk === 'next48' && ctx.warnings && ctx.warnings.items) {
        const rel = ctx.warnings.items.filter(w => w.relevant);
        const bump = (key, kinds, st) => {
          const w = rel.find(x => kinds.includes(x.kind));
          if (!w) return;
          const r = res[key];
          if (RANK[st] > RANK[r.status]) { r.status = st; r.text = w.title; }
          r.warning = w.title;
        };
        bump('wind', ['severe'], 'met');
        bump('storm', ['thunderstorm'], 'met');
        bump('rain', ['flood'], 'close');
        bump('fire', ['fire'], 'close');
      }
      // Ensembles: the chance of each trigger being met. Enough of a chance makes a clear trigger "getting close".
      const E = ctx.ens;
      if (E && E.v) {
        const e0 = Math.max(0, Math.ceil((sc.from - E.t0) / HOUR)), e1 = Math.min(E.n - 1, Math.floor((sc.to - E.t0) / HOUR));
        const close = (W.ensembles && W.ensembles.closeChance) || 30;
        const chance = (key, k, filter) => {
          let b = null;
          for (let h = e0; h <= e1; h++) for (let j = 0; j < E.points.length; j++) {
            if (filter && !filter(E.points[j], h)) continue;
            const p = E.v[k][h] && E.v[k][h][j];
            if (p != null && (!b || p > b.p)) b = { p, at: E.t0 + h * HOUR, km: E.points[j].km, place: E.points[j].name || '' };
          }
          const r = res[key];
          if (!b || !r) return;
          r.chance = b;
          if (b.p >= close && r.status === 'ok') {
            r.status = 'close';
            r.text = (r.text ? r.text + '. ' : '') + b.p + '% of ensemble forecasts reach the trigger';
            r.worst = Object.assign({}, r.worst || {}, { at: b.at, km: b.km, place: b.place, runners: runnersAt(pace, b.km, b.at, ctx.shift) });
          }
        };
        const nightAt = h => { const lh = E.lh ? E.lh[h] : localHour(E.t0 + h * HOUR); return lh >= 18 || lh < 8; };
        if (e1 >= e0) {
          chance('heat', 'hm');
          chance('wind', 'wm', p => p.ridge);
          chance('rain', 'rm');
          chance('cold', 'cm', (p, h) => p.ridge && nightAt(h));
        }
      }

      // VicEmergency: a bushfire near the course meets the fire trigger; a planned burn nearby makes smoke getting close.
      if (sk === 'next48' && ctx.incidents && ctx.incidents.items) {
        const near = W.fireNearKm || 20;
        const fireIt = ctx.incidents.items.find(x => x.kind === 'fire' && x.dist <= near);
        const burn = ctx.incidents.items.find(x => x.kind === 'burn' && x.dist <= near);
        if (fireIt) { const r = res.fire; r.status = 'met'; r.text = 'Bushfire ' + fireIt.dist + ' km from the course: ' + (fireIt.location || fireIt.title); r.incident = fireIt; r.worst = { at: now, km: fireIt.km, place: '', runners: false }; }
        if (burn && RANK[res.smoke.status] < RANK.close) { const r = res.smoke; r.status = 'close'; r.text = 'Planned burn ' + burn.dist + ' km from the course' + (burn.location ? ': ' + burn.location : ''); r.incident = burn; r.note = ''; r.worst = { at: now, km: burn.km, place: '', runners: false }; }
      }

      let worst = 'nodata';
      for (const r of Object.values(res)) if (RANK[r.status] > RANK[worst]) worst = r.status;
      out[sk] = { label: sc.label, from: sc.from, to: sc.to, status: worst, note, triggers: res };
    }
    return out;
  }
  // Trigger status of one forecast cell (point p, hour h), for colouring the timeline and map.
  function cellStatus(grid, h, p, T) {
    const C = grid.cons, pt = grid.points[p], lh = grid.lh[h], night = lh >= 18 || lh < 8;
    const hit = [];
    const add = (key, st) => { if (st !== 'ok') hit.push({ key, status: st }); };
    const t = C.t[h][p];
    if (t == null) return { status: 'nodata', hits: hit };
    const wb = C.wbgt[h][p];
    add('heat', t >= T.heat.met || wb >= T.heat.wbgtMet ? 'met' : t >= T.heat.close || wb >= T.heat.wbgtClose || C.tmax[h][p] >= T.heat.met ? 'close' : 'ok');
    if (pt.ridge) {
      const g = C.g[h][p];
      add('wind', g > T.wind.met ? 'met' : g >= T.wind.close || C.gmax[h][p] > T.wind.met ? 'close' : 'ok');
      if (night) { const a = C.at[h][p]; add('cold', a <= T.cold.met ? 'met' : a <= T.cold.close || C.atmin[h][p] <= T.cold.met ? 'close' : 'ok'); }
    }
    const s = C.storm[h][p] || 0;
    add('storm', s >= 2 ? 'met' : s === 1 || C.cape[h][p] >= T.storm.capeClose ? 'close' : 'ok');
    if (T.cloud && C.cloud && C.cloud[h] && C.cloud[h][p] != null && C.cloud[h][p] >= T.cloud.agree) add('cloud', 'close');
    const r = C.p24[h][p];
    add('rain', r > T.rain.met ? 'met' : r >= T.rain.close || C.p24max[h][p] > T.rain.met ? 'close' : 'ok');
    let st = 'ok';
    hit.forEach(x => { if (RANK[x.status] > RANK[st]) st = x.status; });
    return { status: st, hits: hit };
  }

  // The daily weather update for WhatsApp: race weekend day by day, triggers, official warnings and fire ratings.
  // d: { grid, triggers, fire, warnings, incidents, config, now, url }
  function updateText(d) {
    const W = d.config.weather, g = d.grid, tr = d.triggers, now = d.now;
    const WORD = { met: 'MET', close: 'getting close', ok: 'clear', nodata: 'no forecast yet' };
    const out = [`*GPT100 weather update, ${fmtDay(now)} ${fmtTime(now, false)}*`, ''];
    const s0 = parseLocal(W.event.start), s1 = parseLocal(W.event.end);
    const race = tr && tr.race, n48 = tr && tr.next48;
    const flagged = s => ORDER.map(k => s.triggers[k]).filter(r => r.status === 'met' || r.status === 'close');
    out.push(`*Race weekend (${fmtDay(s0)} to ${fmtDay(s1)})*`);
    if (!race || race.status === 'nodata') out.push('The forecast models don\'t reach race weekend yet.');
    else {
      // Day by day across the course, from the model consensus.
      if (g) {
        const days = [];
        for (let t = s0; t <= s1; t += 24 * HOUR) { const k = localDate(t); if (!days.includes(k)) days.push(k); }
        for (const day of days) {
          let tmax = null, tmin = null, atmin = null, gmax = null, rain = 0, storm = 0, wetModels = 0, any = false;
          const CLT = W.triggers.cloud, cloudH = CLT ? CLT.zones.map(() => 0) : [];
          const rainAt = new Array(g.points.length).fill(0);
          for (let h = 0; h < g.n; h++) {
            const t = g.t0 + h * HOUR;
            if (localDate(t) !== day || t < s0 - 6 * HOUR || t > s1) continue;
            if (CLT && g.cons.cloud && g.cons.cloud[h]) CLT.zones.forEach((z, zi) => {
              if (g.points.some((pt, p) => cloudZone(CLT, pt.km) === z && g.cons.cloud[h][p] != null && g.cons.cloud[h][p] >= CLT.agree)) cloudH[zi]++;
            });
            for (let p = 0; p < g.points.length; p++) {
              const C = g.cons, x = C.t[h][p];
              if (x == null) continue;
              any = true;
              tmax = tmax == null ? x : Math.max(tmax, x); tmin = tmin == null ? x : Math.min(tmin, x);
              if (g.points[p].ridge) {
                if (C.at[h][p] != null) atmin = atmin == null ? C.at[h][p] : Math.min(atmin, C.at[h][p]);
                if (C.g[h][p] != null) gmax = gmax == null ? C.g[h][p] : Math.max(gmax, C.g[h][p]);
              }
              rainAt[p] += C.p[h][p] || 0;
              storm = Math.max(storm, C.storm[h][p] || 0);
              wetModels = Math.max(wetModels, C.pp[h][p] || 0);
            }
          }
          rain = Math.max(...rainAt);
          if (!any) { out.push(`${fmtDay(parseLocal(day))}: beyond the forecast for now.`); continue; }
          out.push(`${fmtDay(parseLocal(day))}: ${Math.round(tmin)} to ${Math.round(tmax)}°C. Ridges feel like ${Math.round(atmin)}°C at the coldest, gusts to ${Math.round(gmax)} km/h. ` +
            (rain >= 1 ? `Up to ${Math.round(rain)} mm of rain.` : wetModels >= 30 ? 'Showers possible.' : 'Mostly dry.') + (storm ? ` Thunderstorm in ${storm} model${storm > 1 ? 's' : ''}.` : '') + cloudH.map((n, zi) => n ? ` ${CLT.zones[zi].name.replace(/ and the .*/, '')} in cloud about ${n} h.` : '').join(''));
        }
      }
      const f = flagged(race);
      out.push(f.length ? 'Triggers:\n' + f.map(r => `${r.label} ${WORD[r.status]}: ${r.text}`).join('\n') : 'Triggers: all clear.');
      if (race.note) out.push(race.note);
    }
    out.push('');
    if (n48 && n48.status !== 'nodata') {
      const f = flagged(n48);
      out.push('*Next 48 hours*');
      out.push(f.length ? f.map(r => `${r.label} ${WORD[r.status]}: ${r.text}`).join('\n') : 'All triggers clear.');
      out.push('');
    }
    const warn = d.warnings && d.warnings.items ? d.warnings.items.filter(w => w.relevant) : null;
    out.push('*Official*');
    out.push(warn ? (warn.length ? warn.map(w => 'BOM: ' + w.title).join('\n') : 'No BOM warnings near the course.') : 'BOM warnings: check bom.gov.au.');
    const fd = d.fire && d.fire.days ? d.fire.days.slice(0, 4) : [];
    const ratings = [...new Set(fd.flatMap(x => Object.values(x.districts).map(r => r.rating)))];
    if (fd.length && ratings.length === 1 && !fd.some(x => Object.values(x.districts).some(r => r.tfb)))
      out.push(`CFA: ${titleCase(ratings[0])} in ${W.districts.join(' and ')}, no Total Fire Ban, to ${fmtDay(parseLocal(fd[fd.length - 1].date))}.`);
    else if (fd.length) out.push('CFA: ' + fd.map(x => fmtDay(parseLocal(x.date)).replace(/ \w+$/, '') + ' ' + Object.entries(x.districts).map(([k, r]) => `${k} ${titleCase(r.rating)}${r.tfb ? ' TOTAL FIRE BAN' : ''}`).join(', ')).join('; ') + '.');
    const inc = d.incidents && d.incidents.items ? d.incidents.items.filter(x => x.kind === 'fire' || x.kind === 'burn') : [];
    if (inc.length) out.push(inc.map(x => `${x.title} ${x.dist} km from the course${x.location ? ' (' + x.location + ')' : ''}`).join('\n'));
    out.push('');
    if (d.url) out.push('Full detail: ' + d.url);
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  // Which cloud zone (high ground) a course km is in, if any.
  function cloudZone(CL, km) { return CL && CL.zones ? CL.zones.find(z => km >= z.fromKm && km <= z.toKm) || null : null; }
  function titleCase(s) { return String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }
  const ORDER = ['fire', 'wind', 'storm', 'heat', 'rain', 'cold', 'cloud', 'smoke'];

  return {
    updateText, cloudZone,
    TZ, HOUR, parseLocal, localHour, fmtTime, fmtDay, localDate, parts, offsetMin,
    median, max, min, r1, r0, wbgt, codeText, modelName, MODEL_NAMES,
    passTime, kmAt, runnersAt, parseCFA, evaluate, cellStatus, RANK, LABELS, ORDER, ruleText, titleCase
  };
});
